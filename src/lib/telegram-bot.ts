// Telegram Bot integration utilities

// ─── Telegram Bot Setup Instructions ────────────────────────

export function generateTelegramBotSetup(): string[] {
  return [
    "1. Відкрийте Telegram та знайдіть бота @BotFather",
    "2. Надішліть команду /newbot",
    "3. Вкажіть ім'я для бота (напр., LeadFinder Bot)",
    "4. Вкажіть username для бота (напр., myleadfinder_bot)",
    "5. Скопіюйте отриманий токен (формат: 123456789:ABCdefGhIjKlMnOpQrStUvWxYz)",
    "6. Для отримання Chat ID: надішліть повідомлення своєму боту, потім відкрийте:",
    "   https://api.telegram.org/bot<ВАШ_ТОКЕН>/getUpdates",
    "7. Знайдіть 'chat':{'id': ...} у відповіді — це ваш Chat ID",
    "8. Вставте токен та Chat ID у налаштуваннях нижче",
  ];
}

export function generateWebhookUrl(botToken: string): string {
  return `https://api.telegram.org/bot${botToken}/setWebhook`;
}

// ─── Notification Message Builder ───────────────────────────

export function buildLeadNotificationMessage(lead: {
  name: string;
  website: string;
  score: string;
  phone: string;
  address: string;
  issues: string;
  worthinessScore?: number;
  worthinessReason?: string;
}): string {
  const scoreEmoji = lead.score === "HOT" ? "🔥" : lead.score === "WARM" ? "⚡" : "❄️";
  const worthinessBadge = lead.worthinessScore !== undefined
    ? `\n🎯 Цінність контакту: ${lead.worthinessScore}/100${lead.worthinessScore >= 40 ? " ✅" : " ⚠️"}`
    : "";
  const worthinessReason = lead.worthinessReason ? `\n📝 ${lead.worthinessReason}` : "";

  return [
    `🆕 <b>Новий лід знайдено!</b>`,
    ``,
    `${scoreEmoji} <b>${lead.name}</b>`,
    `🌐 ${lead.website !== "N/A" ? lead.website : "Немає сайту"}`,
    lead.phone !== "N/A" ? `📞 ${lead.phone}` : "",
    lead.address !== "N/A" ? `📍 ${lead.address}` : "",
    ``,
    `<b>Проблеми:</b>`,
    lead.issues || "Сучасний сайт, але є можливості для покращення",
    worthinessBadge,
    worthinessReason,
  ]
    .filter(Boolean)
    .join("\n");
}
