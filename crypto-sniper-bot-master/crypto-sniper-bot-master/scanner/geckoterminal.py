"""
GeckoTerminal API scanner — finds genuinely NEW pools created recently.
Docs: https://api.geckoterminal.com/docs
Free tier: 30 req/min, no API key needed.
"""

import asyncio
import logging
import time

import aiohttp

logger = logging.getLogger(__name__)

BASE = "https://api.geckoterminal.com/api/v2"

GECKO_CHAINS = {
    "solana": "solana",
    "bsc":    "bsc",
}

_HEADERS = {
    "Accept": "application/json;version=20230302",
}

MIN_LIQ_USD     = 5_000   # raised: pools < $5k rarely score above threshold
MIN_VOL_1H_USD  = 200
MAX_AGE_H       = 48
MIN_AGE_MIN     = 3


async def _get(session: aiohttp.ClientSession, url: str,
               params: dict | None = None) -> dict | None:
    """GET with retry on 429 (rate limit). Up to 3 attempts with backoff."""
    for attempt in range(3):
        try:
            async with session.get(
                url, params=params, headers=_HEADERS,
                timeout=aiohttp.ClientTimeout(total=12),
            ) as r:
                if r.status == 200:
                    return await r.json()
                if r.status == 429:
                    wait = 10 * (attempt + 1)  # 10s, 20s, 30s
                    logger.warning(
                        "GeckoTerminal 429 — retry %d/3 in %ds: %s", attempt + 1, wait, url
                    )
                    await asyncio.sleep(wait)
                    continue
                logger.warning("GeckoTerminal %s → %s", url, r.status)
                return None
        except asyncio.TimeoutError:
            logger.warning("GeckoTerminal timeout: %s", url)
        except Exception as e:
            logger.warning("GeckoTerminal error: %s", e)
        return None
    return None


async def get_new_pools(session: aiohttp.ClientSession, chain: str) -> list[dict]:
    """Fetch new pools on a given chain, page 1 and 2."""
    gecko_chain = GECKO_CHAINS.get(chain)
    if not gecko_chain:
        return []

    all_pools: list[dict] = []
    for page in (1, 2, 3):
        data = await _get(
            session,
            f"{BASE}/networks/{gecko_chain}/new_pools",
            params={"page": page},
        )
        if not data:
            break
        pools = data.get("data") or []
        included = {
            item["id"]: item
            for item in (data.get("included") or [])
        }
        for pool in pools:
            pair = _parse_pool(pool, included, chain)
            if pair:
                all_pools.append(pair)
        await asyncio.sleep(2)  # stay within 30 req/min free tier

    return _prefilter(all_pools)


async def get_trending_pools(session: aiohttp.ClientSession, chain: str) -> list[dict]:
    """Fetch trending pools (high volume last 1h)."""
    gecko_chain = GECKO_CHAINS.get(chain)
    if not gecko_chain:
        return []

    data = await _get(
        session,
        f"{BASE}/networks/{gecko_chain}/trending_pools",
        params={"page": 1},
    )
    if not data:
        return []

    included = {item["id"]: item for item in (data.get("included") or [])}
    pools = []
    for pool in (data.get("data") or []):
        pair = _parse_pool(pool, included, chain)
        if pair:
            pools.append(pair)

    return _prefilter(pools)


def _parse_pool(pool: dict, included: dict, chain: str) -> dict | None:
    """Convert GeckoTerminal pool object → pair_data dict."""
    attrs = pool.get("attributes") or {}
    rels  = pool.get("relationships") or {}

    base_rel = (rels.get("base_token") or {}).get("data") or {}
    base_id  = base_rel.get("id", "")
    token_address = base_id.split("_", 1)[-1] if "_" in base_id else base_id

    dex_rel = (rels.get("dex") or {}).get("data") or {}
    dex_id  = dex_rel.get("id", "")

    pair_address = pool.get("id", "").split("_", 1)[-1]

    base_token_info = included.get(base_id) or {}
    base_attrs      = base_token_info.get("attributes") or {}
    token_name      = base_attrs.get("name") or attrs.get("name", "?")
    token_symbol    = base_attrs.get("symbol") or "?"
    if token_symbol == "?" and attrs.get("name"):
        token_symbol = attrs["name"].split("/")[0].strip()

    try:
        price_usd = float(attrs.get("base_token_price_usd") or 0)
    except (ValueError, TypeError):
        price_usd = 0.0

    try:
        liq_usd = float(attrs.get("reserve_in_usd") or 0)
    except (ValueError, TypeError):
        liq_usd = 0.0

    vol_info = attrs.get("volume_usd") or {}
    try:
        vol_1h  = float(vol_info.get("h1")  or 0)
        vol_6h  = float(vol_info.get("h6")  or 0)
        vol_24h = float(vol_info.get("h24") or 0)
    except (ValueError, TypeError):
        vol_1h = vol_6h = vol_24h = 0.0

    pct = attrs.get("price_change_percentage") or {}
    try:
        chg_1h  = float(pct.get("h1")  or 0)
        chg_6h  = float(pct.get("h6")  or 0)
        chg_24h = float(pct.get("h24") or 0)
    except (ValueError, TypeError):
        chg_1h = chg_6h = chg_24h = 0.0

    try:
        mcap = float(attrs.get("fdv_usd") or attrs.get("market_cap_usd") or 0)
    except (ValueError, TypeError):
        mcap = 0.0

    txns  = (attrs.get("transactions") or {}).get("h1") or {}
    buys  = txns.get("buys",  0) or 0
    sells = txns.get("sells", 0) or 0

    created_str = attrs.get("pool_created_at")
    created_ms  = None
    if created_str:
        try:
            import datetime as _dt
            dt = _dt.datetime.fromisoformat(created_str.replace("Z", "+00:00"))
            created_ms = int(dt.timestamp() * 1000)
        except Exception:
            pass

    dex_screen_url = f"https://dexscreener.com/{chain}/{pair_address}" if pair_address else ""

    return {
        "chain":            chain,
        "pair_address":     pair_address,
        "dex":              dex_id,
        "token_address":    token_address,
        "token_name":       token_name,
        "token_symbol":     token_symbol,
        "price_usd":        price_usd,
        "liquidity_usd":    liq_usd,
        "volume_1h":        vol_1h,
        "volume_6h":        vol_6h,
        "volume_24h":       vol_24h,
        "price_change_1h":  chg_1h,
        "price_change_6h":  chg_6h,
        "price_change_24h": chg_24h,
        "market_cap":       mcap,
        "pair_created_at":  created_ms,
        "pair_url":         dex_screen_url,
        "txns_1h_buys":     buys,
        "txns_1h_sells":    sells,
    }


def _prefilter(pairs: list[dict]) -> list[dict]:
    now_ms = int(time.time() * 1000)
    result = []
    for pair in pairs:
        if pair.get("liquidity_usd", 0) < MIN_LIQ_USD:
            continue
        if pair.get("volume_1h", 0) < MIN_VOL_1H_USD:
            continue
        created_ms = pair.get("pair_created_at")
        if created_ms:
            age_min = (now_ms - created_ms) / 60_000
            if age_min < MIN_AGE_MIN:
                continue
            if age_min > MAX_AGE_H * 60:
                continue
        result.append(pair)
    return result
