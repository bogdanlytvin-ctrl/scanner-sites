"""
Honeypot.is API client for BSC token safety analysis.
Docs: https://honeypot.is/
Free, no API key needed.
"""

import asyncio
import logging

import aiohttp

logger = logging.getLogger(__name__)

BASE = "https://api.honeypot.is/v2"


async def check_bnb_token(session: aiohttp.ClientSession, token_address: str) -> dict:
    """
    Returns safety dict:
      is_honeypot         bool
      buy_tax             float
      sell_tax            float
      is_open_source      bool
      liq_locked          bool
      liq_locked_pct      float
      top10_holders_pct   float | None
      holders             int | None
      risks               list[str]
      contract_renounced  bool
    """
    if not token_address:
        return _empty()

    url = f"{BASE}/IsHoneypot"
    params = {"address": token_address, "chainID": "56"}  # BSC mainnet = chain 56
    try:
        async with session.get(url, params=params,
                               timeout=aiohttp.ClientTimeout(total=10)) as r:
            if r.status != 200:
                logger.warning("Honeypot.is %s → %s", token_address[:8], r.status)
                return _empty()
            data = await r.json()
    except asyncio.TimeoutError:
        logger.warning("Honeypot.is timeout: %s", token_address[:8])
        return _empty()
    except Exception as e:
        logger.warning("Honeypot.is error: %s", e)
        return _empty()

    honeypot_result = data.get("honeypotResult") or {}
    simulation      = data.get("simulationResult") or {}
    contract_code   = data.get("contractCode") or {}
    pair            = (data.get("pair") or {})
    pair_liq        = pair.get("liquidity") or 0

    is_hp      = bool(honeypot_result.get("isHoneypot"))
    buy_tax    = float(simulation.get("buyTax")  or 0)
    sell_tax   = float(simulation.get("sellTax") or 0)
    open_src   = bool(contract_code.get("openSource"))
    renounced  = bool(contract_code.get("isContractRenounced"))

    # Liquidity lock: honeypot.is provides lock info in pair.liquidity
    liq_locked     = pair.get("isLiquidityLocked") or False
    liq_locked_pct = float(pair.get("liquidityLockedPercent") or 0)

    risks: list[str] = []
    if is_hp:
        risks.append("HONEYPOT detected")
    if sell_tax > 15:
        risks.append(f"High sell tax: {sell_tax:.1f}%")
    if not open_src:
        risks.append("Contract not verified")

    return {
        "is_honeypot":        is_hp,
        "buy_tax":            buy_tax,
        "sell_tax":           sell_tax,
        "is_open_source":     open_src,
        "contract_renounced": renounced,
        "liq_locked":         liq_locked,
        "liq_locked_pct":     liq_locked_pct,
        "top10_holders_pct":  None,
        "holders":            None,
        "risks":              risks,
        "rugcheck_score":     0,
        "mint_authority":     False,
        "freeze_authority":   False,
        "has_data":           True,
    }


def _empty() -> dict:
    """Returned when API is unavailable. has_data=False prevents false scoring."""
    return {
        "is_honeypot":        False,
        "buy_tax":            None,   # None = unknown, NOT 0% (avoids false +10 pts)
        "sell_tax":           None,
        "is_open_source":     False,
        "contract_renounced": False,
        "liq_locked":         False,
        "liq_locked_pct":     0.0,
        "top10_holders_pct":  None,
        "holders":            None,
        "risks":              [],
        "rugcheck_score":     0,
        "mint_authority":     False,
        "freeze_authority":   False,
        "has_data":           False,
    }
