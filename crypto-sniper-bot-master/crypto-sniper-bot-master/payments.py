"""
CryptoBot payment integration.
Docs: https://help.crypt.bot/crypto-pay-api

Get your token from @CryptoBot in Telegram → Create App.
Set CRYPTOBOT_TOKEN in .env

Supported assets: USDT, TON, BTC, ETH, LTC, BNB, TRX, USDC
"""

import asyncio
import logging
import os
from datetime import datetime, timezone, timedelta

import aiohttp

import database as db

logger = logging.getLogger(__name__)

CRYPTOBOT_TOKEN = os.getenv("CRYPTOBOT_TOKEN", "")
# Use mainnet. For testing: https://testnet-pay.crypt.bot/api
CRYPTOBOT_API   = "https://pay.crypt.bot/api"

# Assets to show to users (order matters)
ACCEPTED_ASSETS = ["USDT", "TON", "BTC", "ETH"]

_HEADERS = {"Crypto-Pay-API-Token": CRYPTOBOT_TOKEN}


# ── API helpers ────────────────────────────────────────────────────────────────

async def _api_post(session: aiohttp.ClientSession,
                    method: str, data: dict) -> dict | None:
    if not CRYPTOBOT_TOKEN:
        logger.warning("CRYPTOBOT_TOKEN not set — payments disabled")
        return None
    url = f"{CRYPTOBOT_API}/{method}"
    try:
        async with session.post(url, json=data, headers=_HEADERS,
                                timeout=aiohttp.ClientTimeout(total=10)) as r:
            resp = await r.json()
            if resp.get("ok"):
                return resp.get("result")
            logger.warning("CryptoBot API error %s: %s", method, resp.get("error"))
    except Exception as e:
        logger.error("CryptoBot %s error: %s", method, e)
    return None


async def _api_get(session: aiohttp.ClientSession,
                   method: str, params: dict | None = None) -> dict | None:
    if not CRYPTOBOT_TOKEN:
        return None
    url = f"{CRYPTOBOT_API}/{method}"
    try:
        async with session.get(url, params=params, headers=_HEADERS,
                               timeout=aiohttp.ClientTimeout(total=10)) as r:
            resp = await r.json()
            if resp.get("ok"):
                return resp.get("result")
            logger.warning("CryptoBot API error %s: %s", method, resp.get("error"))
    except Exception as e:
        logger.error("CryptoBot %s error: %s", method, e)
    return None


# ── Public API ─────────────────────────────────────────────────────────────────

def is_enabled() -> bool:
    """Returns True if CryptoBot token is configured."""
    return bool(CRYPTOBOT_TOKEN)


async def create_invoice(tier: str, user_id: int) -> dict | None:
    """
    Create a payment invoice for a subscription tier.
    Returns {"invoice_id": str, "pay_url": str} or None on error.
    """
    amount_usd = float(db.get_bot_setting(f"{tier}_price_usd", "29" if tier == "basic" else "79"))
    duration   = int(db.get_bot_setting(f"{tier}_duration_days", "30"))

    tier_names = {"basic": "Basic", "pro": "Pro"}
    description = (
        f"Crypto Sniper Bot — {tier_names.get(tier, tier)} "
        f"${amount_usd:.0f}/{duration}d"
    )
    payload = f"uid:{user_id}:tier:{tier}"

    async with aiohttp.ClientSession() as session:
        result = await _api_post(session, "createInvoice", {
            "asset":        "USDT",
            "amount":       str(amount_usd),
            "description":  description,
            "payload":      payload,
            "paid_btn_name": "callback",
            "paid_btn_url":  "https://t.me/",   # placeholder
            "expires_in":   86400,              # 24 hours
        })

    if not result:
        return None

    invoice_id  = str(result["invoice_id"])
    pay_url     = result["bot_invoice_url"]

    db.save_payment(user_id, tier, amount_usd, invoice_id, pay_url)
    return {"invoice_id": invoice_id, "pay_url": pay_url, "amount_usd": amount_usd}


async def check_invoice(invoice_id: str) -> str | None:
    """
    Check invoice status.
    Returns 'active', 'paid', 'expired', or None on API error.
    """
    async with aiohttp.ClientSession() as session:
        result = await _api_get(session, "getInvoices",
                                {"invoice_ids": invoice_id})
    if not result:
        return None
    items = result.get("items", [])
    if not items:
        return "expired"
    return items[0].get("status")   # 'active' | 'paid' | 'expired'


# ── Background payment checker ─────────────────────────────────────────────────

async def payment_check_loop(send_fn) -> None:
    """
    Runs every 60 seconds. Checks all pending invoices.
    On payment confirmed → activates subscription + notifies user.
    """
    logger.info("Payment checker started.")
    while True:
        await asyncio.sleep(60)
        try:
            await _process_pending(send_fn)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("Payment check loop error: %s", e)


async def _process_pending(send_fn) -> None:
    pending = db.get_pending_payments()
    if not pending:
        return

    for payment in pending:
        invoice_id = payment["invoice_id"]
        if not invoice_id:
            continue

        # Auto-expire after 25 hours (invoice lifetime is 24h)
        created = datetime.fromisoformat(payment["created_at"])
        if (datetime.utcnow() - created) > timedelta(hours=25):
            db.update_payment_status(payment["id"], "expired")
            continue

        status = await check_invoice(invoice_id)
        if status is None:
            continue

        if status == "paid":
            _activate_subscription(payment)
            await _notify_paid(send_fn, payment)
            logger.info(
                "Payment confirmed: user_id=%s tier=%s",
                payment["user_id"], payment["tier"]
            )
        elif status == "expired":
            db.update_payment_status(payment["id"], "expired")


def _activate_subscription(payment: dict) -> None:
    tier     = payment["tier"]
    user_id  = payment["user_id"]
    days     = int(db.get_bot_setting(f"{tier}_duration_days", "30"))
    expires  = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()
    paid_at  = datetime.now(timezone.utc).isoformat()

    db.update_payment_status(payment["id"], "paid", paid_at=paid_at)
    db.set_user_tier_with_expiry(user_id, tier, expires)


async def _notify_paid(send_fn, payment: dict) -> None:
    lang      = payment.get("lang", "ua")
    tier      = payment["tier"]
    user_id   = payment["user_id"]
    days      = int(db.get_bot_setting(f"{tier}_duration_days", "30"))
    expires   = datetime.now(timezone.utc) + timedelta(days=days)
    expires_s = expires.strftime("%d.%m.%Y")

    tier_labels = {"basic": "💳 Basic", "pro": "🚀 Pro"}
    label = tier_labels.get(tier, tier.upper())

    if lang == "en":
        msg = (
            f"✅ <b>Payment confirmed!</b>\n\n"
            f"Your plan: <b>{label}</b>\n"
            f"Active until: <b>{expires_s}</b>\n\n"
            f"Enjoy unlimited signals! 🚀"
        )
    else:
        msg = (
            f"✅ <b>Оплату підтверджено!</b>\n\n"
            f"Ваш тариф: <b>{label}</b>\n"
            f"Активний до: <b>{expires_s}</b>\n\n"
            f"Насолоджуйтесь сигналами! 🚀"
        )

    try:
        user = db.get_user_by_id(user_id)
        if user:
            await send_fn(user["telegram_id"], msg, None, None)
    except Exception as e:
        logger.error("Failed to notify user %s of payment: %s", user_id, e)
