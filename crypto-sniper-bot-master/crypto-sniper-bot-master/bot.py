import asyncio
import logging
import os
import time
from collections import defaultdict

import aiohttp
from dotenv import load_dotenv
from telegram import (
    Update, BotCommand,
    InlineKeyboardButton, InlineKeyboardMarkup,
)
from telegram.constants import ParseMode
from telegram.ext import (
    Application, CommandHandler, MessageHandler,
    CallbackQueryHandler, ConversationHandler, filters, ContextTypes,
)

import database as db
from lang import t
from scanner.monitor import run_monitor
from trader.wallet import (
    get_sol_balance, get_sol_token_balances, get_bnb_balance,
    get_sol_token_balance_raw, get_bsc_token_balance_raw,
    encrypt_pk, decrypt_pk, can_trade,
    is_valid_solana_address, is_valid_evm_address,
    is_valid_solana_private_key, is_valid_bsc_private_key,
)
import payments as pay

load_dotenv()

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)

TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN")

# ── Conversation states ────────────────────────────────────────────────────────
WALLET_ENTER_ADDRESS, WALLET_ENTER_KEY = range(2)

# ── Rate limiting ──────────────────────────────────────────────────────────────
_rate_tracker: dict[int, list[float]] = defaultdict(list)


def _rate_limited(tid: int, limit: int = 10, window: int = 60) -> bool:
    now = time.time()
    _rate_tracker[tid] = [ts for ts in _rate_tracker[tid] if now - ts < window]
    if len(_rate_tracker[tid]) >= limit:
        return True
    _rate_tracker[tid].append(now)
    return False


# Stricter rate limit for financial operations (buy/sell): 3 per 60s per user
_trade_tracker: dict[int, list[float]] = defaultdict(list)


def _trade_rate_limited(tid: int) -> bool:
    """Max 3 trade actions per 60 seconds per user."""
    now = time.time()
    _trade_tracker[tid] = [ts for ts in _trade_tracker[tid] if now - ts < 60]
    if len(_trade_tracker[tid]) >= 3:
        return True
    _trade_tracker[tid].append(now)
    return False


# ── Amount caps ────────────────────────────────────────────────────────────────
_MAX_BUY_SOL = float(os.getenv("MAX_BUY_SOL", "5.0"))   # max manual SOL per trade
_MAX_BUY_BNB = float(os.getenv("MAX_BUY_BNB", "2.0"))   # max manual BNB per trade


# ── App reference ──────────────────────────────────────────────────────────────
_app: Application | None = None

# ── Shared aiohttp session ─────────────────────────────────────────────────────
# One long-lived session with connection pooling for all bot HTTP calls.
# Initialized in post_init, closed on shutdown.
_http: aiohttp.ClientSession | None = None


def _get_http() -> aiohttp.ClientSession:
    """Return the shared session, or create a fallback if called before init."""
    if _http is not None:
        return _http
    return aiohttp.ClientSession(
        connector=aiohttp.TCPConnector(limit=20, ttl_dns_cache=300),
    )


# ── Keyboards ──────────────────────────────────────────────────────────────────

def _main_keyboard(lang: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton(t(lang, 'menu_wallet'),    callback_data="menu:wallet"),
         InlineKeyboardButton(t(lang, 'menu_balance'),   callback_data="menu:balance")],
        [InlineKeyboardButton(t(lang, 'menu_signals'),   callback_data="menu:signals"),
         InlineKeyboardButton(t(lang, 'menu_positions'), callback_data="menu:positions")],
        [InlineKeyboardButton(t(lang, 'menu_automode'),  callback_data="menu:automode"),
         InlineKeyboardButton(t(lang, 'menu_trades'),    callback_data="menu:trades")],
    ])


def _buy_keyboard(chain: str, token_address: str) -> InlineKeyboardMarkup | None:
    """Inline buy buttons for signal messages. Returns None if address missing."""
    if not token_address:
        return None
    if chain == "solana":
        amounts = [("0.1 SOL", "0.1"), ("0.5 SOL", "0.5"), ("1 SOL", "1.0")]
    else:
        amounts = [("0.01 BNB", "0.01"), ("0.05 BNB", "0.05"), ("0.1 BNB", "0.1")]
    buttons = [
        InlineKeyboardButton(
            f"💰 {label}",
            callback_data=f"buy:{chain}:{token_address}:{amt}",
        )
        for label, amt in amounts
    ]
    return InlineKeyboardMarkup([buttons, [InlineKeyboardButton("❌ Skip", callback_data="skip")]])


def _plans_keyboard(lang: str, current_tier: str) -> InlineKeyboardMarkup:
    buttons = []
    if current_tier != "basic":
        price = db.get_bot_setting("basic_price_usd", "29")
        buttons.append(InlineKeyboardButton(
            f"💳 Basic ${price}/міс", callback_data="plans_buy:basic"
        ))
    if current_tier != "pro":
        price = db.get_bot_setting("pro_price_usd", "79")
        buttons.append(InlineKeyboardButton(
            f"🚀 Pro ${price}/міс", callback_data="plans_buy:pro"
        ))
    rows = [buttons] if buttons else []
    if current_tier in ("basic", "pro"):
        rows.append([InlineKeyboardButton(
            t(lang, 'plan_my_payments'), callback_data="plans_buy:history"
        )])
    return InlineKeyboardMarkup(rows)


# ── Monitor send callback ──────────────────────────────────────────────────────

async def _send_signal(
    telegram_id: int,
    message: str,
    pair_data: dict | None = None,
    signal_meta: dict | None = None,
) -> None:
    if _app is None:
        return

    # Show BUY buttons only when auto-mode is OFF (auto-mode buys silently)
    auto_on = (
        signal_meta is not None
        and bool(signal_meta.get("auto_mode"))
        and signal_meta.get("user_tier") in ("basic", "pro")
    )
    keyboard = None
    if pair_data and not auto_on:
        keyboard = _buy_keyboard(
            pair_data.get("chain", ""),
            pair_data.get("token_address", ""),
        )

    try:
        await _app.bot.send_message(
            chat_id=telegram_id,
            text=message,
            parse_mode=ParseMode.HTML,
            disable_web_page_preview=True,
            reply_markup=keyboard,
        )
    except Exception as e:
        logger.warning("send_message failed to %d: %s", telegram_id, e)
        return

    await asyncio.sleep(0.04)  # ~25 msg/sec — stay under Telegram 30/sec limit

    if pair_data and signal_meta and auto_on:
        await _maybe_auto_buy(telegram_id, pair_data, signal_meta)


# ── Auto-buy ───────────────────────────────────────────────────────────────────

_MAX_OPEN_POSITIONS = 5  # hard cap per user


async def _maybe_auto_buy(
    telegram_id: int,
    pair_data: dict,
    signal_meta: dict,
) -> None:
    """
    Triggered after a signal is delivered to a user with auto_mode=1.
    Guards:
      1. Trading must be enabled (ENCRYPTION_KEY set)
      2. Score must meet user's auto_min_score
      3. No duplicate open position for this token
      4. User must not exceed MAX_OPEN_POSITIONS
      5. Sufficient balance
    On success: saves position + trade, notifies user with TX hash.
    Retry: up to 2 attempts with 5s gap.
    Timeout: 30s for Jupiter swaps.
    """
    if not can_trade():
        return

    user_id    = signal_meta.get("user_id")
    user_settings = signal_meta.get("user_settings", {})
    chain      = pair_data.get("chain", "")
    token_addr = pair_data.get("token_address", "")
    token_sym  = pair_data.get("token_symbol", "?")
    token_name = pair_data.get("token_name",   "?")
    score      = signal_meta.get("score", 0)
    price_usd  = signal_meta.get("price_usd") or pair_data.get("price_usd") or 0

    if not user_id or not token_addr or chain not in ("solana", "bsc"):
        return

    # ── Guard 1: user's personal min score for auto-buy
    auto_min = user_settings.get("auto_min_score", 80)
    if score < auto_min:
        logger.debug("Auto-buy skipped uid=%d: score %d < min %d", user_id, score, auto_min)
        return

    # ── Guard 2: no duplicate position
    if db.has_open_position(user_id, chain, token_addr):
        logger.debug("Auto-buy skipped uid=%d: already have open position in %s", user_id, token_sym)
        return

    # ── Guard 3: position cap
    open_count = db.count_open_positions(user_id)
    if open_count >= _MAX_OPEN_POSITIONS:
        logger.info("Auto-buy skipped uid=%d: %d open positions (max %d)", user_id, open_count, _MAX_OPEN_POSITIONS)
        await _notify_auto(telegram_id, f"Auto-buy <b>{token_sym}</b> skipped — max {_MAX_OPEN_POSITIONS} open positions reached.", signal_meta.get("lang", "ua"))
        return

    # ── Resolve wallet + private key for this chain
    wallet_row = db.get_wallet(user_id, chain)
    if not wallet_row or not wallet_row["encrypted_pk"]:
        logger.debug("Auto-buy skipped uid=%d: no %s wallet/key stored", user_id, chain)
        return
    from trader.wallet import decrypt_pk
    pk = decrypt_pk(wallet_row["encrypted_pk"])
    if not pk:
        logger.warning("Auto-buy uid=%d: failed to decrypt private key", user_id)
        return
    pub_key = wallet_row["address"]
    if not pub_key:
        return

    # ── Determine buy amount and check balance
    if chain == "solana":
        max_buy = float(user_settings.get("auto_max_buy_sol") or 0.1)
        balance = await get_sol_balance(pub_key)
        if balance < max_buy:
            logger.info("Auto-buy skipped uid=%d: SOL balance %.4f < %.4f", user_id, balance, max_buy)
            await _notify_auto(telegram_id, f"Auto-buy <b>{token_sym}</b> skipped — insufficient SOL balance ({balance:.4f} < {max_buy:.4f}).", signal_meta.get("lang", "ua"))
            return
        buy_amount = max_buy
    else:
        max_buy = float(user_settings.get("auto_max_buy_bnb") or 0.01)
        balance = await get_bnb_balance(pub_key)
        if balance < max_buy:
            logger.info("Auto-buy skipped uid=%d: BNB balance %.4f < %.4f", user_id, balance, max_buy)
            await _notify_auto(telegram_id, f"Auto-buy <b>{token_sym}</b> skipped — insufficient BNB balance ({balance:.4f} < {max_buy:.4f}).", signal_meta.get("lang", "ua"))
            return
        buy_amount = max_buy

    stop_loss_pct = float(user_settings.get("auto_stop_loss") or 20)

    # ── Execute with up to 2 retries
    result = None
    session = _get_http()
    for attempt in range(1, 3):
        try:
            if chain == "solana":
                from trader.jupiter import get_buy_quote, execute_swap
                quote = await asyncio.wait_for(
                    get_buy_quote(session, token_addr, buy_amount, slippage_bps=500),
                    timeout=30,
                )
                if not quote:
                    logger.warning("Auto-buy uid=%d attempt %d: no quote", user_id, attempt)
                    await asyncio.sleep(5)
                    continue
                result = await asyncio.wait_for(
                    execute_swap(session, quote, pub_key, pk),
                    timeout=30,
                )
            else:
                from trader.bsc import execute_buy as bsc_buy
                result = await asyncio.wait_for(
                    asyncio.to_thread(bsc_buy, token_addr, buy_amount, pk, 10.0),
                    timeout=30,
                )
        except asyncio.TimeoutError:
            logger.warning("Auto-buy uid=%d attempt %d: timeout", user_id, attempt)
            result = {"success": False, "tx_hash": None, "error": "timeout"}

        if result and result.get("success"):
            break
        if attempt < 2:
            await asyncio.sleep(5)

    if not result or not result.get("success"):
        err = (result or {}).get("error", "unknown error")
        logger.warning("Auto-buy uid=%d %s failed: %s", user_id, token_sym, err)
        await _notify_auto(telegram_id, f"Auto-buy <b>{token_sym}</b> failed: {err}", signal_meta.get("lang", "ua"))
        return

    tx_hash = result.get("tx_hash", "")

    # ── Save to DB
    db.save_trade(
        user_id=user_id, chain=chain,
        token_address=token_addr, token_symbol=token_sym,
        trade_type="buy", amount_in=buy_amount,
        amount_out=0, price_usd=float(price_usd),
        tx_hash=tx_hash, status="confirmed", mode="auto",
    )
    db.upsert_position(
        user_id=user_id, chain=chain,
        token_address=token_addr, token_symbol=token_sym,
        token_name=token_name, amount=buy_amount,
        buy_price_usd=float(price_usd),
        buy_amount_native=buy_amount,
        stop_loss_pct=stop_loss_pct,
    )

    logger.info(
        "Auto-buy SUCCESS uid=%d %s chain=%s amount=%.4f tx=%s",
        user_id, token_sym, chain, buy_amount, tx_hash,
    )

    native = "SOL" if chain == "solana" else "BNB"
    tx_link = (
        f'<a href="https://solscan.io/tx/{tx_hash}">Solscan</a>'
        if chain == "solana"
        else f'<a href="https://bscscan.com/tx/{tx_hash}">BscScan</a>'
    )
    msg = (
        f"Auto-buy executed!\n"
        f"Token: <b>{token_name}</b> (${token_sym})\n"
        f"Amount: <b>{buy_amount} {native}</b>\n"
        f"Price: ${float(price_usd):.8f}\n"
        f"SL: -{stop_loss_pct:.0f}%\n"
        f"TX: {tx_link}"
    )
    await _notify_auto(telegram_id, msg, signal_meta.get("lang", "ua"))


async def _notify_auto(telegram_id: int, text: str, _lang: str = "ua") -> None:
    """Send an auto-trading notification. Silently skip on error."""
    if _app is None:
        return
    try:
        await _app.bot.send_message(
            chat_id=telegram_id,
            text=text,
            parse_mode=ParseMode.HTML,
            disable_web_page_preview=True,
        )
    except Exception as e:
        logger.warning("_notify_auto to %d failed: %s", telegram_id, e)


# ── Ban guard ──────────────────────────────────────────────────────────────────

def _check_banned(telegram_id: int) -> bool:
    return db.is_banned(telegram_id)


# ── /start ─────────────────────────────────────────────────────────────────────

async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    if _check_banned(user.id):
        return
    if _rate_limited(user.id):
        return
    user_id = db.upsert_user(user.id, user.first_name, user.username)
    lang    = db.get_user_lang(user_id)
    await update.message.reply_text(
        t(lang, 'start', name=user.first_name),
        parse_mode=ParseMode.HTML,
        reply_markup=_main_keyboard(lang),
    )


# ── /help ──────────────────────────────────────────────────────────────────────

async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    if _check_banned(user.id):
        return
    user_id = db.upsert_user(user.id, user.first_name, user.username)
    lang    = db.get_user_lang(user_id)
    await update.message.reply_text(t(lang, 'help'), parse_mode=ParseMode.HTML)


# ── /status ────────────────────────────────────────────────────────────────────

async def cmd_status(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    if _check_banned(user.id):
        return
    if _rate_limited(user.id):
        return
    user_id   = db.upsert_user(user.id, user.first_name, user.username)
    lang      = db.get_user_lang(user_id)
    wallets   = db.get_all_wallets(user_id)
    settings  = db.get_user_settings(user_id)
    positions = db.get_open_positions(user_id)
    sent_today = db.count_signals_sent_today(user_id)
    tier      = db.get_user_tier(user_id)

    wallet_lines = []
    for w in wallets:
        icon     = "◎" if w["chain"] == "solana" else "🔶"
        key_icon = "🔐" if w["encrypted_pk"] else "👁"
        wallet_lines.append(f"  {icon} {w['chain'].upper()}: {w['address'][:10]}... {key_icon}")

    wallets_text = "\n".join(wallet_lines) if wallet_lines else t(lang, 'status_no_wallet')
    auto_text    = t(lang, 'auto_on') if (settings and settings["auto_mode"]) else t(lang, 'auto_off')
    tier_labels  = {"free": "🆓 Free", "basic": "💳 Basic", "pro": "🚀 Pro"}
    tier_text    = tier_labels.get(tier, tier.upper())

    await update.message.reply_text(
        t(lang, 'status_full',
          wallets=wallets_text,
          signals_today=sent_today,
          positions=len(positions),
          auto=auto_text,
          tier=tier_text),
        parse_mode=ParseMode.HTML,
        reply_markup=_main_keyboard(lang),
    )


# ── /plans ─────────────────────────────────────────────────────────────────────

async def cmd_plans(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    if _check_banned(user.id):
        return
    user_id = db.upsert_user(user.id, user.first_name, user.username)
    lang    = db.get_user_lang(user_id)
    tier    = db.get_user_tier(user_id)
    _show_plans(update, lang, tier, user_id)
    await _send_plans(update, lang, tier, user_id)


async def _send_plans(update_or_query, lang: str, tier: str, user_id: int) -> None:
    basic_price = db.get_bot_setting("basic_price_usd", "29")
    pro_price   = db.get_bot_setting("pro_price_usd", "79")
    basic_days  = db.get_bot_setting("basic_duration_days", "30")
    pro_days    = db.get_bot_setting("pro_duration_days", "30")

    tier_labels = {"free": "🆓 Free", "basic": "💳 Basic", "pro": "🚀 Pro"}
    current_label = tier_labels.get(tier, tier.upper())

    text = t(lang, 'plans',
             basic_price=basic_price, pro_price=pro_price,
             basic_days=basic_days,   pro_days=pro_days,
             current_tier=current_label)

    kb = _plans_keyboard(lang, tier)
    msg = update_or_query.message if hasattr(update_or_query, "message") else update_or_query
    await msg.reply_text(text, parse_mode=ParseMode.HTML, reply_markup=kb)


def _show_plans(update, lang, tier, user_id):
    pass  # placeholder kept for clarity


# ── /language ──────────────────────────────────────────────────────────────────

async def cmd_language(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    if _check_banned(user.id):
        return
    user_id = db.upsert_user(user.id, user.first_name, user.username)
    lang    = db.get_user_lang(user_id)
    keyboard = InlineKeyboardMarkup([[
        InlineKeyboardButton("🇺🇦 Українська", callback_data="lang:ua"),
        InlineKeyboardButton("🇬🇧 English",     callback_data="lang:en"),
    ]])
    await update.message.reply_text(t(lang, 'lang_choose'), reply_markup=keyboard)


async def cb_language(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query    = update.callback_query
    user     = query.from_user
    if _check_banned(user.id):
        return
    user_id  = db.upsert_user(user.id, user.first_name, user.username)
    parts    = query.data.split(":")
    new_lang = parts[1] if len(parts) > 1 else "ua"
    if new_lang not in ("ua", "en"):
        await query.answer()
        return
    db.set_user_lang(user_id, new_lang)
    key = 'lang_set_ua' if new_lang == 'ua' else 'lang_set_en'
    await query.answer()
    await query.edit_message_text(t(new_lang, key))


# ── Main menu callbacks ────────────────────────────────────────────────────────

async def cb_menu(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query   = update.callback_query
    user    = query.from_user
    if _check_banned(user.id):
        return
    if _rate_limited(user.id):
        await query.answer(t("ua", "rate_limit"))
        return
    user_id = db.upsert_user(user.id, user.first_name, user.username)
    lang    = db.get_user_lang(user_id)
    action  = query.data.split(":")[1]
    await query.answer()

    # Extra rate limit for network-heavy menu items
    if action in ("balance", "positions") and _rate_limited(user.id, limit=3, window=30):
        await query.answer("Зачекайте перед наступним запитом.", show_alert=True)
        return

    dispatch = {
        "wallet":    _menu_wallet,
        "balance":   _menu_balance,
        "signals":   _menu_signals,
        "positions": _menu_positions,
        "automode":  _menu_automode,
        "trades":    _menu_trades,
    }
    handler = dispatch.get(action)
    if handler:
        await handler(query, user_id, lang)


async def _menu_wallet(query, user_id: int, lang: str) -> None:
    wallets = db.get_all_wallets(user_id)
    if not wallets:
        text = t(lang, 'wallet_empty')
    else:
        lines = [t(lang, 'wallet_header')]
        for w in wallets:
            icon     = "◎" if w["chain"] == "solana" else "🔶"
            key_icon = "🔐" if w["encrypted_pk"] else "👁"
            short    = w["address"][:8] + "..." + w["address"][-6:]
            lines.append(f"{icon} {w['chain'].upper()}: <code>{short}</code> {key_icon}")
        text = "\n".join(lines)

    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton("◎ Додати Solana", callback_data="wallet:add:solana"),
         InlineKeyboardButton("🔶 Додати BNB",   callback_data="wallet:add:bsc")],
        [InlineKeyboardButton("🗑 Видалити Solana", callback_data="wallet:del:solana"),
         InlineKeyboardButton("🗑 Видалити BNB",    callback_data="wallet:del:bsc")],
        [InlineKeyboardButton("🔑 Додати приватний ключ", callback_data="wallet:addkey")],
        [InlineKeyboardButton("🗝 Видалити ключі",        callback_data="wallet:delkey")],
    ])
    await query.edit_message_text(text, parse_mode=ParseMode.HTML, reply_markup=keyboard)


async def _menu_balance(query, user_id: int, lang: str) -> None:
    wallets = db.get_all_wallets(user_id)
    if not wallets:
        await query.edit_message_text(t(lang, 'balance_no_wallet'))
        return
    await query.edit_message_text(t(lang, 'balance_loading'))

    # Pre-load open positions to show BSC token balances
    open_positions = {
        (p["chain"], p["token_address"]): p
        for p in db.get_open_positions(user_id)
    }

    lines = [t(lang, 'balance_header')]
    for w in wallets:
        icon  = "◎" if w["chain"] == "solana" else "🔶"
        short = w["address"][:8] + "..." + w["address"][-6:]
        lines.append(f"\n{icon} <b>{w['chain'].upper()}</b>\n<code>{short}</code>")

        if w["chain"] == "solana":
            bal = await get_sol_balance(w["address"])
            lines.append(f"  💰 SOL: <b>{bal:.4f}</b>")
            tokens = await get_sol_token_balances(w["address"])
            if tokens:
                for tok in tokens[:5]:
                    mint_short = tok["mint"][:8] + "..."
                    lines.append(f"  🪙 <code>{mint_short}</code>: {tok['amount']:,.4f}")
                if len(tokens) > 5:
                    lines.append(f"  … та ще {len(tokens) - 5} токенів")
            else:
                lines.append("  🪙 Токени не знайдено")
        else:
            bal = await get_bnb_balance(w["address"])
            lines.append(f"  💰 BNB: <b>{bal:.4f}</b>")
            # Show BSC token balances from open positions
            bsc_positions = [p for (ch, _addr), p in open_positions.items() if ch == "bsc"]
            for pos in bsc_positions[:5]:
                raw, decimals = await get_bsc_token_balance_raw(w["address"], pos["token_address"])
                if raw > 0:
                    ui_amt = raw / (10 ** decimals) if decimals else raw
                    sym    = pos["token_symbol"] or pos["token_address"][:8] + "..."
                    lines.append(f"  🪙 <b>{sym}</b>: {ui_amt:,.4f}")
            if not bsc_positions:
                lines.append("  🪙 Відкритих позицій немає")

    await query.edit_message_text("\n".join(lines), parse_mode=ParseMode.HTML)


async def _menu_signals(query, user_id: int, lang: str) -> None:
    from scanner.monitor import _tier_min_score
    tier      = db.get_user_tier(user_id)
    signals   = db.get_recent_signals(limit=50)
    min_score = _tier_min_score(tier)
    visible   = [s for s in signals if s["score"] >= min_score]

    if not visible:
        await query.edit_message_text(t(lang, 'no_signals'))
        return

    await query.edit_message_text(
        t(lang, 'signals_header', count=len(visible)),
        parse_mode=ParseMode.HTML,
    )

    for sig in visible[:5]:
        chain_icon = "◎" if sig["chain"] == "solana" else "🔶"
        st_map = {"STRONG_BUY": "🟢 STRONG BUY", "BUY": "🟡 BUY", "WATCH": "👀 WATCH"}
        label  = st_map.get(sig["signal_type"], sig["signal_type"])
        chg    = sig["price_change_1h"] or 0
        sign   = "+" if chg >= 0 else ""

        msg = (
            f"{label}  |  Score: {sig['score']}/100\n"
            f"{chain_icon} {sig['chain'].upper()}  •  {sig['dex'] or ''}\n"
            f"🪙 <b>{sig['token_name'] or '?'}</b> (${sig['token_symbol'] or '?'})\n"
            f"💧 {t(lang,'sig_liq')}: ${sig['liquidity_usd']:,.0f}\n"
            f"📈 {t(lang,'sig_chg')}: {sign}{chg:.1f}%\n"
        )
        if sig["token_address"]:
            msg += f"\n<code>{sig['token_address']}</code>"

        keyboard = _buy_keyboard(sig["chain"], sig["token_address"] or "")
        await query.message.reply_text(
            msg,
            parse_mode=ParseMode.HTML,
            disable_web_page_preview=True,
            reply_markup=keyboard,
        )


async def _menu_positions(query, user_id: int, lang: str) -> None:
    positions = db.get_open_positions(user_id)
    if not positions:
        await query.edit_message_text(t(lang, 'positions_empty'))
        return

    await query.edit_message_text(
        t(lang, 'positions_header', count=len(positions)),
        parse_mode=ParseMode.HTML,
    )

    from scanner.dexscreener import get_pairs_by_token
    from scanner.price_cache import get_cached_price, set_cached_price

    session = _get_http()
    for pos in positions:
        icon       = "◎" if pos["chain"] == "solana" else "🔶"
        buy_price  = float(pos["buy_price_usd"] or 0)
        sym        = pos["token_symbol"] or "?"
        name       = pos["token_name"]   or "?"

        # Use cached price when available to avoid hammering DexScreener
        pnl_line = ""
        try:
            cur_price = get_cached_price(pos["chain"], pos["token_address"])
            if cur_price is None:
                pairs = await asyncio.wait_for(
                    get_pairs_by_token(session, pos["chain"], pos["token_address"]),
                    timeout=8,
                )
                if pairs:
                    best = max(pairs, key=lambda p: float(
                        (p.get("liquidity") or {}).get("usd") or 0))
                    raw = best.get("priceUsd") or best.get("priceNative")
                    if raw:
                        cur_price = float(raw)
                        set_cached_price(pos["chain"], pos["token_address"], cur_price)
            if cur_price and buy_price > 0:
                pnl_pct  = (cur_price - buy_price) / buy_price * 100
                sign     = "+" if pnl_pct >= 0 else ""
                emoji    = "" if pnl_pct >= 0 else ""
                pnl_line = f"\n{emoji} PnL: <b>{sign}{pnl_pct:.1f}%</b>  (cur: ${cur_price:.8f})"
        except (asyncio.TimeoutError, Exception):
            pass

        buy_price_fmt = f"${buy_price:.8f}" if buy_price > 0 else "невідомо"
        msg = (
            f"{icon} <b>{sym}</b> ({name})\n"
            f"📦 {pos['amount']:,.4f} токенів\n"
            f"💵 Куплено по: {buy_price_fmt}"
            f"{pnl_line}\n"
            f"🛑 Stop-loss: -{pos['stop_loss_pct']}%\n"
            f"📅 {pos['opened_at'][:10]}\n"
            f"<code>{pos['token_address']}</code>"
        )
        keyboard = InlineKeyboardMarkup([[
            InlineKeyboardButton("🔴 Sell 50%",  callback_data=f"sell:{pos['id']}:50"),
            InlineKeyboardButton("🔴 Sell 100%", callback_data=f"sell:{pos['id']}:100"),
        ]])
        await query.message.reply_text(msg, parse_mode=ParseMode.HTML, reply_markup=keyboard)
        await asyncio.sleep(0.5)  # space out DexScreener calls


async def _menu_automode(query, user_id: int, lang: str) -> None:
    s    = db.get_user_settings(user_id)
    on   = bool(s["auto_mode"])          if s else False
    pump = bool(s["notify_all_tokens"])  if s else False

    text = t(lang, 'auto_status',
             status=t(lang, 'auto_on') if on else t(lang, 'auto_off'),
             score=s["auto_min_score"]  if s else 80,
             sol=s["auto_max_buy_sol"]  if s else 0.1,
             bnb=s["auto_max_buy_bnb"]  if s else 0.01,
             sl=s["auto_stop_loss"]     if s else 20)

    pump_btn = ("🟣 pump.fun: ON ✅" if pump else "🟣 pump.fun: OFF")
    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton(t(lang, 'auto_toggle_on'),  callback_data="auto:on"),
         InlineKeyboardButton(t(lang, 'auto_toggle_off'), callback_data="auto:off")],
        [InlineKeyboardButton(pump_btn, callback_data="auto:pump_toggle")],
        [InlineKeyboardButton(t(lang, 'auto_config'),     callback_data="auto:config")],
    ])
    await query.edit_message_text(text, parse_mode=ParseMode.HTML, reply_markup=keyboard)


async def _menu_trades(query, user_id: int, lang: str) -> None:
    trades = db.get_user_trades(user_id, limit=10)
    if not trades:
        await query.edit_message_text(t(lang, 'trades_empty'))
        return

    lines = [t(lang, 'trades_header')]
    for tr in trades:
        type_icon  = "🟢" if tr["trade_type"] == "buy" else "🔴"
        chain_icon = "◎" if tr["chain"] == "solana" else "🔶"
        stat_icon  = {"confirmed": "✅", "pending": "⏳", "failed": "❌"}.get(tr["status"] or "", "❓")
        native     = "SOL" if tr["chain"] == "solana" else "BNB"
        mode_icon  = "🤖" if (tr["mode"] if "mode" in tr.keys() else "") == "auto" else "👤"
        amount_in  = float(tr["amount_in"]  or 0)
        price_usd  = float(tr["price_usd"]  or 0) if "price_usd" in tr.keys() else 0
        price_str  = f"  📈 ${price_usd:.8f}\n" if price_usd > 0 else ""
        lines.append(
            f"\n{type_icon} {tr['trade_type'].upper()} {chain_icon} {mode_icon} "
            f"<b>{tr['token_symbol'] or '?'}</b>\n"
            f"  {amount_in:.4f} {native} {stat_icon}\n"
            f"{price_str}"
            f"  {(tr['created_at'] or '')[:16]}"
        )
    await query.edit_message_text("\n".join(lines), parse_mode=ParseMode.HTML)


# ── Plans / Payment callbacks ──────────────────────────────────────────────────

async def cb_plans_buy(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query   = update.callback_query
    user    = query.from_user
    if _check_banned(user.id):
        return
    user_id = db.upsert_user(user.id, user.first_name, user.username)
    lang    = db.get_user_lang(user_id)
    await query.answer()

    action = query.data.split(":")[1]   # basic | pro | history | check:<invoice_id>

    if action == "history":
        payments = db.get_user_payments(user_id, limit=5)
        if not payments:
            await query.edit_message_text(t(lang, 'pay_no_history'))
            return
        lines = [t(lang, 'pay_history_header')]
        status_icons = {"paid": "✅", "pending": "⏳", "expired": "❌"}
        for p in payments:
            icon = status_icons.get(p["status"], "❓")
            lines.append(
                f"{icon} <b>{p['tier'].upper()}</b> ${p['amount_usd']:.0f} — "
                f"{p['status']} — {p['created_at'][:10]}"
            )
        await query.edit_message_text("\n".join(lines), parse_mode=ParseMode.HTML)
        return

    tier = action  # basic or pro
    if tier not in ("basic", "pro"):
        return

    # Check if payments are enabled
    if not pay.is_enabled():
        await query.edit_message_text(t(lang, 'pay_not_configured'))
        return

    # Check maintenance mode
    if db.get_bot_setting("maintenance_mode", "0") == "1":
        await query.edit_message_text(t(lang, 'pay_maintenance'))
        return

    await query.edit_message_text(t(lang, 'pay_creating'))

    result = await pay.create_invoice(tier, user_id)
    if not result:
        await query.edit_message_text(t(lang, 'pay_error'))
        return

    price   = result["amount_usd"]
    pay_url = result["pay_url"]
    inv_id  = result["invoice_id"]
    days    = db.get_bot_setting(f"{tier}_duration_days", "30")

    tier_labels = {"basic": "💳 Basic", "pro": "🚀 Pro"}
    label = tier_labels.get(tier, tier.upper())

    text = t(lang, 'pay_invoice',
             tier=label, price=f"{price:.0f}", days=days, inv_id=inv_id)

    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton(t(lang, 'pay_btn_pay'), url=pay_url)],
        [InlineKeyboardButton(
            t(lang, 'pay_btn_check'),
            callback_data=f"pay_check:{inv_id}"
        )],
    ])
    await query.edit_message_text(text, parse_mode=ParseMode.HTML,
                                  reply_markup=keyboard,
                                  disable_web_page_preview=True)


async def cb_pay_check(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """User manually checks if their payment went through."""
    query   = update.callback_query
    user    = query.from_user
    if _check_banned(user.id):
        return
    user_id = db.upsert_user(user.id, user.first_name, user.username)
    lang    = db.get_user_lang(user_id)
    await query.answer()

    inv_id  = query.data.split(":", 1)[1]
    payment = db.get_payment_by_invoice(inv_id)

    if not payment or payment["user_id"] != user_id:
        await query.edit_message_text(t(lang, 'pay_not_found'))
        return

    if payment["status"] == "paid":
        tier = payment["tier"]
        sub  = db.get_subscription(user_id)
        exp  = sub["expires_at"][:10] if sub and sub["expires_at"] else "—"
        await query.edit_message_text(
            t(lang, 'pay_already_paid', tier=tier.upper(), expires=exp),
            parse_mode=ParseMode.HTML
        )
        return

    if payment["status"] == "expired":
        await query.edit_message_text(t(lang, 'pay_expired'))
        return

    # Check live
    status = await pay.check_invoice(inv_id)

    if status == "paid":
        pay._activate_subscription(payment)
        tier = payment["tier"]
        days = int(db.get_bot_setting(f"{tier}_duration_days", "30"))
        from datetime import datetime, timezone, timedelta
        expires = (datetime.now(timezone.utc) + timedelta(days=days)).strftime("%d.%m.%Y")
        await query.edit_message_text(
            t(lang, 'pay_confirmed', tier=tier.upper(), expires=expires),
            parse_mode=ParseMode.HTML
        )
    elif status == "expired" or status is None:
        db.update_payment_status(payment["id"], "expired")
        await query.edit_message_text(t(lang, 'pay_expired'))
    else:
        # Still active (not paid yet)
        await query.edit_message_text(
            t(lang, 'pay_pending'),
            parse_mode=ParseMode.HTML,
            reply_markup=InlineKeyboardMarkup([[
                InlineKeyboardButton(t(lang, 'pay_btn_check'),
                                     callback_data=f"pay_check:{inv_id}")
            ]])
        )


# ── Wallet conversation ────────────────────────────────────────────────────────

async def cb_wallet(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query   = update.callback_query
    user    = query.from_user
    if _check_banned(user.id):
        return ConversationHandler.END
    user_id = db.upsert_user(user.id, user.first_name, user.username)
    lang    = db.get_user_lang(user_id)
    await query.answer()

    parts  = query.data.split(":")
    action = parts[1]

    if action == "add":
        context.user_data["wallet_chain"] = parts[2]
        await query.edit_message_text(
            t(lang, 'wallet_enter_address', chain=parts[2].upper()),
        )
        return WALLET_ENTER_ADDRESS

    if action == "del":
        db.delete_wallet(user_id, parts[2])
        await query.edit_message_text(t(lang, 'wallet_deleted', chain=parts[2].upper()))
        return ConversationHandler.END

    if action == "delkey":
        for w in db.get_all_wallets(user_id):
            db.update_wallet_pk(user_id, w["chain"], None)
        await query.edit_message_text(t(lang, 'wallet_pk_deleted'))
        return ConversationHandler.END

    if action == "addkey":
        if not can_trade():
            await query.edit_message_text(t(lang, 'trading_no_enc_key'))
            return ConversationHandler.END
        wallets = db.get_all_wallets(user_id)
        if not wallets:
            await query.edit_message_text(t(lang, 'wallet_no_wallet_for_key'))
            return ConversationHandler.END
        keyboard = InlineKeyboardMarkup([[
            InlineKeyboardButton(
                f"{'◎' if w['chain']=='solana' else '🔶'} {w['chain'].upper()}",
                callback_data=f"wallet:addkey2:{w['chain']}"
            ) for w in wallets
        ]])
        await query.edit_message_text(t(lang, 'wallet_choose_chain_key'), reply_markup=keyboard)
        return ConversationHandler.END

    if action == "addkey2":
        if not can_trade():
            await query.edit_message_text(t(lang, 'trading_no_enc_key'))
            return ConversationHandler.END
        context.user_data["wallet_chain"] = parts[2]
        await query.edit_message_text(
            t(lang, 'wallet_enter_pk_warning'), parse_mode=ParseMode.HTML,
        )
        return WALLET_ENTER_KEY

    return ConversationHandler.END


async def _recv_address(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    user    = update.effective_user
    if _check_banned(user.id):
        return ConversationHandler.END
    user_id = db.upsert_user(user.id, user.first_name, user.username)
    lang    = db.get_user_lang(user_id)
    address = update.message.text.strip()
    chain   = context.user_data.get("wallet_chain", "solana")

    valid = is_valid_solana_address(address) if chain == "solana" else is_valid_evm_address(address)
    if not valid:
        await update.message.reply_text(t(lang, 'wallet_invalid_address'))
        return WALLET_ENTER_ADDRESS

    db.save_wallet(user_id, chain, address)
    await update.message.reply_text(
        t(lang, 'wallet_saved', chain=chain.upper(), address=address),
        parse_mode=ParseMode.HTML,
    )
    return ConversationHandler.END


async def _recv_pk(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    user    = update.effective_user
    if _check_banned(user.id):
        return ConversationHandler.END
    user_id = db.upsert_user(user.id, user.first_name, user.username)
    lang    = db.get_user_lang(user_id)
    pk      = update.message.text.strip()
    chain   = context.user_data.get("wallet_chain", "solana")

    try:
        await update.message.delete()
    except Exception:
        pass

    # Validate key format before storing
    if chain == "solana":
        if not is_valid_solana_private_key(pk):
            await update.message.reply_text(t(lang, 'wallet_pk_invalid'))
            return ConversationHandler.END
    else:
        if not is_valid_bsc_private_key(pk):
            await update.message.reply_text(t(lang, 'wallet_pk_invalid'))
            return ConversationHandler.END

    encrypted = encrypt_pk(pk)
    if not encrypted:
        await update.message.reply_text(t(lang, 'wallet_pk_encrypt_failed'))
        return ConversationHandler.END

    db.update_wallet_pk(user_id, chain, encrypted)
    await update.message.reply_text(t(lang, 'wallet_pk_saved'), parse_mode=ParseMode.HTML)
    return ConversationHandler.END


async def conv_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    user    = update.effective_user
    user_id = db.upsert_user(user.id, user.first_name, user.username)
    lang    = db.get_user_lang(user_id)
    await update.message.reply_text(t(lang, 'cancelled'))
    return ConversationHandler.END


# ── Buy callback ───────────────────────────────────────────────────────────────

async def cb_buy(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query   = update.callback_query
    user    = query.from_user
    if _check_banned(user.id):
        return
    user_id = db.upsert_user(user.id, user.first_name, user.username)
    lang    = db.get_user_lang(user_id)

    # ── Rate limit: max 3 buy actions per 60s
    if _trade_rate_limited(user.id):
        await query.answer("Забагато запитів. Зачекайте хвилину.", show_alert=True)
        return
    await query.answer()

    parts = query.data.split(":", 3)
    if len(parts) < 4:
        await query.message.reply_text("❌ Invalid callback data.")
        return

    _, chain, token_address, amount_str = parts

    # ── Validate chain
    if chain not in ("solana", "bsc"):
        await query.message.reply_text("❌ Unknown chain.")
        return

    # ── Validate token address
    if chain == "solana" and not is_valid_solana_address(token_address):
        await query.message.reply_text("❌ Invalid token address.")
        return
    if chain == "bsc" and not is_valid_evm_address(token_address):
        await query.message.reply_text("❌ Invalid token address.")
        return

    # ── Validate and cap amount
    try:
        amount = float(amount_str)
        if amount <= 0:
            raise ValueError
    except (ValueError, TypeError):
        await query.message.reply_text("❌ Invalid amount.")
        return
    max_allowed = _MAX_BUY_SOL if chain == "solana" else _MAX_BUY_BNB
    if amount > max_allowed:
        native = "SOL" if chain == "solana" else "BNB"
        await query.message.reply_text(f"❌ Amount exceeds max allowed ({max_allowed} {native}).")
        return

    # ── Duplicate buy guard
    if db.has_open_position(user_id, chain, token_address):
        await query.message.reply_text("⚠️ Ви вже маєте відкриту позицію по цьому токену.")
        return

    wallet = db.get_wallet(user_id, chain)
    if not wallet:
        await query.message.reply_text(t(lang, 'buy_no_wallet', chain=chain.upper()))
        return
    if not wallet["encrypted_pk"]:
        await query.message.reply_text(t(lang, 'buy_no_pk'))
        return

    pk = decrypt_pk(wallet["encrypted_pk"])
    if not pk:
        await query.message.reply_text(t(lang, 'buy_decrypt_failed'))
        return

    short_addr = token_address[:12] + "..."
    await query.message.reply_text(
        t(lang, 'buy_executing', amount=amount,
          chain="SOL" if chain == "solana" else "BNB",
          address=short_addr),
        parse_mode=ParseMode.HTML,
    )

    session = _get_http()
    if chain == "solana":
        from trader.jupiter import get_buy_quote, execute_swap
        quote = await get_buy_quote(session, token_address, amount)
        if not quote:
            await query.message.reply_text(t(lang, 'buy_quote_failed'))
            return
        result = await execute_swap(session, quote, wallet["address"], pk)
    else:
        from trader.bsc import execute_buy
        # execute_buy is synchronous (web3) — run in thread to avoid blocking event loop
        result = await asyncio.to_thread(execute_buy, token_address, amount, pk)

    if result["success"]:
        trade_id = db.save_trade(user_id, chain, token_address, "?", "buy",
                                 amount, 0, 0, result["tx_hash"], "pending")
        # Create position record
        settings = db.get_user_settings(user_id)
        sl_pct = settings["auto_stop_loss"] if settings else 20
        db.upsert_position(user_id, chain, token_address, "?", "?",
                           amount, 0, amount, sl_pct)
        await query.message.reply_text(
            t(lang, 'buy_success', tx=result["tx_hash"]),
            parse_mode=ParseMode.HTML,
        )
    else:
        await query.message.reply_text(
            t(lang, 'buy_failed', error=result.get("error", "Unknown")),
            parse_mode=ParseMode.HTML,
        )


async def cb_skip(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.callback_query.answer("Skipped")
    try:
        await update.callback_query.edit_message_reply_markup(reply_markup=None)
    except Exception:
        pass


# ── Positions & auto callbacks ─────────────────────────────────────────────────

async def cb_pos(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query   = update.callback_query
    user    = query.from_user
    if _check_banned(user.id):
        return
    user_id = db.upsert_user(user.id, user.first_name, user.username)
    lang    = db.get_user_lang(user_id)
    await query.answer()

    parts  = query.data.split(":")
    action = parts[1] if len(parts) > 1 else ""

    if action == "close_all_confirm":
        # Confirmed — close all open positions (DB only, no on-chain sell)
        positions = db.get_open_positions(user_id)
        for pos in positions:
            db.close_position(pos["id"])
        await query.edit_message_text(t(lang, 'pos_closed_all', count=len(positions)))
    else:
        # First tap — ask for confirmation before wiping all positions
        positions = db.get_open_positions(user_id)
        if not positions:
            await query.edit_message_text(t(lang, 'positions_empty'))
            return
        kb = InlineKeyboardMarkup([[
            InlineKeyboardButton("✅ Підтвердити закриття", callback_data="pos:close_all_confirm"),
            InlineKeyboardButton("❌ Скасувати",            callback_data="skip"),
        ]])
        await query.edit_message_text(
            f"⚠️ Закрити всі <b>{len(positions)}</b> відкритих позицій?\n"
            f"(Продаж на блокчейні НЕ виконується — тільки видалення з бота.)",
            parse_mode=ParseMode.HTML,
            reply_markup=kb,
        )


async def cb_sell(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query   = update.callback_query
    user    = query.from_user
    if _check_banned(user.id):
        return
    user_id = db.upsert_user(user.id, user.first_name, user.username)
    lang    = db.get_user_lang(user_id)

    # ── Rate limit: max 3 sell actions per 60s
    if _trade_rate_limited(user.id):
        await query.answer("Забагато запитів. Зачекайте хвилину.", show_alert=True)
        return
    await query.answer()

    # ── Safe parse of callback data
    parts = query.data.split(":")
    if len(parts) < 3:
        await query.edit_message_text("❌ Invalid callback data.")
        return
    try:
        pos_id   = int(parts[1])
        sell_pct = int(parts[2])
    except (ValueError, IndexError):
        await query.edit_message_text("❌ Invalid sell parameters.")
        return
    if sell_pct not in (50, 100):
        await query.edit_message_text("❌ Invalid sell percentage.")
        return

    positions = db.get_open_positions(user_id)
    pos = next((p for p in positions if p["id"] == pos_id), None)
    if not pos:
        await query.edit_message_text("❌ Позицію не знайдено.")
        return

    chain  = pos["chain"]
    wallet = db.get_wallet(user_id, chain)
    if not wallet or not wallet["encrypted_pk"]:
        await query.edit_message_text(t(lang, 'buy_no_pk'))
        return

    pk = decrypt_pk(wallet["encrypted_pk"])
    if not pk:
        await query.edit_message_text(t(lang, 'buy_decrypt_failed'))
        return

    sym = pos["token_symbol"] or "?"
    await query.edit_message_text(
        f"⏳ Продаю {sell_pct}% <b>{sym}</b>...",
        parse_mode=ParseMode.HTML,
    )

    session = _get_http()
    if chain == "solana":
        # Get actual on-chain balance for exact raw amount
        raw_total, decimals = await get_sol_token_balance_raw(
            wallet["address"], pos["token_address"])
        if raw_total <= 0:
            await query.edit_message_text("❌ Токени не знайдено в гаманці.")
            return
        amount_raw = int(raw_total * sell_pct / 100)
        from trader.jupiter import get_sell_quote, execute_swap
        quote = await get_sell_quote(session, pos["token_address"], amount_raw)
        if not quote:
            await query.edit_message_text("❌ Не вдалося отримати ціну продажу.")
            return
        result = await execute_swap(session, quote, wallet["address"], pk)
    else:
        # Get actual decimals from chain — don't assume 18
        raw_total, decimals = await get_bsc_token_balance_raw(
            wallet["address"], pos["token_address"])
        if raw_total <= 0:
            await query.edit_message_text("❌ Токени не знайдено в гаманці.")
            return
        amount_raw = int(raw_total * sell_pct / 100)
        from trader.bsc import execute_sell
        result = await asyncio.to_thread(execute_sell, pos["token_address"], amount_raw, pk, 10.0)

    sell_ui = amount_raw / (10 ** decimals) if decimals else amount_raw

    if result["success"]:
        db.save_trade(
            user_id=user_id, chain=chain,
            token_address=pos["token_address"], token_symbol=sym,
            trade_type="sell", amount_in=sell_ui, amount_out=0,
            price_usd=0, tx_hash=result["tx_hash"], status="pending",
        )
        if sell_pct == 100:
            db.close_position(pos_id)
        else:
            with db.get_conn() as conn:
                conn.execute("UPDATE positions SET amount=amount*? WHERE id=?",
                             ((100 - sell_pct) / 100, pos_id))
        await query.edit_message_text(
            t(lang, 'sell_success', tx=result["tx_hash"]),
            parse_mode=ParseMode.HTML,
        )
    else:
        await query.edit_message_text(
            t(lang, 'buy_failed', error=result.get("error", "Unknown")),
            parse_mode=ParseMode.HTML,
        )


async def cb_auto(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query   = update.callback_query
    user    = query.from_user
    if _check_banned(user.id):
        return
    user_id = db.upsert_user(user.id, user.first_name, user.username)
    lang    = db.get_user_lang(user_id)
    await query.answer()

    action = query.data.split(":")[1]
    if action == "on":
        db.update_user_settings(user_id, auto_mode=1)
        await query.edit_message_text(t(lang, 'auto_enabled'), parse_mode=ParseMode.HTML)
    elif action == "off":
        db.update_user_settings(user_id, auto_mode=0)
        await query.edit_message_text(t(lang, 'auto_disabled'))
    elif action == "config":
        await query.edit_message_text(t(lang, 'auto_config_help'), parse_mode=ParseMode.HTML)
    elif action == "pump_toggle":
        s    = db.get_user_settings(user_id)
        curr = bool(s["notify_all_tokens"]) if s else False
        db.update_user_settings(user_id, notify_all_tokens=0 if curr else 1)
        if curr:
            await query.edit_message_text("🟣 pump.fun сповіщення <b>вимкнено</b>.", parse_mode=ParseMode.HTML)
        else:
            await query.edit_message_text("🟣 pump.fun сповіщення <b>увімкнено</b>!\n\nБот надсилатиме кожен новий токен з pump.fun.", parse_mode=ParseMode.HTML)


# ── Background: broadcast task ─────────────────────────────────────────────────

async def _broadcast_loop() -> None:
    """Check for pending admin broadcasts every 30s and send them."""
    logger.info("Broadcast loop started.")
    while True:
        await asyncio.sleep(30)
        try:
            await _process_broadcasts()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("Broadcast loop error: %s", e)


async def _process_broadcasts() -> None:
    if _app is None:
        return
    pending = db.get_pending_broadcasts()
    for bcast in pending:
        db.update_broadcast_status(bcast["id"], "sending")
        users = db.get_all_active_users_with_tier()
        tier_filter = bcast["tier_filter"]
        if tier_filter:
            users = [u for u in users if u["tier"] == tier_filter]

        sent = 0
        for user in users:
            try:
                await _app.bot.send_message(
                    chat_id=user["telegram_id"],
                    text=bcast["message"],
                    parse_mode=ParseMode.HTML,
                    disable_web_page_preview=True,
                )
                sent += 1
                await asyncio.sleep(0.05)   # ~20 msg/sec (Telegram limit: 30/sec)
            except Exception as e:
                logger.warning("Broadcast send error to %d: %s", user["telegram_id"], e)

        db.update_broadcast_status(bcast["id"], "sent", sent_count=sent)
        logger.info("Broadcast #%d sent to %d users.", bcast["id"], sent)


# ── Background: subscription reminder ─────────────────────────────────────────

async def _subscription_reminder_loop() -> None:
    """
    Runs every 6 hours.
    Sends a reminder to users whose subscription expires within 3 days.
    Stub — full logic implemented in STEP 6.
    """
    logger.info("Subscription reminder loop started.")
    while True:
        await asyncio.sleep(6 * 3600)
        try:
            await _check_expiring_subscriptions()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("Subscription reminder error: %s", e)


async def _check_expiring_subscriptions() -> None:
    if _app is None:
        return
    expiring = db.get_expiring_subscriptions(days=3)
    for user in expiring:
        lang = user.get("lang") or "ua"
        tier = user.get("tier", "basic")
        try:
            from lang import t as _t
            msg = _t(lang, "sub_expiring_soon").format(tier=tier.upper())
        except Exception:
            msg = f"Your <b>{tier.upper()}</b> subscription expires in 3 days. Renew to keep receiving signals."
        try:
            await _app.bot.send_message(
                chat_id=user["telegram_id"],
                text=msg,
                parse_mode=ParseMode.HTML,
            )
            await asyncio.sleep(0.05)
        except Exception as e:
            logger.warning("Reminder send error to %d: %s", user["telegram_id"], e)


# ── Background: position monitor ───────────────────────────────────────────────

async def _position_monitor_loop() -> None:
    """
    Runs every 5 minutes.
    Evaluates open positions for SL/TP triggers.
    Stub — full logic implemented in STEP 6.
    """
    logger.info("Position monitor loop started.")
    while True:
        await asyncio.sleep(5 * 60)
        try:
            await _evaluate_open_positions()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("Position monitor error: %s", e)


async def _evaluate_open_positions() -> None:
    """
    Check every open position against current price.
    Triggers auto-sell if:
      - PnL% <= -stop_loss_pct   (stop-loss)
      - auto_take_profit > 0 and PnL% >= auto_take_profit  (take-profit)

    Performance: groups positions by chain and uses batch DexScreener lookup
    (1 request per chain for up to 30 tokens, vs 1 request per position).
    """
    from scanner.dexscreener import get_pairs_batch
    from scanner.price_cache import get_cached_price, set_cached_price

    positions = db.get_all_open_positions_with_users()
    if not positions:
        return

    logger.info("Position monitor: evaluating %d open position(s)", len(positions))
    session = _get_http()

    # ── Pre-fetch prices in batch per chain ───────────────────────────────────
    price_map: dict[str, float] = {}  # "chain:address" → price

    from collections import defaultdict as _dd
    by_chain: dict[str, list[str]] = _dd(list)
    for pos in positions:
        key = f"{pos['chain']}:{pos['token_address']}"
        cached = get_cached_price(pos["chain"], pos["token_address"])
        if cached is not None:
            price_map[key] = cached
        else:
            by_chain[pos["chain"]].append(pos["token_address"])

    for chain, addresses in by_chain.items():
        # Batch up to 30 per request; split if more
        for i in range(0, len(addresses), 30):
            chunk = addresses[i:i + 30]
            try:
                pairs = await asyncio.wait_for(
                    get_pairs_batch(session, chain, chunk),
                    timeout=10,
                )
                for pair in pairs:
                    token_addr = (
                        (pair.get("baseToken") or {}).get("address") or ""
                    ).lower()
                    raw = pair.get("priceUsd") or pair.get("priceNative")
                    liq = float((pair.get("liquidity") or {}).get("usd") or 0)
                    if raw and token_addr:
                        # Keep the pair with the highest liquidity per token
                        key = f"{chain}:{token_addr}"
                        existing_liq = price_map.get(f"_liq_{key}", 0)
                        if liq >= existing_liq:
                            price_map[key] = float(raw)
                            price_map[f"_liq_{key}"] = liq
                            set_cached_price(chain, token_addr, float(raw))
            except (asyncio.TimeoutError, Exception) as e:
                logger.warning("Batch price fetch error chain=%s: %s", chain, e)
            await asyncio.sleep(1)  # respect DexScreener rate limit between chunks

    # ── Evaluate each position ────────────────────────────────────────────────
    for pos in positions:
        try:
            key = f"{pos['chain']}:{pos['token_address'].lower()}"
            current_price = price_map.get(key)
            await _evaluate_single_position(session, pos, current_price)
        except Exception as e:
            logger.error(
                "Position eval error pos_id=%d: %s",
                pos["position_id"], e, exc_info=True,
            )


async def _evaluate_single_position(
    session: aiohttp.ClientSession,
    pos,              # sqlite3.Row from get_all_open_positions_with_users
    current_price: float | None = None,
) -> None:
    from scanner.dexscreener import get_pairs_by_token
    from scanner.price_cache import get_cached_price, set_cached_price

    position_id  = pos["position_id"]
    chain        = pos["chain"]
    token_addr   = pos["token_address"]
    token_sym    = pos["token_symbol"] or "?"
    buy_price    = float(pos["buy_price_usd"] or 0)
    stop_loss    = float(pos["stop_loss_pct"] or 20)
    take_profit  = float(pos["auto_take_profit"] or 0)
    telegram_id  = pos["telegram_id"]
    lang         = pos["lang"] or "ua"

    # No entry price → can't calculate PnL; skip
    if buy_price <= 0:
        return

    # ── Use pre-fetched price or fall back to individual DexScreener call
    if current_price is None:
        current_price = get_cached_price(chain, token_addr)
    if current_price is None:
        pairs = await get_pairs_by_token(session, chain, token_addr)
        if not pairs:
            logger.debug("Position monitor: no pairs found for %s on %s", token_sym, chain)
            return
        best = max(pairs, key=lambda p: float((p.get("liquidity") or {}).get("usd") or 0))
        raw = best.get("priceUsd") or best.get("priceNative")
        if not raw:
            return
        try:
            current_price = float(raw)
            set_cached_price(chain, token_addr, current_price)
        except (ValueError, TypeError):
            return

    if not current_price or current_price <= 0:
        return

    pnl_pct = (current_price - buy_price) / buy_price * 100

    logger.debug(
        "Position %d %s/%s: buy=%.8f cur=%.8f pnl=%.1f%% sl=-%.0f%% tp=+%.0f%%",
        position_id, chain, token_sym,
        buy_price, current_price, pnl_pct, stop_loss, take_profit,
    )

    # ── Check triggers
    triggered_reason = None
    if pnl_pct <= -stop_loss:
        triggered_reason = f"stop_loss (PnL {pnl_pct:.1f}%)"
    elif take_profit > 0 and pnl_pct >= take_profit:
        triggered_reason = f"take_profit (PnL +{pnl_pct:.1f}%)"

    if triggered_reason:
        logger.info(
            "Position %d %s TRIGGERED %s — selling",
            position_id, token_sym, triggered_reason,
        )
        await _auto_sell_position(session, pos, current_price, pnl_pct, triggered_reason)


async def _auto_sell_position(
    session: aiohttp.ClientSession,
    pos,
    current_price: float,
    pnl_pct: float,
    reason: str,
) -> None:
    """
    Execute an auto-sell for a triggered position.
    Closes the DB position first (prevents race condition / double-sell),
    then executes the on-chain sell.
    """
    from trader.wallet import decrypt_pk, get_sol_token_balance_raw, get_bsc_token_balance_raw

    position_id = pos["position_id"]
    chain       = pos["chain"]
    token_addr  = pos["token_address"]
    token_sym   = pos["token_symbol"] or "?"
    token_name  = pos["token_name"]   or "?"
    telegram_id = pos["telegram_id"]
    lang        = pos["lang"] or "ua"
    user_id     = pos["user_id"]

    wallet_addr  = pos["wallet_address"]
    encrypted_pk = pos["encrypted_pk"]

    if not wallet_addr or not encrypted_pk:
        logger.warning("Auto-sell pos %d: no wallet/key", position_id)
        return

    pk = decrypt_pk(encrypted_pk)
    if not pk:
        logger.warning("Auto-sell pos %d: decrypt failed", position_id)
        return

    # ── Close position in DB immediately to prevent double-sell
    db.close_position_with_sell(position_id, current_price, pnl_pct, reason)

    # ── Get actual on-chain token balance
    if chain == "solana":
        raw_balance, decimals = await get_sol_token_balance_raw(wallet_addr, token_addr)
    else:
        raw_balance, decimals = await get_bsc_token_balance_raw(wallet_addr, token_addr)

    if raw_balance <= 0:
        logger.info("Auto-sell pos %d: zero balance on-chain, position closed without TX", position_id)
        await _notify_auto(
            telegram_id,
            f"Position <b>{token_sym}</b> closed ({reason}) — no tokens found in wallet.",
            lang,
        )
        return

    # ── Execute sell with up to 2 retries
    result = None
    for attempt in range(1, 3):
        try:
            if chain == "solana":
                from trader.jupiter import get_sell_quote, execute_swap
                quote = await asyncio.wait_for(
                    get_sell_quote(session, token_addr, raw_balance, slippage_bps=500),
                    timeout=30,
                )
                if not quote:
                    logger.warning("Auto-sell pos %d attempt %d: no quote", position_id, attempt)
                    await asyncio.sleep(5)
                    continue
                result = await asyncio.wait_for(
                    execute_swap(session, quote, wallet_addr, pk),
                    timeout=30,
                )
            else:
                from trader.bsc import execute_sell as bsc_sell
                result = await asyncio.wait_for(
                    asyncio.to_thread(bsc_sell, token_addr, raw_balance, pk, 10.0),
                    timeout=60,
                )
        except asyncio.TimeoutError:
            result = {"success": False, "tx_hash": None, "error": "timeout"}

        if result and result.get("success"):
            break
        if attempt < 2:
            await asyncio.sleep(5)

    tx_hash = (result or {}).get("tx_hash")
    sell_ok  = bool(result and result.get("success"))

    # ── Save trade record
    ui_amount = raw_balance / (10 ** decimals) if decimals else raw_balance
    db.save_trade(
        user_id=user_id, chain=chain,
        token_address=token_addr, token_symbol=token_sym,
        trade_type="sell", amount_in=ui_amount,
        amount_out=ui_amount * current_price,
        price_usd=current_price,
        tx_hash=tx_hash, status="confirmed" if sell_ok else "failed",
        mode="auto",
    )

    logger.info(
        "Auto-sell pos %d %s/%s: reason=%s pnl=%.1f%% success=%s tx=%s",
        position_id, chain, token_sym, reason, pnl_pct, sell_ok, tx_hash,
    )

    # ── Notify user
    sign   = "+" if pnl_pct >= 0 else ""
    native = "SOL" if chain == "solana" else "BNB"
    if sell_ok and tx_hash:
        tx_link = (
            f'<a href="https://solscan.io/tx/{tx_hash}">Solscan</a>'
            if chain == "solana"
            else f'<a href="https://bscscan.com/tx/{tx_hash}">BscScan</a>'
        )
        emoji = "" if pnl_pct >= 0 else ""
        msg = (
            f"{emoji} Auto-sell executed — <b>{reason}</b>\n"
            f"Token: <b>{token_name}</b> (${token_sym})\n"
            f"PnL: <b>{sign}{pnl_pct:.1f}%</b>\n"
            f"Sell price: ${current_price:.8f}\n"
            f"TX: {tx_link}"
        )
    else:
        err = (result or {}).get("error", "unknown")
        msg = (
            f"Auto-sell triggered ({reason}) for <b>{token_sym}</b> "
            f"(PnL {sign}{pnl_pct:.1f}%) but TX failed: {err}\n"
            f"Position is closed in the bot. Please check your wallet."
        )
    await _notify_auto(telegram_id, msg, lang)


# ── Setup ──────────────────────────────────────────────────────────────────────

async def post_init(app: Application) -> None:
    global _app, _http
    _app = app
    _http = aiohttp.ClientSession(
        connector=aiohttp.TCPConnector(limit=30, ttl_dns_cache=300),
        timeout=aiohttp.ClientTimeout(total=30),
    )
    logger.info("Shared aiohttp session created.")

    await app.bot.set_my_commands([
        BotCommand("start",    "Головне меню / Main menu"),
        BotCommand("status",   "Статус і гаманці / Status & wallets"),
        BotCommand("help",     "Довідка / Help"),
        BotCommand("plans",    "Тарифи / Plans"),
        BotCommand("language", "Мова / Language 🇺🇦🇬🇧"),
    ])

    loop = asyncio.get_event_loop()
    loop.create_task(run_monitor(_send_signal))
    loop.create_task(pay.payment_check_loop(_send_signal))
    loop.create_task(_broadcast_loop())
    loop.create_task(_subscription_reminder_loop())
    loop.create_task(_position_monitor_loop())
    logger.info("All background tasks started.")


async def _post_shutdown(app: Application) -> None:
    global _http
    if _http and not _http.closed:
        await _http.close()
        logger.info("Shared aiohttp session closed.")


def main() -> None:
    if not TELEGRAM_TOKEN:
        raise ValueError("TELEGRAM_TOKEN is not set")

    db.init_db()
    logger.info("Database initialized.")

    port = int(os.getenv("PORT", "5000"))
    try:
        from admin.app import app as admin_app
        import threading
        threading.Thread(
            target=lambda: admin_app.run(host="0.0.0.0", port=port, debug=False),
            daemon=True,
        ).start()
        logger.info("Admin panel started on port %d", port)
    except Exception as e:
        logger.warning("Admin panel not started: %s", e)

    app = (
        Application.builder()
        .token(TELEGRAM_TOKEN)
        .post_init(post_init)
        .post_shutdown(_post_shutdown)
        .build()
    )
    global _app
    _app = app

    wallet_conv = ConversationHandler(
        entry_points=[CallbackQueryHandler(cb_wallet, pattern=r"^wallet:")],
        states={
            WALLET_ENTER_ADDRESS: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, _recv_address),
            ],
            WALLET_ENTER_KEY: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, _recv_pk),
            ],
        },
        fallbacks=[CommandHandler("cancel", conv_cancel)],
        per_user=True,
        per_chat=True,
    )

    app.add_handler(CommandHandler("start",    cmd_start))
    app.add_handler(CommandHandler("status",   cmd_status))
    app.add_handler(CommandHandler("help",     cmd_help))
    app.add_handler(CommandHandler("plans",    cmd_plans))
    app.add_handler(CommandHandler("language", cmd_language))
    app.add_handler(wallet_conv)
    app.add_handler(CallbackQueryHandler(cb_menu,      pattern=r"^menu:"))
    app.add_handler(CallbackQueryHandler(cb_language,  pattern=r"^lang:"))
    app.add_handler(CallbackQueryHandler(cb_buy,       pattern=r"^buy:"))
    app.add_handler(CallbackQueryHandler(cb_skip,      pattern=r"^skip$"))
    app.add_handler(CallbackQueryHandler(cb_auto,      pattern=r"^auto:"))
    app.add_handler(CallbackQueryHandler(cb_pos,       pattern=r"^pos:"))
    app.add_handler(CallbackQueryHandler(cb_sell,      pattern=r"^sell:"))
    app.add_handler(CallbackQueryHandler(cb_plans_buy, pattern=r"^plans_buy:"))
    app.add_handler(CallbackQueryHandler(cb_pay_check, pattern=r"^pay_check:"))

    logger.info("Crypto Sniper Bot is running...")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
