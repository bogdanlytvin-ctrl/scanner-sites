import { describeWebsiteEvidence, getWebsiteEvidence, HOT_YEAR_THRESHOLD } from "./scoring";
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
    id: "old-design",
    icon: "📅",
    problem: "Давня дата копірайту",
    description: "На сторінці виявлено копірайт 2020 року або старіший. Фактичний стан дизайну потребує візуальної перевірки.",
    solution: "Повний редизайн сайту з використанням сучасних трендів UI/UX, адаптивної верстки та свіжої палітри кольорів.",
    benefits: [
      "Сучасний та привабливий вигляд",
      "Краще враження для відвідувачів",
      "Вища конверсія у клієнтів",
      "Адаптивність для всіх пристроїв",
    ],
    priceRange: { min: 600, max: 2000 },
    detectCondition: "copyrightYear && copyrightYear <= 2020",
  },
  {
    id: "not-mobile-friendly",
    icon: "📱",
    problem: "Мобільна адаптація потребує перевірки",
    description: "На перевіреній сторінці не виявлено стандартного налаштування ширини екрана для мобільних пристроїв.",
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
    problem: "Отримано сторінку через HTTP",
    description: "Під час перевірки сторінка відкрилась за незашифрованим протоколом HTTP.",
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
    id: "no-contact-form",
    icon: "📋",
    problem: "Не виявлено форми чи посилання для зв’язку",
    description: "На перевіреній сторінці не виявлено контактної форми або посилання на розділ зв’язку.",
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
    description: "На перевіреній сторінці не знайдено метаопису й тегів Open Graph.",
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
    id: "slow-inline-styles",
    icon: "🎨",
    problem: "Ознаки вбудованих стилів",
    description: "На сторінці є ознаки вбудованих стилів. Швидкість варто виміряти окремо.",
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
  if (getWebsiteEvidence(lead) !== "checked") return [];
  const matched: ProblemType[] = [];

  for (const prob of problemLibrary) {
    let matches = false;

    switch (prob.id) {
      case "old-design":
        matches = !!(lead.copyrightYear && lead.copyrightYear <= HOT_YEAR_THRESHOLD);
        break;
      case "not-mobile-friendly":
        matches = !lead.isMobileFriendly;
        break;
      case "no-ssl":
        matches = !lead.hasSsl;
        break;
      case "no-contact-form":
        matches = !lead.hasContactForm;
        break;
      case "table-layout":
        matches = !!(lead.designNotes && lead.designNotes.some((n) =>
          n.toLowerCase().includes("table")
        ));
        break;
      case "missing-seo": {
        // Real SEO = a meta description or Open Graph tags (a <title> alone is
        // not SEO). Fall back to title only for older leads saved before these
        // fields existed. Mirrors hasSeoMetaTags() in scoring.ts.
        const seoKnown =
          lead.hasMetaDescription !== undefined || lead.hasOpenGraph !== undefined;
        const hasSeo = seoKnown
          ? !!(lead.hasMetaDescription || lead.hasOpenGraph)
          : !!lead.pageTitle;
        matches = !hasSeo;
        break;
      }
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

Я звернув увагу на вашу компанію в місті {CITY}. Можу допомогти з діагностикою та розвитком сайту.

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

Я вебдизайнер і хочу запропонувати коротку консультацію щодо вашої присутності онлайн.

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

Можу допомогти перевірити, як ваш бізнес представлений онлайн.
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
    body: `Привіт! 👋 Я вебдизайнер. Можу запропонувати {BIZ_NAME} консультацію щодо сайту.

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

Ось короткий підсумок попередньої перевірки.
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
    name: "Пропозиція створення сайту",
    subject: "Пропозиція щодо сайту для {BIZ_NAME}",
    channel: "email",
    tone: "direct",
    body: `Шановне керівництво {BIZ_NAME},

Я знайшов інформацію про вашу компанію в {CITY}. Якщо створення або оновлення сайту для вас актуальне, буду радий обговорити завдання.

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

Маю пропозицію щодо вашої присутності онлайн.
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

Можу запропонувати коротку консультацію щодо вашого сайту.
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
  const evidence = getWebsiteEvidence(lead);
  if (evidence !== "checked") return describeWebsiteEvidence(evidence);

  const problems = getProblemsForLead(lead);
  if (!problems.length) return "На перевіреній сторінці не виявлено типових ознак для покращення.";

  return problems.map((prob) => `${prob.icon} ${prob.problem} — ${prob.description}`).join("\n");
}

export function estimatePrice(lead: LeadBusiness): {
  min: number;
  max: number;
  currency: string;
  note: string;
} {
  const evidence = getWebsiteEvidence(lead);
  if (evidence !== "checked") {
    return { min: 0, max: 0, currency: "$", note: "Потрібна перевірка перед оцінкою" };
  }

  const hasAncientDesign = lead.designScore === "ancient";
  const hasNoMobile = !lead.isMobileFriendly;
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

  // Ancient design
  if (hasAncientDesign) {
    return {
      min: 600,
      max: 1800,
      currency: "$",
      note: "Редизайн сайту",
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
