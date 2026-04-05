// Website analysis utilities using cheerio
import * as cheerio from "cheerio";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const TIMEOUT = 8000;

export interface WebsiteAnalysis {
  copyrightYear: number | null;
  isMobileFriendly: boolean;
}

export async function analyzeWebsite(url: string): Promise<WebsiteAnalysis> {
  const result: WebsiteAnalysis = {
    copyrightYear: null,
    isMobileFriendly: false,
  };

  if (!url || url === "N/A") {
    return result;
  }

  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }

  let html = "";
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT),
    });

    if (!resp.ok) return result;

    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return result;

    html = await resp.text();
  } catch {
    // Try HTTP fallback
    try {
      const httpUrl = url.replace("https://", "http://");
      const resp = await fetch(httpUrl, {
        headers: { "User-Agent": USER_AGENT },
        redirect: "follow",
        signal: AbortSignal.timeout(TIMEOUT),
      });
      if (!resp.ok) return result;
      html = await resp.text();
    } catch {
      return result;
    }
  }

  if (!html) return result;

  const $ = cheerio.load(html);

  // Check viewport meta tag
  const viewport = $('meta[name="viewport"]');
  if (viewport.length && viewport.attr("content")) {
    result.isMobileFriendly = true;
  }

  // Extract copyright year
  result.copyrightYear = extractCopyrightYear($, html);

  return result;
}

function extractCopyrightYear(
  $: cheerio.CheerioAPI,
  html: string
): number | null {
  // 1. Meta copyright tag
  const metaCopyright = $('meta[name="copyright"], meta[name="Copyright"]');
  if (metaCopyright.length) {
    const content = metaCopyright.attr("content") || "";
    const years = content.match(/\b(19|20)\d{2}\b/g);
    if (years && years.length) {
      return parseInt(years[years.length - 1], 10);
    }
  }

  // 2-3. Search in footer first, then full page
  const footerText = $("footer").text() || "";
  const searchText = footerText || html;

  // © YYYY or © YYYY-YYYY pattern
  const explicit = searchText.match(
    /(?:©|&copy;|\(c\)|™)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/g
  );
  if (explicit) {
    const years = explicit
      .map((m) => {
        const match = m.match(/(\d{4})/g);
        return match ? match.map(Number) : [];
      })
      .flat();
    if (years.length) return Math.min(...years);
  }

  // 4. "copyright" near a year
  const broad = searchText.match(
    /(?:copyright|©|&copy;)[^0-9]*((?:19|20)\d{2})/i
  );
  if (broad) return parseInt(broad[1], 10);

  // 5. Any year in footer
  if (footerText) {
    const footerYears = footerText.match(/\b(19|20)\d{2}\b/g);
    if (footerYears) return parseInt(footerYears[0], 10);
  }

  return null;
}
