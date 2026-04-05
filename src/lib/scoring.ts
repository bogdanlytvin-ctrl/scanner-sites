export type LeadScore = "HOT" | "WARM" | "COLD";
export type DesignScore = "ancient" | "outdated" | "modern" | "unknown";
export type LeadStatus = "new" | "contacted" | "replied" | "not_interested" | "deal" | "archived";

export const HOT_YEAR_THRESHOLD = 2018;
export const WARM_YEAR_UPPER = 2021;

export interface LeadBusiness {
  name: string;
  phone: string;
  website: string;
  address: string;
  email: string;
  facebook: string;
  instagram: string;
  telegram: string;
  openingHours: string;
  description: string;
  rating: number | null;
  reviews: number;
  // Website analysis
  copyrightYear: number | null;
  isMobileFriendly: boolean;
  hasSsl: boolean;
  finalUrl: string;
  technologies: string[];
  designScore: DesignScore;
  designNotes: string[];
  pageTitle: string;
  hasContactForm: boolean;
  // Overall score
  score: LeadScore;
  // Lead management
  status: LeadStatus;
  notes: string;
  contactDate: string | null;
}

// ─── Detailed scoring types ──────────────────────────────────

export interface ScoreFactor {
  name: string;           // e.g. "Немає SSL", "Старий дизайн"
  icon: string;           // e.g. "🔒", "📅"
  points: number;         // positive = worse site = better prospect
  severity: "critical" | "warning" | "info";
}

export interface ScoreBreakdown {
  score: number;           // 0-100, higher = worse site = better prospect
  rating: "HOT" | "WARM" | "COLD" | "NEW";
  factors: ScoreFactor[];
  totalEstimatedValue: { min: number; max: number; currency: string };
  opportunityText: string; // Ukrainian text explaining opportunity
}

// ─── Helper: detect old technologies ─────────────────────────

const OLD_TECH_PATTERNS = [
  "joomla", "drupal", "ucoz", "uCoz", "1c-bitrix", "bitrix",
  "modx", "wordpress", "phpnuke", "joomla!",
];

function hasOldTechnology(technologies: string[]): boolean {
  return technologies.some((t) =>
    OLD_TECH_PATTERNS.some((pattern) => t.toLowerCase().includes(pattern.toLowerCase()))
  );
}

function hasTableLayout(designNotes: string[]): boolean {
  return designNotes.some((note) =>
    /table[_\s]?based|таблиці|table layout/i.test(note)
  );
}

function hasManyInlineStyles(designNotes: string[]): boolean {
  return designNotes.some((note) =>
    /inline.*style|вбудовані.*стилі|inline.*css/i.test(note)
  );
}

function hasSeoMetaTags(pageTitle: string, designNotes: string[]): boolean {
  // If there's a meaningful page title, likely has meta tags
  if (pageTitle && pageTitle.length > 3) return true;
  // Check design notes for SEO-related notes
  const seoNote = designNotes.find((n) => /meta|seo|description|keywords/i.test(n));
  if (seoNote) return true;
  return false;
}

function hasSocialLinks(lead: LeadBusiness): boolean {
  return !!(lead.facebook || lead.instagram || lead.telegram);
}

// ─── Calculate detailed lead score ──────────────────────────

export function calculateLeadScoreDetailed(lead: LeadBusiness): ScoreBreakdown {
  const factors: ScoreFactor[] = [];
  let totalPoints = 0;

  // 1. No website at all
  const noWebsite = !lead.website || lead.website === "N/A";
  if (noWebsite) {
    factors.push({
      name: "Немає вебсайту",
      icon: "🚫",
      points: 60,
      severity: "critical",
    });
    totalPoints += 60;
  } else {
    // 2. Copyright year checks
    if (lead.copyrightYear !== null) {
      if (lead.copyrightYear <= 2016) {
        factors.push({
          name: `Застарілий копірайт (${lead.copyrightYear})`,
          icon: "📅",
          points: 25,
          severity: "critical",
        });
        totalPoints += 25;
      } else if (lead.copyrightYear >= 2017 && lead.copyrightYear <= 2019) {
        factors.push({
          name: `Старий копірайт (${lead.copyrightYear})`,
          icon: "📅",
          points: 15,
          severity: "warning",
        });
        totalPoints += 15;
      }
    }

    // 3. No mobile viewport
    if (!lead.isMobileFriendly) {
      factors.push({
        name: "Не мобільний",
        icon: "📱",
        points: 20,
        severity: "critical",
      });
      totalPoints += 20;
    }

    // 4. No SSL
    if (!lead.hasSsl) {
      factors.push({
        name: "Немає SSL сертифікату",
        icon: "🔒",
        points: 15,
        severity: "critical",
      });
      totalPoints += 15;
    }

    // 5. Old technology
    if (hasOldTechnology(lead.technologies)) {
      const oldTech = lead.technologies.filter((t) =>
        OLD_TECH_PATTERNS.some((p) => t.toLowerCase().includes(p.toLowerCase()))
      );
      factors.push({
        name: `Застарілі технології: ${oldTech.join(", ")}`,
        icon: "🔧",
        points: 20,
        severity: "critical",
      });
      totalPoints += 20;
    }

    // 6. No contact form
    if (!lead.hasContactForm) {
      factors.push({
        name: "Немає форми контакту",
        icon: "📋",
        points: 10,
        severity: "warning",
      });
      totalPoints += 10;
    }

    // 7. Table-based layout
    if (hasTableLayout(lead.designNotes)) {
      factors.push({
        name: "Таблична верстка",
        icon: "📐",
        points: 10,
        severity: "warning",
      });
      totalPoints += 10;
    }

    // 8. No SEO meta tags
    if (!hasSeoMetaTags(lead.pageTitle, lead.designNotes)) {
      factors.push({
        name: "Немає SEO мета-тегів",
        icon: "🔍",
        points: 5,
        severity: "info",
      });
      totalPoints += 5;
    }

    // 9. No social links
    if (!hasSocialLinks(lead)) {
      factors.push({
        name: "Немає посилань на соцмережі",
        icon: "🔗",
        points: 5,
        severity: "info",
      });
      totalPoints += 5;
    }

    // 10. Many inline styles
    if (hasManyInlineStyles(lead.designNotes)) {
      factors.push({
        name: "Багато вбудованих стилів",
        icon: "🎨",
        points: 5,
        severity: "info",
      });
      totalPoints += 5;
    }
  }

  // Clamp score 0-100
  const clampedScore = Math.max(0, Math.min(100, totalPoints));

  // Determine rating
  let rating: ScoreBreakdown["rating"];
  if (clampedScore >= 60) rating = "HOT";
  else if (clampedScore >= 30) rating = "WARM";
  else if (clampedScore >= 10) rating = "COLD";
  else rating = "NEW";

  // Calculate estimated value
  const { min: estMin, max: estMax } = estimateValueFromScore(clampedScore);

  // Generate opportunity text
  const opportunityText = generateOpportunityText(clampedScore, estMin, estMax, rating);

  // Sort factors by severity (critical first) then by points descending
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  factors.sort((a, b) => {
    if (severityOrder[a.severity] !== severityOrder[b.severity]) {
      return severityOrder[a.severity] - severityOrder[b.severity];
    }
    return b.points - a.points;
  });

  return {
    score: clampedScore,
    rating,
    factors,
    totalEstimatedValue: { min: estMin, max: estMax, currency: "$" },
    opportunityText,
  };
}

function estimateValueFromScore(score: number): { min: number; max: number } {
  if (score >= 80) return { min: 800, max: 2000 };
  if (score >= 60) return { min: 500, max: 1500 };
  if (score >= 45) return { min: 300, max: 800 };
  if (score >= 30) return { min: 200, max: 500 };
  if (score >= 15) return { min: 100, max: 300 };
  if (score >= 10) return { min: 50, max: 200 };
  return { min: 0, max: 100 };
}

function generateOpportunityText(
  score: number,
  estMin: number,
  estMax: number,
  rating: ScoreBreakdown["rating"]
): string {
  const priceRange = `$${estMin}-$${estMax}`;

  if (rating === "HOT") {
    if (!score || score === 60 && false) {
      // generic HOT — no website or very bad
    }
    return `Власник потребує повний редизайн або створення сайту з нуля. Оцінена вартість: ${priceRange}. Високий пріоритет контакту.`;
  }

  if (rating === "WARM") {
    if (score >= 45) {
      return `Сайт має кілька серйозних проблем, які потребують уваги. Оцінена вартість: ${priceRange}. Середній пріоритет.`;
    }
    return `Сайт має помірні проблеми. Можна запропонувати оптимізацію або частковий редизайн. Оцінена вартість: ${priceRange}. Середній пріоритет.`;
  }

  if (rating === "COLD") {
    return `Сучасний сайт з мінімальними покращеннями. Можна запропонувати дрібні покращення або підтримку. Оцінена вартість: ${priceRange}. Низький пріоритет.`;
  }

  // NEW
  return `Сучасний сайт в хорошому стані. Можна запропонувати технічну підтримку або розширення. Оцінена вартість: ${priceRange}. Низький пріоритет.`;
}

// ─── Existing scoring functions (unchanged) ──────────────────

export function scoreLead(
  website: string,
  copyrightYear: number | null,
  _isMobileFriendly: boolean
): LeadScore {
  if (!website || website === "N/A") return "HOT";
  if (copyrightYear === null) return "WARM";
  if (copyrightYear <= HOT_YEAR_THRESHOLD) return "HOT";
  if (copyrightYear <= WARM_YEAR_UPPER) return "WARM";
  return "COLD";
}

export function getScoreColor(score: LeadScore): {
  bg: string;
  text: string;
  border: string;
  label: string;
  emoji: string;
} {
  switch (score) {
    case "HOT":
      return { bg: "bg-red-500/15", text: "text-red-700 dark:text-red-400", border: "border-red-500/30", label: "HOT", emoji: "🔥" };
    case "WARM":
      return { bg: "bg-yellow-500/15", text: "text-yellow-700 dark:text-yellow-400", border: "border-yellow-500/30", label: "WARM", emoji: "⚡" };
    case "COLD":
      return { bg: "bg-green-500/15", text: "text-green-700 dark:text-green-400", border: "border-green-500/30", label: "COLD", emoji: "❄️" };
  }
}

export function getDetailedScoreColor(rating: ScoreBreakdown["rating"]): {
  bg: string;
  text: string;
  border: string;
  label: string;
  emoji: string;
} {
  switch (rating) {
    case "HOT":
      return { bg: "bg-red-500/15", text: "text-red-700 dark:text-red-400", border: "border-red-500/30", label: "HOT", emoji: "🔥" };
    case "WARM":
      return { bg: "bg-yellow-500/15", text: "text-yellow-700 dark:text-yellow-400", border: "border-yellow-500/30", label: "WARM", emoji: "⚡" };
    case "COLD":
      return { bg: "bg-green-500/15", text: "text-green-700 dark:text-green-400", border: "border-green-500/30", label: "COLD", emoji: "❄️" };
    case "NEW":
      return { bg: "bg-emerald-500/15", text: "text-emerald-700 dark:text-emerald-400", border: "border-emerald-500/30", label: "NEW", emoji: "✅" };
  }
}

export function getDesignColor(score: DesignScore): {
  bg: string;
  text: string;
  label: string;
  emoji: string;
} {
  switch (score) {
    case "ancient":
      return { bg: "bg-red-100 dark:bg-red-950/40", text: "text-red-700 dark:text-red-400", label: "Дуже старий", emoji: "🏚️" };
    case "outdated":
      return { bg: "bg-orange-100 dark:bg-orange-950/40", text: "text-orange-700 dark:text-orange-400", label: "Застарілий", emoji: "📱" };
    case "modern":
      return { bg: "bg-green-100 dark:bg-green-950/40", text: "text-green-700 dark:text-green-400", label: "Сучасний", emoji: "✨" };
    case "unknown":
      return { bg: "bg-slate-100 dark:bg-slate-800", text: "text-slate-600 dark:text-slate-400", label: "Не визначено", emoji: "❓" };
  }
}

export function getStatusColor(status: string): { bg: string; text: string; label: string; emoji: string } {
  switch (status) {
    case "new":
      return { bg: "bg-blue-100 dark:bg-blue-950/40", text: "text-blue-700 dark:text-blue-400", label: "Новий", emoji: "🆕" };
    case "contacted":
      return { bg: "bg-amber-100 dark:bg-amber-950/40", text: "text-amber-700 dark:text-amber-400", label: "Написав", emoji: "✉️" };
    case "replied":
      return { bg: "bg-emerald-100 dark:bg-emerald-950/40", text: "text-emerald-700 dark:text-emerald-400", label: "Відповів", emoji: "💬" };
    case "not_interested":
      return { bg: "bg-slate-100 dark:bg-slate-800", text: "text-slate-600 dark:text-slate-400", label: "Нецікаво", emoji: "🚫" };
    case "deal":
      return { bg: "bg-green-100 dark:bg-green-950/40", text: "text-green-700 dark:text-green-400", label: "Укладено", emoji: "🎉" };
    case "archived":
      return { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-600 dark:text-gray-400", label: "В Архів", emoji: "📦" };
    default:
      return { bg: "bg-slate-100 dark:bg-slate-800", text: "text-slate-600 dark:text-slate-400", label: status, emoji: "❓" };
  }
}

export function getStatusList(): { value: string; label: string; emoji: string }[] {
  return [
    { value: "new", label: "Новий", emoji: "🆕" },
    { value: "contacted", label: "Написав", emoji: "✉️" },
    { value: "replied", label: "Відповів", emoji: "💬" },
    { value: "not_interested", label: "Нецікаво", emoji: "🚫" },
    { value: "deal", label: "Укладено", emoji: "🎉" },
    { value: "archived", label: "В Архів", emoji: "📦" },
  ];
}
