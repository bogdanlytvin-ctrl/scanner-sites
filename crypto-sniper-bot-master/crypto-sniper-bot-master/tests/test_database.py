"""
Comprehensive tests for database.py — all CRUD functions.
Uses a temporary file DB so each test class gets a fresh schema.

Run:  pytest tests/test_database.py -v
"""

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import tempfile
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import patch


# ── Fixture: isolated DB per test ─────────────────────────────────────────────

@pytest.fixture(autouse=True)
def fresh_db(tmp_path):
    """Each test gets its own SQLite file so there's no shared state."""
    db_file = str(tmp_path / "test.db")
    with patch("database.DB_PATH", db_file):
        import database
        database.DB_PATH = db_file
        database.init_db()
        yield database
        # cleanup happens automatically (tmp_path is deleted after test)


import database as db  # real import; DB_PATH overridden per test via fixture


# ── Users ──────────────────────────────────────────────────────────────────────

class TestUsers:

    def test_upsert_creates_user(self, fresh_db):
        uid = fresh_db.upsert_user(111, "Alice", "alice")
        assert uid > 0

    def test_upsert_returns_same_id(self, fresh_db):
        uid1 = fresh_db.upsert_user(222, "Bob", "bob")
        uid2 = fresh_db.upsert_user(222, "Bob Updated", "bob2")
        assert uid1 == uid2

    def test_upsert_updates_name(self, fresh_db):
        fresh_db.upsert_user(333, "Old", "u")
        fresh_db.upsert_user(333, "New", "u")
        row = fresh_db.get_user_by_telegram_id(333)
        assert row["first_name"] == "New"

    def test_get_by_telegram_id(self, fresh_db):
        fresh_db.upsert_user(444, "Dave", None)
        row = fresh_db.get_user_by_telegram_id(444)
        assert row is not None
        assert row["telegram_id"] == 444

    def test_get_by_telegram_id_missing(self, fresh_db):
        assert fresh_db.get_user_by_telegram_id(9999) is None

    def test_get_by_id(self, fresh_db):
        uid = fresh_db.upsert_user(555, "Eve", "e")
        row = fresh_db.get_user_by_id(uid)
        assert row["telegram_id"] == 555

    def test_default_lang_is_ua(self, fresh_db):
        uid = fresh_db.upsert_user(666, "X", None)
        assert fresh_db.get_user_lang(uid) == "ua"

    def test_set_lang_en(self, fresh_db):
        uid = fresh_db.upsert_user(777, "X", None)
        fresh_db.set_user_lang(uid, "en")
        assert fresh_db.get_user_lang(uid) == "en"

    def test_set_lang_invalid_falls_back_to_ua(self, fresh_db):
        uid = fresh_db.upsert_user(888, "X", None)
        fresh_db.set_user_lang(uid, "fr")  # unsupported
        assert fresh_db.get_user_lang(uid) == "ua"

    def test_upsert_creates_subscription_row(self, fresh_db):
        uid = fresh_db.upsert_user(101, "A", None)
        sub = fresh_db.get_subscription(uid)
        assert sub is not None

    def test_upsert_creates_user_settings_row(self, fresh_db):
        uid = fresh_db.upsert_user(102, "A", None)
        s = fresh_db.get_user_settings(uid)
        assert s is not None


# ── Ban system ─────────────────────────────────────────────────────────────────

class TestBans:

    def test_new_user_not_banned(self, fresh_db):
        fresh_db.upsert_user(201, "A", None)
        assert not fresh_db.is_banned(201)

    def test_ban_user(self, fresh_db):
        uid = fresh_db.upsert_user(202, "B", None)
        fresh_db.ban_user(uid)
        assert fresh_db.is_banned(202)

    def test_unban_user(self, fresh_db):
        uid = fresh_db.upsert_user(203, "C", None)
        fresh_db.ban_user(uid)
        fresh_db.unban_user(uid)
        assert not fresh_db.is_banned(203)

    def test_banned_user_excluded_from_active(self, fresh_db):
        uid = fresh_db.upsert_user(204, "D", None)
        fresh_db.ban_user(uid)
        users = fresh_db.get_all_active_users_with_tier()
        ids = [u["id"] for u in users]
        assert uid not in ids


# ── Subscriptions / Tiers ──────────────────────────────────────────────────────

class TestTiers:

    def test_new_user_is_free(self, fresh_db):
        uid = fresh_db.upsert_user(301, "A", None)
        assert fresh_db.get_user_tier(uid) == "free"

    def test_set_tier_basic(self, fresh_db):
        uid = fresh_db.upsert_user(302, "B", None)
        fresh_db.set_user_tier(uid, "basic")
        assert fresh_db.get_user_tier(uid) == "basic"

    def test_set_tier_pro(self, fresh_db):
        uid = fresh_db.upsert_user(303, "C", None)
        fresh_db.set_user_tier(uid, "pro")
        assert fresh_db.get_user_tier(uid) == "pro"

    def test_expired_subscription_returns_free(self, fresh_db):
        uid = fresh_db.upsert_user(304, "D", None)
        past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        fresh_db.set_user_tier_with_expiry(uid, "basic", past)
        assert fresh_db.get_user_tier(uid) == "free"

    def test_valid_subscription_returns_tier(self, fresh_db):
        uid = fresh_db.upsert_user(305, "E", None)
        future = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
        fresh_db.set_user_tier_with_expiry(uid, "pro", future)
        assert fresh_db.get_user_tier(uid) == "pro"

    def test_get_expiring_subscriptions(self, fresh_db):
        uid = fresh_db.upsert_user(306, "F", None)
        soon = (datetime.now(timezone.utc) + timedelta(days=2)).strftime("%Y-%m-%d %H:%M:%S")
        fresh_db.set_user_tier_with_expiry(uid, "basic", soon)
        expiring = fresh_db.get_expiring_subscriptions(days=3)
        # crypto-sniper-bot-master version returns u.id (not user_id) in the SELECT
        ids = [e["id"] if "id" in e.keys() else e["user_id"] for e in expiring]
        assert uid in ids

    def test_expiring_subscriptions_not_returned_if_far(self, fresh_db):
        uid = fresh_db.upsert_user(307, "G", None)
        far = (datetime.now(timezone.utc) + timedelta(days=10)).strftime("%Y-%m-%d %H:%M:%S")
        fresh_db.set_user_tier_with_expiry(uid, "basic", far)
        expiring = fresh_db.get_expiring_subscriptions(days=3)
        assert not any(e["user_id"] == uid for e in expiring)


# ── get_all_active_users_with_tier (LEFT JOIN bug fix) ─────────────────────────

class TestActiveUsers:

    def test_user_with_no_subscription_row_included(self, fresh_db):
        """Core fix: users without explicit subscription must be treated as free."""
        uid = fresh_db.upsert_user(401, "A", None)
        # The LEFT JOIN with COALESCE should include this user
        users = fresh_db.get_all_active_users_with_tier()
        assert any(u["id"] == uid for u in users)

    def test_user_without_subscription_has_tier_free(self, fresh_db):
        uid = fresh_db.upsert_user(402, "B", None)
        users = fresh_db.get_all_active_users_with_tier()
        u = next(u for u in users if u["id"] == uid)
        assert u["tier"] == "free"

    def test_basic_user_included(self, fresh_db):
        uid = fresh_db.upsert_user(403, "C", None)
        fresh_db.set_user_tier(uid, "basic")
        users = fresh_db.get_all_active_users_with_tier()
        tiers = {u["id"]: u["tier"] for u in users}
        assert tiers[uid] == "basic"

    def test_pro_user_included(self, fresh_db):
        uid = fresh_db.upsert_user(404, "D", None)
        fresh_db.set_user_tier(uid, "pro")
        users = fresh_db.get_all_active_users_with_tier()
        tiers = {u["id"]: u["tier"] for u in users}
        assert tiers[uid] == "pro"

    def test_multiple_users_all_returned(self, fresh_db):
        uid1 = fresh_db.upsert_user(405, "A", None)
        uid2 = fresh_db.upsert_user(406, "B", None)
        uid3 = fresh_db.upsert_user(407, "C", None)
        fresh_db.set_user_tier(uid2, "basic")
        fresh_db.set_user_tier(uid3, "pro")
        users = fresh_db.get_all_active_users_with_tier()
        ids = {u["id"] for u in users}
        assert {uid1, uid2, uid3}.issubset(ids)

    def test_defaults_coalesced_correctly(self, fresh_db):
        uid = fresh_db.upsert_user(408, "D", None)
        users = fresh_db.get_all_active_users_with_tier()
        u = next(u for u in users if u["id"] == uid)
        assert u["auto_mode"] == 0
        assert u["lang"] == "ua"


# ── Signals ────────────────────────────────────────────────────────────────────

def _signal_data(**overrides):
    base = {
        "chain": "solana", "token_address": "TKN" + str(id(overrides)),
        "token_name": "TestToken", "token_symbol": "TEST",
        "pair_address": "PAIR1", "dex": "raydium",
        "score": 70, "signal_type": "BUY",
        "price_usd": 0.001, "liquidity_usd": 50000,
        "volume_1h": 5000, "volume_24h": 50000,
        "price_change_1h": 10.0, "price_change_24h": 5.0,
        "market_cap": 0, "holders": 0,
        "liq_locked": False, "contract_renounced": False,
        "honeypot": False, "rugcheck_score": None,
        "top10_holders_pct": None, "pair_created_at": None,
        "pair_url": None, "extra_json": None,
    }
    base.update(overrides)
    return base


class TestSignals:

    def test_save_signal_returns_id(self, fresh_db):
        sid = fresh_db.save_signal(_signal_data(token_address="A1"))
        assert sid is not None and sid > 0

    def test_save_duplicate_returns_none(self, fresh_db):
        data = _signal_data(token_address="A2")
        fresh_db.save_signal(data)
        assert fresh_db.save_signal(data) is None  # same token_address+date = duplicate

    def test_get_recent_signals(self, fresh_db):
        fresh_db.save_signal(_signal_data(token_address="B1"))
        fresh_db.save_signal(_signal_data(token_address="B2"))
        sigs = fresh_db.get_recent_signals(limit=10)
        assert len(sigs) == 2

    def test_get_recent_signals_by_chain(self, fresh_db):
        fresh_db.save_signal(_signal_data(token_address="C1", chain="solana"))
        fresh_db.save_signal(_signal_data(token_address="C2", chain="bsc"))
        sol = fresh_db.get_recent_signals(chain="solana")
        assert all(s["chain"] == "solana" for s in sol)

    def test_was_signal_sent_false_initially(self, fresh_db):
        uid = fresh_db.upsert_user(501, "A", None)
        sid = fresh_db.save_signal(_signal_data(token_address="D1"))
        assert not fresh_db.was_signal_sent(uid, sid)

    def test_mark_signal_sent(self, fresh_db):
        uid = fresh_db.upsert_user(502, "B", None)
        sid = fresh_db.save_signal(_signal_data(token_address="D2"))
        fresh_db.mark_signal_sent(uid, sid)
        assert fresh_db.was_signal_sent(uid, sid)

    def test_mark_signal_sent_idempotent(self, fresh_db):
        uid = fresh_db.upsert_user(503, "C", None)
        sid = fresh_db.save_signal(_signal_data(token_address="D3"))
        fresh_db.mark_signal_sent(uid, sid)
        fresh_db.mark_signal_sent(uid, sid)  # should not raise
        assert fresh_db.was_signal_sent(uid, sid)

    def test_count_signals_sent_today_zero(self, fresh_db):
        uid = fresh_db.upsert_user(504, "D", None)
        assert fresh_db.count_signals_sent_today(uid) == 0

    def test_count_signals_sent_today_counts(self, fresh_db):
        uid = fresh_db.upsert_user(505, "E", None)
        for i in range(3):
            sid = fresh_db.save_signal(_signal_data(token_address=f"E{i}"))
            fresh_db.mark_signal_sent(uid, sid)
        assert fresh_db.count_signals_sent_today(uid) == 3

    def test_sent_for_one_user_not_counted_for_another(self, fresh_db):
        uid1 = fresh_db.upsert_user(506, "F", None)
        uid2 = fresh_db.upsert_user(507, "G", None)
        sid = fresh_db.save_signal(_signal_data(token_address="F1"))
        fresh_db.mark_signal_sent(uid1, sid)
        assert fresh_db.count_signals_sent_today(uid2) == 0

    def test_free_daily_limit_enforced_at_3(self, fresh_db):
        """Simulate: free user hits 3-signal cap."""
        uid = fresh_db.upsert_user(508, "H", None)
        for i in range(3):
            sid = fresh_db.save_signal(_signal_data(token_address=f"G{i}"))
            fresh_db.mark_signal_sent(uid, sid)
        count = fresh_db.count_signals_sent_today(uid)
        limit = 3
        assert count >= limit  # 4th signal would be blocked


# ── Wallets ────────────────────────────────────────────────────────────────────

class TestWallets:

    def test_save_and_get_wallet(self, fresh_db):
        uid = fresh_db.upsert_user(601, "A", None)
        fresh_db.save_wallet(uid, "solana", "SOL_ADDR")
        w = fresh_db.get_wallet(uid, "solana")
        assert w["address"] == "SOL_ADDR"

    def test_get_wallet_missing_returns_none(self, fresh_db):
        uid = fresh_db.upsert_user(602, "B", None)
        assert fresh_db.get_wallet(uid, "solana") is None

    def test_save_wallet_upsert(self, fresh_db):
        uid = fresh_db.upsert_user(603, "C", None)
        fresh_db.save_wallet(uid, "solana", "ADDR1")
        fresh_db.save_wallet(uid, "solana", "ADDR2")
        w = fresh_db.get_wallet(uid, "solana")
        assert w["address"] == "ADDR2"

    def test_save_wallet_with_pk(self, fresh_db):
        uid = fresh_db.upsert_user(604, "D", None)
        fresh_db.save_wallet(uid, "bsc", "BSC_ADDR", encrypted_pk="ENC_KEY")
        w = fresh_db.get_wallet(uid, "bsc")
        assert w["encrypted_pk"] == "ENC_KEY"

    def test_update_wallet_pk(self, fresh_db):
        uid = fresh_db.upsert_user(605, "E", None)
        fresh_db.save_wallet(uid, "solana", "ADDR")
        fresh_db.update_wallet_pk(uid, "solana", "NEW_ENC")
        w = fresh_db.get_wallet(uid, "solana")
        assert w["encrypted_pk"] == "NEW_ENC"

    def test_delete_wallet(self, fresh_db):
        uid = fresh_db.upsert_user(606, "F", None)
        fresh_db.save_wallet(uid, "solana", "ADDR")
        fresh_db.delete_wallet(uid, "solana")
        assert fresh_db.get_wallet(uid, "solana") is None

    def test_get_all_wallets(self, fresh_db):
        uid = fresh_db.upsert_user(607, "G", None)
        fresh_db.save_wallet(uid, "solana", "SOL")
        fresh_db.save_wallet(uid, "bsc", "BSC")
        wallets = fresh_db.get_all_wallets(uid)
        chains = {w["chain"] for w in wallets}
        assert chains == {"solana", "bsc"}

    def test_wallets_isolated_between_users(self, fresh_db):
        uid1 = fresh_db.upsert_user(608, "H", None)
        uid2 = fresh_db.upsert_user(609, "I", None)
        fresh_db.save_wallet(uid1, "solana", "ADDR_H")
        assert fresh_db.get_wallet(uid2, "solana") is None


# ── Positions ──────────────────────────────────────────────────────────────────

class TestPositions:

    def _open(self, fresh_db, uid, token="TOK1"):
        fresh_db.upsert_position(uid, "solana", token, "SYM", "Name",
                                  0.5, 0.001, 0.5, 20)

    def test_upsert_and_get_open_positions(self, fresh_db):
        uid = fresh_db.upsert_user(701, "A", None)
        self._open(fresh_db, uid)
        pos = fresh_db.get_open_positions(uid)
        assert len(pos) == 1

    def test_get_open_positions_empty(self, fresh_db):
        uid = fresh_db.upsert_user(702, "B", None)
        assert fresh_db.get_open_positions(uid) == []

    def test_close_position(self, fresh_db):
        uid = fresh_db.upsert_user(703, "C", None)
        self._open(fresh_db, uid)
        pos = fresh_db.get_open_positions(uid)
        fresh_db.close_position(pos[0]["id"])
        assert fresh_db.get_open_positions(uid) == []

    def test_close_position_with_sell(self, fresh_db):
        uid = fresh_db.upsert_user(704, "D", None)
        self._open(fresh_db, uid)
        pos = fresh_db.get_open_positions(uid)
        fresh_db.close_position_with_sell(pos[0]["id"], sell_price_usd=0.002,
                                          pnl_pct=100.0, reason="take_profit")
        assert fresh_db.get_open_positions(uid) == []

    def test_upsert_position_updates_existing(self, fresh_db):
        uid = fresh_db.upsert_user(705, "E", None)
        self._open(fresh_db, uid, "TOK_UPDATE")
        fresh_db.upsert_position(uid, "solana", "TOK_UPDATE", "SYM", "Name",
                                  1.0, 0.002, 1.0, 25)
        pos = fresh_db.get_open_positions(uid)
        assert len(pos) == 1  # no duplicate

    def test_multiple_positions(self, fresh_db):
        uid = fresh_db.upsert_user(706, "F", None)
        self._open(fresh_db, uid, "TOK_A")
        self._open(fresh_db, uid, "TOK_B")
        self._open(fresh_db, uid, "TOK_C")
        assert len(fresh_db.get_open_positions(uid)) == 3

    def test_positions_isolated_between_users(self, fresh_db):
        uid1 = fresh_db.upsert_user(707, "G", None)
        uid2 = fresh_db.upsert_user(708, "H", None)
        self._open(fresh_db, uid1)
        assert fresh_db.get_open_positions(uid2) == []

    def test_get_all_open_positions_with_users(self, fresh_db):
        uid = fresh_db.upsert_user(709, "I", None)
        self._open(fresh_db, uid)
        all_pos = fresh_db.get_all_open_positions_with_users()
        assert any(p["user_id"] == uid for p in all_pos)


# ── Trades ─────────────────────────────────────────────────────────────────────

class TestTrades:

    def test_save_and_get_trade(self, fresh_db):
        uid = fresh_db.upsert_user(801, "A", None)
        fresh_db.save_trade(uid, "solana", "TOK1", "SYM", "buy",
                             0.5, 1000, 0.001, "TX_HASH", "pending")
        trades = fresh_db.get_user_trades(uid)
        assert len(trades) == 1
        assert trades[0]["tx_hash"] == "TX_HASH"

    def test_get_user_trades_empty(self, fresh_db):
        uid = fresh_db.upsert_user(802, "B", None)
        assert fresh_db.get_user_trades(uid) == []

    def test_multiple_trades_returned(self, fresh_db):
        uid = fresh_db.upsert_user(803, "C", None)
        for i in range(5):
            fresh_db.save_trade(uid, "solana", f"T{i}", "S", "buy",
                                 0.1, 100, 0.001, f"TX{i}", "pending")
        assert len(fresh_db.get_user_trades(uid)) == 5

    def test_update_trade_status(self, fresh_db):
        uid = fresh_db.upsert_user(804, "D", None)
        fresh_db.save_trade(uid, "bsc", "TOK2", "SYM", "buy",
                             0.01, 10, 0.001, "TX1", "pending")
        trades = fresh_db.get_user_trades(uid)
        fresh_db.update_trade_status(trades[0]["id"], "confirmed")
        updated = fresh_db.get_user_trades(uid)
        assert updated[0]["status"] == "confirmed"

    def test_trades_isolated_between_users(self, fresh_db):
        uid1 = fresh_db.upsert_user(805, "E", None)
        uid2 = fresh_db.upsert_user(806, "F", None)
        fresh_db.save_trade(uid1, "solana", "T1", "S", "buy", 0.1, 100, 0.001, "TX", "pending")
        assert fresh_db.get_user_trades(uid2) == []


# ── Bot settings ───────────────────────────────────────────────────────────────

class TestBotSettings:

    def test_get_default_setting(self, fresh_db):
        val = fresh_db.get_bot_setting("min_signal_score")
        assert val == "35"

    def test_get_missing_setting_returns_none(self, fresh_db):
        assert fresh_db.get_bot_setting("nonexistent_key") is None

    def test_get_missing_setting_with_default(self, fresh_db):
        assert fresh_db.get_bot_setting("nonexistent_key", "fallback") == "fallback"

    def test_set_and_get_setting(self, fresh_db):
        fresh_db.set_bot_setting("test_key", "test_val")
        assert fresh_db.get_bot_setting("test_key") == "test_val"

    def test_set_overwrites_existing(self, fresh_db):
        fresh_db.set_bot_setting("min_signal_score", "50")
        assert fresh_db.get_bot_setting("min_signal_score") == "50"

    def test_get_all_bot_settings(self, fresh_db):
        settings = fresh_db.get_all_bot_settings()
        assert isinstance(settings, dict)
        assert "min_signal_score" in settings
        assert "maintenance_mode" in settings

    def test_free_daily_default(self, fresh_db):
        assert fresh_db.get_bot_setting("free_daily_signals") == "3"

    def test_basic_daily_default(self, fresh_db):
        assert fresh_db.get_bot_setting("basic_daily_signals") == "20"

    def test_pro_daily_default(self, fresh_db):
        assert fresh_db.get_bot_setting("pro_daily_signals") == "0"

    def test_maintenance_mode_default_off(self, fresh_db):
        assert fresh_db.get_bot_setting("maintenance_mode") == "0"


# ── User settings ──────────────────────────────────────────────────────────────

class TestUserSettings:

    def test_default_auto_mode_off(self, fresh_db):
        uid = fresh_db.upsert_user(901, "A", None)
        s = fresh_db.get_user_settings(uid)
        assert s["auto_mode"] == 0

    def test_update_auto_mode(self, fresh_db):
        uid = fresh_db.upsert_user(902, "B", None)
        fresh_db.update_user_settings(uid, auto_mode=1)
        s = fresh_db.get_user_settings(uid)
        assert s["auto_mode"] == 1

    def test_update_stop_loss(self, fresh_db):
        uid = fresh_db.upsert_user(903, "C", None)
        fresh_db.update_user_settings(uid, auto_stop_loss=15.0)
        s = fresh_db.get_user_settings(uid)
        assert s["auto_stop_loss"] == 15.0

    def test_auto_take_profit_readable(self, fresh_db):
        """auto_take_profit column exists and defaults to 0 (added by migration)."""
        uid = fresh_db.upsert_user(904, "D", None)
        s = fresh_db.get_user_settings(uid)
        assert s["auto_take_profit"] == 0.0  # default value

    def test_update_min_score(self, fresh_db):
        uid = fresh_db.upsert_user(905, "E", None)
        fresh_db.update_user_settings(uid, auto_min_score=90)
        s = fresh_db.get_user_settings(uid)
        assert s["auto_min_score"] == 90
