"""
PancakeSwap V2 Subgraph scanner — new BSC pools via GraphQL.
No API key required. Completely free.
Endpoint: https://api.thegraph.com/subgraphs/name/pancakeswap/exchange-v2
"""

import asyncio
import logging
import time as _time

import aiohttp

logger = logging.getLogger(__name__)

SUBGRAPH_URL = "https://api.thegraph.com/subgraphs/name/pancakeswap/exchange-v2"

MIN_LIQ_USD  = 5_000
MIN_VOL_1H   = 100
MAX_AGE_H    = 48
MIN_AGE_MIN  = 3

# GraphQL query: pairs created in last MAX_AGE_H hours, sorted newest first
_QUERY = """
query NewPairs($since: Int!, $minLiq: String!) {
  pairs(
    first: 100
    orderBy: createdAtTimestamp
    orderDirection: desc
    where: {
      createdAtTimestamp_gt: $since
      reserveUSD_gt: $minLiq
    }
  ) {
    id
    createdAtTimestamp
    reserveUSD
    volumeUSD
    token0 {
      id
      name
      symbol
    }
    token1 {
      id
      name
      symbol
    }
    token0Price
    token1Price
  }
}
"""


async def get_new_pairs(session: aiohttp.ClientSession) -> list[dict]:
    """
    Fetch new PancakeSwap V2 pairs created in the last MAX_AGE_H hours.
    Returns list of pair_data dicts in our standard format.
    """
    since = int(_time.time()) - MAX_AGE_H * 3600
    payload = {
        "query":     _QUERY,
        "variables": {
            "since":  since,
            "minLiq": str(MIN_LIQ_USD),
        },
    }

    try:
        async with session.post(
            SUBGRAPH_URL,
            json=payload,
            timeout=aiohttp.ClientTimeout(total=15),
        ) as r:
            if r.status != 200:
                logger.warning("PancakeSwap subgraph → %s", r.status)
                return []
            data = await r.json()
    except asyncio.TimeoutError:
        logger.warning("PancakeSwap subgraph timeout")
        return []
    except Exception as e:
        logger.warning("PancakeSwap subgraph error: %s", e)
        return []

    errors = data.get("errors")
    if errors:
        logger.warning("PancakeSwap subgraph errors: %s", errors)
        return []

    pairs_raw = (data.get("data") or {}).get("pairs") or []
    results = []
    now_ms = int(_time.time() * 1000)

    for p in pairs_raw:
        pair = _parse(p, now_ms)
        if pair:
            results.append(pair)

    return results


def _parse(p: dict, now_ms: int) -> dict | None:
    pair_id = p.get("id", "")
    if not pair_id:
        return None

    liq = float(p.get("reserveUSD") or 0)
    if liq < MIN_LIQ_USD:
        return None

    created_ts = p.get("createdAtTimestamp")
    created_ms = None
    if created_ts:
        created_ms = int(created_ts) * 1000
        age_min = (now_ms - created_ms) / 60_000
        if age_min < MIN_AGE_MIN:
            return None
        if age_min > MAX_AGE_H * 60:
            return None

    # Determine which token is the "base" (not WBNB/BUSD/USDT/USDC)
    QUOTE_TOKENS = {
        "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c",  # WBNB
        "0xe9e7cea3dedca5984780bafc599bd69add087d56",  # BUSD
        "0x55d398326f99059ff775485246999027b3197955",  # USDT
        "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",  # USDC
    }
    t0 = p.get("token0") or {}
    t1 = p.get("token1") or {}
    t0_id = (t0.get("id") or "").lower()
    t1_id = (t1.get("id") or "").lower()

    if t0_id in QUOTE_TOKENS:
        base, quote = t1, t0
        price = float(p.get("token1Price") or 0)
    else:
        base, quote = t0, t1
        price = float(p.get("token0Price") or 0)

    token_address = base.get("id", "")
    token_name    = base.get("name",   "?")
    token_symbol  = base.get("symbol", "?")

    # Volume: subgraph gives cumulative; we don't have 1h breakdown
    # Use 0 for vol_1h — safety check + liq score carry the signal
    vol_total = float(p.get("volumeUSD") or 0)

    return {
        "chain":            "bsc",
        "pair_address":     pair_id,
        "dex":              "pancakeswap",
        "token_address":    token_address,
        "token_name":       token_name,
        "token_symbol":     token_symbol,
        "price_usd":        price,
        "liquidity_usd":    liq,
        "volume_1h":        vol_total,   # cumulative since creation (new pool = ~all volume is recent)
        "volume_6h":        vol_total,
        "volume_24h":       vol_total,
        "price_change_1h":  0.0,
        "price_change_6h":  0.0,
        "price_change_24h": 0.0,
        "market_cap":       0.0,
        "pair_created_at":  created_ms,
        "pair_url":         f"https://dexscreener.com/bsc/{pair_id}",
        "txns_1h_buys":     0,
        "txns_1h_sells":    0,
    }
