"""
Simple in-process TTL cache for token prices and safety check results.

Why: DexScreener / RugCheck / Honeypot.is are called repeatedly for the
same tokens (position monitor every 5 min, manual balance refresh, buy
buttons). This cache prevents duplicate network calls within one cycle.

Thread-safety: asyncio is single-threaded, so plain dicts are safe.
"""

import time
import logging

logger = logging.getLogger(__name__)

# ── Price cache ────────────────────────────────────────────────────────────────
# key: f"{chain}:{address}"  →  (price_usd: float, ts: float)
_price_cache: dict[str, tuple[float, float]] = {}
PRICE_TTL = 90  # seconds — fresh enough for position monitor + menu


def get_cached_price(chain: str, address: str) -> float | None:
    key = f"{chain}:{address}"
    entry = _price_cache.get(key)
    if entry and time.time() - entry[1] < PRICE_TTL:
        return entry[0]
    return None


def set_cached_price(chain: str, address: str, price: float) -> None:
    _price_cache[f"{chain}:{address}"] = (price, time.time())


def evict_price(chain: str, address: str) -> None:
    _price_cache.pop(f"{chain}:{address}", None)


# ── Safety cache ───────────────────────────────────────────────────────────────
# key: f"{chain}:{address}"  →  (safety_dict: dict, ts: float)
_safety_cache: dict[str, tuple[dict, float]] = {}
SAFETY_TTL = 300  # 5 minutes — rug/honeypot data doesn't change that fast


def get_cached_safety(chain: str, address: str) -> dict | None:
    key = f"{chain}:{address}"
    entry = _safety_cache.get(key)
    if entry and time.time() - entry[1] < SAFETY_TTL:
        return entry[0]
    return None


def set_cached_safety(chain: str, address: str, safety: dict) -> None:
    _safety_cache[f"{chain}:{address}"] = (safety, time.time())


# ── Maintenance ────────────────────────────────────────────────────────────────

def evict_expired() -> int:
    """Remove stale entries. Call periodically to prevent memory growth."""
    now = time.time()
    before = len(_price_cache) + len(_safety_cache)

    for d, ttl in ((_price_cache, PRICE_TTL), (_safety_cache, SAFETY_TTL)):
        stale = [k for k, (_, ts) in d.items() if now - ts > ttl]
        for k in stale:
            del d[k]

    removed = before - len(_price_cache) - len(_safety_cache)
    if removed:
        logger.debug("price_cache: evicted %d stale entries", removed)
    return removed
