export type Locale = "ua" | "en" | "ru";

export interface Translations {
  // Header
  appTitle: string;
  appSubtitle: string;
  // Search form
  cityLabel: string;
  cityPlaceholder: string;
  nicheLabel: string;
  nichePlaceholder: string;
  countLabel: string;
  radiusLabel: string;
  searchButton: string;
  searching: string;
  analyzing: string;
  quickKeywords: string;
  // Filters
  allFilter: string;
  onlyFavorites: string;
  onlyWithIssues: string;
  onlyWithWebsite: string;
  websitesOnly: string;
  loadMore: string;
  allStatuses: string;
  // Score labels
  hot: string;
  warm: string;
  cold: string;
  new: string;
  // Dashboard
  totalLeads: string;
  veryOldSites: string;
  notMobile: string;
  noSsl: string;
  noWebsite: string;
  avgEstimate: string;
  filteredLeads: string;
  readyToContact: string;
  // Lead details
  desktop: string;
  mobile: string;
  openSite: string;
  problems: string;
  detailedAnalysis: string;
  technologies: string;
  priceEstimate: string;
  contacts: string;
  phone: string;
  email: string;
  address: string;
  website: string;
  noSiteTopProspect: string;
  noSiteBestProspect: string;
  // Outreach
  writeToOwner: string;
  copyEmail: string;
  openTelegram: string;
  template: string;
  preview: string;
  hide: string;
  theme: string;
  // Lead management
  leadManagement: string;
  status: string;
  contactDate: string;
  notes: string;
  notesPlaceholder: string;
  // Statuses
  statusNew: string;
  statusContacted: string;
  statusInterested: string;
  statusNotInterested: string;
  statusDeal: string;
  statusLost: string;
  // Design scores
  designAncient: string;
  designOutdated: string;
  designModern: string;
  designUnknown: string;
  // Other
  searchHistory: string;
  clearAll: string;
  noResults: string;
  noFiltersResults: string;
  copied: string;
  addToFavorites: string;
  removeFromFavorites: string;
  settings: string;
  exportCsv: string;
  exportExcel: string;
  opportunity: string;
  whyHot: string;
  scoringBreakdown: string;
  error: string;
  notFound: string;
  tryAgain: string;
  // Telegram settings
  telegramSettings: string;
  telegramSettingsDesc: string;
  botToken: string;
  chatId: string;
  notifyNewLeads: string;
  notifyNewLeadsDesc: string;
  hotLeadsOnly: string;
  hotLeadsOnlyDesc: string;
  test: string;
  save: string;
  settingsSaved: string;
  howToSetupBot: string;
  botSetupStep1: string;
  botSetupStep2: string;
  botSetupStep3: string;
  botSetupStep4: string;
  botSetupStep5: string;
  // Toast messages
  emailTemplateCopied: string;
  exportComplete: string;
  noDataToExport: string;
  exportTimeout: string;
  exportError: string;
  historyCleared: string;
  // Footer
  footer: string;
  // Empty state
  emptyTitle: string;
  emptyDescription: string;
  // Misc
  notAvailable: string;
  delete: string;
  formal: string;
  friendly: string;
  direct: string;
  km: string;
  results: string;
  formBadge: string;
  none: string;
}

// ─── Ukrainian translations (default) ────────────────────────

const ua: Translations = {
  appTitle: "Lead Finder",
  appSubtitle: "Платформа лідогенерації • Глобальний пошук • Скріншоти • Розсилка",
  cityLabel: "🏙️ Місто (можна декілька)",
  cityPlaceholder: "Дніпро, Kyiv, Львів, London...",
  nicheLabel: "🎯 Ніша",
  nichePlaceholder: "юрист, dentist...",
  countLabel: "📊 Кількість",
  radiusLabel: "📍 Радіус",
  searchButton: "Знайти ліди",
  searching: "Пошук...",
  analyzing: "Аналіз сайтів...",
  quickKeywords: "Швидко:",
  allFilter: "Всі",
  onlyFavorites: "⭐ Обране",
  onlyWithIssues: "З проблемами",
  onlyWithWebsite: "🌐 Тільки з сайтом",
  websitesOnly: "🌐 З сайтом",
  loadMore: "Показати ще",
  allStatuses: "Усі статуси",
  hot: "HOT",
  warm: "WARM",
  cold: "COLD",
  new: "NEW",
  totalLeads: "Всього лідів",
  veryOldSites: "🏚️ Дуже старі сайти",
  notMobile: "📱 Не мобільні",
  noSsl: "🔒 Без SSL",
  noWebsite: "🚫 Немає сайту",
  avgEstimate: "💰 Сер. оцінка",
  filteredLeads: "лідів відфільтровано",
  readyToContact: "Готові до контакту",
  desktop: "Десктоп",
  mobile: "Мобільний",
  openSite: "Відкрити сайт",
  problems: "Проблеми",
  detailedAnalysis: "Детальний аналіз проблем",
  technologies: "Технології та badges",
  priceEstimate: "Оцінка вартості",
  contacts: "Контакти",
  phone: "Телефон",
  email: "Email",
  address: "Адреса",
  website: "Сайт",
  noSiteTopProspect: "⚠️ Немає сайту — топ prospect!",
  noSiteBestProspect: "🚫 Немає сайту — найкращий prospect!",
  writeToOwner: "Написати власнику",
  copyEmail: "Скопіювати Email",
  openTelegram: "Відкрити Telegram",
  template: "Шаблон:",
  preview: "Перегляд",
  hide: "Сховати",
  theme: "Тема: ",
  leadManagement: "Управління лідом",
  status: "Статус",
  contactDate: "Дата контакту",
  notes: "Замітки",
  notesPlaceholder: "Додайте замітку про цей лід...",
  statusNew: "Новий",
  statusContacted: "Написав",
  statusInterested: "Відповів",
  statusNotInterested: "Нецікаво",
  statusDeal: "Укладено",
  statusLost: "В Архів",
  designAncient: "Дуже старий",
  designOutdated: "Застарілий",
  designModern: "Сучасний",
  designUnknown: "Не визначено",
  searchHistory: "Історія пошуків",
  clearAll: "Очистити все",
  noResults: "Нічого не знайдено.",
  noFiltersResults: "Немає лідів за обраними фільтрами",
  copied: "Скопійовано!",
  addToFavorites: "Додати в обране",
  removeFromFavorites: "Видалити з обраного",
  settings: "Налаштування",
  exportCsv: "CSV",
  exportExcel: "Excel",
  opportunity: "Можливість",
  whyHot: "Чому HOT",
  scoringBreakdown: "Розбивка оцінки",
  error: "Помилка",
  notFound: "Не знайдено",
  tryAgain: "Спробувати ще",
  telegramSettings: "Налаштування Telegram Bot",
  telegramSettingsDesc: "Отримуйте сповіщення про нові ліди безпосередньо в Telegram",
  botToken: "Bot Token",
  chatId: "Chat ID",
  notifyNewLeads: "Сповіщення про нові ліди",
  notifyNewLeadsDesc: "Надсилати повідомлення при пошуку",
  hotLeadsOnly: "Тільки HOT ліди",
  hotLeadsOnlyDesc: "Сповіщати лише про найкращі ліди",
  test: "Тест",
  save: "Зберегти",
  settingsSaved: "Налаштування збережено",
  howToSetupBot: "Як налаштувати Telegram Bot?",
  botSetupStep1: "1. Відкрийте Telegram та знайдіть @BotFather",
  botSetupStep2: "2. Надішліть /newbot та слідуйте інструкціям",
  botSetupStep3: "3. Скопіюйте отриманий Bot Token",
  botSetupStep4: "4. Для Chat ID: надішліть повідомлення боту, потім відкрийте:",
  botSetupStep5: "5. Знайдіть {'chat':{'id': ...} у відповіді",
  emailTemplateCopied: "Email шаблон скопійовано!",
  exportComplete: "Експортовано лідів",
  noDataToExport: "Немає даних для експорту",
  exportTimeout: "Таймаут експорту",
  exportError: "Помилка експорту",
  historyCleared: "Історію очищено",
  footer: "Lead Finder • Безкоштовна лідогенерація • OpenStreetMap + thum.io",
  emptyTitle: "Знайдіть та перегляньте сайти конкурентів",
  emptyDescription: "Скріншоти сайтів, аналіз дизайну, контакти, соцмережі. Все що потрібно для пошуку клієнтів. Підтримка пошуку в декількох містах.",
  notAvailable: "Немає",
  delete: "Видалити",
  formal: "форм.",
  friendly: "дружн.",
  direct: "прям.",
  km: "км",
  results: "рез.",
  formBadge: "Форма",
  none: "—",
};

// ─── English translations ────────────────────────────────────

const en: Translations = {
  appTitle: "Lead Finder",
  appSubtitle: "Lead Generation Platform • Global Search • Screenshots • Outreach",
  cityLabel: "🏙️ City (multiple allowed)",
  cityPlaceholder: "Dnipro, Kyiv, London, NYC...",
  nicheLabel: "🎯 Niche",
  nichePlaceholder: "lawyer, dentist...",
  countLabel: "📊 Count",
  radiusLabel: "📍 Radius",
  searchButton: "Find Leads",
  searching: "Searching...",
  analyzing: "Analyzing sites...",
  quickKeywords: "Quick:",
  allFilter: "All",
  onlyFavorites: "⭐ Favorites",
  onlyWithIssues: "With issues",
  onlyWithWebsite: "🌐 With website only",
  websitesOnly: "🌐 With website",
  loadMore: "Load more",
  allStatuses: "All statuses",
  hot: "HOT",
  warm: "WARM",
  cold: "COLD",
  new: "NEW",
  totalLeads: "Total leads",
  veryOldSites: "🏚️ Very old sites",
  notMobile: "📱 Not mobile",
  noSsl: "🔒 No SSL",
  noWebsite: "🚫 No website",
  avgEstimate: "💰 Avg. estimate",
  filteredLeads: "leads filtered",
  readyToContact: "Ready to contact",
  desktop: "Desktop",
  mobile: "Mobile",
  openSite: "Open site",
  problems: "Problems",
  detailedAnalysis: "Detailed problem analysis",
  technologies: "Technologies & badges",
  priceEstimate: "Price estimate",
  contacts: "Contacts",
  phone: "Phone",
  email: "Email",
  address: "Address",
  website: "Website",
  noSiteTopProspect: "⚠️ No website — top prospect!",
  noSiteBestProspect: "🚫 No website — best prospect!",
  writeToOwner: "Write to owner",
  copyEmail: "Copy Email",
  openTelegram: "Open Telegram",
  template: "Template:",
  preview: "Preview",
  hide: "Hide",
  theme: "Subject: ",
  leadManagement: "Lead Management",
  status: "Status",
  contactDate: "Contact date",
  notes: "Notes",
  notesPlaceholder: "Add a note about this lead...",
  statusNew: "New",
  statusContacted: "Contacted",
  statusInterested: "Replied",
  statusNotInterested: "Not interested",
  statusDeal: "Deal",
  statusLost: "Archived",
  designAncient: "Very old",
  designOutdated: "Outdated",
  designModern: "Modern",
  designUnknown: "Unknown",
  searchHistory: "Search history",
  clearAll: "Clear all",
  noResults: "Nothing found.",
  noFiltersResults: "No leads match selected filters",
  copied: "Copied!",
  addToFavorites: "Add to favorites",
  removeFromFavorites: "Remove from favorites",
  settings: "Settings",
  exportCsv: "CSV",
  exportExcel: "Excel",
  opportunity: "Opportunity",
  whyHot: "Why HOT",
  scoringBreakdown: "Scoring breakdown",
  error: "Error",
  notFound: "Not found",
  tryAgain: "Try again",
  telegramSettings: "Telegram Bot Settings",
  telegramSettingsDesc: "Get notifications about new leads directly in Telegram",
  botToken: "Bot Token",
  chatId: "Chat ID",
  notifyNewLeads: "New lead notifications",
  notifyNewLeadsDesc: "Send messages during search",
  hotLeadsOnly: "HOT leads only",
  hotLeadsOnlyDesc: "Notify only about best leads",
  test: "Test",
  save: "Save",
  settingsSaved: "Settings saved",
  howToSetupBot: "How to setup Telegram Bot?",
  botSetupStep1: "1. Open Telegram and find @BotFather",
  botSetupStep2: "2. Send /newbot and follow instructions",
  botSetupStep3: "3. Copy the received Bot Token",
  botSetupStep4: "4. For Chat ID: send a message to the bot, then open:",
  botSetupStep5: "5. Find {'chat':{'id': ...} in the response",
  emailTemplateCopied: "Email template copied!",
  exportComplete: "Exported leads",
  noDataToExport: "No data to export",
  exportTimeout: "Export timeout",
  exportError: "Export error",
  historyCleared: "History cleared",
  footer: "Lead Finder • Free Lead Generation • OpenStreetMap + thum.io",
  emptyTitle: "Find and review competitor sites",
  emptyDescription: "Site screenshots, design analysis, contacts, social media. Everything you need for lead generation. Multi-city search support.",
  notAvailable: "N/A",
  delete: "Delete",
  formal: "formal",
  friendly: "friendly",
  direct: "direct",
  km: "km",
  results: "res.",
  formBadge: "Form",
  none: "—",
};

// ─── Russian translations (based on Ukrainian) ───────────────

const ru: Translations = {
  appTitle: "Lead Finder",
  appSubtitle: "Платформа лидогенерации • Глобальный поиск • Скриншоты • Рассылка",
  cityLabel: "🏙️ Город (можно несколько)",
  cityPlaceholder: "Днепр, Kyiv, London, NYC...",
  nicheLabel: "🎯 Ниша",
  nichePlaceholder: "юрист, dentist...",
  countLabel: "📊 Количество",
  radiusLabel: "📍 Радиус",
  searchButton: "Найти лиды",
  searching: "Поиск...",
  analyzing: "Анализ сайтов...",
  quickKeywords: "Быстро:",
  allFilter: "Все",
  onlyFavorites: "⭐ Избранное",
  onlyWithIssues: "С проблемами",
  onlyWithWebsite: "🌐 Только с сайтом",
  websitesOnly: "🌐 С сайтом",
  loadMore: "Показать ещё",
  allStatuses: "Все статусы",
  hot: "HOT",
  warm: "WARM",
  cold: "COLD",
  new: "NEW",
  totalLeads: "Всего лидов",
  veryOldSites: "🏚️ Очень старые сайты",
  notMobile: "📱 Не мобильные",
  noSsl: "🔒 Без SSL",
  noWebsite: "🚫 Нет сайта",
  avgEstimate: "💰 Ср. оценка",
  filteredLeads: "лидов отфильтровано",
  readyToContact: "Готовы к контакту",
  desktop: "Десктоп",
  mobile: "Мобильный",
  openSite: "Открыть сайт",
  problems: "Проблемы",
  detailedAnalysis: "Детальный анализ проблем",
  technologies: "Технологии и badges",
  priceEstimate: "Оценка стоимости",
  contacts: "Контакты",
  phone: "Телефон",
  email: "Email",
  address: "Адрес",
  website: "Сайт",
  noSiteTopProspect: "⚠️ Нет сайта — топ перспектив!",
  noSiteBestProspect: "🚫 Нет сайта — лучшая перспектива!",
  writeToOwner: "Написать владельцу",
  copyEmail: "Скопировать Email",
  openTelegram: "Открыть Telegram",
  template: "Шаблон:",
  preview: "Просмотр",
  hide: "Скрыть",
  theme: "Тема: ",
  leadManagement: "Управление лидом",
  status: "Статус",
  contactDate: "Дата контакта",
  notes: "Заметки",
  notesPlaceholder: "Добавьте заметку об этом лиде...",
  statusNew: "Новый",
  statusContacted: "Написал",
  statusInterested: "Ответил",
  statusNotInterested: "Не интересно",
  statusDeal: "Сделка",
  statusLost: "В Архив",
  designAncient: "Очень старый",
  designOutdated: "Устаревший",
  designModern: "Современный",
  designUnknown: "Не определено",
  searchHistory: "История поисков",
  clearAll: "Очистить всё",
  noResults: "Ничего не найдено.",
  noFiltersResults: "Нет лидов по выбранным фильтрам",
  copied: "Скопировано!",
  addToFavorites: "Добавить в избранное",
  removeFromFavorites: "Удалить из избранного",
  settings: "Настройки",
  exportCsv: "CSV",
  exportExcel: "Excel",
  opportunity: "Возможность",
  whyHot: "Почему HOT",
  scoringBreakdown: "Разбивка оценки",
  error: "Ошибка",
  notFound: "Не найдено",
  tryAgain: "Попробовать ещё",
  telegramSettings: "Настройки Telegram Bot",
  telegramSettingsDesc: "Получайте уведомления о новых лидах прямо в Telegram",
  botToken: "Bot Token",
  chatId: "Chat ID",
  notifyNewLeads: "Уведомления о новых лидах",
  notifyNewLeadsDesc: "Отправлять сообщения при поиске",
  hotLeadsOnly: "Только HOT лиды",
  hotLeadsOnlyDesc: "Уведомлять только о лучших лидах",
  test: "Тест",
  save: "Сохранить",
  settingsSaved: "Настройки сохранены",
  howToSetupBot: "Как настроить Telegram Bot?",
  botSetupStep1: "1. Откройте Telegram и найдите @BotFather",
  botSetupStep2: "2. Отправьте /newbot и следуйте инструкциям",
  botSetupStep3: "3. Скопируйте полученный Bot Token",
  botSetupStep4: "4. Для Chat ID: отправьте сообщение боту, затем откройте:",
  botSetupStep5: "5. Найдите {'chat':{'id': ...} в ответе",
  emailTemplateCopied: "Email шаблон скопирован!",
  exportComplete: "Экспортировано лидов",
  noDataToExport: "Нет данных для экспорта",
  exportTimeout: "Таймаут экспорта",
  exportError: "Ошибка экспорта",
  historyCleared: "История очищена",
  footer: "Lead Finder • Бесплатная лидогенерация • OpenStreetMap + thum.io",
  emptyTitle: "Найдите и просмотрите сайты конкурентов",
  emptyDescription: "Скриншоты сайтов, анализ дизайна, контакты, соцсети. Всё что нужно для поиска клиентов. Поддержка поиска в нескольких городах.",
  notAvailable: "Нет",
  delete: "Удалить",
  formal: "офиц.",
  friendly: "друж.",
  direct: "прям.",
  km: "км",
  results: "рез.",
  formBadge: "Форма",
  none: "—",
};

// ─── Translation maps ────────────────────────────────────────

const translationMap: Record<Locale, Translations> = { ua, en, ru };

/**
 * Get translations for a given locale.
 * Default is Ukrainian ("ua").
 */
export function getTranslations(locale: Locale = "ua"): Translations {
  return translationMap[locale] || translationMap.ua;
}

/**
 * Detect locale from text content.
 * Heuristic: check for Cyrillic characters specific to Ukrainian vs Russian.
 */
export function detectLocale(text: string): Locale {
  // Check for Cyrillic
  const hasCyrillic = /[а-яА-ЯёЁіІїЇєЄґҐ]/.test(text);
  if (!hasCyrillic) return "en";

  // Ukrainian-specific characters
  const hasUkrainian = /[іІїЇєЄґҐ]/.test(text);
  if (hasUkrainian) return "ua";

  // Russian-specific
  const hasRussian = /[ёЁ]/.test(text);
  if (hasRussian) return "ru";

  // Default to Ukrainian for ambiguous Cyrillic
  return "ua";
}

/**
 * All available locales.
 */
export const AVAILABLE_LOCALES: { value: Locale; label: string; flag: string }[] = [
  { value: "ua", label: "Українська", flag: "🇺🇦" },
  { value: "en", label: "English", flag: "🇬🇧" },
  { value: "ru", label: "Русский", flag: "🇷🇺" },
];

export { ua, en, ru };
