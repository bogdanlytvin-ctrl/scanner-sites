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

# Allow importing lang from project root when running as part of the package
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

    # ── HARD BLOCKS ────────────────────────────────────────────────────────
    if chain == "bsc" and safety_data.get("is_honeypot"):
        return _blocked("HONEYPOT — cannot sell token")

    if chain == "solana" and safety_data.get("mint_authority"):
        return _blocked("MINT AUTHORITY active — devs can mint new tokens")

    if chain == "solana" and safety_data.get("freeze_authority"):
        return _blocked("FREEZE AUTHORITY — devs can freeze your wallet")

    liq = pair_data.get("liquidity_usd", 0) or 0
    if liq < 5_000:
        return _blocked(f"Liquidity ${liq:,.0f} — too low (min $5k)")

    # ── SAFETY SCORE (max 45 pts) ──────────────────────────────────────────

    if safety_data.get("liq_locked") or safety_data.get("lp_locked"):
        locked_pct = safety_data.get("lp_locked_pct") or safety_data.get("liq_locked_pct") or 100
        if locked_pct >= 90:
            score += 20
            reasons.append(f"Liquidity locked {locked_pct:.0f}% 🔒")
        elif locked_pct >= 70:
            score += 12
            reasons.append(f"Liquidity locked {locked_pct:.0f}% 🔒")
        else:
            score += 5

    if chain == "solana":
        rc_score = safety_data.get("rugcheck_score") or 0
        if rc_score >= 800:
            score += 20
            reasons.append(f"RugCheck: {rc_score}/1000 ✅")
        elif rc_score >= 600:
            score += 12
            reasons.append(f"RugCheck: {rc_score}/1000 ⚠️")
        elif rc_score >= 400:
            score += 5
        elif rc_score > 0:
            # Real bad score — penalize
            score -= 5
            risks.append(f"RugCheck low: {rc_score}/1000")
        # rc_score == 0 means API timeout / unavailable — neutral, no penalty

    if chain == "bsc":
        if safety_data.get("is_open_source"):
            score += 10
            reasons.append("Contract verified (open source) ✅")
        else:
            score -= 5
            risks.append("Contract not verified")

        sell_tax = safety_data.get("sell_tax") or 0
        buy_tax  = safety_data.get("buy_tax")  or 0
        if sell_tax <= 5 and buy_tax <= 5:
            score += 10
            reasons.append(f"Low tax: buy {buy_tax}% / sell {sell_tax}% ✅")
        elif sell_tax <= 10:
            score += 5
        else:
            score -= 10
            risks.append(f"High sell tax: {sell_tax}%")

    top10 = safety_data.get("top10_holders_pct")
    if top10 is not None:
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

    # ── MOMENTUM SCORE (max 40 pts) ────────────────────────────────────────

    vol_1h = pair_data.get("volume_1h") or 0
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

    chg_1h = pair_data.get("price_change_1h") or 0
    if 10 <= chg_1h <= 100:
        score += 12
        reasons.append(f"1h price growth: +{chg_1h:.1f}% 📈")
    elif 5 <= chg_1h < 10:
        score += 6
    elif chg_1h > 100:
        score += 5
        risks.append(f"Growth +{chg_1h:.0f}% — possible pump & dump")
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

    # ── LIQUIDITY SCORE (max 15 pts) ───────────────────────────────────────

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

    # ── HOLDERS (bonus) ────────────────────────────────────────────────────
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
    import time as _time
    st    = signal_result["signal_type"]
    score = signal_result["score"]
    chain = pair_data.get("chain", "").upper()

    emoji_map = {
        SIGNAL_STRONG_BUY: "🟢 STRONG BUY",
        SIGNAL_BUY:        "🟡 BUY",
        SIGNAL_WATCH:      "👀 WATCH",
    }
    header = emoji_map.get(st, "")

    name        = pair_data.get("token_name",    "?")
    symbol      = pair_data.get("token_symbol",  "?")
    address     = pair_data.get("token_address", "")
    price       = pair_data.get("price_usd",         0) or 0
    liq         = pair_data.get("liquidity_usd",     0) or 0
    vol_1h      = pair_data.get("volume_1h",         0) or 0
    chg_1h      = pair_data.get("price_change_1h",   0) or 0
    mcap        = pair_data.get("market_cap",        0) or 0
    dex         = (pair_data.get("dex") or "").capitalize()
    url         = pair_data.get("pair_url", "")
    created_ms  = pair_data.get("pair_created_at")
    chg_sign    = "+" if chg_1h >= 0 else ""

    chain_emoji = "◎" if chain == "SOLANA" else "🔶"
    price_fmt   = f"${price:.8f}" if price < 0.0001 else f"${price:.6f}"

    # Token age / creation time
    age_str = ""
    created_str = ""
    if created_ms:
        age_min = (_time.time() * 1000 - created_ms) / 60_000
        if age_min < 60:
            age_str = f"{int(age_min)}{'хв' if lang == 'ua' else 'min'}"
        else:
            age_str = f"{age_min/60:.1f}{'г' if lang == 'ua' else 'h'}"
        import datetime as _dt
        created_dt = _dt.datetime.utcfromtimestamp(created_ms / 1000)
        created_str = created_dt.strftime("%d.%m.%Y %H:%M UTC")

    lines = [
        f"{header}  |  Score: {score}/100",
        "",
        f"{chain_emoji} {chain}  •  {dex}",
        f"🪙 <b>{name}</b> (${symbol})",
    ]

    if created_str:
        lines.append(f"🕐 {_t(lang,'sig_created')}: {created_str}  ({age_str} {_t(lang,'sig_ago')})")

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
        _t(lang, 'sig_contract'),
    ]

    if address:
        lines.append(f"<code>{address}</code>")

    if url:
        lines.append(f'🔗 <a href="{url}">{_t(lang, "sig_dex_link")}</a>')

    lines += ["", _t(lang, 'sig_disc')]

    return "\n".join(lines)
