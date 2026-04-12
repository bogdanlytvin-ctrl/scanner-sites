"""
Signal scoring engine.
Each token gets a score 0–100 based on safety + momentum + liquidity.

Score thresholds:
  85–100  STRONG BUY  🟢
  70–84   BUY         🟡
  55–69   WATCH       👀
  < 55    SKIP        ❌
"""

import logging
import sys
import os
import time as _time_module

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lang import t as _t

logger = logging.getLogger(__name__)

# Signal types
SIGNAL_STRONG_BUY = "STRONG_BUY"
SIGNAL_BUY        = "BUY"
SIGNAL_WATCH      = "WATCH"
SIGNAL_SKIP       = "SKIP"

# Thresholds
SCORE_STRONG_BUY = 85
SCORE_BUY        = 70
SCORE_WATCH      = 55


def score_token(pair_data: dict, safety_data: dict) -> dict:
    """
    Combine pair market data + safety check into a final signal.

    Returns dict with:
      score         int 0–100
      signal_type   str
      reasons       list[str]
      risks         list[str]
      blocked       bool
      block_reason  str | None
    """
    score   = 0
    reasons = []
    risks   = list(safety_data.get("risks") or [])
    chain   = pair_data.get("chain", "")

    # ── HARD BLOCKS ────────────────────────────────────────────────────────────
    if chain == "bsc" and safety_data.get("is_honeypot"):
        return _blocked("HONEYPOT — cannot sell token")

    if chain == "solana" and safety_data.get("mint_authority"):
        return _blocked("MINT AUTHORITY active — devs can mint new tokens")

    if chain == "solana" and safety_data.get("freeze_authority"):
        return _blocked("FREEZE AUTHORITY — devs can freeze your wallet")

    liq = pair_data.get("liquidity_usd", 0) or 0
    if liq < 5_000:
        return _blocked(f"Liquidity ${liq:,.0f} — too low (min $5k)")

    # ── SAFETY SCORE (max 45 pts) ───────────────────────────────────────────────

    # LP lock — fix: use explicit None check, not truthiness (0.0 is falsy but valid)
    if safety_data.get("liq_locked") or safety_data.get("lp_locked"):
        locked_pct = safety_data.get("lp_locked_pct")
        if locked_pct is None:
            locked_pct = safety_data.get("liq_locked_pct")
        locked_pct = float(locked_pct) if locked_pct is not None else 0.0

        if locked_pct >= 90:
            score += 20
            reasons.append(f"Liquidity locked {locked_pct:.0f}% 🔒")
        elif locked_pct >= 70:
            score += 12
            reasons.append(f"Liquidity locked {locked_pct:.0f}% 🔒")
        elif locked_pct >= 50:
            score += 6
            reasons.append(f"Liquidity locked {locked_pct:.0f}% 🔒")
        elif locked_pct > 0:
            score += 3
        # locked_pct == 0 → liq_locked flag set but 0% locked → no points

    has_data = safety_data.get("has_data", True)  # True = backward compat

    if chain == "solana":
        rc_score = safety_data.get("rugcheck_score") or 0
        if not has_data:
            # API unavailable for brand-new token — neutral, no penalty
            risks.append("RugCheck: no data yet (new token)")
        elif rc_score >= 800:
            score += 20
            reasons.append(f"RugCheck: {rc_score}/1000 ✅")
        elif rc_score >= 600:
            score += 12
            reasons.append(f"RugCheck: {rc_score}/1000 ⚠️")
        elif rc_score >= 400:
            score += 5
        else:
            score -= 5
            risks.append(f"RugCheck low: {rc_score}/1000")

    if chain == "bsc":
        if not has_data:
            # Honeypot.is unavailable — neutral, flag as unverified
            risks.append("Safety check unavailable")
        else:
            if safety_data.get("is_open_source"):
                score += 10
                reasons.append("Contract verified (open source) ✅")
            else:
                score -= 5
                risks.append("Contract not verified")

        sell_tax = safety_data.get("sell_tax")  # None = unknown
        buy_tax  = safety_data.get("buy_tax")
        if sell_tax is None or buy_tax is None:
            pass  # no tax data — skip, don't award or penalize
        elif sell_tax <= 5 and buy_tax <= 5:
            score += 10
            reasons.append(f"Low tax: buy {buy_tax}% / sell {sell_tax}% ✅")
        elif sell_tax <= 10:
            score += 5
        else:
            score -= 10
            risks.append(f"High sell tax: {sell_tax}%")

    top10 = safety_data.get("top10_holders_pct")
    if top10 is not None:
        top10 = float(top10)
        if top10 <= 20:
            score += 15
            reasons.append(f"Top-10 holders: {top10:.1f}% — well distributed ✅")
        elif top10 <= 35:
            score += 8
            reasons.append(f"Top-10 holders: {top10:.1f}%")
        elif top10 <= 50:
            score += 2
            risks.append(f"Top-10 holders: {top10:.1f}% — concentrated")
        else:
            score -= 10
            risks.append(f"Top-10 holders: {top10:.1f}% — VERY concentrated ⚠️")

    # ── MOMENTUM SCORE (max 40 pts) ────────────────────────────────────────────

    vol_1h  = pair_data.get("volume_1h")  or 0
    vol_6h  = pair_data.get("volume_6h")  or 0
    chg_1h  = pair_data.get("price_change_1h")  or 0
    chg_6h  = pair_data.get("price_change_6h")  or 0

    if liq > 0:
        vol_liq_ratio = vol_1h / liq
        if vol_liq_ratio >= 1.0:
            score += 20
            reasons.append(f"Vol/Liq ratio: {vol_liq_ratio:.1f}x 🚀")
        elif vol_liq_ratio >= 0.5:
            score += 12
            reasons.append(f"Vol/Liq ratio: {vol_liq_ratio:.1f}x 📈")
        elif vol_liq_ratio >= 0.2:
            score += 6
        else:
            risks.append("Low trading volume")

    # 1h price change — cap extreme pumps (>200% in 1h = likely manipulation)
    if chg_1h > 200:
        score += 3
        risks.append(f"Extreme pump +{chg_1h:.0f}% — possible manipulation ⚠️")
    elif 10 <= chg_1h <= 200:
        # Cross-check with 6h trend: if 6h is deeply negative, 1h pump is a dead-cat bounce
        if chg_6h < -20:
            score += 4
            risks.append(f"1h pump +{chg_1h:.0f}% but 6h: {chg_6h:.0f}% — dead-cat bounce?")
        else:
            score += 12
            reasons.append(f"1h price growth: +{chg_1h:.1f}% 📈")
    elif 5 <= chg_1h < 10:
        score += 6
    elif chg_1h < -15:
        score -= 10
        risks.append(f"Price drop: {chg_1h:.1f}%")

    buys  = pair_data.get("txns_1h_buys")  or 0
    sells = pair_data.get("txns_1h_sells") or 0
    if buys + sells > 0:
        buy_ratio = buys / (buys + sells)
        if buy_ratio >= 0.65:
            score += 8
            reasons.append(f"Buy pressure: {buy_ratio*100:.0f}% buys 💚")
        elif buy_ratio >= 0.5:
            score += 4
        else:
            score -= 5
            risks.append(f"Sell pressure: {(1-buy_ratio)*100:.0f}% sells")

    # ── LIQUIDITY SCORE (max 15 pts) ───────────────────────────────────────────

    if liq >= 200_000:
        score += 15
        reasons.append(f"Liquidity ${liq:,.0f} 💰")
    elif liq >= 50_000:
        score += 10
        reasons.append(f"Liquidity ${liq:,.0f} ✅")
    elif liq >= 20_000:
        score += 6
    elif liq >= 10_000:
        score += 3

    # ── TOKEN AGE BONUS (max +5 pts) ───────────────────────────────────────────
    # Fresh tokens get a slight bonus for being genuinely new.
    # Very old tokens lose the early-entry advantage.
    created_ms = pair_data.get("pair_created_at")
    if created_ms:
        age_h = (_time_module.time() * 1000 - created_ms) / 3_600_000
        if age_h <= 1:
            score += 5
            reasons.append(f"Fresh token: {age_h*60:.0f}min old 🆕")
        elif age_h <= 6:
            score += 3
        elif age_h <= 24:
            score += 1
        elif age_h > 36:
            score -= 3
            risks.append(f"Token age: {age_h:.0f}h — opportunity window closing")

    # ── HOLDERS (bonus, max +5 pts) ────────────────────────────────────────────
    holders = safety_data.get("holders") or pair_data.get("holders") or 0
    if holders >= 1000:
        score += 5
        reasons.append(f"Holders: {holders:,} 👥")
    elif holders >= 500:
        score += 3
    elif holders >= 200:
        score += 1

    score = max(0, min(100, score))

    if score >= SCORE_STRONG_BUY:
        signal_type = SIGNAL_STRONG_BUY
    elif score >= SCORE_BUY:
        signal_type = SIGNAL_BUY
    elif score >= SCORE_WATCH:
        signal_type = SIGNAL_WATCH
    else:
        signal_type = SIGNAL_SKIP

    return {
        "score":        score,
        "signal_type":  signal_type,
        "reasons":      reasons,
        "risks":        risks,
        "blocked":      False,
        "block_reason": None,
    }


def _blocked(reason: str) -> dict:
    return {
        "score":        0,
        "signal_type":  SIGNAL_SKIP,
        "reasons":      [],
        "risks":        [reason],
        "blocked":      True,
        "block_reason": reason,
    }


def format_signal_message(pair_data: dict, signal_result: dict, lang: str = "ua") -> str:
    """Format a Telegram signal message in the given language."""
    import datetime as _dt

    st    = signal_result["signal_type"]
    score = signal_result["score"]
    chain = pair_data.get("chain", "").upper()

    emoji_map = {
        SIGNAL_STRONG_BUY: "🟢 STRONG BUY",
        SIGNAL_BUY:        "🟡 BUY",
        SIGNAL_WATCH:      "👀 WATCH",
    }
    header = emoji_map.get(st, "⬜ SKIP")

    name       = pair_data.get("token_name",    "?")
    symbol     = pair_data.get("token_symbol",  "?")
    address    = pair_data.get("token_address", "")
    price      = pair_data.get("price_usd",         0) or 0
    liq        = pair_data.get("liquidity_usd",     0) or 0
    vol_1h     = pair_data.get("volume_1h",         0) or 0
    chg_1h     = pair_data.get("price_change_1h",   0) or 0
    mcap       = pair_data.get("market_cap",        0) or 0
    dex        = (pair_data.get("dex") or "").capitalize()
    url        = pair_data.get("pair_url", "")
    created_ms = pair_data.get("pair_created_at")
    chg_sign   = "+" if chg_1h >= 0 else ""

    chain_emoji = "◎" if chain == "SOLANA" else "🔶"
    price_fmt   = f"${price:.8f}" if price < 0.0001 else f"${price:.6f}"

    # Token age
    age_str = ""
    created_str = ""
    if created_ms:
        age_min = (_time_module.time() * 1000 - created_ms) / 60_000
        age_str = f"{int(age_min)}хв" if age_min < 60 else f"{age_min/60:.1f}г"
        created_dt  = _dt.datetime.fromtimestamp(created_ms / 1000, tz=_dt.timezone.utc)
        created_str = created_dt.strftime("%d.%m.%Y %H:%M UTC")

    lines = [
        f"{header}  |  Score: {score}/100",
        "",
        f"{chain_emoji} {chain}  •  {dex}",
        f"🪙 <b>{name}</b> (${symbol})",
    ]

    if created_str:
        lines.append(f"🕐 Створено: {created_str}  ({age_str} тому)")

    lines += [
        "",
        f"💵 {_t(lang,'sig_price')}:  {price_fmt}",
        f"💧 {_t(lang,'sig_liq')}:  ${liq:,.0f}",
        f"📊 {_t(lang,'sig_vol')}:  ${vol_1h:,.0f}",
        f"📈 {_t(lang,'sig_chg')}:  {chg_sign}{chg_1h:.1f}%",
    ]

    if mcap > 0:
        lines.append(f"🏦 {_t(lang,'sig_mcap')}:  ${mcap:,.0f}")

    if signal_result["reasons"]:
        lines += ["", f"✅ <b>{_t(lang,'sig_reasons')}:</b>"]
        for r in signal_result["reasons"][:5]:
            lines.append(f"  • {r}")

    if signal_result["risks"]:
        lines += ["", f"⚠️ <b>{_t(lang,'sig_risks')}:</b>"]
        for r in signal_result["risks"][:3]:
            lines.append(f"  • {r}")

    lines += [
        "",
        f"<b>{_t(lang,'sig_exit')}:</b>",
        f"  {_t(lang,'sig_tp1')}",
        f"  {_t(lang,'sig_tp2')}",
        f"  {_t(lang,'sig_tp3')}",
        f"  {_t(lang,'sig_sl')}",
        "",
        "📋 <b>Контракт:</b>",
    ]

    if address:
        lines.append(f"<code>{address}</code>")

    if url:
        # Show correct link source based on URL
        if "dexscreener.com" in url:
            link_text = "Переглянути на DexScreener"
        elif "geckoterminal.com" in url:
            link_text = "Переглянути на GeckoTerminal"
        else:
            link_text = "Переглянути пару"
        lines.append(f'🔗 <a href="{url}">{link_text}</a>')

    lines += ["", _t(lang, 'sig_disc')]

    return "\n".join(lines)
