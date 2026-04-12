"""All user-facing strings for Crypto Sniper Bot (UA / EN)."""

UA = 'ua'
EN = 'en'

_T: dict[str, dict[str, str]] = {

    # ── /start ──────────────────────────────────────────────────────────────
    'start': {
        UA: (
            "Вітаю, {name}! 👋\n\n"
            "🎯 <b>Crypto Sniper Bot</b>\n"
            "Торгуй мем-коїнами Solana і BNB Chain прямо з Telegram.\n\n"
            "<b>Що вміє бот:</b>\n"
            "• Сканує нові токени кожну хвилину\n"
            "• Перевіряє безпеку (rug pull, honeypot)\n"
            "• Скорить токени 0–100 за 10+ параметрами\n"
            "• Купує/продає автоматично або вручну\n"
            "• Відстежує відкриті позиції\n\n"
            "👇 Обери дію:"
        ),
        EN: (
            "Hello, {name}! 👋\n\n"
            "🎯 <b>Crypto Sniper Bot</b>\n"
            "Trade memecoins on Solana & BNB Chain directly from Telegram.\n\n"
            "<b>What the bot does:</b>\n"
            "• Scans new tokens every minute\n"
            "• Checks safety (rug pull, honeypot)\n"
            "• Scores tokens 0–100 by 10+ parameters\n"
            "• Buys/sells automatically or manually\n"
            "• Tracks open positions\n\n"
            "👇 Choose an action:"
        ),
    },

    # ── /help ────────────────────────────────────────────────────────────────
    'help': {
        UA: (
            "<b>Як користуватись ботом:</b>\n\n"
            "/start — головне меню\n"
            "/status — твій статус і гаманці\n"
            "/plans — тарифи\n"
            "/language — змінити мову\n\n"
            "<b>Через меню:</b>\n"
            "👛 Гаманець — підключи Solana або BNB гаманець\n"
            "💰 Баланс — переглянь SOL/BNB та токени\n"
            "📡 Сигнали — останні сигнали з кнопками купівлі\n"
            "📦 Позиції — відкриті позиції\n"
            "🤖 Авто-трейд — автоматична торгівля\n"
            "📋 Угоди — історія угод\n\n"
            "<b>Типи сигналів:</b>\n"
            "🟢 STRONG BUY — score 85–100\n"
            "🟡 BUY         — score 70–84\n"
            "👀 WATCH       — score 55–69\n\n"
            "⚠️ <i>Не є фінансовою порадою. DYOR.</i>"
        ),
        EN: (
            "<b>How to use the bot:</b>\n\n"
            "/start — main menu\n"
            "/status — your status & wallets\n"
            "/plans — subscription plans\n"
            "/language — change language\n\n"
            "<b>Via menu:</b>\n"
            "👛 Wallet — connect Solana or BNB wallet\n"
            "💰 Balance — view SOL/BNB and tokens\n"
            "📡 Signals — latest signals with buy buttons\n"
            "📦 Positions — open positions\n"
            "🤖 Auto-trade — automated trading\n"
            "📋 Trades — trade history\n\n"
            "<b>Signal types:</b>\n"
            "🟢 STRONG BUY — score 85–100\n"
            "🟡 BUY         — score 70–84\n"
            "👀 WATCH       — score 55–69\n\n"
            "⚠️ <i>Not financial advice. DYOR.</i>"
        ),
    },

    # ── /status ──────────────────────────────────────────────────────────────
    'status_full': {
        UA: (
            "📊 <b>Твій статус</b>\n\n"
            "<b>Гаманці:</b>\n{wallets}\n\n"
            "📨 Сигналів сьогодні: <b>{signals_today}</b>\n"
            "📦 Відкритих позицій: <b>{positions}</b>\n"
            "🤖 Авто-трейд: <b>{auto}</b>\n"
            "💎 Тариф: <b>{tier}</b>"
        ),
        EN: (
            "📊 <b>Your status</b>\n\n"
            "<b>Wallets:</b>\n{wallets}\n\n"
            "📨 Signals today: <b>{signals_today}</b>\n"
            "📦 Open positions: <b>{positions}</b>\n"
            "🤖 Auto-trade: <b>{auto}</b>\n"
            "💎 Plan: <b>{tier}</b>"
        ),
    },
    'status_no_wallet': {UA: '  (немає гаманців)', EN: '  (no wallets)'},

    # ── /plans ───────────────────────────────────────────────────────────────
    'plans': {
        UA: (
            "<b>Тарифи Crypto Sniper Bot</b>\n\n"
            "🆓 <b>Free</b> — безкоштовно\n"
            "  • Тільки STRONG BUY (score 85+)\n"
            "  • Максимум 3 сигнали/день\n\n"
            "💳 <b>Basic</b> — ${basic_price}/{basic_days}д\n"
            "  • STRONG BUY + BUY (score 70+)\n"
            "  • 20 сигналів/день\n\n"
            "🚀 <b>Pro</b> — ${pro_price}/{pro_days}д\n"
            "  • Всі сигнали (score 55+)\n"
            "  • Необмежено сигналів\n"
            "  • Пріоритетна доставка\n\n"
            "📌 Ваш тариф: <b>{current_tier}</b>\n\n"
            "💰 Приймаємо: USDT, TON, BTC, ETH"
        ),
        EN: (
            "<b>Crypto Sniper Bot Plans</b>\n\n"
            "🆓 <b>Free</b> — free forever\n"
            "  • STRONG BUY only (score 85+)\n"
            "  • Max 3 signals/day\n\n"
            "💳 <b>Basic</b> — ${basic_price}/{basic_days}d\n"
            "  • STRONG BUY + BUY (score 70+)\n"
            "  • 20 signals/day\n\n"
            "🚀 <b>Pro</b> — ${pro_price}/{pro_days}d\n"
            "  • All signals (score 55+)\n"
            "  • Unlimited signals\n"
            "  • Priority delivery\n\n"
            "📌 Your plan: <b>{current_tier}</b>\n\n"
            "💰 Accepted: USDT, TON, BTC, ETH"
        ),
    },
    'plans_coming_soon': {
        UA: '',
        EN: '',
    },
    'plan_my_payments': {UA: '📋 Мої платежі', EN: '📋 My payments'},

    # ── Payments ──────────────────────────────────────────────────────────────
    'pay_creating': {
        UA: '⏳ Створюю рахунок для оплати...',
        EN: '⏳ Creating payment invoice...',
    },
    'pay_error': {
        UA: '❌ Помилка створення рахунку. Спробуй пізніше або зверніться до підтримки.',
        EN: '❌ Failed to create invoice. Try later or contact support.',
    },
    'pay_not_configured': {
        UA: '❌ Оплата тимчасово недоступна. Зверніться до адміністратора.',
        EN: '❌ Payments temporarily unavailable. Contact admin.',
    },
    'pay_maintenance': {
        UA: '🔧 Бот на технічному обслуговуванні. Спробуй пізніше.',
        EN: '🔧 Bot is under maintenance. Try later.',
    },
    'pay_invoice': {
        UA: (
            "💳 <b>Рахунок для оплати</b>\n\n"
            "Тариф: <b>{tier}</b>\n"
            "Сума: <b>${price} USDT</b>\n"
            "Дійсний: <b>{days} днів</b>\n\n"
            "📋 ID рахунку: <code>{inv_id}</code>\n\n"
            "⚡ Натисни <b>Оплатити</b> для переходу до CryptoBot.\n"
            "Рахунок дійсний <b>24 години</b>.\n"
            "Після оплати підписка активується <b>автоматично</b>."
        ),
        EN: (
            "💳 <b>Payment Invoice</b>\n\n"
            "Plan: <b>{tier}</b>\n"
            "Amount: <b>${price} USDT</b>\n"
            "Duration: <b>{days} days</b>\n\n"
            "📋 Invoice ID: <code>{inv_id}</code>\n\n"
            "⚡ Tap <b>Pay</b> to go to CryptoBot.\n"
            "Invoice valid for <b>24 hours</b>.\n"
            "Subscription activates <b>automatically</b> after payment."
        ),
    },
    'pay_btn_pay':   {UA: '💰 Оплатити через CryptoBot', EN: '💰 Pay via CryptoBot'},
    'pay_btn_check': {UA: '🔄 Перевірити оплату',        EN: '🔄 Check payment'},
    'pay_pending': {
        UA: (
            "⏳ <b>Очікуємо оплату...</b>\n\n"
            "Якщо ти вже оплатив — натисни <b>Перевірити</b>.\n"
            "Зазвичай підтверджується за 1-2 хвилини."
        ),
        EN: (
            "⏳ <b>Waiting for payment...</b>\n\n"
            "If you already paid — tap <b>Check</b>.\n"
            "Usually confirms within 1-2 minutes."
        ),
    },
    'pay_confirmed': {
        UA: '✅ <b>Оплата підтверджена!</b>\n\nТариф <b>{tier}</b> активний до <b>{expires}</b>. 🚀',
        EN: '✅ <b>Payment confirmed!</b>\n\nPlan <b>{tier}</b> active until <b>{expires}</b>. 🚀',
    },
    'pay_already_paid': {
        UA: '✅ Цей рахунок вже оплачено.\nТариф <b>{tier}</b> активний до <b>{expires}</b>.',
        EN: '✅ This invoice is already paid.\nPlan <b>{tier}</b> active until <b>{expires}</b>.',
    },
    'pay_expired': {
        UA: '❌ Рахунок протермінований або не знайдений. Створи новий через /plans.',
        EN: '❌ Invoice expired or not found. Create a new one via /plans.',
    },
    'pay_not_found': {
        UA: '❌ Рахунок не знайдено.',
        EN: '❌ Invoice not found.',
    },
    'pay_no_history': {
        UA: '📋 Платежів ще немає.',
        EN: '📋 No payments yet.',
    },
    'pay_history_header': {
        UA: '📋 <b>Твої платежі:</b>',
        EN: '📋 <b>Your payments:</b>',
    },

    # ── Main menu buttons ────────────────────────────────────────────────────
    'menu_wallet':    {UA: '👛 Гаманець',    EN: '👛 Wallet'},
    'menu_balance':   {UA: '💰 Баланс',      EN: '💰 Balance'},
    'menu_signals':   {UA: '📡 Сигнали',     EN: '📡 Signals'},
    'menu_positions': {UA: '📦 Позиції',     EN: '📦 Positions'},
    'menu_automode':  {UA: '🤖 Авто-трейд', EN: '🤖 Auto-trade'},
    'menu_trades':    {UA: '📋 Угоди',       EN: '📋 Trades'},

    # ── Wallet ───────────────────────────────────────────────────────────────
    'wallet_empty': {
        UA: '👛 <b>Гаманців немає.</b>\n\nДодай Solana або BNB гаманець щоб бачити баланс і торгувати.',
        EN: '👛 <b>No wallets yet.</b>\n\nAdd a Solana or BNB wallet to see your balance and trade.',
    },
    'wallet_header': {UA: '👛 <b>Твої гаманці:</b>', EN: '👛 <b>Your wallets:</b>'},
    'wallet_enter_address': {
        UA: '📝 Введи адресу {chain} гаманця:',
        EN: '📝 Enter your {chain} wallet address:',
    },
    'wallet_invalid_address': {
        UA: '❌ Невірна адреса. Спробуй ще раз.',
        EN: '❌ Invalid address. Try again.',
    },
    'wallet_saved': {
        UA: '✅ <b>Гаманець {chain} збережено:</b>\n<code>{address}</code>',
        EN: '✅ <b>{chain} wallet saved:</b>\n<code>{address}</code>',
    },
    'wallet_deleted': {UA: '🗑 Гаманець {chain} видалено.', EN: '🗑 {chain} wallet removed.'},
    'wallet_no_wallet_for_key': {
        UA: 'Спочатку додай гаманець через меню → Гаманець.',
        EN: 'Add a wallet first via menu → Wallet.',
    },
    'wallet_choose_chain_key': {
        UA: 'Для якого гаманця додати приватний ключ?',
        EN: 'Which wallet to add private key for?',
    },
    'wallet_enter_pk_warning': {
        UA: (
            "⚠️ <b>УВАГА — БЕЗПЕКА КЛЮЧА</b>\n\n"
            "• Ключ буде зашифровано і збережено на сервері\n"
            "• <b>Використовуй окремий гаманець тільки для трейдингу</b>\n"
            "• Не тримай там більше коштів ніж готовий ризикувати\n"
            "• Нікому не показуй приватний ключ\n\n"
            "Введи приватний ключ:\n"
            "• Solana: base58 рядок\n"
            "• BNB: hex рядок (0x...)\n\n"
            "<i>Повідомлення буде видалено автоматично</i>"
        ),
        EN: (
            "⚠️ <b>WARNING — KEY SECURITY</b>\n\n"
            "• Key will be encrypted and stored on the server\n"
            "• <b>Use a dedicated wallet only for trading</b>\n"
            "• Don't keep more funds than you're willing to risk\n"
            "• Never share your private key\n\n"
            "Enter private key:\n"
            "• Solana: base58 string\n"
            "• BNB: hex string (0x...)\n\n"
            "<i>Message will be deleted automatically</i>"
        ),
    },
    'wallet_pk_saved': {
        UA: '🔐 <b>Ключ збережено і зашифровано.</b>\n\n🤖 Тепер можеш купувати токени прямо з сигналів!',
        EN: '🔐 <b>Key saved and encrypted.</b>\n\n🤖 You can now buy tokens directly from signals!',
    },
    'wallet_pk_deleted': {
        UA: '🗝 Приватні ключі видалено. Торгівля вимкнена.',
        EN: '🗝 Private keys removed. Trading disabled.',
    },
    'wallet_pk_encrypt_failed': {
        UA: '❌ Помилка шифрування. Переконайся що ENCRYPTION_KEY налаштовано на сервері.',
        EN: '❌ Encryption failed. Make sure ENCRYPTION_KEY is set on the server.',
    },
    'wallet_pk_invalid': {
        UA: '❌ Невалідний формат ключа.\n\nSOL: base58-рядок 43–88 символів.\nBNB: hex-рядок 64 символи (з або без 0x).',
        EN: '❌ Invalid private key format.\n\nSOL: base58 string, 43–88 chars.\nBNB: hex string, 64 chars (with or without 0x).',
    },

    # ── Balance ───────────────────────────────────────────────────────────────
    'balance_no_wallet': {
        UA: '💰 Немає гаманців. Додай через меню → 👛 Гаманець.',
        EN: '💰 No wallets. Add via menu → 👛 Wallet.',
    },
    'balance_loading': {UA: '⏳ Завантажую баланси...', EN: '⏳ Loading balances...'},
    'balance_header':  {UA: '💰 <b>Баланси:</b>',       EN: '💰 <b>Balances:</b>'},

    # ── Signals ───────────────────────────────────────────────────────────────
    'no_signals': {
        UA: '📡 Нових сигналів поки немає. Бот сканує ринок щохвилини — сигнал прийде автоматично.',
        EN: "📡 No new signals yet. The bot scans the market every minute — you'll be notified automatically.",
    },
    'signals_header': {
        UA: '📡 Знайдено <b>{count}</b> сигналів. Показую останні 5:',
        EN: '📡 Found <b>{count}</b> signals. Showing last 5:',
    },
    'rate_limit': {
        UA: '⏳ Забагато запитів. Зачекайте хвилину.',
        EN: '⏳ Too many requests. Please wait a minute.',
    },

    # ── Positions ──────────────────────────────────────────────────────────────
    'positions_empty':  {UA: '📦 Відкритих позицій немає.', EN: '📦 No open positions.'},
    'positions_header': {
        UA: '📦 <b>Відкриті позиції ({count}):</b>',
        EN: '📦 <b>Open positions ({count}):</b>',
    },
    'pos_close_all':  {UA: '🗑 Закрити всі (відмітити)',   EN: '🗑 Close all (mark)'},
    'pos_closed_all': {UA: '✅ Закрито {count} позицій.', EN: '✅ Closed {count} positions.'},

    # ── Auto mode ──────────────────────────────────────────────────────────────
    'auto_on':  {UA: '✅ УВІМКНЕНО', EN: '✅ ON'},
    'auto_off': {UA: '❌ ВИМКНЕНО',  EN: '❌ OFF'},
    'auto_status': {
        UA: (
            "🤖 <b>Авто-трейдинг</b>\n\n"
            "Статус: <b>{status}</b>\n"
            "Мін. score: <b>{score}/100</b>\n"
            "Макс. покупка: <b>{sol} SOL / {bnb} BNB</b>\n"
            "Stop-loss: <b>-{sl}%</b>\n\n"
            "⚠️ Потрібен приватний ключ гаманця."
        ),
        EN: (
            "🤖 <b>Auto-trading</b>\n\n"
            "Status: <b>{status}</b>\n"
            "Min score: <b>{score}/100</b>\n"
            "Max buy: <b>{sol} SOL / {bnb} BNB</b>\n"
            "Stop-loss: <b>-{sl}%</b>\n\n"
            "⚠️ Private key required."
        ),
    },
    'auto_toggle_on':  {UA: '✅ Увімкнути', EN: '✅ Enable'},
    'auto_toggle_off': {UA: '❌ Вимкнути',  EN: '❌ Disable'},
    'auto_config':     {UA: '⚙️ Налаштувати', EN: '⚙️ Configure'},
    'auto_enabled': {
        UA: '✅ <b>Авто-трейдинг увімкнено!</b>\n\nБот буде автоматично купувати токени за score ≥ 80.',
        EN: '✅ <b>Auto-trading enabled!</b>\n\nBot will auto-buy tokens with score ≥ 80.',
    },
    'auto_disabled':    {UA: '❌ Авто-трейдинг вимкнено.', EN: '❌ Auto-trading disabled.'},
    'auto_config_help': {
        UA: (
            "⚙️ <b>Параметри авто-трейдингу</b>\n\n"
            "Поточні значення за замовчуванням:\n"
            "• Мін. score: 80\n"
            "• Макс. покупка: 0.1 SOL / 0.01 BNB\n"
            "• Stop-loss: -20%\n\n"
            "Кастомне налаштування — незабаром."
        ),
        EN: (
            "⚙️ <b>Auto-trading settings</b>\n\n"
            "Current defaults:\n"
            "• Min score: 80\n"
            "• Max buy: 0.1 SOL / 0.01 BNB\n"
            "• Stop-loss: -20%\n\n"
            "Custom configuration coming soon."
        ),
    },

    # ── Trades ────────────────────────────────────────────────────────────────
    'trades_empty':  {UA: '📋 Угод ще немає.',        EN: '📋 No trades yet.'},
    'trades_header': {UA: '📋 <b>Останні угоди:</b>', EN: '📋 <b>Recent trades:</b>'},

    # ── Trading ───────────────────────────────────────────────────────────────
    'buy_no_wallet': {
        UA: '👛 Немає {chain} гаманця. Меню → 👛 Гаманець → Додай.',
        EN: '👛 No {chain} wallet. Menu → 👛 Wallet → Add.',
    },
    'buy_no_pk': {
        UA: '🔑 Немає приватного ключа. Меню → 👛 Гаманець → Add Private Key.',
        EN: '🔑 No private key. Menu → 👛 Wallet → Add Private Key.',
    },
    'buy_decrypt_failed': {
        UA: '❌ Помилка розшифрування ключа. Спробуй додати ключ знову.',
        EN: '❌ Failed to decrypt key. Try adding key again.',
    },
    'buy_executing': {
        UA: '⏳ Виконую покупку <b>{amount} {chain}</b> → <code>{address}</code>...',
        EN: '⏳ Executing buy <b>{amount} {chain}</b> → <code>{address}</code>...',
    },
    'buy_quote_failed': {
        UA: '❌ Не вдалося отримати ціну від Jupiter. Пара може бути недоступна.',
        EN: '❌ Failed to get quote from Jupiter. Pair may be unavailable.',
    },
    'buy_success': {
        UA: '✅ <b>Покупка успішна!</b>\n\n🔗 Tx: <code>{tx}</code>',
        EN: '✅ <b>Buy successful!</b>\n\n🔗 Tx: <code>{tx}</code>',
    },
    'buy_failed': {
        UA: '❌ <b>Помилка покупки:</b>\n<code>{error}</code>',
        EN: '❌ <b>Buy failed:</b>\n<code>{error}</code>',
    },
    'sell_success': {
        UA: '✅ <b>Продаж успішний!</b>\n\n🔗 Tx: <code>{tx}</code>',
        EN: '✅ <b>Sell successful!</b>\n\n🔗 Tx: <code>{tx}</code>',
    },
    'trading_no_enc_key': {
        UA: '❌ Торгівля недоступна: ENCRYPTION_KEY не налаштовано на сервері.',
        EN: '❌ Trading unavailable: ENCRYPTION_KEY not configured on server.',
    },
    'cancelled': {UA: '❌ Скасовано.', EN: '❌ Cancelled.'},

    # ── /language ─────────────────────────────────────────────────────────────
    'lang_choose': {
        UA: '🌐 Виберіть мову / Choose language:',
        EN: '🌐 Виберіть мову / Choose language:',
    },
    'lang_set_ua': {UA: '✅ Мову встановлено: Українська 🇺🇦', EN: '✅ Language set: Ukrainian 🇺🇦'},
    'lang_set_en': {UA: '✅ Language set: English 🇬🇧',        EN: '✅ Language set: English 🇬🇧'},

    # ── Signal message labels ─────────────────────────────────────────────────
    'sig_price':   {UA: 'Ціна',             EN: 'Price'},
    'sig_liq':     {UA: 'Ліквідність',      EN: 'Liquidity'},
    'sig_vol':     {UA: 'Обсяг 1год',       EN: '1h Volume'},
    'sig_chg':     {UA: 'Зміна 1год',       EN: '1h Change'},
    'sig_mcap':    {UA: 'Маркеткап',        EN: 'Market Cap'},
    'sig_reasons': {UA: 'Причини сигналу',  EN: 'Signal reasons'},
    'sig_risks':   {UA: 'Ризики',           EN: 'Risks'},
    'sig_exit':    {UA: 'Стратегія виходу', EN: 'Exit strategy'},
    'sig_tp1':     {UA: '🎯 TP1: +50%  → продати 30%',     EN: '🎯 TP1: +50%  → sell 30%'},
    'sig_tp2':     {UA: '🎯 TP2: +100% → продати 30%',     EN: '🎯 TP2: +100% → sell 30%'},
    'sig_tp3':     {UA: '🎯 TP3: +200% → продати 30%',     EN: '🎯 TP3: +200% → sell 30%'},
    'sig_sl':      {UA: '🛑 SL:  -20%  → вийти повністю',  EN: '🛑 SL:  -20%  → close full position'},
    'sig_disc':    {
        UA: '⚠️ <i>Не є фінансовою порадою. DYOR.</i>',
        EN: '⚠️ <i>Not financial advice. DYOR.</i>',
    },
}


def t(lang: str, key: str, **kwargs) -> str:
    """Return translated string, fallback to UA."""
    entry = _T.get(key, {})
    text = entry.get(lang) or entry.get(UA) or key
    return text.format(**kwargs) if kwargs else text
