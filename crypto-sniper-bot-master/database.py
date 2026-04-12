import sqlite3
import os
from datetime import datetime, timezone

# On Railway: set DB_PATH=/data/data.db and mount a Volume at /data
_default = os.path.join(os.path.dirname(__file__), "data.db")
DB_PATH  = os.getenv("DB_PATH", _default)

# Ensure the parent directory exists (needed when Volume is mounted at /data)
_db_dir = os.path.dirname(DB_PATH)
if _db_dir:
    os.makedirs(_db_dir, exist_ok=True)


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db() -> None:
    with get_conn() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                telegram_id INTEGER UNIQUE NOT NULL,
                first_name  TEXT,
                username    TEXT,
                lang        TEXT NOT NULL DEFAULT 'ua',
                registered  INTEGER NOT NULL DEFAULT 0,
                banned      INTEGER NOT NULL DEFAULT 0,
                created_at  TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS subscriptions (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id    INTEGER NOT NULL REFERENCES users(id),
                tier       TEXT NOT NULL DEFAULT 'free',
                status     TEXT NOT NULL DEFAULT 'active',
                expires_at TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS signals (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                chain            TEXT NOT NULL,
                token_address    TEXT NOT NULL,
                token_name       TEXT,
                token_symbol     TEXT,
                pair_address     TEXT,
                dex              TEXT,
                score            INTEGER NOT NULL,
                signal_type      TEXT NOT NULL,
                price_usd        REAL,
                liquidity_usd    REAL,
                volume_1h        REAL,
                volume_24h       REAL,
                price_change_1h  REAL,
                price_change_24h REAL,
                market_cap       REAL,
                holders          INTEGER,
                liq_locked       INTEGER DEFAULT 0,
                contract_renounced INTEGER DEFAULT 0,
                honeypot         INTEGER DEFAULT 0,
                rugcheck_score   INTEGER,
                top10_holders_pct REAL,
                pair_created_at  INTEGER,
                pair_url         TEXT,
                extra_json       TEXT,
                created_at       TEXT NOT NULL DEFAULT (datetime('now')),
                signal_date      TEXT NOT NULL DEFAULT (date('now')),
                UNIQUE(chain, token_address, signal_date)
            );

            CREATE TABLE IF NOT EXISTS signal_sends (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id   INTEGER NOT NULL REFERENCES users(id),
                signal_id INTEGER NOT NULL REFERENCES signals(id),
                sent_at   TEXT NOT NULL DEFAULT (datetime('now')),
                UNIQUE(user_id, signal_id)
            );

            CREATE TABLE IF NOT EXISTS wallets (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id      INTEGER NOT NULL REFERENCES users(id),
                chain        TEXT NOT NULL,
                address      TEXT NOT NULL,
                encrypted_pk TEXT,
                label        TEXT,
                created_at   TEXT NOT NULL DEFAULT (datetime('now')),
                UNIQUE(user_id, chain)
            );

            CREATE TABLE IF NOT EXISTS trades (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id       INTEGER NOT NULL REFERENCES users(id),
                signal_id     INTEGER REFERENCES signals(id),
                chain         TEXT NOT NULL,
                token_address TEXT NOT NULL,
                token_symbol  TEXT,
                trade_type    TEXT NOT NULL,
                amount_in     REAL,
                amount_out    REAL,
                price_usd     REAL,
                tx_hash       TEXT,
                status        TEXT NOT NULL DEFAULT 'pending',
                mode          TEXT NOT NULL DEFAULT 'manual',
                created_at    TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS positions (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id          INTEGER NOT NULL REFERENCES users(id),
                chain            TEXT NOT NULL,
                token_address    TEXT NOT NULL,
                token_symbol     TEXT,
                token_name       TEXT,
                amount           REAL NOT NULL,
                buy_price_usd    REAL,
                buy_amount_native REAL,
                stop_loss_pct    REAL DEFAULT 20,
                take_profit_pct  REAL DEFAULT 0,
                exit_reason      TEXT,
                status           TEXT NOT NULL DEFAULT 'open',
                opened_at        TEXT NOT NULL DEFAULT (datetime('now')),
                closed_at        TEXT,
                UNIQUE(user_id, chain, token_address)
            );

            CREATE TABLE IF NOT EXISTS user_settings (
                user_id           INTEGER PRIMARY KEY REFERENCES users(id),
                auto_mode              INTEGER DEFAULT 0,
                auto_min_score         INTEGER DEFAULT 80,
                auto_max_buy_sol       REAL DEFAULT 0.1,
                auto_max_buy_bnb       REAL DEFAULT 0.01,
                auto_stop_loss         REAL DEFAULT 20,
                auto_take_profit       REAL DEFAULT 0,
                notify_all_tokens      INTEGER DEFAULT 0,
                signals_push           INTEGER DEFAULT 1,
                signal_chain           TEXT DEFAULT 'all',
                signal_min_score_user  INTEGER DEFAULT 0,
                updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS payments (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id     INTEGER NOT NULL REFERENCES users(id),
                tier        TEXT NOT NULL,
                amount_usd  REAL NOT NULL,
                invoice_id  TEXT UNIQUE,
                invoice_url TEXT,
                status      TEXT NOT NULL DEFAULT 'pending',
                created_at  TEXT NOT NULL DEFAULT (datetime('now')),
                paid_at     TEXT
            );

            CREATE TABLE IF NOT EXISTS bot_settings (
                key        TEXT PRIMARY KEY,
                value      TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS broadcasts (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                admin_user  TEXT NOT NULL,
                message     TEXT NOT NULL,
                tier_filter TEXT,
                status      TEXT NOT NULL DEFAULT 'pending',
                sent_count  INTEGER DEFAULT 0,
                created_at  TEXT NOT NULL DEFAULT (datetime('now')),
                sent_at     TEXT
            );

            CREATE TABLE IF NOT EXISTS audit_log (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                admin_user TEXT NOT NULL,
                action     TEXT NOT NULL,
                details    TEXT,
                ip         TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_signals_created   ON signals(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_signals_score     ON signals(score DESC);
            CREATE INDEX IF NOT EXISTS idx_signals_chain     ON signals(chain);
            CREATE INDEX IF NOT EXISTS idx_signal_sends_user ON signal_sends(user_id);
            CREATE INDEX IF NOT EXISTS idx_trades_user       ON trades(user_id);
            CREATE INDEX IF NOT EXISTS idx_positions_user    ON positions(user_id);
            CREATE INDEX IF NOT EXISTS idx_payments_user     ON payments(user_id);
            CREATE INDEX IF NOT EXISTS idx_payments_status   ON payments(status);
        """)

        # Migrations for existing DBs
        for col, ddl in [
            ("lang",            "ALTER TABLE users ADD COLUMN lang TEXT NOT NULL DEFAULT 'ua'"),
            ("registered",      "ALTER TABLE users ADD COLUMN registered INTEGER NOT NULL DEFAULT 0"),
            ("banned",          "ALTER TABLE users ADD COLUMN banned INTEGER NOT NULL DEFAULT 0"),
            ("pair_created_at", "ALTER TABLE signals ADD COLUMN pair_created_at INTEGER"),
            ("pair_url",        "ALTER TABLE signals ADD COLUMN pair_url TEXT"),
            # subscriptions columns added in v2
            ("expires_at",      "ALTER TABLE subscriptions ADD COLUMN expires_at TEXT"),
            ("updated_at",      "ALTER TABLE subscriptions ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'))"),
            # user_settings columns added in v3
            ("auto_take_profit",       "ALTER TABLE user_settings ADD COLUMN auto_take_profit REAL DEFAULT 0"),
            # user_settings columns added in v4 (notification filters)
            ("signals_push",           "ALTER TABLE user_settings ADD COLUMN signals_push INTEGER DEFAULT 1"),
            ("signal_chain",           "ALTER TABLE user_settings ADD COLUMN signal_chain TEXT DEFAULT 'all'"),
            ("signal_min_score_user",  "ALTER TABLE user_settings ADD COLUMN signal_min_score_user INTEGER DEFAULT 0"),
            # positions columns added in v3
            ("take_profit_pct", "ALTER TABLE positions ADD COLUMN take_profit_pct REAL DEFAULT 0"),
            ("exit_reason",     "ALTER TABLE positions ADD COLUMN exit_reason TEXT"),
        ]:
            try:
                conn.execute(ddl)
            except Exception:
                pass

        # Default bot settings
        defaults = {
            "min_signal_score":    "35",   # global floor (save to DB only)
            "free_min_score":      "35",   # min score to dispatch to free users
            "basic_min_score":     "35",   # same quality, more per day
            "pro_min_score":       "35",   # same quality, unlimited
            "free_daily_signals":  "10",
            "basic_daily_signals": "0",
            "pro_daily_signals":   "0",
            "basic_price_usd":     "29",
            "pro_price_usd":       "79",
            "basic_duration_days": "30",
            "pro_duration_days":   "30",
            "maintenance_mode":    "0",
        }
        for key, val in defaults.items():
            try:
                conn.execute(
                    "INSERT OR IGNORE INTO bot_settings (key, value) VALUES (?, ?)",
                    (key, val)
                )
            except Exception:
                pass

        # Migration v1: reset overly-strict thresholds (85/70/55 → 35/30/25)
        # Migration v2: reset too-high thresholds (40/40/40 → 35/30/25)
        # Migration v3: raise daily limits (3→10 free, 20→0 basic=unlimited)
        _migrations = {
            "free_min_score":    [("85", "35"), ("40", "35"), ("30", "35"), ("25", "35")],
            "basic_min_score":   [("70", "35"), ("40", "35"), ("30", "35")],
            "pro_min_score":     [("55", "35"), ("40", "35"), ("25", "35")],
            "min_signal_score":  [("40", "35")],
            "free_daily_signals":  [("10", "10"), ("3", "10")],
            "basic_daily_signals": [("50", "0"), ("20", "0")],
        }
        for key, steps in _migrations.items():
            try:
                row = conn.execute("SELECT value FROM bot_settings WHERE key=?", (key,)).fetchone()
                if row:
                    for old_val, new_val in steps:
                        if row["value"] == old_val:
                            conn.execute(
                                "UPDATE bot_settings SET value=?, updated_at=datetime('now') WHERE key=?",
                                (new_val, key)
                            )
                            break
            except Exception:
                pass


# ── Users ──────────────────────────────────────────────────────────────────────

def upsert_user(telegram_id: int, first_name: str, username: str | None) -> int:
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO users (telegram_id, first_name, username)
            VALUES (?, ?, ?)
            ON CONFLICT(telegram_id) DO UPDATE SET
                first_name = excluded.first_name,
                username   = excluded.username
        """, (telegram_id, first_name, username))
        row = conn.execute("SELECT id FROM users WHERE telegram_id = ?", (telegram_id,)).fetchone()
        uid = row["id"]
        if not conn.execute("SELECT id FROM subscriptions WHERE user_id=?", (uid,)).fetchone():
            conn.execute("INSERT INTO subscriptions (user_id) VALUES (?)", (uid,))
        if not conn.execute("SELECT user_id FROM user_settings WHERE user_id=?", (uid,)).fetchone():
            conn.execute("INSERT INTO user_settings (user_id) VALUES (?)", (uid,))
        return uid


def get_user_by_telegram_id(telegram_id: int) -> sqlite3.Row | None:
    with get_conn() as conn:
        return conn.execute("SELECT * FROM users WHERE telegram_id=?", (telegram_id,)).fetchone()


def get_user_by_id(user_id: int) -> sqlite3.Row | None:
    with get_conn() as conn:
        return conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()


def get_user_lang(user_id: int) -> str:
    with get_conn() as conn:
        row = conn.execute("SELECT lang FROM users WHERE id=?", (user_id,)).fetchone()
    return row["lang"] if row and row["lang"] else "ua"


def set_user_lang(user_id: int, lang: str) -> None:
    if lang not in ("ua", "en"):
        lang = "ua"
    with get_conn() as conn:
        conn.execute("UPDATE users SET lang=? WHERE id=?", (lang, user_id))


def set_user_registered(user_id: int) -> None:
    with get_conn() as conn:
        conn.execute("UPDATE users SET registered=1 WHERE id=?", (user_id,))


def is_banned(telegram_id: int) -> bool:
    with get_conn() as conn:
        row = conn.execute("SELECT banned FROM users WHERE telegram_id=?", (telegram_id,)).fetchone()
    return bool(row and row["banned"])


def ban_user(user_id: int) -> None:
    with get_conn() as conn:
        conn.execute("UPDATE users SET banned=1 WHERE id=?", (user_id,))


def unban_user(user_id: int) -> None:
    with get_conn() as conn:
        conn.execute("UPDATE users SET banned=0 WHERE id=?", (user_id,))


def get_all_active_users_with_tier() -> list[sqlite3.Row]:
    with get_conn() as conn:
        return conn.execute("""
            SELECT u.id, u.telegram_id, u.first_name,
                   COALESCE(u.lang,'ua') as lang,
                   COALESCE(s.tier,'free') as tier,
                   s.status, s.expires_at,
                   COALESCE(us.auto_mode, 0) as auto_mode,
                   COALESCE(us.auto_min_score, 80) as auto_min_score,
                   COALESCE(us.auto_max_buy_sol, 0.1) as auto_max_buy_sol,
                   COALESCE(us.auto_max_buy_bnb, 0.01) as auto_max_buy_bnb,
                   COALESCE(us.auto_stop_loss, 20)         as auto_stop_loss,
                   COALESCE(us.auto_take_profit, 0)        as auto_take_profit,
                   COALESCE(us.notify_all_tokens, 0)       as notify_all_tokens,
                   COALESCE(us.signals_push, 1)            as signals_push,
                   COALESCE(us.signal_chain, 'all')        as signal_chain,
                   COALESCE(us.signal_min_score_user, 0)   as signal_min_score_user
            FROM users u
            LEFT JOIN (
                SELECT user_id, tier, status, expires_at
                FROM subscriptions
                WHERE id IN (SELECT MAX(id) FROM subscriptions GROUP BY user_id)
            ) s ON s.user_id = u.id
            LEFT JOIN user_settings us ON us.user_id=u.id
            WHERE (COALESCE(s.status,'active')='active' OR COALESCE(s.tier,'free')='free')
              AND u.banned=0
        """).fetchall()


# ── Subscriptions ──────────────────────────────────────────────────────────────

def get_subscription(user_id: int) -> sqlite3.Row | None:
    with get_conn() as conn:
        return conn.execute("SELECT * FROM subscriptions WHERE user_id=?", (user_id,)).fetchone()


def get_user_tier(user_id: int) -> str:
    with get_conn() as conn:
        row = conn.execute("SELECT tier, status, expires_at FROM subscriptions WHERE user_id=?",
                           (user_id,)).fetchone()
    if not row or row["tier"] == "free":
        return "free"
    if row["status"] != "active":
        return "free"
    if row["expires_at"]:
        try:
            expires = datetime.fromisoformat(row["expires_at"]).replace(tzinfo=timezone.utc)
            if expires < datetime.now(timezone.utc):
                return "free"
        except ValueError:
            return "free"
    return row["tier"]


def set_user_tier(user_id: int, tier: str) -> None:
    with get_conn() as conn:
        exists = conn.execute("SELECT id FROM subscriptions WHERE user_id=?", (user_id,)).fetchone()
        if exists:
            conn.execute(
                "UPDATE subscriptions SET tier=?, status='active', updated_at=datetime('now') WHERE user_id=?",
                (tier, user_id))
        else:
            conn.execute(
                "INSERT INTO subscriptions (user_id, tier, status) VALUES (?, ?, 'active')",
                (user_id, tier))


def get_expiring_subscriptions(days: int = 3) -> list[sqlite3.Row]:
    """Return active paid subscriptions expiring within `days` days."""
    with get_conn() as conn:
        return conn.execute("""
            SELECT s.user_id, s.tier, s.expires_at,
                   u.telegram_id, u.first_name, COALESCE(u.lang, 'ua') as lang
            FROM subscriptions s
            JOIN users u ON u.id = s.user_id
            WHERE s.status = 'active'
              AND s.tier != 'free'
              AND s.expires_at IS NOT NULL
              AND date(s.expires_at) BETWEEN date('now') AND date('now', ? || ' days')
              AND u.banned = 0
        """, (f"+{days}",)).fetchall()


def set_user_tier_with_expiry(user_id: int, tier: str, expires_at: str) -> None:
    with get_conn() as conn:
        exists = conn.execute("SELECT id FROM subscriptions WHERE user_id=?", (user_id,)).fetchone()
        if exists:
            conn.execute(
                "UPDATE subscriptions SET tier=?, status='active', expires_at=?, updated_at=datetime('now') WHERE user_id=?",
                (tier, expires_at, user_id))
        else:
            conn.execute(
                "INSERT INTO subscriptions (user_id, tier, status, expires_at) VALUES (?, ?, 'active', ?)",
                (user_id, tier, expires_at))


# ── Signals ────────────────────────────────────────────────────────────────────

def save_signal(data: dict) -> int | None:
    with get_conn() as conn:
        try:
            cur = conn.execute("""
                INSERT INTO signals (
                    chain, token_address, token_name, token_symbol,
                    pair_address, dex, score, signal_type,
                    price_usd, liquidity_usd, volume_1h, volume_24h,
                    price_change_1h, price_change_24h, market_cap,
                    holders, liq_locked, contract_renounced, honeypot,
                    rugcheck_score, top10_holders_pct,
                    pair_created_at, pair_url, extra_json, signal_date
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,date('now'))
            """, (
                data.get("chain"), data.get("token_address"), data.get("token_name"),
                data.get("token_symbol"), data.get("pair_address"), data.get("dex"),
                data.get("score"), data.get("signal_type"),
                data.get("price_usd"), data.get("liquidity_usd"),
                data.get("volume_1h"), data.get("volume_24h"),
                data.get("price_change_1h"), data.get("price_change_24h"),
                data.get("market_cap"), data.get("holders"),
                int(data.get("liq_locked", False)),
                int(data.get("contract_renounced", False)),
                int(data.get("honeypot", False)),
                data.get("rugcheck_score"), data.get("top10_holders_pct"),
                data.get("pair_created_at"), data.get("pair_url"),
                data.get("extra_json"),
            ))
            return cur.lastrowid
        except sqlite3.IntegrityError:
            return None


def get_recent_signals(limit: int = 50, chain: str | None = None) -> list[sqlite3.Row]:
    with get_conn() as conn:
        if chain:
            return conn.execute(
                "SELECT * FROM signals WHERE chain=? ORDER BY created_at DESC LIMIT ?",
                (chain, limit)).fetchall()
        return conn.execute(
            "SELECT * FROM signals ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()


def was_signal_sent(user_id: int, signal_id: int) -> bool:
    with get_conn() as conn:
        return bool(conn.execute(
            "SELECT id FROM signal_sends WHERE user_id=? AND signal_id=?",
            (user_id, signal_id)).fetchone())


def mark_signal_sent(user_id: int, signal_id: int) -> None:
    with get_conn() as conn:
        try:
            conn.execute("INSERT INTO signal_sends (user_id, signal_id) VALUES (?,?)",
                         (user_id, signal_id))
        except sqlite3.IntegrityError:
            pass


def count_signals_sent_today(user_id: int) -> int:
    with get_conn() as conn:
        row = conn.execute("""
            SELECT COUNT(*) as cnt FROM signal_sends
            WHERE user_id=? AND date(sent_at)=date('now')
        """, (user_id,)).fetchone()
    return row["cnt"]


# ── Wallets ────────────────────────────────────────────────────────────────────

def get_wallet(user_id: int, chain: str) -> sqlite3.Row | None:
    with get_conn() as conn:
        return conn.execute("SELECT * FROM wallets WHERE user_id=? AND chain=?",
                            (user_id, chain)).fetchone()


def get_all_wallets(user_id: int) -> list[sqlite3.Row]:
    with get_conn() as conn:
        return conn.execute("SELECT * FROM wallets WHERE user_id=?", (user_id,)).fetchall()


def save_wallet(user_id: int, chain: str, address: str, encrypted_pk: str | None = None) -> None:
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO wallets (user_id, chain, address, encrypted_pk)
            VALUES (?,?,?,?)
            ON CONFLICT(user_id, chain) DO UPDATE SET
                address=excluded.address,
                encrypted_pk=COALESCE(excluded.encrypted_pk, wallets.encrypted_pk)
        """, (user_id, chain, address, encrypted_pk))


def update_wallet_pk(user_id: int, chain: str, encrypted_pk: str | None) -> None:
    with get_conn() as conn:
        conn.execute("UPDATE wallets SET encrypted_pk=? WHERE user_id=? AND chain=?",
                     (encrypted_pk, user_id, chain))


def delete_wallet(user_id: int, chain: str) -> None:
    with get_conn() as conn:
        conn.execute("DELETE FROM wallets WHERE user_id=? AND chain=?", (user_id, chain))


# ── Trades ─────────────────────────────────────────────────────────────────────

def save_trade(user_id: int, chain: str, token_address: str, token_symbol: str,
               trade_type: str, amount_in: float, amount_out: float,
               price_usd: float, tx_hash: str | None, status: str,
               mode: str = "manual", signal_id: int | None = None) -> int:
    with get_conn() as conn:
        cur = conn.execute("""
            INSERT INTO trades (user_id, signal_id, chain, token_address, token_symbol,
                                trade_type, amount_in, amount_out, price_usd,
                                tx_hash, status, mode)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
        """, (user_id, signal_id, chain, token_address, token_symbol,
              trade_type, amount_in, amount_out, price_usd, tx_hash, status, mode))
        return cur.lastrowid


def get_user_trades(user_id: int, limit: int = 20) -> list[sqlite3.Row]:
    with get_conn() as conn:
        return conn.execute(
            "SELECT * FROM trades WHERE user_id=? ORDER BY created_at DESC LIMIT ?",
            (user_id, limit)).fetchall()


def update_trade_status(trade_id: int, status: str, tx_hash: str | None = None) -> None:
    with get_conn() as conn:
        conn.execute("UPDATE trades SET status=?, tx_hash=COALESCE(?,tx_hash) WHERE id=?",
                     (status, tx_hash, trade_id))


# ── Positions ──────────────────────────────────────────────────────────────────

def upsert_position(user_id: int, chain: str, token_address: str, token_symbol: str,
                    token_name: str, amount: float, buy_price_usd: float,
                    buy_amount_native: float, stop_loss_pct: float = 20,
                    take_profit_pct: float = 0) -> None:
    with get_conn() as conn:
        existing = conn.execute(
            "SELECT id, amount FROM positions WHERE user_id=? AND chain=? AND token_address=? AND status='open'",
            (user_id, chain, token_address)).fetchone()
        if existing:
            conn.execute(
                "UPDATE positions SET amount=amount+? WHERE id=?",
                (amount, existing["id"]))
        else:
            conn.execute("""
                INSERT INTO positions (user_id, chain, token_address, token_symbol, token_name,
                                       amount, buy_price_usd, buy_amount_native,
                                       stop_loss_pct, take_profit_pct)
                VALUES (?,?,?,?,?,?,?,?,?,?)
            """, (user_id, chain, token_address, token_symbol, token_name,
                  amount, buy_price_usd, buy_amount_native,
                  stop_loss_pct, take_profit_pct))


def get_open_positions(user_id: int) -> list[sqlite3.Row]:
    with get_conn() as conn:
        return conn.execute(
            "SELECT * FROM positions WHERE user_id=? AND status='open' ORDER BY opened_at DESC",
            (user_id,)).fetchall()


def get_all_open_positions_with_users() -> list[sqlite3.Row]:
    """Return all open positions joined with user info + settings — used by position monitor."""
    with get_conn() as conn:
        return conn.execute("""
            SELECT p.*,
                   u.telegram_id,
                   COALESCE(u.lang, 'ua')        AS lang,
                   COALESCE(s.tier, 'free')      AS tier,
                   COALESCE(us.auto_stop_loss, 20)   AS eff_sl,
                   COALESCE(us.auto_take_profit, 0)  AS eff_tp,
                   COALESCE(us.auto_mode, 0)         AS auto_mode,
                   w.encrypted_pk,
                   w.address AS wallet_address
            FROM positions p
            JOIN users u ON u.id = p.user_id
            LEFT JOIN subscriptions  s  ON s.user_id  = p.user_id
            LEFT JOIN user_settings  us ON us.user_id = p.user_id
            LEFT JOIN wallets        w  ON w.user_id  = p.user_id AND w.chain = p.chain
            WHERE p.status = 'open'
              AND p.buy_price_usd > 0
              AND u.banned = 0
        """).fetchall()


def close_position(position_id: int) -> None:
    with get_conn() as conn:
        conn.execute(
            "UPDATE positions SET status='closed', closed_at=datetime('now') WHERE id=?",
            (position_id,))


def close_position_with_reason(position_id: int, reason: str) -> None:
    with get_conn() as conn:
        conn.execute(
            "UPDATE positions SET status='closed', exit_reason=?, closed_at=datetime('now') WHERE id=?",
            (reason, position_id))


# ── User Settings ──────────────────────────────────────────────────────────────

def get_user_settings(user_id: int) -> sqlite3.Row | None:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM user_settings WHERE user_id=?", (user_id,)).fetchone()
    if not row:
        with get_conn() as conn:
            conn.execute("INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)", (user_id,))
        with get_conn() as conn:
            row = conn.execute("SELECT * FROM user_settings WHERE user_id=?", (user_id,)).fetchone()
    return row


def update_user_settings(user_id: int, **kwargs) -> None:
    allowed = {"auto_mode", "auto_min_score", "auto_max_buy_sol",
               "auto_max_buy_bnb", "auto_stop_loss", "auto_take_profit",
               "notify_all_tokens", "signals_push", "signal_chain",
               "signal_min_score_user"}
    fields = {k: v for k, v in kwargs.items() if k in allowed}
    if not fields:
        return
    sets = ", ".join(f"{k}=?" for k in fields)
    vals = list(fields.values()) + [user_id]
    with get_conn() as conn:
        conn.execute(f"UPDATE user_settings SET {sets}, updated_at=datetime('now') WHERE user_id=?", vals)


# ── Payments ───────────────────────────────────────────────────────────────────

def save_payment(user_id: int, tier: str, amount_usd: float,
                 invoice_id: str, invoice_url: str) -> int:
    with get_conn() as conn:
        cur = conn.execute("""
            INSERT INTO payments (user_id, tier, amount_usd, invoice_id, invoice_url)
            VALUES (?, ?, ?, ?, ?)
        """, (user_id, tier, amount_usd, invoice_id, invoice_url))
        return cur.lastrowid


def get_payment_by_invoice(invoice_id: str) -> sqlite3.Row | None:
    with get_conn() as conn:
        return conn.execute("SELECT * FROM payments WHERE invoice_id=?", (invoice_id,)).fetchone()


def get_pending_payments() -> list[sqlite3.Row]:
    with get_conn() as conn:
        return conn.execute("""
            SELECT p.*, u.telegram_id, u.first_name, u.lang
            FROM payments p JOIN users u ON u.id=p.user_id
            WHERE p.status='pending'
            ORDER BY p.created_at DESC
        """).fetchall()


def update_payment_status(payment_id: int, status: str,
                           paid_at: str | None = None) -> None:
    with get_conn() as conn:
        conn.execute(
            "UPDATE payments SET status=?, paid_at=COALESCE(?,paid_at) WHERE id=?",
            (status, paid_at, payment_id)
        )


def get_user_payments(user_id: int, limit: int = 20) -> list[sqlite3.Row]:
    with get_conn() as conn:
        return conn.execute(
            "SELECT * FROM payments WHERE user_id=? ORDER BY created_at DESC LIMIT ?",
            (user_id, limit)).fetchall()


def get_all_payments(limit: int = 50, offset: int = 0) -> list[sqlite3.Row]:
    with get_conn() as conn:
        return conn.execute("""
            SELECT p.*, u.first_name, u.username, u.telegram_id
            FROM payments p JOIN users u ON u.id=p.user_id
            ORDER BY p.created_at DESC LIMIT ? OFFSET ?
        """, (limit, offset)).fetchall()


def count_payments() -> int:
    with get_conn() as conn:
        return conn.execute("SELECT COUNT(*) FROM payments").fetchone()[0]


# ── Bot Settings ───────────────────────────────────────────────────────────────

def get_bot_setting(key: str, default: str | None = None) -> str | None:
    with get_conn() as conn:
        row = conn.execute("SELECT value FROM bot_settings WHERE key=?", (key,)).fetchone()
    return row["value"] if row else default


def set_bot_setting(key: str, value: str) -> None:
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO bot_settings (key, value, updated_at)
            VALUES (?, ?, datetime('now'))
            ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')
        """, (key, value))


def get_all_bot_settings() -> dict[str, str]:
    with get_conn() as conn:
        rows = conn.execute("SELECT key, value FROM bot_settings").fetchall()
    return {r["key"]: r["value"] for r in rows}


# ── Broadcasts ─────────────────────────────────────────────────────────────────

def create_broadcast(admin_user: str, message: str,
                     tier_filter: str | None = None) -> int:
    with get_conn() as conn:
        cur = conn.execute("""
            INSERT INTO broadcasts (admin_user, message, tier_filter)
            VALUES (?, ?, ?)
        """, (admin_user, message, tier_filter))
        return cur.lastrowid


def get_pending_broadcasts() -> list[sqlite3.Row]:
    with get_conn() as conn:
        return conn.execute(
            "SELECT * FROM broadcasts WHERE status='pending' ORDER BY created_at ASC"
        ).fetchall()


def update_broadcast_status(broadcast_id: int, status: str,
                             sent_count: int = 0) -> None:
    with get_conn() as conn:
        conn.execute("""
            UPDATE broadcasts SET status=?, sent_count=?, sent_at=datetime('now')
            WHERE id=?
        """, (status, sent_count, broadcast_id))


def get_all_broadcasts(limit: int = 30) -> list[sqlite3.Row]:
    with get_conn() as conn:
        return conn.execute(
            "SELECT * FROM broadcasts ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()


# ── Audit Log ──────────────────────────────────────────────────────────────────

def add_audit_log(admin_user: str, action: str,
                  details: str | None = None, ip: str | None = None) -> None:
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO audit_log (admin_user, action, details, ip)
            VALUES (?, ?, ?, ?)
        """, (admin_user, action, details, ip))


def get_audit_log(limit: int = 100) -> list[sqlite3.Row]:
    with get_conn() as conn:
        return conn.execute(
            "SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
