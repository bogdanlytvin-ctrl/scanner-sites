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
            "  • Максимум 3 сигнали/день\n"
            "  • ❌ Авто-трейдинг недоступний\n\n"
            "💳 <b>Basic</b> — ${basic_price}/{basic_days}д\n"
            "  • STRONG BUY + BUY (score 70+)\n"
            "  • 20 сигналів/день\n"
            "  • ✅ Авто-трейдинг (макс. 3 позиції)\n"
            "  • ✅ Stop-loss / Take-profit\n\n"
            "🚀 <b>Pro</b> — ${pro_price}/{pro_days}д\n"
            "  • Всі сигнали (score 55+)\n"
            "  • Необмежено сигналів\n"
            "  • ✅ Авто-трейдинг (макс. 10 позицій)\n"
            "  • ✅ Stop-loss / Take-profit\n"
            "  • ✅ Пріоритетна доставка\n\n"
            "📌 Ваш тариф: <b>{current_tier}</b>\n\n"
            "💰 Приймаємо: USDT, TON, BTC, ETH"
        ),
        EN: (
            "<b>Crypto Sniper Bot Plans</b>\n\n"
            "🆓 <b>Free</b> — free forever\n"
            "  • STRONG BUY only (score 85+)\n"
            "  • Max 3 signals/day\n"
            "  • ❌ No auto-trading\n\n"
            "💳 <b>Basic</b> — ${basic_price}/{basic_days}d\n"
            "  • STRONG BUY + BUY (score 70+)\n"
            "  • 20 signals/day\n"
            "  • ✅ Auto-trading (max 3 positions)\n"
            "  • ✅ Stop-loss / Take-profit\n\n"
            "🚀 <b>Pro</b> — ${pro_price}/{pro_days}d\n"
            "  • All signals (score 55+)\n"
            "  • Unlimited signals\n"
            "  • ✅ Auto-trading (max 10 positions)\n"
            "  • ✅ Stop-loss / Take-profit\n"
            "  • ✅ Priority delivery\n\n"
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
    'sub_expiry_reminder': {
        UA: (
            '⚠️ <b>Нагадування про підписку</b>\n\n'
            'Твій тариф <b>{tier}</b> закінчується <b>{expires}</b> '
            '(через {days} дн.).\n\n'
            'Щоб продовжити підписку — /plans 🚀'
        ),
        EN: (
            '⚠️ <b>Subscription reminder</b>\n\n'
            'Your <b>{tier}</b> plan expires on <b>{expires}</b> '
            '({days} days left).\n\n'
            'To renew — /plans 🚀'
        ),
    },

    # ── Main menu buttons ────────────────────────────────────────────────────
    'menu_wallet':    {UA: '👛 Гаманець',    EN: '👛 Wallet'},
    'menu_balance':   {UA: '💰 Баланс',      EN: '💰 Balance'},
    'menu_signals':   {UA: '📡 Сигнали',     EN: '📡 Signals'},
    'menu_positions': {UA: '📦 Позиції',     EN: '📦 Positions'},
    'menu_automode':  {UA: '🤖 Авто-трейд', EN: '🤖 Auto-trade'},
    'menu_results':   {UA: '📊 Результати', EN: '📊 Results'},
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

    'auto_tier_required': {
        UA: (
            "🤖 <b>Авто-трейдинг</b>\n\n"
            "❌ Авто-трейдинг доступний тільки для тарифів <b>Basic</b> і <b>Pro</b>.\n\n"
            "🆓 Free — тільки ручна торгівля за сигналами.\n"
            "💳 Basic — авто-трейд, макс. 3 позиції.\n"
            "🚀 Pro   — авто-трейд, макс. 10 позицій.\n\n"
            "Оформи підписку щоб розблокувати авто-торгівлю 👇"
        ),
        EN: (
            "🤖 <b>Auto-trading</b>\n\n"
            "❌ Auto-trading is available for <b>Basic</b> and <b>Pro</b> plans only.\n\n"
            "🆓 Free  — manual trading by signals only.\n"
            "💳 Basic — auto-trade, max 3 positions.\n"
            "🚀 Pro   — auto-trade, max 10 positions.\n\n"
            "Subscribe to unlock auto-trading 👇"
        ),
    },
    'auto_tier_required_short': {
        UA: '🔒 Авто-трейд тільки для Basic / Pro. Оформи підписку: /plans',
        EN: '🔒 Auto-trade only for Basic / Pro. Subscribe: /plans',
    },
    'auto_no_wallet': {
        UA: '👛 Спочатку додай гаманець і приватний ключ.',
        EN: '👛 First add a wallet and private key.',
    },

    'auto_status': {
        UA: (
            "🤖 <b>Авто-трейдинг</b>  [{tier}]\n\n"
            "Статус: <b>{status}</b>\n"
            "Мін. score: <b>{score}/100</b>\n"
            "Макс. покупка: <b>{sol} SOL / {bnb} BNB</b>\n"
            "Stop-loss: <b>-{sl}%</b>  |  Take-profit: <b>{tp}</b>\n"
            "Відкриті позиції: <b>{positions}</b>\n\n"
            "⚠️ Для роботи потрібен приватний ключ гаманця.\n"
            "SL / TP змінюй кнопками нижче ↓"
        ),
        EN: (
            "🤖 <b>Auto-trading</b>  [{tier}]\n\n"
            "Status: <b>{status}</b>\n"
            "Min score: <b>{score}/100</b>\n"
            "Max buy: <b>{sol} SOL / {bnb} BNB</b>\n"
            "Stop-loss: <b>-{sl}%</b>  |  Take-profit: <b>{tp}</b>\n"
            "Open positions: <b>{positions}</b>\n\n"
            "⚠️ Private key required for execution.\n"
            "Change SL / TP with the buttons below ↓"
        ),
    },
    'auto_toggle_on':  {UA: '✅ Увімкнути', EN: '✅ Enable'},
    'auto_toggle_off': {UA: '❌ Вимкнути',  EN: '❌ Disable'},
    'auto_config':     {UA: '⚙️ Налаштувати', EN: '⚙️ Configure'},

    'auto_enabled': {
        UA: (
            "✅ <b>Авто-трейдинг увімкнено!</b>  [{tier}]\n\n"
            "• Мін. score: <b>{score}/100</b>\n"
            "• Макс. позицій: <b>{max_pos}</b>\n\n"
            "Бот автоматично купуватиме токени що відповідають твоїм критеріям.\n"
            "⚠️ Переконайся що є гаманець з приватним ключем."
        ),
        EN: (
            "✅ <b>Auto-trading enabled!</b>  [{tier}]\n\n"
            "• Min score: <b>{score}/100</b>\n"
            "• Max positions: <b>{max_pos}</b>\n\n"
            "Bot will automatically buy tokens matching your criteria.\n"
            "⚠️ Make sure a wallet with private key is added."
        ),
    },
    'auto_disabled': {UA: '❌ Авто-трейдинг вимкнено.', EN: '❌ Auto-trading disabled.'},
    'auto_config_help': {
        UA: (
            "⚙️ <b>Налаштування авто-трейдингу</b>\n\n"
            "<b>Stop-Loss (SL)</b> — авто-продаж якщо ціна впала на X%\n"
            "<b>Take-Profit (TP)</b> — авто-продаж якщо ціна зросла на X%\n\n"
            "Встанови SL і TP кнопками в меню авто-трейду.\n\n"
            "Для зміни score і суми покупки — напиши /start і зайди в "
            "🤖 Авто-трейд.\n\n"
            "💡 <b>Рекомендовані налаштування:</b>\n"
            "• SL 20–30% (захист від великих збитків)\n"
            "• TP 50–100% (фіксація прибутку при 2x)"
        ),
        EN: (
            "⚙️ <b>Auto-trading configuration</b>\n\n"
            "<b>Stop-Loss (SL)</b> — auto-sell when price drops X%\n"
            "<b>Take-Profit (TP)</b> — auto-sell when price rises X%\n\n"
            "Set SL and TP using the buttons in the auto-trade menu.\n\n"
            "To change score threshold and buy amount use /start → "
            "🤖 Auto-trade.\n\n"
            "💡 <b>Recommended settings:</b>\n"
            "• SL 20–30% (protection from big losses)\n"
            "• TP 50–100% (take profit at 2x)"
        ),
    },

    # ── Auto-trade execution notifications ─────────────────────────────────────
    'auto_buying': {
        UA: (
            "🤖 <b>Авто-купівля...</b>\n\n"
            "Токен: <b>{symbol}</b>\n"
            "Сума: <b>{amount} {chain}</b>\n"
            "Score: <b>{score}/100</b>\n"
            "SL: <b>-{sl}%</b>  |  TP: <b>{tp}</b>\n\n"
            "⏳ Виконую транзакцію..."
        ),
        EN: (
            "🤖 <b>Auto-buying...</b>\n\n"
            "Token: <b>{symbol}</b>\n"
            "Amount: <b>{amount} {chain}</b>\n"
            "Score: <b>{score}/100</b>\n"
            "SL: <b>-{sl}%</b>  |  TP: <b>{tp}</b>\n\n"
            "⏳ Executing transaction..."
        ),
    },
    'auto_buy_success': {
        UA: (
            "✅ <b>Авто-купівля виконана!</b>\n\n"
            "Токен: <b>{symbol}</b>\n"
            "Куплено: <b>{amount} {chain}</b>\n"
            "SL: <b>-{sl}%</b>  |  TP: <b>{tp}</b>\n"
            "🔗 Tx: <code>{tx}</code>\n\n"
            "Позиція відстежується автоматично."
        ),
        EN: (
            "✅ <b>Auto-buy executed!</b>\n\n"
            "Token: <b>{symbol}</b>\n"
            "Bought: <b>{amount} {chain}</b>\n"
            "SL: <b>-{sl}%</b>  |  TP: <b>{tp}</b>\n"
            "🔗 Tx: <code>{tx}</code>\n\n"
            "Position is being tracked automatically."
        ),
    },
    'auto_buy_failed': {
        UA: '⚠️ <b>Авто-купівля невдала</b>\n\nТокен: <b>{symbol}</b>\nПричина: <code>{error}</code>',
        EN: '⚠️ <b>Auto-buy failed</b>\n\nToken: <b>{symbol}</b>\nReason: <code>{error}</code>',
    },
    'auto_max_positions': {
        UA: (
            "⚠️ <b>Ліміт позицій досягнуто</b>\n\n"
            "Тариф <b>{tier}</b> дозволяє максимум <b>{max}</b> відкритих позицій.\n"
            "Закрий існуючі позиції або перейди на Pro."
        ),
        EN: (
            "⚠️ <b>Position limit reached</b>\n\n"
            "<b>{tier}</b> plan allows max <b>{max}</b> open positions.\n"
            "Close existing positions or upgrade to Pro."
        ),
    },
    'auto_sl_hit': {
        UA: (
            "🔴 <b>Stop-Loss спрацював!</b>\n\n"
            "Токен: <b>{symbol}</b>\n"
            "P&L: <b>{pnl}%</b>  (SL: -{sl}%)\n"
            "Продаж: {sold}\n"
            "🔗 Tx: <code>{tx}</code>"
        ),
        EN: (
            "🔴 <b>Stop-Loss triggered!</b>\n\n"
            "Token: <b>{symbol}</b>\n"
            "P&L: <b>{pnl}%</b>  (SL: -{sl}%)\n"
            "Sell: {sold}\n"
            "🔗 Tx: <code>{tx}</code>"
        ),
    },
    'auto_tp_hit': {
        UA: (
            "🟢 <b>Take-Profit спрацював!</b>\n\n"
            "Токен: <b>{symbol}</b>\n"
            "P&L: <b>{pnl}%</b>  (TP: +{tp}%)\n"
            "Продаж: {sold}\n"
            "🔗 Tx: <code>{tx}</code>"
        ),
        EN: (
            "🟢 <b>Take-Profit triggered!</b>\n\n"
            "Token: <b>{symbol}</b>\n"
            "P&L: <b>{pnl}%</b>  (TP: +{tp}%)\n"
            "Sell: {sold}\n"
            "🔗 Tx: <code>{tx}</code>"
        ),
    },

    # ── Trades / Results ──────────────────────────────────────────────────────
    'trades_empty':  {UA: '📋 Угод ще немає.',        EN: '📋 No trades yet.'},
    'trades_header': {UA: '📋 <b>Останні угоди:</b>', EN: '📋 <b>Recent trades:</b>'},
    'trade_history_header': {
        UA: '📋 <b>Останні 10 угод:</b>',
        EN: '📋 <b>Last 10 trades:</b>',
    },
    'trade_history_item': {
        UA: (
            "{chain_icon} <b>{token}</b>\n"
            "BUY: {buy_price}\n"
            "SELL: {sell_price}\n"
            "P&L: <b>{pnl_percent}</b>"
        ),
        EN: (
            "{chain_icon} <b>{token}</b>\n"
            "BUY: {buy_price}\n"
            "SELL: {sell_price}\n"
            "P&L: <b>{pnl_percent}</b>"
        ),
    },
    'results_summary': {
        UA: (
            "📊 <b>Bot Performance:</b>\n\n"
            "- Total P&L: <b>${total_pnl}</b>\n"
            "- Winrate: <b>{winrate}%</b>\n"
            "- Trades: <b>{trades}</b>"
        ),
        EN: (
            "📊 <b>Bot Performance:</b>\n\n"
            "- Total P&L: <b>${total_pnl}</b>\n"
            "- Winrate: <b>{winrate}%</b>\n"
            "- Trades: <b>{trades}</b>"
        ),
    },
    'daily_stats_report': {
        UA: (
            "📅 <b>Daily Stats:</b>\n\n"
            "Signals: <b>{signals}</b>\n"
            "Wins: <b>{wins}</b>\n"
            "Losses: <b>{losses}</b>\n"
            "Avg P&L: <b>{avg_pnl}%</b>"
        ),
        EN: (
            "📅 <b>Daily Stats:</b>\n\n"
            "Signals: <b>{signals}</b>\n"
            "Wins: <b>{wins}</b>\n"
            "Losses: <b>{losses}</b>\n"
            "Avg P&L: <b>{avg_pnl}%</b>"
        ),
    },

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
    'sig_contract': {UA: '📋 <b>Контракт:</b>', EN: '📋 <b>Contract:</b>'},
    'sig_dex_link': {UA: 'Переглянути на DexScreener', EN: 'View on DexScreener'},
    'sig_created':  {UA: 'Створено', EN: 'Created'},
    'sig_ago':      {UA: 'тому',     EN: 'ago'},

    # ── Main menu extra button ────────────────────────────────────────────────
    'menu_notif': {UA: '🔔 Сповіщення', EN: '🔔 Notifications'},

    # ── Notification settings ─────────────────────────────────────────────────
    'notif_menu': {
        UA: (
            "🔔 <b>Налаштування сповіщень</b>\n\n"
            "Авто-пуш: <b>{push}</b>\n"
            "Мережа: <b>{chain}</b>\n"
            "Мін. score: <b>{score}</b>\n"
            "Тариф: <b>{tier}</b>\n\n"
            "📡 Сигнали надходять <b>автоматично</b> щойно бот знаходить нову монету.\n"
            "Basic/Pro також отримують <b>нові монети з pump.fun</b> відразу при запуску."
        ),
        EN: (
            "🔔 <b>Notification Settings</b>\n\n"
            "Auto-push: <b>{push}</b>\n"
            "Network: <b>{chain}</b>\n"
            "Min score: <b>{score}</b>\n"
            "Plan: <b>{tier}</b>\n\n"
            "📡 Signals are pushed <b>automatically</b> as soon as the bot finds a new coin.\n"
            "Basic/Pro also receive <b>all new pump.fun coins</b> instantly at launch."
        ),
    },
    'notif_push':         {UA: 'Авто-сповіщення',                   EN: 'Auto-push'},
    'notif_chain_all':    {UA: 'Всі мережі',                         EN: 'All networks'},
    'notif_score_auto':   {UA: 'Авто',                               EN: 'Auto'},
    'notif_upgrade_hint': {
        UA: '🔓 Фільтри доступні на Basic/Pro → /plans',
        EN: '🔓 Filters available on Basic/Pro → /plans',
    },
}


def t(lang: str, key: str, **kwargs) -> str:
    """Return translated string, fallback to UA."""
    entry = _T.get(key, {})
    text = entry.get(lang) or entry.get(UA) or key
    return text.format(**kwargs) if kwargs else text
