export type LeadScore = "HOT" | "WARM" | "COLD";
export type DesignScore = "ancient" | "outdated" | "modern" | "unknown";
export type LeadStatus = "new" | "contacted" | "replied" | "not_interested" | "deal" | "archived";

export const HOT_YEAR_THRESHOLD = 2020;
export const WARM_YEAR_UPPER = 2023;

export interface LeadBusiness {
  osmId?: string;
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
  securityIssues: string[];
  pageTitle: string;
  hasContactForm: boolean;
  // Real DOM-derived SEO facts (non-empty meta description / any og:* tags).
  // Optional so older saved leads without these fields still type-check.
  hasMetaDescription?: boolean;
  hasOpenGraph?: boolean;
  // True when the page is JS-rendered/blocked and we only saw an empty shell —
  // DOM-derived verdicts (old design, no form, not mobile) are unreliable here.
  analysisLimited?: boolean;
  // Overall score
  score: LeadScore;
  // Lead management
  status: LeadStatus;
  notes: string;
  contactDate: string | null;
}

export function getWebsiteEvidence(
  lead: Pick<LeadBusiness, "website" | "analysisLimited">
): "not-listed" | "limited" | "checked" {
  if (!lead.website || lead.website === "N/A") return "not-listed";
  return lead.analysisLimited ? "limited" : "checked";
}

export function describeWebsiteEvidence(evidence: "not-listed" | "limited"): string {
  return evidence === "not-listed"
    ? "Сайт не вказано в даних карти. Перевірте, чи компанія має власний сайт."
    : "Не вдалося повністю перевірити сайт. Ознаки сайту потребують ручної перевірки.";
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

function hasSeoMetaTags(lead: LeadBusiness): boolean {
  // Real SEO presence = an actual meta description OR Open Graph tags. A <title>
  // alone is NOT SEO (almost every page has one), so we no longer infer SEO from
  // the title length — that made the "no SEO" finding fire essentially never.
  // Fallback for older leads analysed before these fields existed: trust a
  // non-empty title only when we have no real SEO signal recorded at all.
  if (lead.hasMetaDescription || lead.hasOpenGraph) return true;
  if (lead.hasMetaDescription === undefined && lead.hasOpenGraph === undefined) {
    return !!(lead.pageTitle && lead.pageTitle.trim().length > 3);
  }
  return false;
}

// ─── Calculate detailed lead score ──────────────────────────

export function calculateLeadScoreDetailed(lead: LeadBusiness): ScoreBreakdown {
  const evidence = getWebsiteEvidence(lead);
  if (evidence !== "checked") {
    return {
      score: 0,
      rating: "WARM",
      factors: [],
      totalEstimatedValue: { min: 0, max: 0, currency: "$" },
      opportunityText: describeWebsiteEvidence(evidence),
    };
  }

  const factors: ScoreFactor[] = [];
  let totalPoints = 0;

  if (lead.copyrightYear !== null && lead.copyrightYear <= HOT_YEAR_THRESHOLD) {
    factors.push({ name: `Рік у копірайті: ${lead.copyrightYear}`, icon: "📅", points: 0, severity: "info" });
  }

  // No mobile viewport
  if (!lead.isMobileFriendly) {
    factors.push({
      name: "Не виявлено мобільного viewport",
      icon: "📱",
      points: 20,
      severity: "critical",
    });
    totalPoints += 20;
  }

  // No SSL
  if (!lead.hasSsl) {
    factors.push({
      name: "Сторінка відкрилась через HTTP",
      icon: "🔒",
      points: 15,
      severity: "critical",
    });
    totalPoints += 15;
  }

  // No contact form
  if (!lead.hasContactForm) {
    factors.push({
      name: "Не виявлено форми чи посилання для зв’язку",
      icon: "📋",
      points: 10,
      severity: "warning",
    });
    totalPoints += 10;
  }

  // Table-based layout
  if (hasTableLayout(lead.designNotes)) {
    factors.push({
      name: "Таблична верстка",
      icon: "📐",
      points: 10,
      severity: "warning",
    });
    totalPoints += 10;
  }

  // No SEO meta tags
  if (!hasSeoMetaTags(lead)) {
    factors.push({
      name: "Немає SEO мета-тегів",
      icon: "🔍",
      points: 5,
      severity: "info",
    });
    totalPoints += 5;
  }

  // Many inline styles
  if (hasManyInlineStyles(lead.designNotes)) {
    factors.push({
      name: "Багато вбудованих стилів",
      icon: "🎨",
      points: 5,
      severity: "info",
    });
    totalPoints += 5;
  }

  // Clamp score 0-100
  const clampedScore = Math.max(0, Math.min(100, totalPoints));

  const rating = scoreLead(lead.website, lead.copyrightYear, lead.isMobileFriendly, lead.hasSsl, lead.analysisLimited);
  const opportunityText = factors.some(factor => factor.points > 0)
    ? "Ці ознаки головної сторінки можна перевірити вручну. Для оцінки звернення відкрийте фонову перевірку."
    : "Перевірка головної сторінки не виявила конкретної підстави для звернення.";

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
    totalEstimatedValue: { min: 0, max: 0, currency: "$" },
    opportunityText,
  };
}

export function scoreLead(
  website: string,
  _copyrightYear: number | null,
  isMobileFriendly: boolean,
  hasSsl: boolean = true,
  analysisLimited: boolean = false
): LeadScore {
  if (getWebsiteEvidence({ website, analysisLimited }) !== "checked") return "WARM";

  // The quick HTML reading can suggest a review. A verified high-priority
  // opportunity requires identity, contact and service-specific evidence.
  if (!isMobileFriendly || !hasSsl) return "WARM";
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

// ─── Website Validity Check ─────────────────────────────────
// Pure scoring of how worth-contacting a lead is. Lives here (not in
// website-analyzer.ts) so the client bundle never pulls in the analyzer's
// server-only deps (ssrf.ts DoH fetch, cheerio).

export interface WorthinessResult {
  worth: boolean;
  reason: string;
  score: number;
}

export function isWorthContacting(lead: LeadBusiness): WorthinessResult {
  const evidence = getWebsiteEvidence(lead);
  if (evidence !== "checked") {
    return { worth: false, reason: describeWebsiteEvidence(evidence), score: 0 };
  }

  let score = 0;
  const reasons: string[] = [];

  // Ancient design — "very old" means >= 6 years stale, relative to today so the
  // threshold doesn't drift out of date (and doesn't contradict scoreDesign,
  // which still rewards copyrightYear >= currentYear-2).
  const veryOldCutoff = new Date().getFullYear() - 6;
  if (lead.copyrightYear && lead.copyrightYear <= veryOldCutoff) {
    score += 30;
    reasons.push(`Давня дата копірайту (© ${lead.copyrightYear})`);
  } else if (lead.designScore === "ancient") {
    score += 25;
    reasons.push("Дуже старий дизайн сайту");
  }

  // No mobile
  if (!lead.isMobileFriendly) {
    score += 20;
    reasons.push("Не виявлено мобільного viewport");
  }

  // No SSL
  if (!lead.hasSsl) {
    score += 10;
    reasons.push("Сторінка відкрилась через HTTP");
  }

  // No contact form
  if (!lead.hasContactForm) {
    score += 10;
    reasons.push("Не виявлено форми чи посилання для зв’язку");
  }

  // Table-based layout
  if (lead.designNotes && lead.designNotes.some((n) => n.toLowerCase().includes("table"))) {
    score += 10;
    reasons.push("Table-based layout");
  }

  // Modern site with minor issues: penalize
  if (lead.designScore === "modern") {
    if (score > 0) {
      score = Math.min(score, 25);
      reasons.push("Сучасний сайт з дрібними проблемами");
    } else {
      score = 5;
      reasons.push("Сучасний сайт — мало причин для контакту");
    }
  }

  // Outdated but okay
  if (lead.designScore === "outdated" && score <= 10) {
    score = 15;
    reasons.push("Застарілий дизайн, але без серйозних проблем");
  }

  const worth = score >= 40;

  if (reasons.length === 0) {
    reasons.push(score >= 40 ? "Багато проблем для вирішення" : "Мало причин для контакту");
  }

  return {
    worth,
    reason: reasons.join("; "),
    score: Math.min(score, 100),
  };
}
