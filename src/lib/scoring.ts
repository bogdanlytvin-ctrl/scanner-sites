// Lead scoring logic
// HOT  — no website or site estimated before 2018
// WARM — site between 2019 and 2021
// COLD — modern site (after 2021)

export type LeadScore = "HOT" | "WARM" | "COLD";

export const HOT_YEAR_THRESHOLD = 2018;
export const WARM_YEAR_UPPER = 2021;

export interface LeadBusiness {
  name: string;
  phone: string;
  website: string;
  address: string;
  rating: number | null;
  reviews: number;
  copyrightYear: number | null;
  isMobileFriendly: boolean;
  score: LeadScore;
}

export function scoreLead(
  website: string,
  copyrightYear: number | null,
  _isMobileFriendly: boolean
): LeadScore {
  if (!website || website === "N/A") {
    return "HOT";
  }

  if (copyrightYear === null) {
    return "WARM";
  }

  if (copyrightYear <= HOT_YEAR_THRESHOLD) {
    return "HOT";
  } else if (copyrightYear <= WARM_YEAR_UPPER) {
    return "WARM";
  } else {
    return "COLD";
  }
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
      return {
        bg: "bg-red-500/15",
        text: "text-red-700 dark:text-red-400",
        border: "border-red-500/30",
        label: "HOT",
        emoji: "🔥",
      };
    case "WARM":
      return {
        bg: "bg-yellow-500/15",
        text: "text-yellow-700 dark:text-yellow-400",
        border: "border-yellow-500/30",
        label: "WARM",
        emoji: "⚡",
      };
    case "COLD":
      return {
        bg: "bg-green-500/15",
        text: "text-green-700 dark:text-green-400",
        border: "border-green-500/30",
        label: "COLD",
        emoji: "❄️",
      };
  }
}
