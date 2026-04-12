"""
Unit tests for scanner/signals.py — score_token and format_signal_message.

Run:  pytest tests/test_signals.py -v
"""

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import time
import pytest
from scanner.signals import score_token, format_signal_message, SIGNAL_STRONG_BUY, SIGNAL_BUY, SIGNAL_WATCH, SIGNAL_SKIP


# ── Helpers ────────────────────────────────────────────────────────────────────

def _pair(chain="solana", liq=50_000, vol_1h=30_000, chg_1h=15.0,
          chg_6h=5.0, buys=70, sells=30, mcap=0, created_offset_h=2):
    """Build a minimal pair_data dict."""
    created_ms = int((time.time() - created_offset_h * 3600) * 1000)
    return {
        "chain":          chain,
        "liquidity_usd":  liq,
        "volume_1h":      vol_1h,
        "price_change_1h": chg_1h,
        "price_change_6h": chg_6h,
        "txns_1h_buys":   buys,
        "txns_1h_sells":  sells,
        "market_cap":     mcap,
        "pair_created_at": created_ms,
        "token_name":     "TestToken",
        "token_symbol":   "TEST",
        "token_address":  "So11111111111111111111111111111111111111112",
        "price_usd":      0.001,
        "dex":            "raydium",
        "pair_url":       "https://dexscreener.com/solana/test",
    }


def _safety(chain="solana", lp_locked=True, lp_locked_pct=95.0,
            rugcheck_score=850, mint_auth=False, freeze_auth=False,
            top10=18.0, holders=1200, is_honeypot=False,
            is_open_source=True, sell_tax=2.0, buy_tax=2.0):
    return {
        "lp_locked":          lp_locked,
        "lp_locked_pct":      lp_locked_pct,
        "liq_locked":         lp_locked,
        "liq_locked_pct":     lp_locked_pct,
        "rugcheck_score":     rugcheck_score,
        "mint_authority":     mint_auth,
        "freeze_authority":   freeze_auth,
        "top10_holders_pct":  top10,
        "holders":            holders,
        "is_honeypot":        is_honeypot,
        "is_open_source":     is_open_source,
        "sell_tax":           sell_tax,
        "buy_tax":            buy_tax,
        "contract_renounced": not mint_auth and not freeze_auth,
        "risks":              [],
    }


# ── Hard-block tests ───────────────────────────────────────────────────────────

def test_block_honeypot_bsc():
    result = score_token(_pair(chain="bsc"), _safety(chain="bsc", is_honeypot=True))
    assert result["blocked"] is True
    assert "HONEYPOT" in result["block_reason"]
    assert result["score"] == 0


def test_block_mint_authority_solana():
    result = score_token(_pair(chain="solana"), _safety(mint_auth=True))
    assert result["blocked"] is True
    assert "MINT" in result["block_reason"]


def test_block_freeze_authority_solana():
    result = score_token(_pair(chain="solana"), _safety(freeze_auth=True))
    assert result["blocked"] is True
    assert "FREEZE" in result["block_reason"]


def test_block_low_liquidity():
    result = score_token(_pair(liq=4_000), _safety())
    assert result["blocked"] is True
    assert "Liquidity" in result["block_reason"]


# ── Regression: lp_locked_pct=0.0 used to give +20 pts (falsy bug) ────────────

def test_lp_locked_pct_zero_gives_no_points():
    """lp_locked=True but lp_locked_pct=0.0 must NOT award points."""
    s = _safety(lp_locked=True, lp_locked_pct=0.0, rugcheck_score=900,
                top10=15.0, holders=2000)
    base = score_token(_pair(), s)

    s_with_lock = _safety(lp_locked=True, lp_locked_pct=95.0, rugcheck_score=900,
                          top10=15.0, holders=2000)
    with_lock = score_token(_pair(), s_with_lock)

    assert base["score"] < with_lock["score"], (
        f"0% lock should score lower than 95% lock: {base['score']} vs {with_lock['score']}"
    )


def test_lp_locked_pct_none_gives_no_points():
    """lp_locked_pct=None should not crash and not give LP points."""
    s = _safety(lp_locked=True, lp_locked_pct=None)
    result = score_token(_pair(), s)
    assert result["blocked"] is False  # no crash


# ── has_data=False: API unavailable should not penalize ───────────────────────

def test_rugcheck_no_data_no_penalty():
    """When rugcheck API is down (has_data=False), score should NOT get -5 penalty."""
    s_no_data = dict(_safety(rugcheck_score=0), has_data=False)
    s_bad_score = dict(_safety(rugcheck_score=0), has_data=True)
    result_no_data  = score_token(_pair(), s_no_data)
    result_bad      = score_token(_pair(), s_bad_score)
    # no-data should score HIGHER than confirmed bad score
    assert result_no_data["score"] >= result_bad["score"]


def test_bsc_no_tax_data_no_bonus():
    """When honeypot.is is down (sell_tax=None, buy_tax=None), no +10 tax bonus."""
    pair = _pair(chain="bsc", liq=10_000)
    s_no_data = dict(_safety(chain="bsc"), sell_tax=None, buy_tax=None, has_data=False)
    s_low_tax = dict(_safety(chain="bsc"), sell_tax=2.0, buy_tax=2.0, has_data=True)
    r_no_data = score_token(pair, s_no_data)
    r_low_tax = score_token(pair, s_low_tax)
    # confirmed low tax should score higher than unknown tax
    assert r_low_tax["score"] > r_no_data["score"]


def test_bsc_no_data_risk_flag():
    """When safety check unavailable, risk flag should be added."""
    pair = _pair(chain="bsc", liq=10_000)
    s_no_data = dict(_safety(chain="bsc"), sell_tax=None, buy_tax=None, has_data=False)
    result = score_token(pair, s_no_data)
    assert any("unavailable" in r.lower() or "safety" in r.lower() for r in result["risks"])


# ── Scoring tier tests ─────────────────────────────────────────────────────────

def test_strong_buy_high_quality():
    pair   = _pair(liq=200_000, vol_1h=250_000, chg_1h=25.0, chg_6h=10.0,
                   buys=80, sells=20, created_offset_h=0.5)
    safety = _safety(lp_locked_pct=95.0, rugcheck_score=900, top10=12.0, holders=2000)
    result = score_token(pair, safety)
    assert result["signal_type"] == SIGNAL_STRONG_BUY, f"score={result['score']}"


def test_skip_low_score():
    pair   = _pair(liq=6_000, vol_1h=100, chg_1h=-20.0, chg_6h=-30.0,
                   buys=20, sells=80, created_offset_h=40)
    safety = _safety(lp_locked=False, lp_locked_pct=0.0, rugcheck_score=100,
                     top10=85.0, holders=10)
    result = score_token(pair, safety)
    assert result["signal_type"] == SIGNAL_SKIP, f"score={result['score']}"


def test_score_clamped_0_100():
    pair   = _pair(liq=500_000, vol_1h=2_000_000, chg_1h=50.0, buys=99, sells=1,
                   created_offset_h=0.1)
    safety = _safety(rugcheck_score=1000, lp_locked_pct=100.0, top10=5.0, holders=10000)
    result = score_token(pair, safety)
    assert 0 <= result["score"] <= 100


# ── Momentum edge cases ────────────────────────────────────────────────────────

def test_extreme_pump_capped():
    """Pump >200% should give only +3 and add a risk, not +12."""
    pair_extreme = _pair(chg_1h=350.0)
    pair_normal  = _pair(chg_1h=50.0)
    safety = _safety()
    r_extreme = score_token(pair_extreme, safety)
    r_normal  = score_token(pair_normal,  safety)
    assert r_extreme["score"] < r_normal["score"], (
        "Extreme pump should score lower than normal pump"
    )
    assert any("pump" in r.lower() or "manipulation" in r.lower()
               for r in r_extreme["risks"])


def test_dead_cat_bounce_penalised():
    """1h pump +30% with 6h -40% should score lower than genuine pump."""
    genuine     = _pair(chg_1h=30.0, chg_6h=15.0)
    dead_cat    = _pair(chg_1h=30.0, chg_6h=-40.0)
    safety = _safety()
    assert score_token(genuine, safety)["score"] > score_token(dead_cat, safety)["score"]


def test_price_drop_penalised():
    pair = _pair(chg_1h=-20.0)
    result = score_token(pair, _safety())
    assert any("drop" in r.lower() or "%" in r for r in result["risks"])


# ── Token age bonus ────────────────────────────────────────────────────────────

def test_fresh_token_bonus():
    fresh = _pair(created_offset_h=0.3)
    old   = _pair(created_offset_h=50.0)
    safety = _safety()
    assert score_token(fresh, safety)["score"] > score_token(old, safety)["score"]


def test_old_token_malus():
    old = _pair(created_offset_h=50.0)
    result = score_token(old, _safety())
    assert any("age" in r.lower() or "window" in r.lower() for r in result["risks"])


# ── BSC-specific ───────────────────────────────────────────────────────────────

def test_bsc_honeypot_not_blocked_without_flag():
    pair   = _pair(chain="bsc", liq=10_000)
    safety = _safety(chain="bsc", is_honeypot=False, is_open_source=True,
                     sell_tax=3.0, buy_tax=3.0, lp_locked_pct=90.0)
    result = score_token(pair, safety)
    assert result["blocked"] is False


def test_bsc_high_sell_tax_risk():
    pair   = _pair(chain="bsc", liq=10_000)
    safety = _safety(chain="bsc", is_honeypot=False, sell_tax=25.0)
    result = score_token(pair, safety)
    assert any("tax" in r.lower() for r in result["risks"])


# ── format_signal_message smoke test ──────────────────────────────────────────

def test_format_signal_message_no_crash():
    pair = _pair()
    signal_result = score_token(pair, _safety())
    msg = format_signal_message(pair, signal_result, lang="ua")
    assert isinstance(msg, str)
    assert len(msg) > 50
    assert "TEST" in msg or "Score" in msg


def test_format_signal_message_contains_contract():
    pair = _pair()
    signal_result = score_token(pair, _safety())
    msg = format_signal_message(pair, signal_result, lang="en")
    assert pair["token_address"] in msg


def test_format_signal_dexscreener_link():
    pair = _pair()
    result = score_token(pair, _safety())
    msg = format_signal_message(pair, result, lang="ua")
    assert "DexScreener" in msg


def test_format_signal_geckoterminal_link():
    pair = dict(_pair(), pair_url="https://www.geckoterminal.com/solana/pools/test")
    result = score_token(pair, _safety())
    msg = format_signal_message(pair, result, lang="ua")
    assert "GeckoTerminal" in msg
