"""
Raydium public API — all active Solana AMM pools.
No authentication, completely free, official Raydium API.
New pairs are detected by tracking which ammId appears for the first time.
"""

import asyncio
import logging

import aiohttp

logger = logging.getLogger(__name__)

BASE = "https://api.raydium.io/v2"

MIN_LIQ_USD = 5_000
MIN_VOL_24H = 300   # pools with zero volume are dead/scam


async def get_pairs(session: aiohttp.ClientSession) -> list[dict]:
    """Fetch all active Raydium AMM v2 pools. Returns raw list."""
    try:
        async with session.get(
            f"{BASE}/main/pairs",
            timeout=aiohttp.ClientTimeout(total=20),
        ) as r:
            if r.status == 200:
                data = await r.json(content_type=None)
                return data if isinstance(data, list) else []
            logger.warning("Raydium API → %s", r.status)
            return []
    except asyncio.TimeoutError:
        logger.warning("Raydium timeout")
        return []
    except Exception as e:
        logger.warning("Raydium error: %s", e)
        return []


def prefilter(pairs: list[dict]) -> list[dict]:
    """Keep only pairs with meaningful liquidity and volume."""
    result = []
    for p in pairs:
        try:
            liq = float(p.get("liquidity") or 0)
            vol = float(p.get("volume24h") or 0)
        except (ValueError, TypeError):
            continue
        if liq >= MIN_LIQ_USD and vol >= MIN_VOL_24H:
            result.append(p)
    return result


def to_pair_data(p: dict) -> dict:
    """Convert Raydium pair to minimal pair_data for DexScreener enrichment lookup."""
    amm_id    = p.get("ammId", "")
    base_mint = p.get("baseMint", "")
    liq       = float(p.get("liquidity") or 0)
    vol_24h   = float(p.get("volume24h") or 0)
    price     = float(p.get("price") or 0)

    name   = p.get("name", "?")
    symbol = name.split("/")[0].strip() if "/" in name else name

    return {
        "chain":            "solana",
        "pair_address":     amm_id,
        "dex":              "raydium",
        "token_address":    base_mint,
        "token_name":       symbol,
        "token_symbol":     symbol,
        "price_usd":        price,
        "liquidity_usd":    liq,
        "volume_1h":        vol_24h / 24,   # approx
        "volume_6h":        vol_24h / 4,
        "volume_24h":       vol_24h,
        "price_change_1h":  0.0,
        "price_change_6h":  0.0,
        "price_change_24h": 0.0,
        "market_cap":       0.0,
        "pair_created_at":  None,
        "pair_url":         f"https://dexscreener.com/solana/{amm_id}",
        "txns_1h_buys":     0,
        "txns_1h_sells":    0,
    }
