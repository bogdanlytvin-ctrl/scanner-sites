import type { LeadBusiness } from "./scoring";

// ─── Problem Library ────────────────────────────────────────

export interface ProblemType {
  id: string;
  icon: string;
  problem: string;
  description: string;
  solution: string;
  benefits: string[];
  priceRange: { min: number; max: number };
  detectCondition: string;
}

const problemLibrary: ProblemType[] = [
  {
    id: "no-website",
    icon: "🚫",
    problem: "Немає вебсайту взагалі",
    description: "Бізнес не має власного сайту. Клієнти не можуть знайти компанію в інтернеті, що призводить до втрати значної частини потенційних клієнтів.",
    solution: "Створення сучасного адаптивного сайту з нуля з контактною формою, SEO-оптимізацією та підключенням карт.",
    benefits: [
      "Залучення нових клієнтів з Google",
      "Професійний імідж компанії",
      "Цілодобова інформація про послуги",
      "Збільшення довіри клієнтів",
    ],
    priceRange: { min: 500, max: 1500 },
    detectCondition: "website === 'N/A' || !website",
  },
  {
    id: "old-design",
    icon: "📅",
    problem: "Дуже старий дизайн сайту",
    description: "Сайт має копірайт 2016 року або старіший, що вказує на те, що він не оновлювався понад 8 років. Дизайн виглядає застарілим і непривабливим для сучасних користувачів.",
    solution: "Повний редизайн сайту з використанням сучасних трендів UI/UX, адаптивної верстки та свіжої палітри кольорів.",
    benefits: [
      "Сучасний та привабливий вигляд",
      "Краще враження для відвідувачів",
      "Вища конверсія у клієнтів",
      "Адаптивність для всіх пристроїв",
    ],
    priceRange: { min: 600, max: 2000 },
    detectCondition: "copyrightYear && copyrightYear <= 2016",
  },
  {
    id: "not-mobile-friendly",
    icon: "📱",
    problem: "Не адаптивний для мобільних",
    description: "Сайт не має мобільної версії або viewport meta-тегу. Близько 60% користувачів заходять з мобільних пристроїв, і такий сайт їм незручний.",
    solution: "Створення повністю адаптивної версії сайту, яка коректно відображається на смартфонах, планшетах та десктопах.",
    benefits: [
      "Комфорт для 60%+ мобільних користувачів",
      "Покращення позицій в Google (Mobile-First Index)",
      "Зменшення показника відмов",
      "Збільшення конверсії",
    ],
    priceRange: { min: 300, max: 1000 },
    detectCondition: "!isMobileFriendly && website !== 'N/A'",
  },
  {
    id: "no-ssl",
    icon: "🔒",
    problem: "Немає SSL сертифікату",
    description: "Сайт працює по HTTP без SSL. Браузери відображають попередження «Не безпечно», що відлякує відвідувачів та знижує довіру до бізнесу.",
    solution: "Встановлення безкоштовного SSL сертифікату (Let's Encrypt) та налаштування переадресації з HTTP на HTTPS.",
    benefits: [
      "Безпека даних відвідувачів",
      "Усунення попереджень браузера",
      "Покращення SEO-ранжування",
      "Довіра клієнтів",
    ],
    priceRange: { min: 50, max: 200 },
    detectCondition: "!hasSsl && website !== 'N/A'",
  },
  {
    id: "old-technology",
    icon: "🔧",
    problem: "Застаріла технологія (CMS)",
    description: "Сайт побудований на застарілій платформі: Joomla, Drupal, uCoz або 1C-Bitrix. Ці системи складні в обслуговуванні та мають обмежені можливості.",
    solution: "Міграція на сучасну платформу (Next.js, Tilda, WordPress або кастомний сайт) зі збереженням контенту та покращеним функціоналом.",
    benefits: [
      "Швидша робота сайту",
      "Простіше обслуговування",
      "Більше можливостей для розширення",
      "Краща безпека",
    ],
    priceRange: { min: 600, max: 1800 },
    detectCondition: "technologies includes Joomla|Drupal|uCoz|1C-Bitrix|Bitrix",
  },
  {
    id: "no-contact-form",
    icon: "📋",
    problem: "Немає контактної форми",
    description: "На сайті відсутня форма для зв'язку. Клієнти не можуть швидко залишити заявку, що знижує конверсію та призводить до втрати лідів.",
    solution: "Додавання сучасної контактної форми з валідацією, захистом від спаму та відправкою на email/Telegram.",
    benefits: [
      "Отримання заявок 24/7",
      "Збільшення конверсії сайту",
      "Зручність для клієнтів",
      "Автоматичне збирання лідів",
    ],
    priceRange: { min: 100, max: 300 },
    detectCondition: "!hasContactForm && website !== 'N/A'",
  },
  {
    id: "table-layout",
    icon: "📐",
    problem: "Table-based layout (застаріла розмітка)",
    description: "Сайт використовує таблиці для верстки — це застаріла практика, яка ускладнює адаптивність, SEO та доступність сайту.",
    solution: "Переробка розмітки на сучасну HTML5/CSS3 структуру (Flexbox/Grid) з семантичними тегами.",
    benefits: [
      "Правильна адаптивність",
      "Краще SEO ранжування",
      "Швидше завантаження",
      "Доступність для всіх користувачів",
    ],
    priceRange: { min: 400, max: 1200 },
    detectCondition: "designNotes includes table|table-based",
  },
  {
    id: "missing-seo",
    icon: "🔍",
    problem: "Відсутні SEO meta-теги",
    description: "Сайт не має мета-опису, Open Graph тегів або інших SEO-елементів. Це суттєво знижує позиції в пошукових системах.",
    solution: "Повний SEO-аудит та впровадження мета-тегів, структурованих даних, Open Graph,sitemap.xml та robots.txt.",
    benefits: [
      "Кращі позиції в Google",
      "Привабливі посилання в соцмережах",
      "Збільшення органічного трафіку",
      "Професійний вигляд у результатах пошуку",
    ],
    priceRange: { min: 150, max: 500 },
    detectCondition: "no pageTitle || no meta description",
  },
  {
    id: "no-social-links",
    icon: "🔗",
    problem: "Немає посилань на соцмережі",
    description: "На сайті відсутні посилання на Facebook, Instagram або Telegram. Це ускладнює клієнтам зв'язок з бізнесом та зменшує аудиторію.",
    solution: "Додавання блоку з посиланнями на всі соцмережі бізнесу з іконками, розміщеними у футері та контактній секції.",
    benefits: [
      "Зручний зв'язок з клієнтами",
      "Збільшення аудиторії в соцмережах",
      "Краща довіра до бізнесу",
      "Додатковий канал залучення клієнтів",
    ],
    priceRange: { min: 50, max: 150 },
    detectCondition: "!facebook && !instagram && !telegram",
  },
  {
    id: "slow-inline-styles",
    icon: "🎨",
    problem: "Повільне завантаження / Inline стилі",
    description: "Сайт має велику кількість inline-стилів або не використовує сучасні CSS-технології, що призводить до повільного завантаження.",
    solution: "Оптимізація CSS, видалення inline-стилів, впровадження lazy loading, стиснення зображень та кешування.",
    benefits: [
      "Швидке завантаження сторінок",
      "Кращий досвід користувачів",
      "Вищі позиції в Google (Core Web Vitals)",
      "Зниження показника відмов",
    ],
    priceRange: { min: 200, max: 600 },
    detectCondition: "designNotes includes inline",
  },
];

export function getProblemLibrary(): ProblemType[] {
  return problemLibrary;
}

export function getProblemsForLead(lead: LeadBusiness): ProblemType[] {
  const matched: ProblemType[] = [];

  for (const prob of problemLibrary) {
    let matches = false;

    switch (prob.id) {
      case "no-website":
        matches = !lead.website || lead.website === "N/A";
        break;
      case "old-design":
        matches = !!(lead.copyrightYear && lead.copyrightYear <= 2016);
        break;
      case "not-mobile-friendly":
        matches = lead.website !== "N/A" && !lead.isMobileFriendly;
        break;
      case "no-ssl":
        matches = lead.website !== "N/A" && !lead.hasSsl;
        break;
      case "old-technology": {
        const oldTechs = ["Joomla", "Drupal", "uCoz", "1C-Bitrix", "Bitrix"];
        matches = lead.technologies.some((t) =>
          oldTechs.some((ot) => t.toLowerCase().includes(ot.toLowerCase()))
        );
        break;
      }
      case "no-contact-form":
        matches = lead.website !== "N/A" && !lead.hasContactForm;
        break;
      case "table-layout":
        matches = !!(lead.designNotes && lead.designNotes.some((n) =>
          n.toLowerCase().includes("table")
        ));
        break;
      case "missing-seo":
        matches = lead.website !== "N/A" && !lead.pageTitle;
        break;
      case "no-social-links":
        matches = !lead.facebook && !lead.instagram && !lead.telegram;
        break;
      case "slow-inline-styles":
        matches = !!(lead.designNotes && lead.designNotes.some((n) =>
          n.toLowerCase().includes("inline")
        ));
        break;
    }

    if (matches) {
      matched.push(prob);
    }
  }

  return matched;
}

// ─── Outreach Templates ─────────────────────────────────────

export interface OutreachTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  channel: "email" | "telegram" | "messenger";
  tone: "formal" | "friendly" | "direct";
}

const templates: OutreachTemplate[] = [
  {
    id: "formal-email",
    name: "Формальний Email",
    subject: "Пропозиція оновлення вебсайту для {BIZ_NAME}",
    channel: "email",
    tone: "formal",
    body: `Шановний керівництву {BIZ_NAME},

Мене звати Олександр, я веб-розробник та дизайнер з понад 8-річним досвідом створення сучасних сайтів для бізнесу.

Під час аналізу бізнесів у місті {CITY}, я звернув увагу на ваш сайт та виявив кілька аспектів, які можуть впливати на привернення нових клієнтів:

{ISSUES}

У сучасному світі перше враження формується онлайн. Близько 75% клієнтів спочатку шукають послуги в інтернеті, і саме ваш сайт є візиткою компанії.

Я пропоную:
• Повний аналіз вашого поточного сайту (безкоштовно)
• Проєкт нового сучасного дизайну
• Адаптивну версію для мобільних пристроїв
• SEO-оптимізація для кращого ранжування в Google

Буду радий обговорити деталі зручним для вас способом.

З повагою,
Олександр
Web Design Studio
📞 +380 XX XXX XX XX`,
  },
  {
    id: "friendly-email",
    name: "Дружній Email",
    subject: "👋 Ваш сайт {BIZ_NAME} — є ідеї для покращення!",
    channel: "email",
    tone: "friendly",
    body: `Привіт, команда {BIZ_NAME}! 👋

Я — веб-дизайнер і нещодавно натрапив на ваш сайт. По-перше — ви робите класну справу! Але як фахівець, я помітив кілька речей, які можна покращити:

{ISSUES}

Зараз клієнти очікують, що сайт буде швидким, зручним на телефоні та сучасним. Я можу допомогти!

Що я можу зробити:
✨ Створити свіжий сучасний дизайн
📱 Зробити сайт ідеальним для мобільних
⚡ Покращити швидкість завантаження
🔍 Підняти сайт вищі в пошуку Google

Це не зобов'язує вас ні до чого — просто давайте поспілкуємось, я покажу що саме можу запропонувати саме для вас.

До зв'язку! 😊
Олександр
Web Design Studio
📞 +380 XX XXX XX XX`,
  },
  {
    id: "telegram-direct",
    name: "Пряме повідомлення Telegram",
    subject: "",
    channel: "telegram",
    tone: "direct",
    body: `Доброго дня! 👋

Я веб-розробник, звернув увагу на {BIZ_NAME} у {CITY}.

Зайшов на ваш сайт і помітив кілька проблем:
{ISSUES}

Можу допомогти зробити сучасний сайт, який приноситиме нових клієнтів. Безкоштовно зроблю попередній аналіз та покажу ескіз нового дизайну.

Цікаво? Напишіть, буду радий допомогти! 🚀`,
  },
  {
    id: "messenger-short",
    name: "Коротке повідомлення Messenger",
    subject: "",
    channel: "messenger",
    tone: "friendly",
    body: `Привіт! 👋 Я веб-дизайнер, помітив ваш сайт {BIZ_NAME} — є кілька речей для покращення:

{ISSUES}

Можу зробити сучасний сайт, який приноситиме клієнтів. Цікаво дізнатись більше? 😊`,
  },
  {
    id: "followup-email",
    name: "Повторний Email (нагадування)",
    subject: "RE: Пропозиція оновлення вебсайту для {BIZ_NAME}",
    channel: "email",
    tone: "formal",
    body: `Шановне керівництво {BIZ_NAME},

Кілька днів тому я надсилав вам пропозицію щодо оновлення вашого вебсайту. Розумію, що у вас багато справ, тому дозвольте коротко нагадати.

Я виявив наступні проблеми на вашому сайті:
{ISSUES}

Кожен день із застарілим сайтом — це втрачені клієнти. За даними досліджень, 94% людей формують перше враження про бізнес саме за сайтом.

Я готовий запропонувати безкоштовну консультацію та показати конкретні рішення для {BIZ_NAME}.

Буду вдячний за відповідь.

З повагою,
Олександр
Web Design Studio
📞 +380 XX XXX XX XX`,
  },
  {
    id: "urgency-email",
    name: "Терміновий (немає сайту)",
    subject: "⚠️ {BIZ_NAME} — ви втрачаєте клієнтів без сайту!",
    channel: "email",
    tone: "direct",
    body: `Шановне керівництво {BIZ_NAME},

Я шукав послуги у сфері вашого бізнесу в {CITY} і не зміг знайти ваш сайт. Це означає, що ви втрачаєте потенційних клієнтів щодня!

Факти:
📊 Близько 97% людей шукають бізнес онлайн
📱 60% пошуків здійснюються з мобільних
💰 Компанії з сайтом отримують на 67% більше запитів

Я спеціалізуюсь на створенні сайтів для малого та середнього бізнесу. Можу розробити для вас:
✅ Сучасний адаптивний сайт
✅ Форму для запитів від клієнтів
✅ Підключення Google Maps
✅ SEO-оптимізація

Це швидше і доступніше, ніж ви думаєте. Перший крок — безкоштовна консультація.

Зв'яжіться зі мною:
📞 +380 XX XXX XX XX
📧 email@example.com

Олександр
Web Design Studio`,
  },
  {
    id: "cold-teplovka",
    name: "Холодне повідомлення (привітання)",
    subject: "Нова можливість для {BIZ_NAME}",
    channel: "email",
    tone: "friendly",
    body: `Доброго дня, {BIZ_NAME}!

Я веб-розробник з {CITY}. Працюю з місцевим бізнесом, допомагаю залучати клієнтів через інтернет.

Проаналізував ваш онлайн-присутність і знайшов точки для росту:
{ISSUES}

Запропоную конкретні рішення без зайвих слів. Перша консультація — безкоштовна.

Олександр
Web Design Studio`,
  },
  {
    id: "telegram-casual",
    name: "Telegram (неформальний)",
    subject: "",
    channel: "telegram",
    tone: "friendly",
    body: `Привіт! 🙌

Бачив {BIZ_NAME} в {CITY} — крутий бізнес!

Зайшов на сайт і подумав, що він заслуговує на краще:
{ISSUES}

Я веб-розробник — можу допомогти зробити так, щоб сайт працював на вас і приносив нових клієнтів. Показати що може вийти? 🎨`,
  },
];

export function getTemplates(): OutreachTemplate[] {
  return templates;
}

export function fillTemplate(
  template: OutreachTemplate,
  data: { bizName: string; issues: string; city: string }
): { subject: string; body: string } {
  const { bizName, issues, city } = data;
  const filledSubject = template.subject
    .replace(/{BIZ_NAME}/g, bizName)
    .replace(/{ISSUES}/g, issues)
    .replace(/{CITY}/g, city);
  const filledBody = template.body
    .replace(/{BIZ_NAME}/g, bizName)
    .replace(/{ISSUES}/g, issues)
    .replace(/{CITY}/g, city);
  return { subject: filledSubject, body: filledBody };
}

export function getIssuesText(lead: LeadBusiness): string {
  const problems = getProblemsForLead(lead);
  const issues: string[] = [];

  if (problems.length === 0) {
    issues.push("✅ Сайт виглядає сучасним, але є можливості для покращення SEO та конверсії");
    return issues.join("\n");
  }

  for (const prob of problems) {
    issues.push(`${prob.icon} ${prob.problem} — ${prob.description.split(".")[0]}.`);
  }

  return issues.join("\n");
}

export function estimatePrice(lead: LeadBusiness): {
  min: number;
  max: number;
  currency: string;
  note: string;
} {
  // No website at all
  if (!lead.website || lead.website === "N/A") {
    return {
      min: 500,
      max: 1500,
      currency: "$",
      note: "Створення сайту з нуля",
    };
  }

  const hasAncientDesign = lead.designScore === "ancient";
  const hasNoMobile = !lead.isMobileFriendly;
  const hasOldTech = lead.technologies.some((t) =>
    ["Joomla", "Drupal", "uCoz", "1C-Bitrix", "Bitrix"].some((ot) =>
      t.toLowerCase().includes(ot.toLowerCase())
    )
  );
  const hasOutdatedDesign = lead.designScore === "outdated";

  // Ancient + no mobile = full redesign
  if (hasAncientDesign && hasNoMobile) {
    return {
      min: 800,
      max: 2000,
      currency: "$",
      note: "Повний редизайн + мобільна версія",
    };
  }

  // Ancient design or old tech
  if (hasAncientDesign || hasOldTech) {
    return {
      min: 600,
      max: 1800,
      currency: "$",
      note: "Повний редизайн + міграція технологій",
    };
  }

  // Outdated + no mobile
  if (hasOutdatedDesign && hasNoMobile) {
    return {
      min: 600,
      max: 1500,
      currency: "$",
      note: "Оновлення дизайну + адаптація",
    };
  }

  // Outdated design
  if (hasOutdatedDesign) {
    return {
      min: 400,
      max: 1200,
      currency: "$",
      note: "Оновлення дизайну",
    };
  }

  // No mobile
  if (hasNoMobile) {
    return {
      min: 300,
      max: 800,
      currency: "$",
      note: "Адаптація для мобільних",
    };
  }

  // Minor issues
  if (!lead.hasSsl || !lead.hasContactForm) {
    return {
      min: 200,
      max: 600,
      currency: "$",
      note: "Дрібні покращення",
    };
  }

  // Modern site
  return {
    min: 50,
    max: 150,
    currency: "$",
    note: "Технічна підтримка",
  };
}
