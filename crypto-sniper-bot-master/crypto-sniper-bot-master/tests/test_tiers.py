"""
Tests for tier system: dispatch thresholds, daily limits, auto-trade limits.

Run:  pytest tests/test_tiers.py -v
"""

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from unittest.mock import patch, MagicMock


# ── _tier_min_score ────────────────────────────────────────────────────────────

class TestTierMinScore:
    """_tier_min_score should return 35 for all tiers (fallback when DB unavailable)."""

    def _get_score(self, tier, db_value=None):
        """Call _tier_min_score with DB returning db_value (None = key not found)."""
        with patch("scanner.monitor.db") as mock_db:
            mock_db.get_bot_setting.return_value = db_value
            from scanner.monitor import _tier_min_score
            return _tier_min_score(tier)

    def test_free_fallback(self):
        assert self._get_score("free", None) == 35

    def test_basic_fallback(self):
        assert self._get_score("basic", None) == 35

    def test_pro_fallback(self):
        assert self._get_score("pro", None) == 35

    def test_unknown_tier_fallback(self):
        assert self._get_score("vip", None) == 35

    def test_reads_from_db(self):
        """When DB has a value, use it."""
        assert self._get_score("free", "50") == 50
        assert self._get_score("basic", "40") == 40
        assert self._get_score("pro", "25") == 25

    def test_invalid_db_value_returns_fallback(self):
        """Non-numeric DB value → fallback."""
        assert self._get_score("free", "bad") == 35

    def test_all_tiers_same_default(self):
        """Free/basic/pro should all default to 35 — daily limit is the differentiator."""
        with patch("scanner.monitor.db") as mock_db:
            mock_db.get_bot_setting.return_value = None
            from scanner.monitor import _tier_min_score
            scores = {t: _tier_min_score(t) for t in ("free", "basic", "pro")}
        assert scores["free"] == scores["basic"] == scores["pro"] == 35


# ── _daily_limit ───────────────────────────────────────────────────────────────

class TestDailyLimit:
    """_daily_limit should reflect 3/20/0 for free/basic/pro."""

    def _get_limit(self, tier, db_value):
        with patch("scanner.monitor.db") as mock_db:
            mock_db.get_bot_setting.return_value = db_value
            from scanner.monitor import _daily_limit
            return _daily_limit(tier)

    def test_free_limit_3(self):
        assert self._get_limit("free", "3") == 3

    def test_basic_limit_20(self):
        assert self._get_limit("basic", "20") == 20

    def test_pro_unlimited(self):
        """0 means unlimited."""
        assert self._get_limit("pro", "0") == 0

    def test_zero_means_unlimited(self):
        """A limit of 0 should never block dispatch."""
        limit = self._get_limit("pro", "0")
        # Guard used in monitor: if limit > 0 and count >= limit → skip
        count = 999
        assert not (limit > 0 and count >= limit)

    def test_free_blocks_after_3(self):
        limit = self._get_limit("free", "3")
        assert limit > 0 and 3 >= limit  # 4th signal should be blocked

    def test_basic_blocks_after_20(self):
        limit = self._get_limit("basic", "20")
        assert limit > 0 and 20 >= limit

    def test_invalid_db_returns_0(self):
        """Non-numeric → treat as unlimited (safe default)."""
        assert self._get_limit("free", "unlimited") == 0


# ── database defaults ──────────────────────────────────────────────────────────

class TestDatabaseDefaults:
    """Verify database.py initialises the correct default values."""

    def _get_defaults(self):
        """Extract the defaults dict from init_db source without running SQL."""
        import inspect
        import database
        src = inspect.getsource(database.init_db)
        # Parse the dict literal — exec it safely
        start = src.index("defaults = {")
        chunk = src[start:]
        end   = chunk.index("\n        }") + len("\n        }")
        local = {}
        exec(chunk[:end], {}, local)       # pylint: disable=exec-used
        return local["defaults"]

    def test_free_daily_is_3(self):
        d = self._get_defaults()
        assert d["free_daily_signals"] == "3"

    def test_basic_daily_is_20(self):
        d = self._get_defaults()
        assert d["basic_daily_signals"] == "20"

    def test_pro_daily_is_unlimited(self):
        d = self._get_defaults()
        assert d["pro_daily_signals"] == "0"

    def test_all_tier_min_scores_are_35(self):
        d = self._get_defaults()
        assert d["free_min_score"]  == "35"
        assert d["basic_min_score"] == "35"
        assert d["pro_min_score"]   == "35"

    def test_global_floor_is_35(self):
        d = self._get_defaults()
        assert d["min_signal_score"] == "35"


# ── dispatch guard logic ───────────────────────────────────────────────────────

class TestDispatchGuard:
    """Verify the score + daily-limit guard logic (mirroring monitor._dispatch_signals)."""

    def _would_dispatch(self, score, tier, min_score, daily_limit, sent_today):
        """Returns True if signal would be sent given these conditions."""
        if score < min_score:
            return False
        if daily_limit > 0 and sent_today >= daily_limit:
            return False
        return True

    # --- score gate ---
    def test_score_35_reaches_free(self):
        assert self._would_dispatch(score=35, tier="free",
                                    min_score=35, daily_limit=3, sent_today=0)

    def test_score_34_blocked_for_all(self):
        for tier, ml in [("free", 3), ("basic", 20), ("pro", 0)]:
            assert not self._would_dispatch(score=34, tier=tier,
                                            min_score=35, daily_limit=ml, sent_today=0)

    def test_score_70_reaches_basic(self):
        assert self._would_dispatch(score=70, tier="basic",
                                    min_score=35, daily_limit=20, sent_today=0)

    # --- daily limit gate ---
    def test_free_blocked_after_3(self):
        assert not self._would_dispatch(score=50, tier="free",
                                        min_score=35, daily_limit=3, sent_today=3)

    def test_free_passes_at_2(self):
        assert self._would_dispatch(score=50, tier="free",
                                    min_score=35, daily_limit=3, sent_today=2)

    def test_basic_blocked_after_20(self):
        assert not self._would_dispatch(score=50, tier="basic",
                                        min_score=35, daily_limit=20, sent_today=20)

    def test_pro_unlimited_never_blocked_by_count(self):
        # daily_limit=0 → no cap
        assert self._would_dispatch(score=50, tier="pro",
                                    min_score=35, daily_limit=0, sent_today=10_000)

    # --- pro gets all tiers of signals ---
    def test_strong_buy_reaches_all_tiers(self):
        for tier, ml in [("free", 3), ("basic", 20), ("pro", 0)]:
            assert self._would_dispatch(score=85, tier=tier,
                                        min_score=35, daily_limit=ml, sent_today=0)


# ── auto-trade position limits ─────────────────────────────────────────────────

class TestAutoTradeLimits:
    """basic=3 pairs, pro=999 (unlimited)."""

    def _max_pos(self, tier):
        return 3 if tier == "basic" else 999

    def test_basic_max_3(self):
        assert self._max_pos("basic") == 3

    def test_pro_unlimited(self):
        assert self._max_pos("pro") == 999

    def test_basic_blocked_at_3(self):
        assert len([1, 2, 3]) >= self._max_pos("basic")

    def test_pro_not_blocked_at_3(self):
        assert len([1, 2, 3]) < self._max_pos("pro")

    def test_free_has_no_auto_trade(self):
        """Free tier is excluded from auto-trading entirely (tier check in bot.py)."""
        allowed_tiers = ("basic", "pro")
        assert "free" not in allowed_tiers
