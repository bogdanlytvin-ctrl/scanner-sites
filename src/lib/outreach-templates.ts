import type { LeadBusiness } from "./scoring";

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
  const issues: string[] = [];

  // No website at all
  if (!lead.website || lead.website === "N/A") {
    issues.push("🚫 Немає вебсайту взагалі — найкращий prospect для створення нового сайту!");
    return issues.join("\n");
  }

  // Copyright year issues
  if (lead.copyrightYear) {
    const currentYear = new Date().getFullYear();
    const age = currentYear - lead.copyrightYear;
    if (age >= 8) {
      issues.push(`📅 © ${lead.copyrightYear} — сайт не оновлювався ${age} років`);
    } else if (age >= 4) {
      issues.push(`📅 © ${lead.copyrightYear} — сайт не оновлювався ${age} роки`);
    }
  }

  // Mobile
  if (!lead.isMobileFriendly) {
    issues.push("📱 Не адаптивний для мобільних пристроїв");
  }

  // SSL
  if (!lead.hasSsl) {
    issues.push("🔒 Немає SSL сертифікату (небезпечно для відвідувачів)");
  }

  // Technologies
  const oldTechs: string[] = [];
  const knownOldTech = ["Joomla", "Drupal", "WordPress", "Wix", "uCoz", "Joomla!", "1C-Bitrix", "Bitrix"];
  lead.technologies.forEach((tech) => {
    const matched = knownOldTech.find((ot) => tech.toLowerCase().includes(ot.toLowerCase()));
    if (matched) {
      oldTechs.push(matched);
    }
  });
  if (oldTechs.length > 0) {
    issues.push(`🔧 Застаріла технологія: ${oldTechs.join(", ")}`);
  }

  // Design notes
  if (lead.designNotes && lead.designNotes.length > 0) {
    lead.designNotes.forEach((note) => {
      if (
        note.toLowerCase().includes("table") ||
        note.toLowerCase().includes("table-based")
      ) {
        issues.push("📐 Table-based layout (застаріла розмітка)");
      } else if (
        note.toLowerCase().includes("old") ||
        note.toLowerCase().includes("стар") ||
        note.toLowerCase().includes("застар")
      ) {
        issues.push(`⚠️ ${note}`);
      }
    });
  }

  // No contact form
  if (!lead.hasContactForm) {
    issues.push("📋 Немає форми для зв'язку (клієнти не можуть залишити заявку)");
  }

  if (issues.length === 0) {
    issues.push("✅ Сайт виглядає сучасним, але є можливості для покращення SEO та конверсії");
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
