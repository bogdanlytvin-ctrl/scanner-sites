export type LeadScore = "HOT" | "WARM" | "COLD";
export type DesignScore = "ancient" | "outdated" | "modern" | "unknown";

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
}

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
