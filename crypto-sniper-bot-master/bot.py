import asyncio
import logging
import os
import signal
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
    encrypt_pk, decrypt_pk, can_trade,
    is_valid_solana_address, is_valid_evm_address,
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


# ── App reference ──────────────────────────────────────────────────────────────
_app: Application | None = None


# ── Keyboards ──────────────────────────────────────────────────────────────────

def _main_keyboard(lang: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton(t(lang, 'menu_wallet'),    callback_data="menu:wallet"),
         InlineKeyboardButton(t(lang, 'menu_balance'),   callback_data="menu:balance")],
        [InlineKeyboardButton(t(lang, 'menu_signals'),   callback_data="menu:signals"),
         InlineKeyboardButton(t(lang, 'menu_positions'), callback_data="menu:positions")],
        [InlineKeyboardButton(t(lang, 'menu_automode'),  callback_data="menu:automode"),
         InlineKeyboardButton(t(lang, 'menu_trades'),    callback_data="menu:trades")],
        [InlineKeyboardButton(t(lang, 'menu_notif'),     callback_data="menu:notif")],
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

async def _send_signal(telegram_id: int, message: str,
                       pair_data: dict | None = None,
                       signal_meta: dict | None = None) -> None:
    if _app is None:
        return

    # Use user data pre-loaded by _dispatch_signals (zero extra DB queries)
    auto_on = False
    if signal_meta:
        auto_on = bool(signal_meta.get("auto_mode")) and signal_meta.get("user_tier") in ("basic", "pro")

    keyboard = None
    if pair_data and not auto_on:
        keyboard = _buy_keyboard(
            pair_data.get("chain", ""),
            pair_data.get("token_address", ""),
        )

    await _app.bot.send_message(
        chat_id=telegram_id,
        text=message,
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
        reply_markup=keyboard,
    )
    # Throttle: Telegram allows ~30 msg/sec globally
    await asyncio.sleep(0.04)

    # Trigger auto-buy if applicable (uses pre-loaded data from signal_meta)
    if pair_data and signal_meta and auto_on:
        await _maybe_auto_buy(telegram_id, pair_data, signal_meta)


async def _maybe_auto_buy(telegram_id: int, pair_data: dict, signal_meta: dict) -> None:
    """Execute automatic buy. All user data must be pre-loaded in signal_meta
    by _dispatch_signals to avoid N×M DB queries."""
    if _app is None:
        return

    user_id  = signal_meta.get("user_id")
    lang     = signal_meta.get("lang", "ua")
    tier     = signal_meta.get("user_tier", "free")
    settings = signal_meta.get("user_settings")

    if not user_id or tier not in ("basic", "pro"):
        return
    if not settings or not settings.get("auto_mode"):
        return

    score = signal_meta.get("score", 0)
    if score < (settings.get("auto_min_score") or 80):
        return

    chain         = pair_data.get("chain", "")
    token_address = pair_data.get("token_address", "")
    token_symbol  = pair_data.get("token_symbol", "?")
    token_name    = pair_data.get("token_name", "?")

    if not chain or not token_address:
        return

    # Max concurrent positions (basic: 3, pro: unlimited=999)
    max_pos = 3 if tier == "basic" else 999
    open_pos = db.get_open_positions(user_id)
    if len(open_pos) >= max_pos:
        try:
            await _app.bot.send_message(
                chat_id=telegram_id,
                text=t(lang, 'auto_max_positions', max=max_pos, tier=tier.upper()),
                parse_mode=ParseMode.HTML,
            )
        except Exception:
            pass
        return

    # Skip if position already open for this token
    if any(p["chain"] == chain and p["token_address"] == token_address for p in open_pos):
        return

    # Check wallet
    wallet = db.get_wallet(user_id, chain)
    if not wallet or not wallet["encrypted_pk"]:
        return

    pk = decrypt_pk(wallet["encrypted_pk"])
    if not pk:
        return

    amount = settings.get("auto_max_buy_sol", 0.1) if chain == "solana" else settings.get("auto_max_buy_bnb", 0.01)
    sl_pct = settings.get("auto_stop_loss") or 20
    tp_pct = settings.get("auto_take_profit") or 0
    chain_label = "SOL" if chain == "solana" else "BNB"

    # Notify user that auto-buy is starting
    try:
        await _app.bot.send_message(
            chat_id=telegram_id,
            text=t(lang, 'auto_buying',
                   symbol=token_symbol, amount=amount, chain=chain_label,
                   score=score, sl=sl_pct,
                   tp=f"+{tp_pct}%" if tp_pct > 0 else "—"),
            parse_mode=ParseMode.HTML,
        )
    except Exception:
        pass

    # Execute buy
    result: dict = {"success": False, "error": "unknown"}
    try:
        if chain == "solana":
            async with aiohttp.ClientSession() as session:
                from trader.jupiter import get_buy_quote, execute_swap
                quote = await get_buy_quote(session, token_address, amount)
                if not quote:
                    result = {"success": False, "error": "no_quote"}
                else:
                    result = await execute_swap(session, quote, wallet["address"], pk)
        else:
            from trader.bsc import execute_buy
            result = execute_buy(token_address, amount, pk)
    except Exception as e:
        result = {"success": False, "error": str(e)}
        logger.error("Auto-buy error for %s: %s", token_address, e)

    if result["success"]:
        entry_price = signal_meta.get("price_usd", 0)
        signal_id   = signal_meta.get("signal_id")
        db.save_trade(user_id, chain, token_address, token_symbol, "buy",
                      amount, result.get("amount_out", 0), entry_price,
                      result["tx_hash"], "confirmed", "auto", signal_id)
        db.upsert_position(user_id, chain, token_address, token_symbol, token_name,
                           amount, entry_price, amount, sl_pct, tp_pct)
        try:
            await _app.bot.send_message(
                chat_id=telegram_id,
                text=t(lang, 'auto_buy_success',
                       symbol=token_symbol, amount=amount, chain=chain_label,
                       tx=result["tx_hash"], sl=sl_pct,
                       tp=f"+{tp_pct}%" if tp_pct > 0 else "—"),
                parse_mode=ParseMode.HTML,
            )
        except Exception:
            pass
        logger.info("Auto-buy %s %s for user %d tx=%s", amount, token_symbol, telegram_id, result["tx_hash"])
    else:
        logger.warning("Auto-buy failed for %s: %s", token_symbol, result.get("error"))
        try:
            await _app.bot.send_message(
                chat_id=telegram_id,
                text=t(lang, 'auto_buy_failed',
                       symbol=token_symbol, error=str(result.get("error", "?"))),
                parse_mode=ParseMode.HTML,
            )
        except Exception:
            pass


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
    new_lang = query.data.split(":")[1]
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

    dispatch = {
        "wallet":    _menu_wallet,
        "balance":   _menu_balance,
        "signals":   _menu_signals,
        "positions": _menu_positions,
        "automode":  _menu_automode,
        "trades":    _menu_trades,
        "notif":     _menu_notif,
        "plans":     lambda q, uid, lng: cmd_plans_via_callback(q, uid, lng),
    }
    handler = dispatch.get(action)
    if handler:
        await handler(query, user_id, lang)


async def cmd_plans_via_callback(query, user_id: int, lang: str) -> None:
    tier = db.get_user_tier(user_id)
    basic_price = db.get_bot_setting("basic_price_usd", "29")
    pro_price   = db.get_bot_setting("pro_price_usd",   "79")
    basic_days  = db.get_bot_setting("basic_duration_days", "30")
    pro_days    = db.get_bot_setting("pro_duration_days",   "30")
    tier_labels = {"free": "🆓 Free", "basic": "💳 Basic", "pro": "🚀 Pro"}
    text = t(lang, 'plans',
             basic_price=basic_price, pro_price=pro_price,
             basic_days=basic_days, pro_days=pro_days,
             current_tier=tier_labels.get(tier, tier.upper()))
    keyboard = _plans_keyboard(lang, tier)
    await query.edit_message_text(text, parse_mode=ParseMode.HTML, reply_markup=keyboard,
                                  disable_web_page_preview=True)


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

    lines = [t(lang, 'balance_header')]
    for w in wallets:
        icon  = "◎" if w["chain"] == "solana" else "🔶"
        short = w["address"][:8] + "..." + w["address"][-6:]
        lines.append(f"\n{icon} <b>{w['chain'].upper()}</b>\n<code>{short}</code>")

        if w["chain"] == "solana":
            bal = await get_sol_balance(w["address"])
            lines.append(f"  💰 SOL: <b>{bal:.4f}</b>")
            tokens = await get_sol_token_balances(w["address"])
            for tok in tokens[:5]:
                mint_short = tok["mint"][:8] + "..."
                lines.append(f"  🪙 <code>{mint_short}</code>: {tok['amount']:,.2f}")
            if len(tokens) > 5:
                lines.append(f"  … та ще {len(tokens) - 5} токенів")
        else:
            bal = await get_bnb_balance(w["address"])
            lines.append(f"  💰 BNB: <b>{bal:.4f}</b>")

    await query.edit_message_text("\n".join(lines), parse_mode=ParseMode.HTML)


async def _menu_signals(query, user_id: int, lang: str) -> None:
    tier      = db.get_user_tier(user_id)
    signals   = db.get_recent_signals(limit=50)
    min_score = 35  # same threshold for all tiers — daily limit enforced at dispatch time
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

    for pos in positions:
        icon = "◎" if pos["chain"] == "solana" else "🔶"
        msg = (
            f"{icon} <b>{pos['token_symbol'] or '?'}</b> ({pos['token_name'] or '?'})\n"
            f"📦 {pos['amount']:,.4f} токенів\n"
            f"💵 Куплено по: ${pos['buy_price_usd'] or 0:,.8f}\n"
            f"🛑 Stop-loss: -{pos['stop_loss_pct']}%\n"
            f"📅 {pos['opened_at'][:10]}\n"
            f"<code>{pos['token_address']}</code>"
        )
        keyboard = InlineKeyboardMarkup([[
            InlineKeyboardButton("🔴 Sell 50%",  callback_data=f"sell:{pos['id']}:50"),
            InlineKeyboardButton("🔴 Sell 100%", callback_data=f"sell:{pos['id']}:100"),
        ]])
        await query.message.reply_text(msg, parse_mode=ParseMode.HTML, reply_markup=keyboard)


async def _menu_automode(query, user_id: int, lang: str) -> None:
    tier = db.get_user_tier(user_id)

    # Free tier: show upgrade prompt
    if tier == "free":
        text = t(lang, 'auto_tier_required')
        keyboard = InlineKeyboardMarkup([[
            InlineKeyboardButton("🚀 Upgrade → /plans", callback_data="menu:plans")
        ]])
        await query.edit_message_text(text, parse_mode=ParseMode.HTML, reply_markup=keyboard)
        return

    s    = db.get_user_settings(user_id)
    on   = bool(s["auto_mode"])           if s else False
    pump = bool(s["notify_all_tokens"])   if s else False
    sl   = s["auto_stop_loss"]            if s else 20
    tp   = s["auto_take_profit"]          if s else 0
    score = s["auto_min_score"]           if s else 80
    sol  = s["auto_max_buy_sol"]          if s else 0.1
    bnb  = s["auto_max_buy_bnb"]          if s else 0.01

    open_pos   = db.get_open_positions(user_id)
    max_pos    = 3 if tier == "basic" else 999
    tp_display = f"+{int(tp)}%" if tp > 0 else "—"

    text = t(lang, 'auto_status',
             status   = t(lang, 'auto_on') if on else t(lang, 'auto_off'),
             tier     = tier.upper(),
             score    = score,
             sol      = sol,
             bnb      = bnb,
             sl       = int(sl),
             tp       = tp_display,
             positions = f"{len(open_pos)}/{max_pos}")

    pump_btn  = ("🟣 pump.fun ✅" if pump else "🟣 pump.fun ❌")
    sl_active = lambda v: "●" if int(sl) == v else "○"
    tp_active = lambda v: "●" if int(tp) == v else "○"

    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton(t(lang, 'auto_toggle_on'),  callback_data="auto:on"),
         InlineKeyboardButton(t(lang, 'auto_toggle_off'), callback_data="auto:off")],
        # Stop-loss presets
        [InlineKeyboardButton(f"SL {sl_active(10)} 10%",  callback_data="auto:sl:10"),
         InlineKeyboardButton(f"SL {sl_active(20)} 20%",  callback_data="auto:sl:20"),
         InlineKeyboardButton(f"SL {sl_active(30)} 30%",  callback_data="auto:sl:30"),
         InlineKeyboardButton(f"SL {sl_active(50)} 50%",  callback_data="auto:sl:50")],
        # Take-profit presets
        [InlineKeyboardButton(f"TP {tp_active(0)} OFF",   callback_data="auto:tp:0"),
         InlineKeyboardButton(f"TP {tp_active(50)} 50%",  callback_data="auto:tp:50"),
         InlineKeyboardButton(f"TP {tp_active(100)} 100%",callback_data="auto:tp:100"),
         InlineKeyboardButton(f"TP {tp_active(200)} 200%",callback_data="auto:tp:200")],
        [InlineKeyboardButton(pump_btn,                   callback_data="auto:pump_toggle")],
        [InlineKeyboardButton(t(lang, 'auto_config'),     callback_data="auto:config")],
    ])
    await query.edit_message_text(text, parse_mode=ParseMode.HTML, reply_markup=keyboard)


async def _menu_notif(query, user_id: int, lang: str) -> None:
    """Notification settings menu."""
    tier = db.get_user_tier(user_id)
    s    = db.get_user_settings(user_id)

    push  = bool(s["signals_push"])         if s and "signals_push"          in s.keys() else True
    chain = (s["signal_chain"] or "all")    if s and "signal_chain"           in s.keys() else "all"
    mscore = int(s["signal_min_score_user"] or 0) if s and "signal_min_score_user" in s.keys() else 0

    push_icon  = "✅" if push else "❌"
    chain_icon = {"all": "🌍", "solana": "◎", "bsc": "🔶"}.get(chain, "🌍")
    chain_name = {"all": t(lang, "notif_chain_all"), "solana": "Solana", "bsc": "BNB Chain"}.get(chain, "All")

    score_display = str(mscore) if mscore > 0 else t(lang, "notif_score_auto")

    text = t(lang, "notif_menu",
             push=push_icon, chain=f"{chain_icon} {chain_name}",
             score=score_display, tier=tier.upper())

    # Chain filter buttons (only paid can pick)
    chain_row = []
    if tier in ("basic", "pro"):
        for c, lbl in [("all", f"🌍 {t(lang,'notif_chain_all')}"), ("solana", "◎ SOL"), ("bsc", "🔶 BSC")]:
            active = "●" if chain == c else "○"
            chain_row.append(InlineKeyboardButton(f"{active} {lbl}", callback_data=f"notif:chain:{c}"))

    # Score filter buttons (only paid can pick)
    score_row = []
    if tier in ("basic", "pro"):
        for sc, lbl in [(0, t(lang,"notif_score_auto")), (35, "35+"), (55, "55+"), (70, "70+"), (85, "85+")]:
            active = "●" if mscore == sc else "○"
            score_row.append(InlineKeyboardButton(f"{active} {lbl}", callback_data=f"notif:score:{sc}"))

    rows = [
        [InlineKeyboardButton(
            f"🔔 {t(lang,'notif_push')}: {push_icon}",
            callback_data="notif:push_toggle"
        )],
    ]
    if chain_row:
        rows.append(chain_row)
    if score_row:
        rows.append(score_row)
    if tier == "free":
        rows.append([InlineKeyboardButton(
            t(lang, "notif_upgrade_hint"), callback_data="menu:plans"
        )])

    keyboard = InlineKeyboardMarkup(rows)
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
        stat_icon  = {"confirmed": "✅", "pending": "⏳", "failed": "❌"}.get(tr["status"], "❓")
        lines.append(
            f"\n{type_icon} {tr['trade_type'].upper()} {chain_icon} "
            f"<b>{tr['token_symbol'] or '?'}</b>\n"
            f"  {tr['amount_in']} → {tr['amount_out'] or '?'} | {stat_icon} {tr['status']}\n"
            f"  {tr['created_at'][:16]}"
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
    await query.answer()

    parts = query.data.split(":", 3)
    if len(parts) < 4:
        await query.message.reply_text("❌ Invalid callback data.")
        return

    _, chain, token_address, amount_str = parts
    amount = float(amount_str)

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

    if chain == "solana":
        async with aiohttp.ClientSession() as session:
            from trader.jupiter import get_buy_quote, execute_swap
            quote = await get_buy_quote(session, token_address, amount)
            if not quote:
                await query.message.reply_text(t(lang, 'buy_quote_failed'))
                return
            result = await execute_swap(session, quote, wallet["address"], pk)
    else:
        from trader.bsc import execute_buy
        result = execute_buy(token_address, amount, pk)

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

    positions = db.get_open_positions(user_id)
    for pos in positions:
        db.close_position(pos["id"])
    await query.edit_message_text(t(lang, 'pos_closed_all', count=len(positions)))


async def cb_sell(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query   = update.callback_query
    user    = query.from_user
    if _check_banned(user.id):
        return
    user_id = db.upsert_user(user.id, user.first_name, user.username)
    lang    = db.get_user_lang(user_id)
    await query.answer()

    parts    = query.data.split(":")
    pos_id   = int(parts[1])
    sell_pct = int(parts[2])

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

    sell_amount = pos["amount"] * sell_pct / 100
    await query.edit_message_text(
        f"⏳ Продаю {sell_pct}% <b>{pos['token_symbol'] or '?'}</b>...",
        parse_mode=ParseMode.HTML,
    )

    if chain == "solana":
        tokens   = await get_sol_token_balances(wallet["address"])
        tok      = next((tk for tk in tokens if tk["mint"] == pos["token_address"]), None)
        decimals = tok["decimals"] if tok else 6
        amount_raw = int(sell_amount * (10 ** decimals))

        async with aiohttp.ClientSession() as session:
            from trader.jupiter import get_sell_quote, execute_swap
            quote = await get_sell_quote(session, pos["token_address"], amount_raw)
            if not quote:
                await query.edit_message_text("❌ Не вдалося отримати ціну продажу.")
                return
            result = await execute_swap(session, quote, wallet["address"], pk)
    else:
        from trader.bsc import execute_sell
        # BSC: sell_amount is in token units, convert with decimals (assume 18)
        amount_raw = int(sell_amount * (10 ** 18))
        result = execute_sell(pos["token_address"], amount_raw, pk)

    if result["success"]:
        db.save_trade(user_id, chain, pos["token_address"],
                      pos["token_symbol"] or "?", "sell",
                      sell_amount, 0, 0, result["tx_hash"], "pending")
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


async def cb_notif(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handles notification settings callbacks: notif:push_toggle, notif:chain:X, notif:score:N"""
    query   = update.callback_query
    user    = query.from_user
    if _check_banned(user.id):
        return
    user_id = db.upsert_user(user.id, user.first_name, user.username)
    lang    = db.get_user_lang(user_id)
    tier    = db.get_user_tier(user_id)
    await query.answer()

    parts  = query.data.split(":")   # ["notif", action, ...value]
    action = parts[1] if len(parts) > 1 else ""

    s = db.get_user_settings(user_id)

    if action == "push_toggle":
        curr = bool(s["signals_push"]) if s and "signals_push" in s.keys() else True
        db.update_user_settings(user_id, signals_push=0 if curr else 1)

    elif action == "chain" and tier in ("basic", "pro"):
        new_chain = parts[2] if len(parts) > 2 else "all"
        if new_chain in ("all", "solana", "bsc"):
            db.update_user_settings(user_id, signal_chain=new_chain)

    elif action == "score" and tier in ("basic", "pro"):
        try:
            new_score = int(parts[2]) if len(parts) > 2 else 0
        except ValueError:
            new_score = 0
        db.update_user_settings(user_id, signal_min_score_user=new_score)

    # Re-render the notifications menu
    await _menu_notif(query, user_id, lang)


async def cb_auto(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query   = update.callback_query
    user    = query.from_user
    if _check_banned(user.id):
        return
    user_id = db.upsert_user(user.id, user.first_name, user.username)
    lang    = db.get_user_lang(user_id)
    await query.answer()

    parts  = query.data.split(":")
    action = parts[1]

    if action == "on":
        # Tier gate — free users cannot enable auto-trade
        tier = db.get_user_tier(user_id)
        if tier == "free":
            await query.answer(t(lang, 'auto_tier_required_short'), show_alert=True)
            return
        # Wallet + pk check
        settings = db.get_user_settings(user_id)
        has_sol = bool(db.get_wallet(user_id, "solana"))
        has_bnb = bool(db.get_wallet(user_id, "bsc"))
        if not (has_sol or has_bnb):
            await query.answer(t(lang, 'auto_no_wallet'), show_alert=True)
            return
        db.update_user_settings(user_id, auto_mode=1)
        max_pos = 3 if tier == "basic" else 999
        score   = settings["auto_min_score"] if settings else 80
        await query.edit_message_text(
            t(lang, 'auto_enabled', score=score, max_pos=max_pos, tier=tier.upper()),
            parse_mode=ParseMode.HTML,
        )
    elif action == "off":
        db.update_user_settings(user_id, auto_mode=0)
        await query.edit_message_text(t(lang, 'auto_disabled'))
    elif action == "sl" and len(parts) >= 3:
        try:
            sl_val = int(parts[2])
            db.update_user_settings(user_id, auto_stop_loss=float(sl_val))
            await query.answer(f"Stop-loss: {sl_val}%", show_alert=False)
            await _menu_automode(query, user_id, lang)
        except (ValueError, IndexError):
            pass
        return
    elif action == "tp" and len(parts) >= 3:
        try:
            tp_val = int(parts[2])
            db.update_user_settings(user_id, auto_take_profit=float(tp_val))
            label = f"+{tp_val}%" if tp_val > 0 else "OFF"
            await query.answer(f"Take-profit: {label}", show_alert=False)
            await _menu_automode(query, user_id, lang)
        except (ValueError, IndexError):
            pass
        return
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


# ── Background: position monitor (stop-loss / take-profit) ────────────────────

async def _position_monitor_loop() -> None:
    """Check open positions every 5 minutes for stop-loss / take-profit triggers."""
    logger.info("Position monitor loop started.")
    await asyncio.sleep(90)   # short delay after startup
    while True:
        try:
            await _check_positions_for_exit()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("Position monitor error: %s", e)
        await asyncio.sleep(300)   # every 5 minutes


async def _check_positions_for_exit() -> None:
    if _app is None:
        return
    from scanner.dexscreener import get_pairs_by_token

    positions = db.get_all_open_positions_with_users()
    if not positions:
        return

    # Deduplicate price fetches: fetch price once per unique chain+token
    # (multiple users may hold the same token — no need to call DexScreener N times)
    price_cache: dict[str, float] = {}

    async with aiohttp.ClientSession() as session:
        for pos in positions:
            try:
                cache_key = f"{pos['chain']}:{pos['token_address']}"
                if cache_key not in price_cache:
                    pairs = await get_pairs_by_token(session, pos["chain"], pos["token_address"])
                    price = float(pairs[0].get("priceUsd") or 0) if pairs else 0.0
                    price_cache[cache_key] = price
                    await asyncio.sleep(0.2)   # rate-limit only on cache miss
                await _evaluate_position(session, pos, price_cache[cache_key])
            except Exception as e:
                logger.warning("Position eval error (id=%d): %s", pos["id"], e)


async def _evaluate_position(session, pos, current_price: float) -> None:
    """Check one open position and execute auto-sell if SL/TP triggered.
    current_price is pre-fetched and cached by _check_positions_for_exit."""
    buy_price = pos["buy_price_usd"]
    if not buy_price or buy_price <= 0 or current_price <= 0:
        return

    sl_pct = pos["stop_loss_pct"] if pos["stop_loss_pct"] is not None else (pos["eff_sl"] or 20)
    tp_pct = pos["take_profit_pct"] if pos["take_profit_pct"] is not None else pos["eff_tp"]

    pnl_pct = (current_price - buy_price) / buy_price * 100

    triggered_reason = None
    if pnl_pct <= -sl_pct:
        triggered_reason = "sl"
    elif tp_pct > 0 and pnl_pct >= tp_pct:
        triggered_reason = "tp"

    if triggered_reason is None:
        return

    logger.info(
        "Position %d %s %s triggered %s (pnl=%.1f%%)",
        pos["id"], pos["chain"], pos["token_symbol"] or "?", triggered_reason, pnl_pct
    )

    # Execute sell if wallet+pk available
    sell_ok = False
    tx_hash = "—"
    if pos["encrypted_pk"] and pos["wallet_address"]:
        pk = decrypt_pk(pos["encrypted_pk"])
        if pk:
            chain  = pos["chain"]
            amount = pos["amount"]
            try:
                if chain == "solana":
                    from trader.wallet import get_sol_token_balances
                    tokens     = await get_sol_token_balances(pos["wallet_address"])
                    tok        = next((tk for tk in tokens if tk["mint"] == pos["token_address"]), None)
                    decimals   = tok["decimals"] if tok else 6
                    amount_raw = int(amount * (10 ** decimals))
                    from trader.jupiter import get_sell_quote, execute_swap
                    quote = await get_sell_quote(session, pos["token_address"], amount_raw)
                    if quote:
                        result = await execute_swap(session, quote, pos["wallet_address"], pk)
                        sell_ok = result["success"]
                        tx_hash = result.get("tx_hash", "—")
                else:
                    from trader.bsc import execute_sell
                    amount_raw = int(amount * (10 ** 18))
                    result     = execute_sell(pos["token_address"], amount_raw, pk)
                    sell_ok    = result["success"]
                    tx_hash    = result.get("tx_hash", "—")
            except Exception as e:
                logger.error("Auto-sell error pos %d: %s", pos["id"], e)

    # Close position in DB regardless of sell success (to avoid looping)
    db.close_position_with_reason(pos["id"], triggered_reason)

    # Record trade if sell went through
    if sell_ok and _app:
        db.save_trade(pos["user_id"], pos["chain"], pos["token_address"],
                      pos["token_symbol"] or "?", "sell",
                      pos["amount"], 0, current_price,
                      tx_hash, "confirmed", "auto")

    # Notify user
    if _app is None:
        return
    lang = pos["lang"] or "ua"
    symbol = pos["token_symbol"] or pos["token_address"][:8]
    if triggered_reason == "sl":
        text = t(lang, 'auto_sl_hit',
                 symbol=symbol, pnl=f"{pnl_pct:.1f}",
                 sl=sl_pct, tx=tx_hash if sell_ok else "—",
                 sold=("✅" if sell_ok else "⚠️ не вдалося продати"))
    else:
        text = t(lang, 'auto_tp_hit',
                 symbol=symbol, pnl=f"+{pnl_pct:.1f}",
                 tp=tp_pct, tx=tx_hash if sell_ok else "—",
                 sold=("✅" if sell_ok else "⚠️ не вдалося продати"))
    try:
        await _app.bot.send_message(
            chat_id=pos["telegram_id"],
            text=text,
            parse_mode=ParseMode.HTML,
        )
    except Exception as e:
        logger.warning("Notify user after auto-sell failed: %s", e)


# ── Background: subscription expiry reminders ─────────────────────────────────

async def _subscription_reminder_loop() -> None:
    """Once per day check for subscriptions expiring in ~3 days and notify users."""
    logger.info("Subscription reminder loop started.")
    await asyncio.sleep(60)   # wait 1 min after startup before first check
    while True:
        try:
            await _send_expiry_reminders()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("Subscription reminder loop error: %s", e)
        await asyncio.sleep(86400)   # run once every 24 hours


async def _send_expiry_reminders() -> None:
    if _app is None:
        return
    from datetime import datetime, timezone
    expiring = db.get_expiring_subscriptions(days=3)
    for row in expiring:
        try:
            lang = row["lang"] or "ua"
            expires_dt = datetime.fromisoformat(row["expires_at"])
            days_left  = (expires_dt.replace(tzinfo=timezone.utc) -
                          datetime.now(timezone.utc)).days
            days_left  = max(0, days_left)
            text = t(lang, "sub_expiry_reminder").format(
                tier    = row["tier"].upper(),
                expires = row["expires_at"][:10],
                days    = days_left,
            )
            await _app.bot.send_message(
                chat_id    = row["telegram_id"],
                text       = text,
                parse_mode = ParseMode.HTML,
            )
            logger.info("Expiry reminder sent to user %d (tier=%s, expires=%s)",
                        row["telegram_id"], row["tier"], row["expires_at"][:10])
            await asyncio.sleep(0.05)
        except Exception as e:
            logger.warning("Expiry reminder send error to %d: %s", row["telegram_id"], e)


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


# ── Setup ──────────────────────────────────────────────────────────────────────

async def post_init(app: Application) -> None:
    global _app
    _app = app

    # Remove any active webhook so polling doesn't conflict
    await app.bot.delete_webhook(drop_pending_updates=True)
    logger.info("Webhook deleted, pending updates dropped.")

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


def main() -> None:
    if not TELEGRAM_TOKEN:
        raise ValueError("TELEGRAM_TOKEN is not set")

    db.init_db()
    logger.info("Database initialized.")

    port = int(os.getenv("PORT", "8080"))
    try:
        from admin.app import app as admin_app
        import threading
        threading.Thread(
            target=lambda: admin_app.run(
                host="0.0.0.0",
                port=port,
                debug=False,
                threaded=True,
                use_reloader=False,
            ),
            daemon=True,
        ).start()
        logger.info("Admin panel started on port %d", port)
    except Exception as e:
        logger.warning("Admin panel not started: %s", e)

    app = Application.builder().token(TELEGRAM_TOKEN).post_init(post_init).build()
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
    app.add_handler(CallbackQueryHandler(cb_notif,     pattern=r"^notif:"))
    app.add_handler(CallbackQueryHandler(cb_auto,      pattern=r"^auto:"))
    app.add_handler(CallbackQueryHandler(cb_pos,       pattern=r"^pos:"))
    app.add_handler(CallbackQueryHandler(cb_sell,      pattern=r"^sell:"))
    app.add_handler(CallbackQueryHandler(cb_plans_buy, pattern=r"^plans_buy:"))
    app.add_handler(CallbackQueryHandler(cb_pay_check, pattern=r"^pay_check:"))

    # Graceful shutdown on SIGTERM/SIGINT (Railway sends SIGTERM on redeploy)
    def _handle_stop(signum, frame):
        logger.info("Received signal %s — stopping bot...", signum)
        app.stop_running()

    signal.signal(signal.SIGTERM, _handle_stop)
    signal.signal(signal.SIGINT,  _handle_stop)

    logger.info("Crypto Sniper Bot is running...")
    app.run_polling(
        allowed_updates=Update.ALL_TYPES,
        drop_pending_updates=True,
        close_loop=False,
    )


if __name__ == "__main__":
    main()
