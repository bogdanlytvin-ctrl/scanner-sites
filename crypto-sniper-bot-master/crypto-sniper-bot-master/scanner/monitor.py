"""
Background monitoring loop.
Sources (priority order):
  - Raydium:        all Solana AMM pools every 45s  [PRIMARY, no key, official Raydium API]
  - PancakeSwap:    new BSC pools every 90s         [PRIMARY, no key, subgraph GraphQL]
  - GeckoTerminal:  Solana trending every 60s       [SECONDARY, rate-limited]
  - DexScreener:    boosted tokens every 90s        [TERTIARY]
  - Pump.fun:       new Solana launches every 30s   [circuit-breaker if blocked]
"""

import asyncio
import logging
import os
import time as _time
from typing import Callable, Awaitable

import aiohttp

import database as db
from scanner.dexscreener import search_new_pairs, extract_pair_data, get_pairs_batch, CHAINS
from scanner.geckoterminal import get_trending_pools
from scanner.rugcheck  import check_solana_token
from scanner.honeypot  import check_bnb_token
from scanner.signals   import (
    score_token, format_signal_message,
    SIGNAL_STRONG_BUY, SIGNAL_BUY, SIGNAL_WATCH,
)
from scanner.pumpfun     import get_new_tokens, is_new as pumpfun_is_new, format_token_message
from scanner.raydium     import get_pairs as raydium_get_pairs, prefilter as raydium_prefilter, to_pair_data as raydium_to_pair
from scanner.pancakeswap import get_new_pairs as pcs_new_pairs
from scanner.price_cache import (
    get_cached_safety, set_cached_safety, evict_expired as _cache_evict,
)

logger = logging.getLogger(__name__)

SCAN_INTERVAL        = int(os.getenv("SCAN_INTERVAL_SEC",        "90"))   # DexScreener (tertiary)
GECKO_INTERVAL       = int(os.getenv("GECKO_INTERVAL_SEC",       "60"))   # GeckoTerminal Solana trending
GECKO_INTERVAL_BSC   = int(os.getenv("GECKO_INTERVAL_BSC_SEC",  "180"))  # GeckoTerminal BSC
RAYDIUM_INTERVAL     = int(os.getenv("RAYDIUM_INTERVAL_SEC",     "45"))   # Raydium AMM pools (PRIMARY)
PANCAKE_INTERVAL     = int(os.getenv("PANCAKE_INTERVAL_SEC",     "90"))   # PancakeSwap subgraph (PRIMARY)
PUMPFUN_INTERVAL     = int(os.getenv("PUMPFUN_INTERVAL_SEC",     "30"))
MIN_SIGNAL_SCORE     = int(os.getenv("MIN_SIGNAL_SCORE",         "35"))

# pump.fun circuit breaker — suspend after this many consecutive all-endpoint failures
_PUMP_MAX_FAILS   = 5
_PUMP_SUSPEND_SEC = 3_600  # 1 hour

# seen-pairs TTL: allow re-evaluation after 4 hours (DexScreener promoted tokens
# stay live for 24h, so without TTL DexScreener becomes useless after cycle 1)
_SEEN_TTL = 4 * 3600  # 4 hours

# 4-arg callback: (telegram_id, message, pair_data, signal_meta)
# signal_meta carries pre-loaded user context so send callback needs 0 extra DB queries
SendCallback = Callable[[int, str, dict | None, dict | None], Awaitable[None]]

_seen_pairs: dict[str, float] = {}  # addr → timestamp first seen


def _mark_seen(addr: str) -> bool:
    """Returns True if NEW or TTL expired (re-evaluate). Updates seen timestamp."""
    if not addr:
        return False
    now = _time.time()
    last = _seen_pairs.get(addr)
    if last is not None and now - last < _SEEN_TTL:
        return False  # seen recently
    _seen_pairs[addr] = now
    return True


def _cleanup_seen() -> None:
    """Remove expired entries to prevent unbounded memory growth."""
    cutoff = _time.time() - _SEEN_TTL
    expired = [k for k, v in _seen_pairs.items() if v < cutoff]
    for k in expired:
        del _seen_pairs[k]


async def run_monitor(send_fn: SendCallback) -> None:
    logger.info(
        "Monitor started. Raydium: %ds | PancakeSwap: %ds | Gecko SOL: %ds | DexScreener: %ds | pump.fun: %ds",
        RAYDIUM_INTERVAL, PANCAKE_INTERVAL, GECKO_INTERVAL, SCAN_INTERVAL, PUMPFUN_INTERVAL,
    )
    async with aiohttp.ClientSession() as session:
        tasks = [
            _raydium_loop(session, send_fn),       # PRIMARY: Solana all AMM pools
            _pancake_loop(session, send_fn),       # PRIMARY: BSC new pools
            _gecko_loop_solana(session, send_fn),  # SECONDARY: Solana trending
            _gecko_loop_bsc(session, send_fn),     # SECONDARY: BSC trending
            _dex_loop(session, send_fn),           # TERTIARY: DexScreener boosted
            _pump_loop(session, send_fn),          # Pump.fun (circuit-breaker)
        ]
        await asyncio.gather(*tasks)


# ── helpers ───────────────────────────────────────────────────────────────────

async def _process_pair(
    session: aiohttp.ClientSession,
    pair_data: dict,
    new_signals: list,
) -> None:
    """Score one pair, append to new_signals if good enough."""
    chain   = pair_data.get("chain", "")
    address = pair_data.get("token_address", "")
    symbol  = pair_data.get("token_symbol", "?")

    # Use cached safety result if fresh (< 5 min) to avoid redundant API calls
    safety = get_cached_safety(chain, address)
    if safety is None:
        if chain == "solana":
            safety = await check_solana_token(session, address)
        else:
            safety = await check_bnb_token(session, address)
        set_cached_safety(chain, address, safety)

    result = score_token(pair_data, safety)

    if result["blocked"]:
        logger.info(
            "BLOCKED  %s [%s] — %s",
            symbol, chain.upper(), result["block_reason"],
        )
        return

    liq = pair_data.get("liquidity_usd", 0) or 0
    vol = pair_data.get("volume_1h", 0) or 0
    chg = pair_data.get("price_change_1h", 0) or 0
    logger.info(
        "SCORED   %s [%s] score=%d/%d  liq=$%s  vol1h=$%s  chg=%+.1f%%  src=%s",
        symbol, chain.upper(), result["score"], MIN_SIGNAL_SCORE,
        f"{liq:,.0f}", f"{vol:,.0f}", chg,
        pair_data.get("dex", "?"),
    )

    if result["score"] < MIN_SIGNAL_SCORE:
        return

    signal_data = {
        **pair_data,
        "score":              result["score"],
        "signal_type":        result["signal_type"],
        "liq_locked":         bool(safety.get("lp_locked") or safety.get("liq_locked")),
        "contract_renounced": safety.get("contract_renounced", False),
        "honeypot":           safety.get("is_honeypot", False),
        "rugcheck_score":     safety.get("rugcheck_score"),
        "top10_holders_pct":  safety.get("top10_holders_pct"),
        "holders":            safety.get("holders"),
        "pair_created_at":    pair_data.get("pair_created_at"),
        "pair_url":           pair_data.get("pair_url"),
    }
    signal_id = db.save_signal(signal_data)
    if signal_id is None:
        return  # duplicate for today

    new_signals.append((signal_id, result["signal_type"], result["score"], pair_data, result))
    logger.info(
        "Signal %s | %s | %s | score=%d",
        chain.upper(), result["signal_type"],
        pair_data.get("token_symbol", "?"), result["score"],
    )


def _daily_limit(tier: str) -> int:
    """Returns daily signal limit for tier. 0 = unlimited."""
    key = f"{tier}_daily_signals"
    val = db.get_bot_setting(key, "0")
    try:
        return int(val)
    except ValueError:
        return 0


def _tier_min_score(tier: str) -> int:
    """
    Min score to dispatch a signal to a user of this tier.
    Reads from bot_settings so admin can tune live without redeploying.
    """
    defaults = {"free": 35, "basic": 35, "pro": 35}
    fallback = defaults.get(tier, 35)
    key = f"{tier}_min_score"
    try:
        val = db.get_bot_setting(key)
        return int(val) if val is not None else fallback
    except (ValueError, TypeError):
        return fallback


async def _dispatch_signals(
    signals: list[tuple[int, str, int, dict, dict]],
    send_fn: SendCallback,
) -> None:
    if db.get_bot_setting("maintenance_mode", "0") == "1":
        logger.info("Maintenance mode — signals not dispatched.")
        return

    users = db.get_all_active_users_with_tier()
    logger.info("Dispatching %d signal(s) to %d active user(s)", len(signals), len(users))

    for signal_id, signal_type, score, pair_data, signal_result in signals:
        symbol     = pair_data.get("token_symbol", "?")
        sent_count = 0

        for user in users:
            user_id     = user["id"]
            telegram_id = user["telegram_id"]
            user_lang   = user["lang"] or "ua"
            tier        = user["tier"] or "free"
            min_score   = _tier_min_score(tier)

            if score < min_score:
                logger.debug(
                    "Signal %d (%s score=%d) skipped uid=%d tier=%s (need %d)",
                    signal_id, symbol, score, user_id, tier, min_score,
                )
                continue

            if db.was_signal_sent(user_id, signal_id):
                continue

            limit = _daily_limit(tier)
            if limit > 0 and db.count_signals_sent_today(user_id) >= limit:
                logger.debug(
                    "Signal %d skipped uid=%d: daily limit %d reached",
                    signal_id, user_id, limit,
                )
                continue

            message = format_signal_message(pair_data, signal_result, lang=user_lang)

            # Embed user context so send_fn needs zero extra DB queries per user
            signal_meta = {
                "signal_id":   signal_id,
                "score":       score,
                "signal_type": signal_type,
                "price_usd":   pair_data.get("price_usd", 0),
                "user_id":     user_id,
                "lang":        user_lang,
                "user_tier":   tier,
                "auto_mode":   user.get("auto_mode", 0),
                "user_settings": {
                    "auto_mode":        user.get("auto_mode", 0),
                    "auto_min_score":   user.get("auto_min_score", 80),
                    "auto_max_buy_sol": user.get("auto_max_buy_sol", 0.1),
                    "auto_max_buy_bnb": user.get("auto_max_buy_bnb", 0.01),
                    "auto_stop_loss":   user.get("auto_stop_loss", 20),
                    "auto_take_profit": user.get("auto_take_profit", 0),
                },
            }

            try:
                await send_fn(telegram_id, message, pair_data, signal_meta)
                db.mark_signal_sent(user_id, signal_id)
                sent_count += 1
                await asyncio.sleep(0.04)  # ~25 msg/sec Telegram limit
            except Exception as e:
                logger.warning("Failed to send signal to %d: %s", telegram_id, e)

        if sent_count > 0:
            logger.info(
                "Signal %d (%s score=%d) sent to %d user(s)",
                signal_id, symbol, score, sent_count,
            )
        else:
            logger.warning(
                "Signal %d (%s score=%d) — sent to 0 users "
                "(check tier score thresholds and user count)",
                signal_id, symbol, score,
            )


# ── Raydium loop (PRIMARY Solana) ────────────────────────────────────────────

async def _raydium_loop(session: aiohttp.ClientSession, send_fn: SendCallback) -> None:
    logger.info("Raydium scanner active (Solana AMM pools every %ds)", RAYDIUM_INTERVAL)
    while True:
        try:
            await _raydium_cycle(session, send_fn)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("Raydium cycle error: %s", e, exc_info=True)
        await asyncio.sleep(RAYDIUM_INTERVAL)


async def _raydium_cycle(session: aiohttp.ClientSession, send_fn: SendCallback) -> None:
    new_signals: list = []

    raw_pairs  = await raydium_get_pairs(session)
    filtered   = raydium_prefilter(raw_pairs)
    new_pairs  = [p for p in filtered if _mark_seen(p.get("ammId", ""))]

    logger.info("Raydium: %d total, %d pass filter, %d new", len(raw_pairs), len(filtered), len(new_pairs))
    if not new_pairs:
        return

    # Enrich top 30 new pairs with DexScreener (price change, txn counts, full data)
    base_mints = [p.get("baseMint", "") for p in new_pairs if p.get("baseMint")][:30]
    if base_mints:
        enriched = await get_pairs_batch(session, "solana", base_mints)
        dex_map  = {}
        for ep in enriched:
            pd = extract_pair_data(ep)
            dex_map[pd["token_address"]] = pd

        enriched_pairs = []
        for p in new_pairs[:30]:
            mint = p.get("baseMint", "")
            # Prefer DexScreener data (has price change, txns); fall back to Raydium
            enriched_pairs.append(dex_map.get(mint) or raydium_to_pair(p))
    else:
        enriched_pairs = [raydium_to_pair(p) for p in new_pairs[:30]]

    # Safety checks in parallel
    await asyncio.gather(*[_process_pair(session, pd, new_signals) for pd in enriched_pairs])

    if new_signals:
        await _dispatch_signals(new_signals, send_fn)


# ── PancakeSwap Subgraph loop (PRIMARY BSC) ───────────────────────────────────

async def _pancake_loop(session: aiohttp.ClientSession, send_fn: SendCallback) -> None:
    logger.info("PancakeSwap subgraph scanner active (new BSC pools every %ds)", PANCAKE_INTERVAL)
    await asyncio.sleep(10)  # offset from startup burst
    while True:
        try:
            await _pancake_cycle(session, send_fn)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("PancakeSwap cycle error: %s", e, exc_info=True)
        await asyncio.sleep(PANCAKE_INTERVAL)


async def _pancake_cycle(session: aiohttp.ClientSession, send_fn: SendCallback) -> None:
    new_signals: list = []

    pairs = await pcs_new_pairs(session)
    new_pairs = [p for p in pairs if _mark_seen(p.get("pair_address", ""))]
    logger.info("PancakeSwap new_pairs: %d (%d new)", len(pairs), len(new_pairs))
    # Safety checks in parallel
    await asyncio.gather(*[_process_pair(session, p, new_signals) for p in new_pairs])

    if new_signals:
        await _dispatch_signals(new_signals, send_fn)


# ── DexScreener loop ──────────────────────────────────────────────────────────

async def _dex_loop(session: aiohttp.ClientSession, send_fn: SendCallback) -> None:
    while True:
        try:
            await _dex_cycle(session, send_fn)
            _cache_evict()    # prune stale price/safety cache entries
            _cleanup_seen()   # prune expired seen-pairs entries
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("DexScreener cycle error: %s", e, exc_info=True)
        await asyncio.sleep(SCAN_INTERVAL)


async def _dex_cycle(session: aiohttp.ClientSession, send_fn: SendCallback) -> None:
    new_signals: list = []
    for chain in CHAINS.values():
        pairs = await search_new_pairs(session, chain)
        new_pairs = [p for p in pairs if _mark_seen(p.get("pairAddress", ""))]
        logger.info("DexScreener %s: %d pairs (%d new)", chain, len(pairs), len(new_pairs))
        for pair in new_pairs:
            pair_data = extract_pair_data(pair)
            await _process_pair(session, pair_data, new_signals)

    if new_signals:
        await _dispatch_signals(new_signals, send_fn)


# ── GeckoTerminal loops (solana and BSC run at different intervals) ────────────

async def _gecko_loop_solana(session: aiohttp.ClientSession, send_fn: SendCallback) -> None:
    await asyncio.sleep(15)  # offset from DexScreener start
    while True:
        try:
            await _gecko_cycle(session, send_fn, "solana")
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("GeckoTerminal SOL cycle error: %s", e, exc_info=True)
        await asyncio.sleep(GECKO_INTERVAL)


async def _gecko_loop_bsc(session: aiohttp.ClientSession, send_fn: SendCallback) -> None:
    # BSC gets a longer interval: free tier 429s are common on bsc endpoint
    await asyncio.sleep(45)  # offset further to avoid burst at startup
    while True:
        try:
            await _gecko_cycle(session, send_fn, "bsc")
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("GeckoTerminal BSC cycle error: %s", e, exc_info=True)
        await asyncio.sleep(GECKO_INTERVAL_BSC)


async def _gecko_cycle(
    session: aiohttp.ClientSession,
    send_fn: SendCallback,
    chain: str,
) -> None:
    new_signals: list = []

    new_pool_pairs = await get_new_pools(session, chain)
    new_pairs = [p for p in new_pool_pairs if _mark_seen(p.get("pair_address", ""))]
    logger.info("GeckoTerminal %s new_pools: %d (%d new)", chain, len(new_pool_pairs), len(new_pairs))
    for pair_data in new_pairs:
        await _process_pair(session, pair_data, new_signals)

    await asyncio.sleep(4)  # gap between new_pools and trending to stay within rate limit

    trending = await get_trending_pools(session, chain)
    new_trending = [p for p in trending if _mark_seen(p.get("pair_address", ""))]
    logger.info("GeckoTerminal %s trending: %d (%d new)", chain, len(trending), len(new_trending))
    for pair_data in new_trending:
        await _process_pair(session, pair_data, new_signals)

    if new_signals:
        await _dispatch_signals(new_signals, send_fn)


# ── Pump.fun loop ─────────────────────────────────────────────────────────────

async def _pump_loop(session: aiohttp.ClientSession, send_fn: SendCallback) -> None:
    # Seed seen set on startup (skip initial failure — not critical)
    tokens = await get_new_tokens(session, limit=50)
    for tok in tokens:
        pumpfun_is_new(tok.get("mint", ""))
    if tokens:
        logger.info("pump.fun: seeded %d existing tokens", len(tokens))
    else:
        logger.warning("pump.fun: seed failed (endpoint may be blocked)")

    consecutive_empty = 0  # circuit breaker counter

    while True:
        await asyncio.sleep(PUMPFUN_INTERVAL)
        try:
            result = await _pump_cycle(session, send_fn)
            if result is False:
                # get_new_tokens returned empty — all endpoints failed
                consecutive_empty += 1
                if consecutive_empty >= _PUMP_MAX_FAILS:
                    logger.warning(
                        "pump.fun: %d consecutive failures — suspending for %ds. "
                        "Set PUMPFUN_INTERVAL_SEC env var to re-enable after endpoint recovers.",
                        consecutive_empty, _PUMP_SUSPEND_SEC,
                    )
                    await asyncio.sleep(_PUMP_SUSPEND_SEC)
                    consecutive_empty = 0
            else:
                consecutive_empty = 0
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("pump.fun cycle error: %s", e, exc_info=True)


async def _pump_cycle(session: aiohttp.ClientSession, send_fn: SendCallback) -> bool | None:
    """Returns False if all pump.fun endpoints failed (for circuit breaker)."""
    tokens = await get_new_tokens(session, limit=20)
    if not tokens:
        return False  # all endpoints returned empty — signal circuit breaker
    new_tokens = [t for t in tokens if pumpfun_is_new(t.get("mint", "")) and t.get("mint")]
    if not new_tokens:
        return None  # got data, just no new tokens — normal

    logger.info("pump.fun: %d new tokens", len(new_tokens))
    users = db.get_all_active_users_with_tier()
    pump_users = [u for u in users if u.get("auto_mode") or u.get("notify_all_tokens")]
    if not pump_users:
        return

    for token in new_tokens:
        mint = token.get("mint", "")
        pair_data = {
            "chain":         "solana",
            "token_address": mint,
            "token_name":    token.get("name", "?"),
            "token_symbol":  token.get("symbol", "?"),
        }
        for user in pump_users:
            lang = user["lang"] or "ua"
            msg  = format_token_message(token, lang)
            try:
                await send_fn(user["telegram_id"], msg, pair_data, None)
            except Exception as e:
                logger.warning("pump.fun send error %d: %s", user["telegram_id"], e)
