"""
Tests for bot.py pure functions and core logic (no real Telegram connection needed).

Covers:
  - _rate_limited
  - _buy_keyboard
  - _plans_keyboard
  - _check_banned
  - _maybe_auto_buy guards (tier, score, max_pos, wallet)
  - _evaluate_position (SL / TP trigger logic)

Run:  pytest tests/test_bot_logic.py -v
"""

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import time
import asyncio
import pytest
from unittest.mock import patch, MagicMock, AsyncMock


# ── Helpers ────────────────────────────────────────────────────────────────────

def run(coro):
    """Run an async coroutine from sync test code (Python 3.10+ safe)."""
    return asyncio.run(coro)


# ── _rate_limited ──────────────────────────────────────────────────────────────

class TestRateLimited:

    def setup_method(self):
        """Clear rate tracker before each test."""
        import bot
        bot._rate_tracker.clear()

    def test_first_request_not_limited(self):
        import bot
        assert not bot._rate_limited(1001)

    def test_within_limit_not_blocked(self):
        import bot
        for _ in range(9):
            assert not bot._rate_limited(1002)

    def test_exceeds_limit_blocked(self):
        import bot
        for _ in range(10):
            bot._rate_limited(1003)
        assert bot._rate_limited(1003)

    def test_different_users_independent(self):
        import bot
        for _ in range(10):
            bot._rate_limited(1004)
        # User 1005 is independent
        assert not bot._rate_limited(1005)

    def test_expired_requests_dont_count(self):
        import bot
        # Fill up with old timestamps (61 seconds ago)
        past = time.time() - 61
        bot._rate_tracker[1006] = [past] * 10
        # Should NOT be limited — old requests expired
        assert not bot._rate_limited(1006)

    def test_custom_limit(self):
        import bot
        for _ in range(3):
            bot._rate_limited(1007, limit=3)
        assert bot._rate_limited(1007, limit=3)


# ── _buy_keyboard ──────────────────────────────────────────────────────────────

class TestBuyKeyboard:

    def test_solana_returns_keyboard(self):
        import bot
        kb = bot._buy_keyboard("solana", "SOL_ADDR_123")
        assert kb is not None

    def test_bsc_returns_keyboard(self):
        import bot
        kb = bot._buy_keyboard("bsc", "0xABCDEF1234567890")
        assert kb is not None

    def test_empty_address_returns_none(self):
        import bot
        assert bot._buy_keyboard("solana", "") is None

    def test_solana_has_sol_amounts(self):
        import bot
        kb = bot._buy_keyboard("solana", "ADDR")
        buttons_text = [btn.text for row in kb.inline_keyboard for btn in row]
        assert any("SOL" in t for t in buttons_text)

    def test_bsc_has_bnb_amounts(self):
        import bot
        kb = bot._buy_keyboard("bsc", "0xADDR")
        buttons_text = [btn.text for row in kb.inline_keyboard for btn in row]
        assert any("BNB" in t for t in buttons_text)

    def test_solana_has_3_buy_buttons(self):
        import bot
        kb = bot._buy_keyboard("solana", "ADDR")
        buy_buttons = [btn for row in kb.inline_keyboard for btn in row
                       if btn.callback_data and btn.callback_data.startswith("buy:")]
        assert len(buy_buttons) == 3

    def test_bsc_has_3_buy_buttons(self):
        import bot
        kb = bot._buy_keyboard("bsc", "0xADDR")
        buy_buttons = [btn for row in kb.inline_keyboard for btn in row
                       if btn.callback_data and btn.callback_data.startswith("buy:")]
        assert len(buy_buttons) == 3

    def test_callback_data_format(self):
        import bot
        kb = bot._buy_keyboard("solana", "MY_TOKEN")
        cbs = [btn.callback_data for row in kb.inline_keyboard for btn in row
               if btn.callback_data and btn.callback_data.startswith("buy:")]
        # Format: buy:chain:token_address:amount
        for cb in cbs:
            parts = cb.split(":")
            assert len(parts) == 4
            assert parts[1] == "solana"
            assert parts[2] == "MY_TOKEN"

    def test_skip_button_present(self):
        import bot
        kb = bot._buy_keyboard("solana", "ADDR")
        skip = [btn for row in kb.inline_keyboard for btn in row
                if btn.callback_data == "skip"]
        assert len(skip) == 1


# ── _plans_keyboard ────────────────────────────────────────────────────────────

class TestPlansKeyboard:

    def _kb(self, tier):
        import bot
        with patch("bot.db") as mock_db:
            mock_db.get_bot_setting.return_value = "29"
            return bot._plans_keyboard("ua", tier)

    def test_free_user_sees_basic_and_pro(self):
        kb = self._kb("free")
        cbs = [btn.callback_data for row in kb.inline_keyboard for btn in row]
        assert any("basic" in c for c in cbs)
        assert any("pro" in c for c in cbs)

    def test_basic_user_sees_pro_not_basic(self):
        kb = self._kb("basic")
        cbs = [btn.callback_data for row in kb.inline_keyboard for btn in row]
        assert any("pro" in c for c in cbs)
        assert not any("plans_buy:basic" in c for c in cbs)

    def test_pro_user_sees_no_pro_button(self):
        """Pro user cannot buy Pro (already on it), but can switch to Basic."""
        kb = self._kb("pro")
        cbs = [btn.callback_data for row in kb.inline_keyboard for btn in row]
        assert "plans_buy:pro" not in cbs   # already pro
        assert "plans_buy:basic" in cbs     # can downgrade

    def test_basic_user_sees_payment_history(self):
        kb = self._kb("basic")
        cbs = [btn.callback_data for row in kb.inline_keyboard for btn in row]
        assert any("history" in c for c in cbs)

    def test_pro_user_sees_payment_history(self):
        kb = self._kb("pro")
        cbs = [btn.callback_data for row in kb.inline_keyboard for btn in row]
        assert any("history" in c for c in cbs)

    def test_free_user_no_payment_history(self):
        kb = self._kb("free")
        cbs = [btn.callback_data for row in kb.inline_keyboard for btn in row]
        assert not any("history" in c for c in cbs)


# ── _check_banned ──────────────────────────────────────────────────────────────

class TestCheckBanned:

    def test_not_banned(self):
        import bot
        with patch("bot.db") as mock_db:
            mock_db.is_banned.return_value = False
            assert not bot._check_banned(123)

    def test_banned(self):
        import bot
        with patch("bot.db") as mock_db:
            mock_db.is_banned.return_value = True
            assert bot._check_banned(123)


# ── _maybe_auto_buy guards ─────────────────────────────────────────────────────

def _make_signal_meta(**overrides):
    base = {
        "user_id": 1,
        "lang": "ua",
        "user_tier": "basic",
        "score": 85,
        "price_usd": 0.001,
        "signal_id": 1,
        "user_settings": {
            "auto_mode": 1,
            "auto_min_score": 80,
            "auto_max_buy_sol": 0.1,
            "auto_max_buy_bnb": 0.01,
            "auto_stop_loss": 20,
            "auto_take_profit": 0,
        },
    }
    base.update(overrides)
    return base


def _make_pair_data(**overrides):
    base = {"chain": "solana", "token_address": "TOKEN_ADDR",
            "token_symbol": "TKN", "token_name": "Token"}
    base.update(overrides)
    return base


class TestMaybeAutoBuy:
    """_maybe_auto_buy early-exit guards (crypto-sniper-bot-master version).

    Guard order in the actual code:
      1. can_trade() — ENCRYPTION_KEY must be set
      2. user_id and token_addr must be present; chain in (solana, bsc)
      3. score >= user's auto_min_score
      4. db.has_open_position — no duplicate
      5. db.count_open_positions < _MAX_OPEN_POSITIONS (5)
      6. wallet + pk
      7. balance
    """

    def test_no_user_id_skipped(self):
        """Missing user_id → exits at guard 2, no DB calls."""
        import bot
        meta = _make_signal_meta(user_id=None)
        with patch("bot.can_trade", return_value=True), patch("bot.db") as mock_db:
            run(bot._maybe_auto_buy(123, _make_pair_data(), meta))
            mock_db.has_open_position.assert_not_called()

    def test_missing_chain_skipped(self):
        """chain not in (solana, bsc) → exits at guard 2."""
        import bot
        meta = _make_signal_meta()
        with patch("bot.can_trade", return_value=True), patch("bot.db") as mock_db:
            run(bot._maybe_auto_buy(123, _make_pair_data(chain="eth"), meta))
            mock_db.has_open_position.assert_not_called()

    def test_score_below_threshold_skipped(self):
        """score < auto_min_score → exits at guard 3."""
        import bot
        meta = _make_signal_meta(score=50)
        meta["user_settings"]["auto_min_score"] = 80
        with patch("bot.can_trade", return_value=True), patch("bot.db") as mock_db:
            run(bot._maybe_auto_buy(123, _make_pair_data(), meta))
            mock_db.has_open_position.assert_not_called()

    def test_duplicate_position_skipped(self):
        """has_open_position=True → exits at guard 4."""
        import bot
        meta = _make_signal_meta(score=90)
        with patch("bot.can_trade", return_value=True), patch("bot.db") as mock_db:
            mock_db.has_open_position.return_value = True
            run(bot._maybe_auto_buy(123, _make_pair_data(), meta))
            mock_db.count_open_positions.assert_not_called()

    def test_max_positions_reached(self):
        """count_open_positions >= 5 → exits at guard 5, notifies user."""
        import bot
        meta = _make_signal_meta(score=90)
        mock_app = AsyncMock()
        bot._app = mock_app
        with patch("bot.can_trade", return_value=True), patch("bot.db") as mock_db:
            mock_db.has_open_position.return_value = False
            mock_db.count_open_positions.return_value = 5  # at cap
            run(bot._maybe_auto_buy(123, _make_pair_data(), meta))
            mock_db.get_wallet.assert_not_called()

    def test_no_wallet_skipped(self):
        """get_wallet returns None → exits at guard 6."""
        import bot
        meta = _make_signal_meta(score=90)
        bot._app = AsyncMock()
        with patch("bot.can_trade", return_value=True), patch("bot.db") as mock_db:
            mock_db.has_open_position.return_value = False
            mock_db.count_open_positions.return_value = 0
            mock_db.get_wallet.return_value = None
            run(bot._maybe_auto_buy(123, _make_pair_data(), meta))

    def test_wallet_no_pk_skipped(self):
        """wallet exists but no encrypted_pk → exits at guard 6."""
        import bot
        meta = _make_signal_meta(score=90)
        bot._app = AsyncMock()
        with patch("bot.can_trade", return_value=True), patch("bot.db") as mock_db:
            mock_db.has_open_position.return_value = False
            mock_db.count_open_positions.return_value = 0
            mock_db.get_wallet.return_value = MagicMock(encrypted_pk=None)
            run(bot._maybe_auto_buy(123, _make_pair_data(), meta))

    def test_can_trade_false_exits_immediately(self):
        """ENCRYPTION_KEY not set → exits at guard 1, no DB calls."""
        import bot
        meta = _make_signal_meta(score=90)
        with patch("bot.can_trade", return_value=False), patch("bot.db") as mock_db:
            run(bot._maybe_auto_buy(123, _make_pair_data(), meta))
            mock_db.has_open_position.assert_not_called()


# ── _evaluate_single_position (SL / TP logic) ────────────────────────────────

def _make_pos(**overrides):
    """Build a minimal position row dict matching get_all_open_positions_with_users."""
    base = {
        "position_id": 1, "user_id": 1, "chain": "solana",
        "token_address": "ADDR", "token_symbol": "TKN", "token_name": "Token",
        "buy_price_usd": 1.0, "amount": 0.5,
        "stop_loss_pct": 20, "auto_take_profit": 50,
        "encrypted_pk": None, "wallet_address": None,
        "telegram_id": 123456, "lang": "ua",
    }
    base.update(overrides)
    return base


class TestEvaluateSinglePosition:
    """
    Tests _evaluate_single_position pure PnL logic.
    We pass current_price directly so no HTTP calls are made.
    SL/TP detection happens in the function; _auto_sell_position is mocked.
    """

    def test_no_trigger_within_range(self):
        import bot
        with patch("bot._auto_sell_position", new_callable=AsyncMock) as mock_sell, \
             patch("scanner.price_cache.get_cached_price", return_value=None), \
             patch("scanner.price_cache.set_cached_price"):
            pos = _make_pos(buy_price_usd=1.0, stop_loss_pct=20, auto_take_profit=50)
            run(bot._evaluate_single_position(None, pos, current_price=1.1))
            mock_sell.assert_not_called()

    def test_stop_loss_triggers(self):
        import bot
        with patch("bot._auto_sell_position", new_callable=AsyncMock) as mock_sell, \
             patch("scanner.price_cache.get_cached_price", return_value=None), \
             patch("scanner.price_cache.set_cached_price"):
            pos = _make_pos(buy_price_usd=1.0, stop_loss_pct=20, auto_take_profit=0)
            # price = 0.75 → -25%, exceeds SL of 20%
            run(bot._evaluate_single_position(None, pos, current_price=0.75))
            mock_sell.assert_called_once()
            reason = mock_sell.call_args[0][4]
            assert "stop_loss" in reason

    def test_take_profit_triggers(self):
        import bot
        with patch("bot._auto_sell_position", new_callable=AsyncMock) as mock_sell, \
             patch("scanner.price_cache.get_cached_price", return_value=None), \
             patch("scanner.price_cache.set_cached_price"):
            pos = _make_pos(buy_price_usd=1.0, stop_loss_pct=200, auto_take_profit=50)
            # price = 1.6 → +60%, exceeds TP of 50%
            run(bot._evaluate_single_position(None, pos, current_price=1.6))
            mock_sell.assert_called_once()
            reason = mock_sell.call_args[0][4]
            assert "take_profit" in reason

    def test_price_zero_skipped(self):
        import bot
        with patch("bot._auto_sell_position", new_callable=AsyncMock) as mock_sell, \
             patch("scanner.price_cache.get_cached_price", return_value=None):
            pos = _make_pos(buy_price_usd=1.0)
            run(bot._evaluate_single_position(None, pos, current_price=0.0))
            mock_sell.assert_not_called()

    def test_buy_price_zero_skipped(self):
        import bot
        with patch("bot._auto_sell_position", new_callable=AsyncMock) as mock_sell, \
             patch("scanner.price_cache.get_cached_price", return_value=None):
            pos = _make_pos(buy_price_usd=0.0)
            run(bot._evaluate_single_position(None, pos, current_price=1.0))
            mock_sell.assert_not_called()

    def test_no_tp_set_never_triggers_tp(self):
        import bot
        with patch("bot._auto_sell_position", new_callable=AsyncMock) as mock_sell, \
             patch("scanner.price_cache.get_cached_price", return_value=None), \
             patch("scanner.price_cache.set_cached_price"):
            pos = _make_pos(buy_price_usd=1.0, stop_loss_pct=200, auto_take_profit=0)
            # price = 5.0 → +400%, but TP is 0 (disabled)
            run(bot._evaluate_single_position(None, pos, current_price=5.0))
            mock_sell.assert_not_called()

    def test_at_sl_boundary_triggers(self):
        """Price 21% below entry (clearly past 20% SL) triggers stop-loss."""
        import bot
        with patch("bot._auto_sell_position", new_callable=AsyncMock) as mock_sell, \
             patch("scanner.price_cache.get_cached_price", return_value=None), \
             patch("scanner.price_cache.set_cached_price"):
            pos = _make_pos(buy_price_usd=1.0, stop_loss_pct=20, auto_take_profit=0)
            # 0.79 → -21%, clearly beyond -20% SL (avoids float rounding edge)
            run(bot._evaluate_single_position(None, pos, current_price=0.79))
            mock_sell.assert_called_once()

    def test_sl_before_tp(self):
        """Price below entry should trigger SL, not TP."""
        import bot
        with patch("bot._auto_sell_position", new_callable=AsyncMock) as mock_sell, \
             patch("scanner.price_cache.get_cached_price", return_value=None), \
             patch("scanner.price_cache.set_cached_price"):
            pos = _make_pos(buy_price_usd=1.0, stop_loss_pct=20, auto_take_profit=50)
            run(bot._evaluate_single_position(None, pos, current_price=0.70))
            mock_sell.assert_called_once()
            reason = mock_sell.call_args[0][4]
            assert "stop_loss" in reason


# ── Tier gate: free users can't auto-trade ────────────────────────────────────

class TestAutoTierGate:
    """Free users cannot use auto-trading (blocked in cb_auto, not in _maybe_auto_buy)."""

    def test_free_user_blocked_before_open_positions(self):
        """_maybe_auto_buy in this version: no tier check, but can_trade() is the first gate.
        Free users are blocked by cb_auto before _maybe_auto_buy is ever called."""
        import bot
        meta = _make_signal_meta(score=90)
        # can_trade() fails (ENCRYPTION_KEY not set in test env)
        with patch("bot.can_trade", return_value=False), patch("bot.db") as mock_db:
            run(bot._maybe_auto_buy(123, _make_pair_data(), meta))
            mock_db.has_open_position.assert_not_called()

    def test_basic_passes_score_check(self):
        """Score above threshold reaches the position check."""
        import bot
        meta = _make_signal_meta(score=90)
        meta["user_settings"]["auto_min_score"] = 80
        with patch("bot.can_trade", return_value=True), patch("bot.db") as mock_db:
            mock_db.has_open_position.return_value = True  # exits at guard 4
            run(bot._maybe_auto_buy(123, _make_pair_data(), meta))
            mock_db.has_open_position.assert_called_once()

    def test_score_too_low_never_reaches_db(self):
        """Score below threshold: has_open_position never queried."""
        import bot
        meta = _make_signal_meta(score=40)
        meta["user_settings"]["auto_min_score"] = 80
        with patch("bot.can_trade", return_value=True), patch("bot.db") as mock_db:
            run(bot._maybe_auto_buy(123, _make_pair_data(), meta))
            mock_db.has_open_position.assert_not_called()
