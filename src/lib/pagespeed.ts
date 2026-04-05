/**
 * PageSpeed Insights utility functions
 *
 * Client-side helpers for calling the PageSpeed API endpoint
 * and formatting results for display.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PageSpeedResult {
  url: string;
  strategy: "mobile" | "desktop";
  performanceScore: number | null;
  firstContentfulPaint: number | null;
  largestContentfulPaint: number | null;
  totalBlockingTime: number | null;
  cumulativeLayoutShift: number | null;
  speedIndex: number | null;
  diagnostics: string[];
  error?: string;
}

// ─── API Call ────────────────────────────────────────────────────────────────

/**
 * Calls the local PageSpeed API endpoint to check website performance.
 * Should be called one URL at a time since the API takes 10-30s per request.
 */
export async function checkPageSpeed(
  url: string,
  strategy: "mobile" | "desktop" = "mobile"
): Promise<PageSpeedResult> {
  const resp = await fetch("/api/pagespeed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, strategy }),
  });

  if (!resp.ok) {
    // Try to parse error from response body
    try {
      const contentType = resp.headers.get("content-type");
      if (contentType && contentType.includes("json")) {
        const errorData = await resp.json();
        return {
          url,
          strategy,
          performanceScore: null,
          firstContentfulPaint: null,
          largestContentfulPaint: null,
          totalBlockingTime: null,
          cumulativeLayoutShift: null,
          speedIndex: null,
          diagnostics: [],
          error: errorData.error || `Помилка ${resp.status}`,
        };
      }
    } catch {
      // Fall through to generic error
    }

    return {
      url,
      strategy,
      performanceScore: null,
      firstContentfulPaint: null,
      largestContentfulPaint: null,
      totalBlockingTime: null,
      cumulativeLayoutShift: null,
      speedIndex: null,
      diagnostics: [],
      error: `Помилка ${resp.status}`,
    };
  }

  const data = await resp.json();
  return data as PageSpeedResult;
}

// ─── Formatting Helpers ─────────────────────────────────────────────────────

/**
 * Returns a Tailwind color class based on a performance score (0-100).
 * - Red: < 50 (poor)
 * - Orange: 50-89 (needs improvement)
 * - Green: >= 90 (good)
 */
export function getScoreColor(score: number | null): string {
  if (score === null) return "text-muted-foreground";

  if (score < 50) return "text-red-600 dark:text-red-400";
  if (score < 90) return "text-amber-600 dark:text-amber-400";
  return "text-emerald-600 dark:text-emerald-400";
}

/**
 * Returns a Tailwind background color class based on a performance score (0-100).
 */
export function getScoreBgColor(score: number | null): string {
  if (score === null) return "bg-muted";

  if (score < 50) return "bg-red-100 dark:bg-red-950";
  if (score < 90) return "bg-amber-100 dark:bg-amber-950";
  return "bg-emerald-100 dark:bg-emerald-950";
}

/**
 * Returns a Tailwind border color class based on a performance score (0-100).
 */
export function getScoreBorderColor(score: number | null): string {
  if (score === null) return "border-muted";

  if (score < 50) return "border-red-300 dark:border-red-700";
  if (score < 90) return "border-amber-300 dark:border-amber-700";
  return "border-emerald-300 dark:border-emerald-700";
}

/**
 * Returns a performance rating label based on score.
 */
export function getScoreRating(score: number | null): string {
  if (score === null) return "Н/Д";

  if (score < 50) return "Погано";
  if (score < 90) return "Потребує покращення";
  return "Добре";
}

/**
 * Formats milliseconds to a human-readable string.
 * - < 1000ms → "150ms"
 * - >= 1000ms → "1.5s"
 */
export function formatMs(ms: number | null): string {
  if (ms === null || ms === undefined) return "Н/Д";

  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }

  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Formats a CLS (Cumulative Layout Shift) value for display.
 * Shows up to 3 decimal places.
 */
export function formatCls(cls: number | null): string {
  if (cls === null || cls === undefined) return "Н/Д";
  return cls.toFixed(3);
}

/**
 * Returns the Core Web Vitals rating for a specific metric.
 * Uses Google's thresholds (mobile):
 * - FCP: Good <= 1.8s, Poor > 3.0s
 * - LCP: Good <= 2.5s, Poor > 4.0s
 * - TBT: Good <= 200ms, Poor > 600ms
 * - CLS: Good <= 0.1, Poor > 0.25
 * - SI: Good <= 3.4s, Poor > 5.8s
 */
export function getMetricRating(
  metric: "fcp" | "lcp" | "tbt" | "cls" | "si",
  value: number | null
): { rating: "good" | "needs-improvement" | "poor"; label: string } {
  if (value === null) {
    return { rating: "poor", label: "Н/Д" };
  }

  switch (metric) {
    case "fcp":
      if (value <= 1800) return { rating: "good", label: "Добре" };
      if (value <= 3000) return { rating: "needs-improvement", label: "Потребує покращення" };
      return { rating: "poor", label: "Погано" };
    case "lcp":
      if (value <= 2500) return { rating: "good", label: "Добре" };
      if (value <= 4000) return { rating: "needs-improvement", label: "Потребує покращення" };
      return { rating: "poor", label: "Погано" };
    case "tbt":
      if (value <= 200) return { rating: "good", label: "Добре" };
      if (value <= 600) return { rating: "needs-improvement", label: "Потребує покращення" };
      return { rating: "poor", label: "Погано" };
    case "cls":
      if (value <= 0.1) return { rating: "good", label: "Добре" };
      if (value <= 0.25) return { rating: "needs-improvement", label: "Потребує покращення" };
      return { rating: "poor", label: "Погано" };
    case "si":
      if (value <= 3400) return { rating: "good", label: "Добре" };
      if (value <= 5800) return { rating: "needs-improvement", label: "Потребує покращення" };
      return { rating: "poor", label: "Погано" };
  }
}

/**
 * Returns a Tailwind dot color class for Core Web Vitals ratings.
 */
export function getMetricDotColor(
  rating: "good" | "needs-improvement" | "poor"
): string {
  switch (rating) {
    case "good":
      return "bg-emerald-500";
    case "needs-improvement":
      return "bg-amber-500";
    case "poor":
      return "bg-red-500";
  }
}
