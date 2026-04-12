"""
RugCheck.xyz API client for Solana token safety analysis.
Docs: https://api.rugcheck.xyz/swagger/index.html
Free, no API key needed.
"""

import asyncio
import logging

import aiohttp

logger = logging.getLogger(__name__)

BASE = "https://api.rugcheck.xyz/v1"


async def check_solana_token(session: aiohttp.ClientSession, token_address: str) -> dict:
    """
    Returns safety dict:
      rugcheck_score      int   0-1000 (higher = safer)
      mint_authority      bool
      freeze_authority    bool
      lp_locked           bool
      lp_locked_pct       float
      top10_holders_pct   float | None
      holders             int | None
      risks               list[str]
      contract_renounced  bool
    """
    if not token_address:
        return _empty()

    url = f"{BASE}/tokens/{token_address}/report/summary"
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as r:
            if r.status != 200:
                logger.warning("RugCheck %s → %s", token_address[:8], r.status)
                return _empty()
            data = await r.json()
    except asyncio.TimeoutError:
        logger.warning("RugCheck timeout: %s", token_address[:8])
        return _empty()
    except Exception as e:
        logger.warning("RugCheck error: %s", e)
        return _empty()

    risks_raw = data.get("risks") or []
    risk_names = [r.get("name", "") for r in risks_raw if r.get("level") in ("danger", "warn")]

    # Score: rugcheck returns a score field (higher = riskier in some versions)
    # In the current API, score is 0–1000 where higher = SAFER (Good = high)
    score = data.get("score") or 0

    mint_auth   = bool(data.get("mintAuthority"))
    freeze_auth = bool(data.get("freezeAuthority"))
    renounced   = not mint_auth and not freeze_auth

    # Liquidity lock info
    markets = data.get("markets") or []
    lp_locked = False
    lp_locked_pct = 0.0
    for market in markets:
        lp = market.get("lp") or {}
        if lp.get("lpLockedPct", 0) > 0:
            lp_locked = True
            lp_locked_pct = max(lp_locked_pct, float(lp.get("lpLockedPct", 0)))

    # Top holders
    top_holders = data.get("topHolders") or []
    top10_pct = None
    if top_holders:
        top10_pct = sum(float(h.get("pct", 0)) for h in top_holders[:10]) * 100

    total_holders = data.get("totalHolders") or data.get("holders")

    return {
        "rugcheck_score":     score,
        "mint_authority":     mint_auth,
        "freeze_authority":   freeze_auth,
        "contract_renounced": renounced,
        "lp_locked":          lp_locked,
        "lp_locked_pct":      lp_locked_pct,
        "top10_holders_pct":  top10_pct,
        "holders":            total_holders,
        "risks":              risk_names,
        "is_honeypot":        False,
    }


def _empty() -> dict:
    return {
        "rugcheck_score":     0,
        "mint_authority":     False,
        "freeze_authority":   False,
        "contract_renounced": False,
        "lp_locked":          False,
        "lp_locked_pct":      0.0,
        "top10_holders_pct":  None,
        "holders":            None,
        "risks":              [],
        "is_honeypot":        False,
    }
