import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

interface LighthouseAudit {
  score?: number | null;
  numericValue?: number;
  displayValue?: string;
  title?: string;
}

interface PageSpeedResponse {
  id?: string;
  lighthouseResult?: {
    categories?: {
      performance?: {
        score?: number | null;
      };
    };
    audits?: Record<string, LighthouseAudit>;
  };
  error?: {
    message?: string;
    code?: number;
  };
}

/**
 * Fetches a single audit value from the Lighthouse result.
 * Returns the numeric value or null if unavailable.
 */
function getAuditValue(
  audits: Record<string, LighthouseAudit> | undefined,
  auditKey: string
): number | null {
  if (!audits || !audits[auditKey]) return null;
  return audits[auditKey].numericValue ?? null;
}

/**
 * Extracts key diagnostic suggestions from Lighthouse audits.
 * Returns an array of suggestion strings (max 5).
 */
function extractDiagnostics(
  audits: Record<string, LighthouseAudit> | undefined
): string[] {
  if (!audits) return [];

  const diagnostics: string[] = [];
  const diagnosticKeys = [
    "render-blocking-resources",
    "unused-css-rules",
    "unused-javascript",
    "unminified-css",
    "unminified-javascript",
    "bootup-time",
    "mainthread-work-breakdown",
    "offscreen-images",
    "uses-optimized-images",
    "uses-text-compression",
    "uses-responsive-images",
    "efficient-animated-content",
    "total-blocking-time",
    "largest-contentful-paint-element",
    "layout-shifts",
    "long-tasks",
    "dom-size",
    "viewport",
    "uses-rel-preconnect",
    "server-response-time",
  ];

  for (const key of diagnosticKeys) {
    const audit = audits[key];
    if (!audit) continue;

    const score = audit.score ?? null;

    if (score !== null && score < 0.9) {
      const title = audit.title ?? key;
      const displayValue = audit.displayValue ?? "";

      if (displayValue) {
        diagnostics.push(`${title}: ${displayValue}`);
      } else {
        diagnostics.push(title);
      }
    }

    if (diagnostics.length >= 5) break;
  }

  return diagnostics;
}

/**
 * Validates a URL string. Returns the normalized URL or null if invalid.
 */
function validateUrl(url: string): string | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    // Add protocol if missing
    const withProtocol = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    new URL(withProtocol);
    return withProtocol;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, strategy = "mobile" } = body;

    // Validate URL
    const normalizedUrl = validateUrl(url);
    if (!normalizedUrl) {
      return NextResponse.json(
        { error: "Невірний URL. Вкажіть коректну адресу вебсайту." },
        { status: 400 }
      );
    }

    // Validate strategy
    if (strategy !== "mobile" && strategy !== "desktop") {
      return NextResponse.json(
        { error: 'Невірна стратегія. Допустимі значення: "mobile" або "desktop".' },
        { status: 400 }
      );
    }

    // Build PageSpeed API URL
    const apiUrl = new URL(
      "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"
    );
    apiUrl.searchParams.set("url", normalizedUrl);
    apiUrl.searchParams.set("strategy", strategy);
    apiUrl.searchParams.set("category", "performance");

    // Fetch with 28s timeout (within 30s maxDuration)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 28000);

    let data: PageSpeedResponse;
    try {
      const resp = await fetch(apiUrl.toString(), {
        signal: controller.signal,
        headers: {
          "Accept-Encoding": "gzip",
        },
      });

      clearTimeout(timeoutId);

      if (!resp.ok) {
        const errorBody = await resp.text();
        console.error("PageSpeed API error response:", resp.status, errorBody);

        let errorMessage = `PageSpeed API error: ${resp.status}`;

        if (resp.status === 429) {
          errorMessage =
            "Перевищено ліміт запитів до PageSpeed API. Спробуйте пізніше.";
        } else if (resp.status === 400) {
          errorMessage =
            "Помилка запиту до PageSpeed API. Перевірте URL.";
        }

        return NextResponse.json(
          {
            url: normalizedUrl,
            strategy,
            performanceScore: null,
            firstContentfulPaint: null,
            largestContentfulPaint: null,
            totalBlockingTime: null,
            cumulativeLayoutShift: null,
            speedIndex: null,
            diagnostics: [],
            error: errorMessage,
          },
          { status: resp.status === 429 ? 429 : 502 }
        );
      }

      // Validate content-type before parsing JSON
      const contentType = resp.headers.get("content-type");
      if (!contentType || !contentType.includes("json")) {
        return NextResponse.json(
          {
            url: normalizedUrl,
            strategy,
            performanceScore: null,
            firstContentfulPaint: null,
            largestContentfulPaint: null,
            totalBlockingTime: null,
            cumulativeLayoutShift: null,
            speedIndex: null,
            diagnostics: [],
            error: "PageSpeed API повернув неочікуваний формат відповіді.",
          },
          { status: 502 }
        );
      }

      data = await resp.json();
    } catch (fetchError: unknown) {
      clearTimeout(timeoutId);

      if (fetchError instanceof DOMException && fetchError.name === "AbortError") {
        return NextResponse.json(
          {
            url: normalizedUrl,
            strategy,
            performanceScore: null,
            firstContentfulPaint: null,
            largestContentfulPaint: null,
            totalBlockingTime: null,
            cumulativeLayoutShift: null,
            speedIndex: null,
            diagnostics: [],
            error: "Час очікування PageSpeed API перевищено (30с). Спробуйте пізніше.",
          },
          { status: 504 }
        );
      }

      throw fetchError;
    }

    // Check for API-level errors in the response body
    if (data.error) {
      const errorMsg = data.error.message || "Помилка PageSpeed API";
      return NextResponse.json(
        {
          url: normalizedUrl,
          strategy,
          performanceScore: null,
          firstContentfulPaint: null,
          largestContentfulPaint: null,
          totalBlockingTime: null,
          cumulativeLayoutShift: null,
          speedIndex: null,
          diagnostics: [],
          error: errorMsg,
        },
        { status: 502 }
      );
    }

    // Check for missing lighthouse result
    if (!data.lighthouseResult) {
      return NextResponse.json(
        {
          url: normalizedUrl,
          strategy,
          performanceScore: null,
          firstContentfulPaint: null,
          largestContentfulPaint: null,
          totalBlockingTime: null,
          cumulativeLayoutShift: null,
          speedIndex: null,
          diagnostics: [],
          error: "Lighthouse не зміг надійно завантажити сторінку. Спробуйте пізніше.",
        },
        { status: 502 }
      );
    }

    const { categories, audits } = data.lighthouseResult;

    // Extract performance score (0-1 → 0-100)
    const rawScore = categories?.performance?.score ?? null;
    const performanceScore =
      rawScore !== null ? Math.round(rawScore * 100) : null;

    // Extract Core Web Vitals and other metrics
    const firstContentfulPaint = getAuditValue(
      audits,
      "first-contentful-paint"
    );
    const largestContentfulPaint = getAuditValue(
      audits,
      "largest-contentful-paint"
    );
    const totalBlockingTime = getAuditValue(audits, "total-blocking-time");
    const cumulativeLayoutShift = getAuditValue(audits, "cumulative-layout-shift");
    const speedIndex = getAuditValue(audits, "speed-index");

    // Extract diagnostics
    const diagnostics = extractDiagnostics(audits);

    return NextResponse.json({
      url: normalizedUrl,
      strategy,
      performanceScore,
      firstContentfulPaint,
      largestContentfulPaint,
      totalBlockingTime,
      cumulativeLayoutShift,
      speedIndex,
      diagnostics,
    });
  } catch (error: unknown) {
    console.error("PageSpeed API error:", error);
    const message =
      error instanceof Error ? error.message : "Помилка перевірки PageSpeed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
