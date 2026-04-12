"""
Admin panel — Flask web app.
Features:
  - Dashboard with live stats
  - Users with detail page, ban/unban, manual tier change
  - Signals / Trades / Positions
  - Subscriptions management
  - Payments history
  - Bot settings (hot-editable)
  - Broadcast messages to all / by tier
  - Audit log
  - CSRF protection + rate-limited login
  - Optional TOTP 2FA (set ADMIN_TOTP_SECRET env var)
"""
import os
import sys
import time
import secrets
import functools
import datetime as _dt

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from flask import (
    Flask, render_template, request, redirect,
    url_for, session, flash, jsonify,
)
import database as db

app = Flask(__name__)
app.secret_key      = os.getenv("ADMIN_SECRET_KEY", secrets.token_hex(32))
app.permanent_session_lifetime = _dt.timedelta(minutes=30)

# ── Config ─────────────────────────────────────────────────────────────────────
ADMIN_USER        = os.getenv("ADMIN_USER",        "admin")
ADMIN_PASSWORD    = os.getenv("ADMIN_PASSWORD",    "changeme")
ADMIN_TOTP_SECRET = os.getenv("ADMIN_TOTP_SECRET", "")   # optional TOTP

_login_attempts: dict[str, list[float]] = {}


# ── Template filters ──────────────────────────────────────────────────────────

@app.template_filter("format_ts")
def format_ts(ts) -> str:
    try:
        return _dt.datetime.utcfromtimestamp(int(ts)).strftime("%d.%m.%Y %H:%M")
    except Exception:
        return "—"


@app.context_processor
def inject_globals():
    today = _dt.date.today().isoformat()
    lang  = session.get("admin_lang", "ua")
    return {
        "now_ts": time.time(),
        "today": today,
        "totp_enabled": bool(ADMIN_TOTP_SECRET),
        "lang": lang,
        "UI": _UI.get(lang, _UI["ua"]),
    }


# ── Admin UI translations ─────────────────────────────────────────────────────

_UI = {
    "ua": {
        # Sidebar
        "nav_main":          "Основне",
        "nav_trading":       "Торгівля",
        "nav_management":    "Управління",
        "nav_dashboard":     "Dashboard",
        "nav_users":         "Користувачі",
        "nav_subscriptions": "Підписки",
        "nav_payments":      "Платежі",
        "nav_signals":       "Сигнали",
        "nav_trades":        "Угоди",
        "nav_positions":     "Позиції",
        "nav_broadcast":     "Розсилка",
        "nav_settings":      "Налаштування",
        "nav_audit":         "Аудит",
        "nav_logout":        "Вийти",
        # Common
        "actions":           "Дії",
        "user":              "Користувач",
        "status":            "Статус",
        "tier":              "Тариф",
        "date":              "Дата",
        "save":              "Зберегти",
        "cancel":            "Скасувати",
        "search":            "Пошук",
        "ban":               "Заблокувати",
        "unban":             "Розблокувати",
        "all_tiers":         "Всі тарифи",
        "all_chains":        "Всі ланцюги",
        "all_statuses":      "Всі статуси",
        # Dashboard
        "db_title":          "Dashboard",
        "db_users":          "Користувачів",
        "db_signals_today":  "Сигналів сьогодні",
        "db_active_subs":    "Активних підписок",
        "db_open_pos":       "Відкритих позицій",
        "db_revenue":        "Дохід (USD)",
        "db_trades":         "Угод усього",
        # Users
        "users_title":       "Користувачі",
        "users_id":          "ID",
        "users_name":        "Ім'я",
        "users_username":    "Username",
        "users_lang":        "Мова",
        "users_registered":  "Реєстрація",
        "users_signals":     "Сигналів",
        # Settings
        "settings_title":    "Налаштування бота",
        "settings_key":      "Ключ",
        "settings_value":    "Значення",
        "settings_saved":    "Збережено",
        # Signals
        "signals_title":     "Сигнали",
        "sig_chain":         "Ланцюг",
        "sig_token":         "Токен",
        "sig_score":         "Скор",
        "sig_type":          "Тип",
        "sig_liq":           "Ліквідність",
        "sig_vol":           "Обсяг 1г",
        "sig_chg":           "Зміна",
        # Positions
        "pos_title":         "Позиції",
        "pos_token":         "Токен",
        "pos_amount":        "Кількість",
        "pos_buy_price":     "Ціна купівлі",
        "pos_sl":            "Stop-loss",
        "pos_opened":        "Відкрито",
        # Trades
        "trades_title":      "Угоди",
        "trades_type":       "Тип",
        "trades_amount":     "Сума",
        "trades_status":     "Статус",
        "trades_tx":         "TX Hash",
    },
    "en": {
        # Sidebar
        "nav_main":          "Main",
        "nav_trading":       "Trading",
        "nav_management":    "Management",
        "nav_dashboard":     "Dashboard",
        "nav_users":         "Users",
        "nav_subscriptions": "Subscriptions",
        "nav_payments":      "Payments",
        "nav_signals":       "Signals",
        "nav_trades":        "Trades",
        "nav_positions":     "Positions",
        "nav_broadcast":     "Broadcast",
        "nav_settings":      "Settings",
        "nav_audit":         "Audit",
        "nav_logout":        "Logout",
        # Common
        "actions":           "Actions",
        "user":              "User",
        "status":            "Status",
        "tier":              "Tier",
        "date":              "Date",
        "save":              "Save",
        "cancel":            "Cancel",
        "search":            "Search",
        "ban":               "Ban",
        "unban":             "Unban",
        "all_tiers":         "All tiers",
        "all_chains":        "All chains",
        "all_statuses":      "All statuses",
        # Dashboard
        "db_title":          "Dashboard",
        "db_users":          "Users",
        "db_signals_today":  "Signals today",
        "db_active_subs":    "Active subscriptions",
        "db_open_pos":       "Open positions",
        "db_revenue":        "Revenue (USD)",
        "db_trades":         "Total trades",
        # Users
        "users_title":       "Users",
        "users_id":          "ID",
        "users_name":        "Name",
        "users_username":    "Username",
        "users_lang":        "Language",
        "users_registered":  "Registered",
        "users_signals":     "Signals",
        # Settings
        "settings_title":    "Bot Settings",
        "settings_key":      "Key",
        "settings_value":    "Value",
        "settings_saved":    "Saved",
        # Signals
        "signals_title":     "Signals",
        "sig_chain":         "Chain",
        "sig_token":         "Token",
        "sig_score":         "Score",
        "sig_type":          "Type",
        "sig_liq":           "Liquidity",
        "sig_vol":           "Vol 1h",
        "sig_chg":           "Change",
        # Positions
        "pos_title":         "Positions",
        "pos_token":         "Token",
        "pos_amount":        "Amount",
        "pos_buy_price":     "Buy price",
        "pos_sl":            "Stop-loss",
        "pos_opened":        "Opened",
        # Trades
        "trades_title":      "Trades",
        "trades_type":       "Type",
        "trades_amount":     "Amount",
        "trades_status":     "Status",
        "trades_tx":         "TX Hash",
    },
}


# ── Security helpers ───────────────────────────────────────────────────────────

def _rate_limited(ip: str, limit: int = 5, window: int = 60) -> bool:
    now = time.time()
    attempts = [t for t in _login_attempts.get(ip, []) if now - t < window]
    if len(attempts) >= limit:
        _login_attempts[ip] = attempts
        return True
    attempts.append(now)
    _login_attempts[ip] = attempts
    return False


def _verify_totp(code: str) -> bool:
    if not ADMIN_TOTP_SECRET:
        return True
    try:
        import pyotp
        return pyotp.TOTP(ADMIN_TOTP_SECRET).verify(code, valid_window=1)
    except Exception:
        return False


def login_required(f):
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        if not session.get("logged_in"):
            return redirect(url_for("login"))
        # Session timeout: refresh on activity
        session.modified = True
        return f(*args, **kwargs)
    return decorated


def _audit(action: str, details: str | None = None) -> None:
    admin_user = session.get("admin_user", "admin")
    ip = request.remote_addr or "unknown"
    db.add_audit_log(admin_user, action, details, ip)


def _csrf_token() -> str:
    token = secrets.token_hex(32)
    session["csrf"] = token
    return token


def _check_csrf() -> bool:
    form_token = request.form.get("csrf_token", "")
    sess_token = session.pop("csrf", "")
    return bool(sess_token and secrets.compare_digest(form_token, sess_token))


# ── Language switch ───────────────────────────────────────────────────────────

@app.route("/set_lang/<lang>")
@login_required
def set_lang(lang: str):
    if lang in ("ua", "en"):
        session["admin_lang"] = lang
    return redirect(request.referrer or url_for("dashboard"))


# ── Auth ────────────────────────────────────────────────────────────────────────

@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "GET":
        return render_template("login.html", csrf_token=_csrf_token(),
                               totp_required=bool(ADMIN_TOTP_SECRET))

    ip = request.remote_addr or "unknown"
    if _rate_limited(ip):
        flash("Забагато спроб. Зачекайте хвилину. / Too many attempts.")
        return render_template("login.html", csrf_token=_csrf_token(),
                               totp_required=bool(ADMIN_TOTP_SECRET)), 429

    if not _check_csrf():
        flash("Невалідний запит / Invalid request.")
        return render_template("login.html", csrf_token=_csrf_token(),
                               totp_required=bool(ADMIN_TOTP_SECRET)), 403

    username = request.form.get("username", "")
    password = request.form.get("password", "")
    totp_code = request.form.get("totp_code", "")

    if not (secrets.compare_digest(username, ADMIN_USER) and
            secrets.compare_digest(password, ADMIN_PASSWORD)):
        flash("Невірний логін або пароль / Wrong credentials")
        db.add_audit_log(username or "?", "login_failed", f"ip={ip}", ip)
        return render_template("login.html", csrf_token=_csrf_token(),
                               totp_required=bool(ADMIN_TOTP_SECRET))

    if ADMIN_TOTP_SECRET and not _verify_totp(totp_code):
        flash("Невірний TOTP код / Invalid TOTP code")
        db.add_audit_log(username, "totp_failed", f"ip={ip}", ip)
        return render_template("login.html", csrf_token=_csrf_token(),
                               totp_required=True)

    session.permanent = True
    session["logged_in"]   = True
    session["admin_user"]  = username
    db.add_audit_log(username, "login_ok", f"ip={ip}", ip)
    return redirect(url_for("dashboard"))


@app.route("/logout")
def logout():
    if session.get("logged_in"):
        _audit("logout")
    session.clear()
    return redirect(url_for("login"))


# ── Dashboard ───────────────────────────────────────────────────────────────────

@app.route("/")
@login_required
def dashboard():
    with db.get_conn() as conn:
        stats = {
            "total_users":    conn.execute("SELECT COUNT(*) FROM users").fetchone()[0],
            "banned_users":   conn.execute("SELECT COUNT(*) FROM users WHERE banned=1").fetchone()[0],
            "with_wallet":    conn.execute("SELECT COUNT(DISTINCT user_id) FROM wallets").fetchone()[0],
            "with_pk":        conn.execute(
                "SELECT COUNT(DISTINCT user_id) FROM wallets WHERE encrypted_pk IS NOT NULL"
            ).fetchone()[0],
            "auto_mode_on":   conn.execute(
                "SELECT COUNT(*) FROM user_settings WHERE auto_mode=1"
            ).fetchone()[0],
            "signals_today":  conn.execute(
                "SELECT COUNT(*) FROM signals WHERE date(created_at)=date('now')"
            ).fetchone()[0],
            "signals_total":  conn.execute("SELECT COUNT(*) FROM signals").fetchone()[0],
            "trades_today":   conn.execute(
                "SELECT COUNT(*) FROM trades WHERE date(created_at)=date('now')"
            ).fetchone()[0],
            "trades_total":   conn.execute("SELECT COUNT(*) FROM trades").fetchone()[0],
            "open_positions": conn.execute(
                "SELECT COUNT(*) FROM positions WHERE status='open'"
            ).fetchone()[0],
            "subs_basic":     conn.execute(
                "SELECT COUNT(*) FROM subscriptions WHERE tier='basic' AND status='active'"
            ).fetchone()[0],
            "subs_pro":       conn.execute(
                "SELECT COUNT(*) FROM subscriptions WHERE tier='pro' AND status='active'"
            ).fetchone()[0],
            "revenue_total":  conn.execute(
                "SELECT COALESCE(SUM(amount_usd),0) FROM payments WHERE status='paid'"
            ).fetchone()[0],
            "revenue_today":  conn.execute(
                "SELECT COALESCE(SUM(amount_usd),0) FROM payments WHERE status='paid' AND date(paid_at)=date('now')"
            ).fetchone()[0],
            "payments_pending": conn.execute(
                "SELECT COUNT(*) FROM payments WHERE status='pending'"
            ).fetchone()[0],
        }

        signal_breakdown = conn.execute("""
            SELECT signal_type, COUNT(*) as cnt
            FROM signals WHERE date(created_at)=date('now')
            GROUP BY signal_type ORDER BY cnt DESC
        """).fetchall()

        recent_signals = conn.execute(
            "SELECT * FROM signals ORDER BY created_at DESC LIMIT 10"
        ).fetchall()

        recent_users = conn.execute("""
            SELECT u.*, COALESCE(s.tier,'free') as tier,
                   (SELECT COUNT(*) FROM wallets w WHERE w.user_id=u.id) as wallet_count
            FROM users u
            LEFT JOIN subscriptions s ON s.user_id=u.id
            ORDER BY u.created_at DESC LIMIT 10
        """).fetchall()

        recent_trades = conn.execute("""
            SELECT t.*, u.first_name, u.username
            FROM trades t JOIN users u ON u.id=t.user_id
            ORDER BY t.created_at DESC LIMIT 10
        """).fetchall()

        recent_payments = conn.execute("""
            SELECT p.*, u.first_name, u.username
            FROM payments p JOIN users u ON u.id=p.user_id
            ORDER BY p.created_at DESC LIMIT 5
        """).fetchall()

    return render_template("dashboard.html",
                           stats=stats,
                           signal_breakdown=signal_breakdown,
                           recent_signals=recent_signals,
                           recent_users=recent_users,
                           recent_trades=recent_trades,
                           recent_payments=recent_payments)


# ── Users ────────────────────────────────────────────────────────────────────────

@app.route("/users")
@login_required
def users():
    page     = max(1, request.args.get("page", 1, type=int))
    search   = request.args.get("q", "").strip()
    tier_f   = request.args.get("tier", "")
    per_page = 25
    offset   = (page - 1) * per_page

    where_parts, params = [], []
    if search:
        where_parts.append("(u.first_name LIKE ? OR u.username LIKE ? OR u.telegram_id=?)")
        like = f"%{search}%"
        params += [like, like, search]
    if tier_f:
        where_parts.append("COALESCE(s.tier,'free')=?")
        params.append(tier_f)
    where = ("WHERE " + " AND ".join(where_parts)) if where_parts else ""

    with db.get_conn() as conn:
        total = conn.execute(f"""
            SELECT COUNT(*) FROM users u
            LEFT JOIN subscriptions s ON s.user_id=u.id
            {where}
        """, params).fetchone()[0]

        rows = conn.execute(f"""
            SELECT u.*,
                   COALESCE(s.tier,'free') as tier,
                   s.expires_at,
                   COALESCE(us.auto_mode,0) as auto_mode,
                   (SELECT COUNT(*) FROM wallets w WHERE w.user_id=u.id) as wallets,
                   (SELECT COUNT(*) FROM wallets w WHERE w.user_id=u.id
                    AND w.encrypted_pk IS NOT NULL) as has_pk,
                   (SELECT COUNT(*) FROM trades t WHERE t.user_id=u.id) as trades_count,
                   (SELECT COUNT(*) FROM positions p WHERE p.user_id=u.id
                    AND p.status='open') as open_positions
            FROM users u
            LEFT JOIN subscriptions s ON s.user_id=u.id
            LEFT JOIN user_settings us ON us.user_id=u.id
            {where}
            ORDER BY u.created_at DESC
            LIMIT ? OFFSET ?
        """, params + [per_page, offset]).fetchall()

    return render_template("users.html", users=rows, page=page,
                           total=total, per_page=per_page,
                           search=search, tier_f=tier_f,
                           csrf_token=_csrf_token())


@app.route("/users/<int:uid>")
@login_required
def user_detail(uid: int):
    user = db.get_user_by_id(uid)
    if not user:
        flash("Користувача не знайдено.")
        return redirect(url_for("users"))

    with db.get_conn() as conn:
        sub      = conn.execute("SELECT * FROM subscriptions WHERE user_id=?", (uid,)).fetchone()
        settings = conn.execute("SELECT * FROM user_settings WHERE user_id=?", (uid,)).fetchone()
        wallets  = conn.execute("SELECT * FROM wallets WHERE user_id=?", (uid,)).fetchall()
        trades   = conn.execute(
            "SELECT * FROM trades WHERE user_id=? ORDER BY created_at DESC LIMIT 20", (uid,)
        ).fetchall()
        positions = conn.execute(
            "SELECT * FROM positions WHERE user_id=? ORDER BY opened_at DESC LIMIT 20", (uid,)
        ).fetchall()
        payments = conn.execute(
            "SELECT * FROM payments WHERE user_id=? ORDER BY created_at DESC LIMIT 10", (uid,)
        ).fetchall()
        signals_sent = conn.execute(
            "SELECT COUNT(*) FROM signal_sends WHERE user_id=?", (uid,)
        ).fetchone()[0]

    return render_template("user_detail.html",
                           user=user, sub=sub, settings=settings,
                           wallets=wallets, trades=trades,
                           positions=positions, payments=payments,
                           signals_sent=signals_sent,
                           csrf_token=_csrf_token())


@app.route("/users/<int:uid>/set_tier", methods=["POST"])
@login_required
def user_set_tier(uid: int):
    if not _check_csrf():
        flash("CSRF error.")
        return redirect(url_for("user_detail", uid=uid))

    tier = request.form.get("tier", "free")
    days = int(request.form.get("days", 30))

    if tier == "free":
        db.set_user_tier(uid, "free")
        _audit("set_tier", f"uid={uid} tier=free")
    else:
        from datetime import datetime, timezone, timedelta
        expires = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()
        db.set_user_tier_with_expiry(uid, tier, expires)
        _audit("set_tier", f"uid={uid} tier={tier} days={days} expires={expires[:10]}")

    flash(f"Тариф змінено на {tier.upper()}.")
    return redirect(url_for("user_detail", uid=uid))


@app.route("/users/<int:uid>/ban", methods=["POST"])
@login_required
def user_ban(uid: int):
    if not _check_csrf():
        flash("CSRF error.")
        return redirect(url_for("user_detail", uid=uid))
    db.ban_user(uid)
    _audit("ban_user", f"uid={uid}")
    flash("Користувача заблоковано.")
    return redirect(url_for("user_detail", uid=uid))


@app.route("/users/<int:uid>/unban", methods=["POST"])
@login_required
def user_unban(uid: int):
    if not _check_csrf():
        flash("CSRF error.")
        return redirect(url_for("user_detail", uid=uid))
    db.unban_user(uid)
    _audit("unban_user", f"uid={uid}")
    flash("Користувача розблоковано.")
    return redirect(url_for("user_detail", uid=uid))


# ── Signals ────────────────────────────────────────────────────────────────────

@app.route("/signals")
@login_required
def signals():
    chain    = request.args.get("chain", "")
    sig_type = request.args.get("type", "")
    page     = max(1, request.args.get("page", 1, type=int))
    per_page = 30
    offset   = (page - 1) * per_page

    filters_sql, params = [], []
    if chain:
        filters_sql.append("chain=?"); params.append(chain)
    if sig_type:
        filters_sql.append("signal_type=?"); params.append(sig_type)
    where = ("WHERE " + " AND ".join(filters_sql)) if filters_sql else ""

    with db.get_conn() as conn:
        total = conn.execute(f"SELECT COUNT(*) FROM signals {where}", params).fetchone()[0]
        rows  = conn.execute(
            f"SELECT * FROM signals {where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
            params + [per_page, offset]
        ).fetchall()

    return render_template("signals.html", signals=rows, page=page,
                           total=total, per_page=per_page,
                           chain=chain, sig_type=sig_type)


# ── Trades ─────────────────────────────────────────────────────────────────────

@app.route("/trades")
@login_required
def trades():
    page     = max(1, request.args.get("page", 1, type=int))
    per_page = 30
    offset   = (page - 1) * per_page
    status_f = request.args.get("status", "")
    pnl_f    = request.args.get("pnl", "")

    where_parts, params = [], []
    if status_f in ("open", "closed"):
        where_parts.append("t.status=?")
        params.append(status_f)
    if pnl_f == "profit":
        where_parts.append("COALESCE(t.pnl_usd, 0) > 0")
    elif pnl_f == "loss":
        where_parts.append("COALESCE(t.pnl_usd, 0) <= 0")
    where_sql = ("WHERE " + " AND ".join(where_parts)) if where_parts else ""

    with db.get_conn() as conn:
        total = conn.execute(f"SELECT COUNT(*) FROM trades t {where_sql}", params).fetchone()[0]
        rows  = conn.execute(f"""
            SELECT t.*, u.first_name, u.username
            FROM trades t JOIN users u ON u.id=t.user_id
            {where_sql}
            ORDER BY COALESCE(t.closed_at, t.created_at) DESC LIMIT ? OFFSET ?
        """, params + [per_page, offset]).fetchall()

    return render_template("trades.html", trades=rows, page=page,
                           total=total, per_page=per_page,
                           status_f=status_f, pnl_f=pnl_f)


# ── Positions ──────────────────────────────────────────────────────────────────

@app.route("/positions")
@login_required
def positions():
    with db.get_conn() as conn:
        rows = conn.execute("""
            SELECT p.*, u.first_name, u.username
            FROM positions p JOIN users u ON u.id=p.user_id
            WHERE p.status='open'
            ORDER BY p.opened_at DESC
        """).fetchall()
    return render_template("positions.html", positions=rows)


# ── Subscriptions ──────────────────────────────────────────────────────────────

@app.route("/subscriptions")
@login_required
def subscriptions():
    tier_f   = request.args.get("tier", "")
    status_f = request.args.get("status", "")
    page     = max(1, request.args.get("page", 1, type=int))
    per_page = 30
    offset   = (page - 1) * per_page

    where_parts, params = [], []
    if tier_f:
        where_parts.append("s.tier=?"); params.append(tier_f)
    if status_f:
        where_parts.append("s.status=?"); params.append(status_f)
    where = ("WHERE " + " AND ".join(where_parts)) if where_parts else ""

    with db.get_conn() as conn:
        total = conn.execute(f"SELECT COUNT(*) FROM subscriptions s {where}", params).fetchone()[0]
        rows  = conn.execute(f"""
            SELECT s.*, u.first_name, u.username, u.telegram_id, u.banned
            FROM subscriptions s JOIN users u ON u.id=s.user_id
            {where}
            ORDER BY s.updated_at DESC LIMIT ? OFFSET ?
        """, params + [per_page, offset]).fetchall()

        tier_stats = conn.execute("""
            SELECT tier, COUNT(*) as cnt
            FROM subscriptions
            GROUP BY tier ORDER BY cnt DESC
        """).fetchall()

    return render_template("subscriptions.html", subs=rows, page=page,
                           total=total, per_page=per_page,
                           tier_f=tier_f, status_f=status_f,
                           tier_stats=tier_stats)


# ── Payments ───────────────────────────────────────────────────────────────────

@app.route("/payments")
@login_required
def payments():
    status_f = request.args.get("status", "")
    page     = max(1, request.args.get("page", 1, type=int))
    per_page = 30
    offset   = (page - 1) * per_page

    where_parts, params = [], []
    if status_f:
        where_parts.append("p.status=?"); params.append(status_f)
    where = ("WHERE " + " AND ".join(where_parts)) if where_parts else ""

    with db.get_conn() as conn:
        total = conn.execute(f"SELECT COUNT(*) FROM payments p {where}", params).fetchone()[0]
        rows  = conn.execute(f"""
            SELECT p.*, u.first_name, u.username, u.telegram_id
            FROM payments p JOIN users u ON u.id=p.user_id
            {where}
            ORDER BY p.created_at DESC LIMIT ? OFFSET ?
        """, params + [per_page, offset]).fetchall()

        revenue = conn.execute(
            "SELECT COALESCE(SUM(amount_usd),0) FROM payments WHERE status='paid'"
        ).fetchone()[0]

        by_tier = conn.execute("""
            SELECT tier, COUNT(*) as cnt, COALESCE(SUM(amount_usd),0) as total
            FROM payments WHERE status='paid'
            GROUP BY tier
        """).fetchall()

    return render_template("payments.html", payments=rows, page=page,
                           total=total, per_page=per_page,
                           status_f=status_f, revenue=revenue, by_tier=by_tier)


# ── Bot Settings ───────────────────────────────────────────────────────────────

_SETTINGS_META = {
    "free_min_score":      ("🆓 Free: мін. score",    "int",   "0–100"),
    "basic_min_score":     ("💳 Basic: мін. score",   "int",   "0–100"),
    "pro_min_score":       ("🚀 Pro: мін. score",     "int",   "0–100"),
    "free_daily_signals":  ("🆓 Free: сигналів/день", "int",   "0=∞"),
    "basic_daily_signals": ("💳 Basic: сигналів/день","int",   "0=∞"),
    "pro_daily_signals":   ("🚀 Pro: сигналів/день",  "int",   "0=∞"),
    "basic_price_usd":     ("Basic ціна ($)",          "float", ""),
    "pro_price_usd":       ("Pro ціна ($)",            "float", ""),
    "basic_duration_days": ("Basic тривалість (днів)", "int",   ""),
    "pro_duration_days":   ("Pro тривалість (днів)",   "int",   ""),
    "maintenance_mode":    ("Maintenance mode (0/1)",  "int",   "1=стоп"),
}


@app.route("/settings", methods=["GET", "POST"])
@login_required
def settings():
    if request.method == "POST":
        if not _check_csrf():
            flash("CSRF error.")
            return redirect(url_for("settings"))

        changes = []
        for key in _SETTINGS_META:
            val = request.form.get(key, "").strip()
            if val:
                db.set_bot_setting(key, val)
                changes.append(f"{key}={val}")

        if changes:
            _audit("update_settings", "; ".join(changes))
            flash("Налаштування збережено!")
        return redirect(url_for("settings"))

    current = db.get_all_bot_settings()
    env_vars = {
        "telegram":   bool(os.getenv("TELEGRAM_TOKEN")),
        "cryptobot":  bool(os.getenv("CRYPTOBOT_TOKEN")),
        "encryption": bool(os.getenv("ENCRYPTION_KEY")),
        "totp":       bool(ADMIN_TOTP_SECRET),
        "solana_rpc": bool(os.getenv("SOLANA_RPC")),
        "bsc_rpc":    bool(os.getenv("BSC_RPC")),
    }
    return render_template("settings.html",
                           settings=current,
                           meta=_SETTINGS_META,
                           env_vars=env_vars,
                           csrf_token=_csrf_token())


# ── Broadcast ──────────────────────────────────────────────────────────────────

@app.route("/broadcast", methods=["GET", "POST"])
@login_required
def broadcast():
    if request.method == "POST":
        if not _check_csrf():
            flash("CSRF error.")
            return redirect(url_for("broadcast"))

        message = request.form.get("message", "").strip()
        tier_filter = request.form.get("tier_filter", "") or None

        if not message:
            flash("Повідомлення не може бути порожнім.")
            return redirect(url_for("broadcast"))

        if len(message) > 4096:
            flash("Повідомлення занадто довге (макс. 4096 символів).")
            return redirect(url_for("broadcast"))

        bcast_id = db.create_broadcast(
            session.get("admin_user", "admin"),
            message,
            tier_filter
        )
        _audit("create_broadcast", f"id={bcast_id} tier={tier_filter or 'all'} len={len(message)}")
        flash(f"Розсилку #{bcast_id} поставлено в чергу. Бот надішле протягом 30 секунд.")
        return redirect(url_for("broadcast"))

    with db.get_conn() as conn:
        user_counts = {
            "all":   conn.execute("SELECT COUNT(*) FROM users WHERE banned=0").fetchone()[0],
            "free":  conn.execute(
                "SELECT COUNT(*) FROM users u JOIN subscriptions s ON s.user_id=u.id "
                "WHERE s.tier='free' AND u.banned=0"
            ).fetchone()[0],
            "basic": conn.execute(
                "SELECT COUNT(*) FROM users u JOIN subscriptions s ON s.user_id=u.id "
                "WHERE s.tier='basic' AND s.status='active' AND u.banned=0"
            ).fetchone()[0],
            "pro":   conn.execute(
                "SELECT COUNT(*) FROM users u JOIN subscriptions s ON s.user_id=u.id "
                "WHERE s.tier='pro' AND s.status='active' AND u.banned=0"
            ).fetchone()[0],
        }

    history = db.get_all_broadcasts(limit=20)

    return render_template("broadcast.html",
                           user_counts=user_counts,
                           history=history,
                           csrf_token=_csrf_token())


# ── Audit Log ──────────────────────────────────────────────────────────────────

@app.route("/audit")
@login_required
def audit():
    logs = db.get_audit_log(limit=200)
    return render_template("audit.html", logs=logs)


# ── API: quick stats for dashboard refresh ─────────────────────────────────────

@app.route("/api/stats")
@login_required
def api_stats():
    with db.get_conn() as conn:
        return jsonify({
            "total_users":      conn.execute("SELECT COUNT(*) FROM users").fetchone()[0],
            "signals_today":    conn.execute(
                "SELECT COUNT(*) FROM signals WHERE date(created_at)=date('now')"
            ).fetchone()[0],
            "payments_pending": conn.execute(
                "SELECT COUNT(*) FROM payments WHERE status='pending'"
            ).fetchone()[0],
            "open_positions":   conn.execute(
                "SELECT COUNT(*) FROM positions WHERE status='open'"
            ).fetchone()[0],
        })


if __name__ == "__main__":
    db.init_db()
    port = int(os.getenv("PORT", 8080))
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True, use_reloader=False)
