"""
Birdeye API scanner — new Solana token listings.
Free tier: 10 000 req/day, 1 req/sec.

Setup (one-time, 2 minutes):
  1. Register at https://birdeye.so/api  (free)
  2. Copy API key
  3. Add to Railway env vars:  BIRDEYE_API_KEY=<your_key>

Without BIRDEYE_API_KEY this module returns empty list (GeckoTerminal used as fallback).
"""

import asyncio
import logging
import os
import time as _time

import aiohttp

logger = logging.getLogger(__name__)

BIRDEYE_API_KEY = os.getenv("BIRDEYE_API_KEY", "")
BASE = "https://public-api.birdeye.so"

MIN_LIQ_USD  = 5_000
MIN_VOL_1H   = 100
MAX_AGE_H    = 48
MIN_AGE_MIN  = 3


def is_available() -> bool:
    return bool(BIRDEYE_API_KEY)


async def _get(session: aiohttp.ClientSession, url: str,
               params: dict | None = None) -> dict | None:
    headers = {
        "accept":      "application/json",
        "x-chain":     "solana",
        "X-API-KEY":   BIRDEYE_API_KEY,
    }
    try:
        async with session.get(
            url, params=params, headers=headers,
            timeout=aiohttp.ClientTimeout(total=12),
        ) as r:
            if r.status == 200:
                return await r.json()
            if r.status == 429:
                logger.warning("Birdeye 429 rate limit — wait 60s")
                await asyncio.sleep(60)
            else:
                logger.warning("Birdeye %s → %s", url, r.status)
    except asyncio.TimeoutError:
        logger.warning("Birdeye timeout: %s", url)
    except Exception as e:
        logger.warning("Birdeye error: %s", e)
    return None


async def get_new_listings(session: aiohttp.ClientSession,
                           limit: int = 50) -> list[dict]:
    """
    New token listings on Solana, sorted by creation time DESC.
    Returns list of pair_data dicts in our standard format.
    """
    if not BIRDEYE_API_KEY:
        return []

    now_sec = int(_time.time())
    data = await _get(
        session,
        f"{BASE}/defi/v2/tokens/new_listing",
        params={
            "time_to":              now_sec,
            "limit":                limit,
            "meme_platform_enabled": "true",
        },
    )
    if not data:
        return []

    items = (data.get("data") or {}).get("items") or []
    results = []
    for item in items:
        pair = _parse(item)
        if pair:
            results.append(pair)
    return results


async def get_trending(session: aiohttp.ClientSession,
                       limit: int = 20) -> list[dict]:
    """
    Trending Solana tokens by 1h volume change (momentum scanner).
    """
    if not BIRDEYE_API_KEY:
        return []

    data = await _get(
        session,
        f"{BASE}/defi/v3/token/list",
        params={
            "sort_by":       "v1hChangePercent",
            "sort_type":     "desc",
            "offset":        0,
            "limit":         limit,
            "min_liquidity": MIN_LIQ_USD,
        },
    )
    if not data:
        return []

    items = (data.get("data") or {}).get("items") or []
    results = []
    for item in items:
        pair = _parse_from_list(item)
        if pair:
            results.append(pair)
    return results


def _parse(item: dict) -> dict | None:
    """Parse /v2/tokens/new_listing item."""
    address = item.get("address", "")
    if not address:
        return None

    liq  = float(item.get("liquidity")  or 0)
    if liq < MIN_LIQ_USD:
        return None

    created_ts = item.get("createdAt") or item.get("creation_time")
    created_ms = None
    if created_ts:
        ts = int(created_ts)
        created_ms = ts * 1000 if ts < 1_000_000_000_000 else ts
        age_min = (_time.time() * 1000 - created_ms) / 60_000
        if age_min < MIN_AGE_MIN:
            return None
        if age_min > MAX_AGE_H * 60:
            return None

    price    = float(item.get("price")   or 0)
    vol_1h   = float(item.get("v1hUSD")  or 0)
    vol_24h  = float(item.get("v24hUSD") or 0)
    chg_1h   = float(item.get("v1hChangePercent")  or 0)
    chg_24h  = float(item.get("v24hChangePercent") or 0)
    mcap     = float(item.get("mc") or item.get("realMc") or 0)
    name     = item.get("name",   "?")
    symbol   = item.get("symbol", "?")

    if vol_1h < MIN_VOL_1H:
        return None

    return {
        "chain":            "solana",
        "pair_address":     address,
        "dex":              "birdeye",
        "token_address":    address,
        "token_name":       name,
        "token_symbol":     symbol,
        "price_usd":        price,
        "liquidity_usd":    liq,
        "volume_1h":        vol_1h,
        "volume_6h":        vol_24h / 4,
        "volume_24h":       vol_24h,
        "price_change_1h":  chg_1h,
        "price_change_6h":  chg_24h / 4,
        "price_change_24h": chg_24h,
        "market_cap":       mcap,
        "pair_created_at":  created_ms,
        "pair_url":         f"https://dexscreener.com/solana/{address}",
        "txns_1h_buys":     0,
        "txns_1h_sells":    0,
    }


def _parse_from_list(item: dict) -> dict | None:
    """Parse /v3/token/list item (trending)."""
    address = item.get("address", "")
    if not address:
        return None

    liq  = float(item.get("liquidity") or 0)
    if liq < MIN_LIQ_USD:
        return None

    price    = float(item.get("price")   or 0)
    vol_1h   = float(item.get("v1hUSD")  or 0)
    vol_24h  = float(item.get("v24hUSD") or 0)
    chg_1h   = float(item.get("v1hChangePercent")  or 0)
    chg_24h  = float(item.get("v24hChangePercent") or 0)
    mcap     = float(item.get("mc") or 0)
    name     = item.get("name",   "?")
    symbol   = item.get("symbol", "?")

    if vol_1h < MIN_VOL_1H:
        return None

    return {
        "chain":            "solana",
        "pair_address":     address,
        "dex":              "birdeye",
        "token_address":    address,
        "token_name":       name,
        "token_symbol":     symbol,
        "price_usd":        price,
        "liquidity_usd":    liq,
        "volume_1h":        vol_1h,
        "volume_6h":        vol_24h / 4,
        "volume_24h":       vol_24h,
        "price_change_1h":  chg_1h,
        "price_change_6h":  chg_24h / 4,
        "price_change_24h": chg_24h,
        "market_cap":       mcap,
        "pair_created_at":  None,
        "pair_url":         f"https://dexscreener.com/solana/{address}",
        "txns_1h_buys":     0,
        "txns_1h_sells":    0,
    }
