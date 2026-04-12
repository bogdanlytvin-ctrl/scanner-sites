"""
DexScreener API client.
Docs: https://docs.dexscreener.com/api/reference
Free tier: 300 req/min, no API key needed.
"""

import asyncio
import logging
import time

import aiohttp

logger = logging.getLogger(__name__)

BASE = "https://api.dexscreener.com"

CHAINS = {
    "solana": "solana",
    "bsc":    "bsc",
}

MIN_LIQUIDITY_USD = 3_000
MIN_VOLUME_1H     = 500
MAX_TOKEN_AGE_H   = 48
MIN_TOKEN_AGE_MIN = 3


async def _get(session: aiohttp.ClientSession, url: str,
               params: dict | None = None) -> dict | list | None:
    try:
        async with session.get(url, params=params,
                               timeout=aiohttp.ClientTimeout(total=10)) as r:
            if r.status == 200:
                return await r.json()
            logger.warning("DexScreener %s → %s", url, r.status)
    except asyncio.TimeoutError:
        logger.warning("DexScreener timeout: %s", url)
    except Exception as e:
        logger.error("DexScreener error: %s", e)
    return None


async def get_latest_token_profiles(session: aiohttp.ClientSession) -> list[dict]:
    data = await _get(session, f"{BASE}/token-profiles/latest/v1")
    if not data:
        return []
    return data if isinstance(data, list) else []


async def get_latest_boosted_tokens(session: aiohttp.ClientSession) -> list[dict]:
    data = await _get(session, f"{BASE}/token-boosts/latest/v1")
    if not data:
        return []
    return data if isinstance(data, list) else []


async def get_pairs_by_token(session: aiohttp.ClientSession,
                              chain: str, token_address: str) -> list[dict]:
    """Get trading pairs for a token. Uses /latest/dex/tokens/ endpoint."""
    data = await _get(session, f"{BASE}/latest/dex/tokens/{token_address}")
    if not data or "pairs" not in data:
        return []
    pairs = data["pairs"] or []
    return [p for p in pairs if p.get("chainId") == chain]


async def get_pairs_batch(session: aiohttp.ClientSession,
                           chain: str, addresses: list[str]) -> list[dict]:
    """Batch lookup — up to 30 token addresses in a single request."""
    if not addresses:
        return []
    # API accepts comma-separated addresses, max 30
    chunk = ",".join(addresses[:30])
    data = await _get(session, f"{BASE}/latest/dex/tokens/{chunk}")
    if not data or "pairs" not in data:
        return []
    return [p for p in (data["pairs"] or []) if p.get("chainId") == chain]


async def search_new_pairs(session: aiohttp.ClientSession, chain: str) -> list[dict]:
    """
    Find candidate pairs using two strategies:
      1. Token profiles + boosts  — batch lookup (2 API calls total)
      2. Direct trending search   — volume-sorted pairs for the chain
    """
    all_pairs: list[dict] = []

    # ── Strategy 1: latest profiles + boosts (batch, 2 HTTP calls) ────────────
    profiles, boosted = [], []
    profiles = await get_latest_token_profiles(session)
    boosted  = await get_latest_boosted_tokens(session)

    addresses = list({
        p.get("tokenAddress", "")
        for p in (profiles + boosted)
        if p.get("chainId") == chain and p.get("tokenAddress")
    })

    if addresses:
        # Single batch request instead of 20+ sequential calls
        batch_pairs = await get_pairs_batch(session, chain, addresses[:30])
        all_pairs.extend(batch_pairs)
        # If > 30 addresses, fetch the rest in a second batch
        if len(addresses) > 30:
            batch_pairs2 = await get_pairs_batch(session, chain, addresses[30:60])
            all_pairs.extend(batch_pairs2)

    # ── Strategy 2: trending search — tokens with recent volume spikes ─────────
    trending_data = await _get(
        session,
        f"{BASE}/latest/dex/search",
        params={"q": "new"},
    )
    if trending_data and "pairs" in trending_data:
        for p in (trending_data["pairs"] or []):
            if p.get("chainId") == chain:
                all_pairs.append(p)

    # Deduplicate by pairAddress
    seen: set[str] = set()
    unique: list[dict] = []
    for p in all_pairs:
        pa = p.get("pairAddress", "")
        if pa and pa not in seen:
            seen.add(pa)
            unique.append(p)

    return _prefilter(unique, chain)


def _prefilter(pairs: list[dict], chain: str) -> list[dict]:
    now_ms = int(time.time() * 1000)
    result = []
    for pair in pairs:
        if pair.get("chainId") != chain:
            continue
        liquidity = (pair.get("liquidity") or {}).get("usd", 0) or 0
        if liquidity < MIN_LIQUIDITY_USD:
            continue
        volume = (pair.get("volume") or {}).get("h1", 0) or 0
        if volume < MIN_VOLUME_1H:
            continue
        pair_created = pair.get("pairCreatedAt")
        if pair_created:
            age_min = (now_ms - pair_created) / 60_000
            if age_min < MIN_TOKEN_AGE_MIN:
                continue
            if age_min > MAX_TOKEN_AGE_H * 60:
                continue
        result.append(pair)
    return result


def extract_pair_data(pair: dict) -> dict:
    base_token = pair.get("baseToken") or {}
    liquidity  = pair.get("liquidity") or {}
    volume     = pair.get("volume") or {}
    price_chg  = pair.get("priceChange") or {}
    return {
        "chain":            pair.get("chainId", ""),
        "pair_address":     pair.get("pairAddress", ""),
        "dex":              pair.get("dexId", ""),
        "token_address":    base_token.get("address", ""),
        "token_name":       base_token.get("name", ""),
        "token_symbol":     base_token.get("symbol", ""),
        "price_usd":        float(pair.get("priceUsd") or 0),
        "liquidity_usd":    float(liquidity.get("usd") or 0),
        "volume_1h":        float(volume.get("h1") or 0),
        "volume_6h":        float(volume.get("h6") or 0),
        "volume_24h":       float(volume.get("h24") or 0),
        "price_change_1h":  float(price_chg.get("h1") or 0),
        "price_change_6h":  float(price_chg.get("h6") or 0),
        "price_change_24h": float(price_chg.get("h24") or 0),
        "market_cap":       float(pair.get("marketCap") or 0),
        "pair_created_at":  pair.get("pairCreatedAt"),
        "pair_url":         pair.get("url", ""),
        "txns_1h_buys":     ((pair.get("txns") or {}).get("h1") or {}).get("buys", 0),
        "txns_1h_sells":    ((pair.get("txns") or {}).get("h1") or {}).get("sells", 0),
    }
