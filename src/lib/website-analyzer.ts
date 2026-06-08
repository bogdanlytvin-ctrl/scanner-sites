// Website analysis utilities using cheerio
// Extracts: copyright year, mobile friendliness, technology, SSL, design score

import * as cheerio from "cheerio/slim";
import { safeFetch } from "./ssrf";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const TIMEOUT = 10000;

export interface WebsiteAnalysis {
  copyrightYear: number | null;
  isMobileFriendly: boolean;
  hasSsl: boolean;
  finalUrl: string;
  technologies: string[];
  designScore: "ancient" | "outdated" | "modern" | "unknown";
  designNotes: string[];
  pageTitle: string;
  hasContactForm: boolean;
  // Real, DOM-derived SEO facts (not guessed from the title): a non-empty
  // <meta name="description"> and any Open Graph (og:*) tags.
  hasMetaDescription: boolean;
  hasOpenGraph: boolean;
  securityIssues: string[]; // real, header-derived security findings (no guesses)
  // True when we could NOT fully read the rendered page (site unreachable, or a
  // JS/SPA shell whose content is rendered client-side). In that case the DOM we
  // see is incomplete, so the negative signals (no form, not mobile, old layout)
  // are unreliable and downstream must NOT report them as real problems.
  analysisLimited: boolean;
}

export async function analyzeWebsite(url: string): Promise<WebsiteAnalysis> {
  const empty: WebsiteAnalysis = {
    copyrightYear: null,
    isMobileFriendly: false,
    hasSsl: false,
    finalUrl: url,
    technologies: [],
    designScore: "unknown",
    designNotes: [],
    pageTitle: "",
    hasContactForm: false,
    hasMetaDescription: false,
    hasOpenGraph: false,
    securityIssues: [],
    analysisLimited: true, // until we successfully read a real HTML body
  };

  if (!url || url === "N/A") return empty;

  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }

  let html = "";
  let finalUrl = url;
  let hasSsl = url.startsWith("https://");
  let respHeaders: Record<string, string> = {};

  const collectHeaders = (h: Headers): Record<string, string> => {
    const out: Record<string, string> = {};
    h.forEach((v, k) => { out[k.toLowerCase()] = v; });
    return out;
  };

  try {
    const resp = await safeFetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT),
    });

    finalUrl = resp.url || url;
    hasSsl = finalUrl.startsWith("https://");
    respHeaders = collectHeaders(resp.headers);

    if (!resp.ok) return { ...empty, hasSsl, finalUrl };

    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return { ...empty, hasSsl, finalUrl };

    html = await resp.text();
  } catch {
    // Try HTTP fallback
    try {
      const httpUrl = url.replace("https://", "http://");
      const resp = await safeFetch(httpUrl, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(TIMEOUT),
      });
      finalUrl = resp.url || httpUrl;
      hasSsl = finalUrl.startsWith("https://");
      respHeaders = collectHeaders(resp.headers);
      if (!resp.ok) return { ...empty, hasSsl, finalUrl };
      html = await resp.text();
    } catch {
      return { ...empty, hasSsl, finalUrl };
    }
  }

  if (!html) return { ...empty, hasSsl, finalUrl };

  const $ = cheerio.load(html);

  // ─── JS/SPA shell detection ──────────────────────────────
  // We fetch raw HTML and do NOT execute JavaScript. A client-side-rendered app
  // (or a blocked/redirect/consent page) returns an almost-empty body — its real
  // content, forms and footer are injected by JS in the browser. Detect that so
  // we don't fabricate "no form / not mobile / old design" problems for a site
  // that actually has all of them when viewed normally.
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const analysisLimited = bodyText.length < 400;

  // ─── Page title ──────────────────────────────────────────
  const pageTitle = $("title").text().trim();

  // ─── Mobile viewport ─────────────────────────────────────
  // A responsive site must declare width=device-width; a viewport pinned to a
  // fixed width (e.g. width=1024) is a desktop layout, not mobile-friendly.
  const viewportContent = ($('meta[name="viewport"]').attr("content") || "").toLowerCase();
  const isMobileFriendly = /width\s*=\s*device-width/.test(viewportContent);

  // ─── Copyright year ──────────────────────────────────────
  const copyrightYear = extractCopyrightYear($, html);

  // ─── Technology detection (HTML + response headers) ──────
  const technologies = detectTechnologies($, html, respHeaders);

  // ─── Security findings (header-derived, factual) ─────────
  const securityIssues = detectSecurityIssues(respHeaders, hasSsl, html, finalUrl);

  // ─── Contact form detection ──────────────────────────────
  const hasContactForm = detectContactForm($);

  // ─── SEO meta facts (real DOM, not guessed from the title) ──
  const hasMetaDescription = !!($('meta[name="description"]').attr("content") || "").trim();
  const hasOpenGraph = $('meta[property^="og:"]').length > 0;

  // ─── Design scoring ──────────────────────────────────────
  const { score, notes } = scoreDesign({
    copyrightYear,
    isMobileFriendly,
    hasSsl,
    technologies,
    html,
    $,
    limited: analysisLimited,
  });

  // Surface security findings in notes too, so they show in the existing UI.
  const designNotes = securityIssues.length
    ? [...notes, ...securityIssues.map((s) => `🔒 ${s}`)]
    : notes;

  return {
    copyrightYear,
    isMobileFriendly,
    hasSsl,
    finalUrl,
    technologies,
    designScore: score,
    designNotes,
    pageTitle,
    hasContactForm,
    hasMetaDescription,
    hasOpenGraph,
    securityIssues,
    analysisLimited,
  };
}

// ─── Technology detection ──────────────────────────────────

function detectTechnologies(
  $: cheerio.CheerioAPI,
  html: string,
  headers: Record<string, string> = {}
): string[] {
  const techs: string[] = [];

  // ── Response headers: ground-truth server stack ──
  const server = (headers["server"] || "").toLowerCase();
  const poweredBy = (headers["x-powered-by"] || "").toLowerCase();
  const xGenerator = (headers["x-generator"] || "").toLowerCase();
  const setCookie = (headers["set-cookie"] || "").toLowerCase();

  if (server.includes("nginx")) techs.push("Nginx");
  if (server.includes("apache")) techs.push("Apache");
  if (server.includes("litespeed")) techs.push("LiteSpeed");
  if (server.includes("microsoft-iis") || server.includes("iis")) techs.push("IIS");
  if (server.includes("cloudflare")) techs.push("Cloudflare");
  if (poweredBy.includes("php") || /php/i.test(server)) techs.push("PHP");
  if (poweredBy.includes("asp.net")) techs.push("ASP.NET");
  if (poweredBy.includes("express")) techs.push("Express");
  if (xGenerator.includes("drupal")) techs.push("Drupal");
  if (setCookie.includes("wordpress_") || setCookie.includes("wp-settings")) techs.push("WordPress");
  if (setCookie.includes("phpsessid") && !poweredBy.includes("php") && !/php/i.test(server)) techs.push("PHP");

  // ── Meta generator tag ──
  const generator = $('meta[name="generator"]').attr("content") || "";
  if (generator) {
    const g = generator.toLowerCase();
    if (g.includes("wordpress")) techs.push("WordPress");
    else if (g.includes("joomla")) techs.push("Joomla");
    else if (g.includes("drupal")) techs.push("Drupal");
    else if (g.includes("shopify")) techs.push("Shopify");
    else if (g.includes("wix")) techs.push("Wix");
    else if (g.includes("tilda")) techs.push("Tilda");
    else if (g.includes("1c-bitrix") || g.includes("bitrix")) techs.push("1C-Bitrix");
    else if (g.includes("modx")) techs.push("MODX");
    else if (g.includes("typo3")) techs.push("TYPO3");
    else if (g.includes("ghost")) techs.push("Ghost");
    else if (g.includes("hexo")) techs.push("Hexo");
    else if (g.includes("hugo")) techs.push("Hugo");
    else if (g.includes("webflow")) techs.push("Webflow");
    else if (g.includes("squarespace")) techs.push("Squarespace");
    else if (g.includes("elementor")) techs.push("Elementor");
    else if (g.includes("divi")) techs.push("Divi");
    else if (g.includes("wpbakery") || g.includes("visual composer")) techs.push("WPBakery");
    else if (g.includes("all in one seo") || g.includes("aioseo") || g.includes("yoast") || g.includes("rank math")) techs.push("WordPress");
    else if (g) {
      const token = generator.split(/[;,(]/)[0].trim();
      if (token.length >= 3 && !/^(all|the|and|web|new|site|page|cms|seo)\b/i.test(token)) techs.push(token);
    }
  }

  // ── HTML patterns (anchored to avoid false positives) ──
  if (/wp-content|wp-includes/i.test(html)) techs.push("WordPress");
  if (/\/bitrix\//i.test(html)) techs.push("1C-Bitrix");
  if (/cdn\.shopify\.com|shopify\.com\/s\//i.test(html)) techs.push("Shopify");
  if (/static\.wix(static)?\.com|wix\.com\/website/i.test(html)) techs.push("Wix");
  if (/tilda\.ws|tilda\.cc|tildacdn/i.test(html)) techs.push("Tilda");
  // Joomla/Drupal: require a real path/marker, not a stray word in copy
  if (/\/components\/com_|\/media\/jui\/|joomla!|option=com_/i.test(html)) techs.push("Joomla");
  if (/sites\/(?:all|default)\/(?:themes|modules|files)|drupal\.settings|data-drupal|drupal\.js/i.test(html)) techs.push("Drupal");
  if (/webflow\.com|wf-/i.test(html) && /webflow/i.test(html)) techs.push("Webflow");
  if (/static\d?\.squarespace\.com|squarespace\.com\/(?:universal|static)/i.test(html)) techs.push("Squarespace");
  if (/\/assets\/(?:components|snippets)\/|MODX\.config|class="modx-/i.test(html)) techs.push("MODX");
  // JS frameworks — anchored markers, not bare framework names
  if (/__next|\/_next\/static/i.test(html)) techs.push("Next.js");
  if (/__nuxt|\/_nuxt\//i.test(html)) techs.push("Nuxt");
  if (/data-reactroot|react-dom|\/react(?:\.production|\.min)?\.js/i.test(html)) techs.push("React");
  if (/data-v-app|vue(?:\.min|\.runtime)?\.js|__vue__/i.test(html)) techs.push("Vue.js");
  if (/ng-version=|_nghost|_ngcontent|angular(?:\.min)?\.js/i.test(html)) techs.push("Angular");
  if (/laravel_session|\/vendor\/laravel/i.test(html) || setCookie.includes("laravel_session")) techs.push("Laravel");

  // Deduplicate
  return [...new Set(techs)];
}

// ─── Security findings (factual, header-derived — no guessing) ─────
function detectSecurityIssues(
  headers: Record<string, string>,
  hasSsl: boolean,
  html: string,
  finalUrl: string
): string[] {
  const issues: string[] = [];

  if (!hasSsl) {
    issues.push("Немає HTTPS — трафік не шифрується");
  } else {
    if (!headers["strict-transport-security"]) issues.push("Немає HSTS — можливий downgrade на HTTP");
    // Mixed content: HTTPS page that pulls http:// sub-resources
    if (/(?:src|href)\s*=\s*["']http:\/\//i.test(html)) {
      issues.push("Mixed content — підвантажує ресурси по незахищеному http://");
    }
  }

  if (!headers["content-security-policy"]) issues.push("Немає Content-Security-Policy (захист від XSS)");
  if (!headers["x-frame-options"] && !/frame-ancestors/i.test(headers["content-security-policy"] || "")) {
    issues.push("Немає X-Frame-Options — ризик clickjacking");
  }
  if (!headers["x-content-type-options"]) issues.push("Немає X-Content-Type-Options (MIME-sniffing)");

  // Version disclosure in headers = information leak
  const server = headers["server"] || "";
  if (/\d+\.\d+/.test(server)) issues.push(`Server розкриває версію: ${server}`);
  const poweredBy = headers["x-powered-by"] || "";
  if (poweredBy) issues.push(`X-Powered-By розкриває стек: ${poweredBy}`);

  return issues;
}

// ─── Contact form detection ────────────────────────────────

function detectContactForm($: cheerio.CheerioAPI): boolean {
  // A real "way to get in touch" is broader than a <form> — a mailto:/tel: link
  // or a dedicated contact page counts. Only treat a site as having NO feedback
  // channel when none of these are present.
  if (
    $('form[action*="contact"]').length > 0 ||
    $('form[action*="send"]').length > 0 ||
    $('form[action*="submit"]').length > 0 ||
    $('form[action*="mail"]').length > 0 ||
    $('form[action*="message"]').length > 0 ||
    $('input[name="email"], input[name="name"], textarea[name="message"]').length >= 2 ||
    $('[class*="contact-form"], [id*="contact-form"]').length > 0 ||
    $('[class*="contact_form"], [id*="contact_form"]').length > 0 ||
    $('form').filter((_, el) => {
      const text = $(el).text().toLowerCase();
      return text.includes("send") || text.includes("відправ") ||
             text.includes("submit") || text.includes("надісл");
    }).length > 0
  ) {
    return true;
  }

  // mailto: / tel: links — a direct contact channel.
  if ($('a[href^="mailto:"], a[href^="tel:"]').length > 0) return true;

  // Link or button to a dedicated contact page (multilingual).
  const contactHref = $(
    'a[href*="contact"], a[href*="kontakt"], a[href*="kontakty"], a[href*="contacts"], a[href*="zwrotny"], a[href*="feedback"]'
  ).length > 0;
  if (contactHref) return true;

  const contactLinkText = $("a, button").filter((_, el) => {
    const text = $(el).text().toLowerCase();
    return (
      text.includes("контакт") || text.includes("contact") || text.includes("kontakt") ||
      text.includes("зворотн") || text.includes("звʼязатися") || text.includes("звязатися") ||
      text.includes("напиши") || text.includes("зв'язок")
    );
  }).length > 0;

  return contactLinkText;
}

// ─── Design scoring ────────────────────────────────────────

function scoreDesign(opts: {
  copyrightYear: number | null;
  isMobileFriendly: boolean;
  hasSsl: boolean;
  technologies: string[];
  html: string;
  $: cheerio.CheerioAPI;
  limited: boolean;
}): { score: "ancient" | "outdated" | "modern" | "unknown"; notes: string[] } {
  const notes: string[] = [];
  let points = 0; // 0 = worst, 10 = best
  const now = new Date().getFullYear();

  // The page body was rendered by JS (or blocked/redirected) and we only saw an
  // empty shell. Any "old design / table layout / no content" verdict here would
  // be wrong — bail out with an honest "unknown" instead of fabricating problems.
  if (opts.limited) {
    return {
      score: "unknown",
      notes: ["⚠️ Контент рендериться через JS або сайт недоступний — повний аналіз потребує браузера"],
    };
  }

  // 1. Copyright year (0-3 points)
  if (opts.copyrightYear) {
    if (opts.copyrightYear >= now - 2) {
      points += 3;
    } else if (opts.copyrightYear >= 2020) {
      points += 2;
    } else if (opts.copyrightYear >= 2017) {
      points += 1;
    } else {
      points += 0;
      notes.push(`© ${opts.copyrightYear} — дуже старий сайт`);
    }
  } else {
    points += 1; // neutral
    notes.push("Рік сайту не визначено");
  }

  // 2. Mobile friendly (0-2 points)
  if (opts.isMobileFriendly) {
    points += 2;
  } else {
    notes.push("❌ Не адаптивний (no mobile viewport)");
  }

  // 3. SSL (0-1 point)
  if (opts.hasSsl) {
    points += 1;
  } else {
    notes.push("⚠️ Немає HTTPS (без SSL сертифікату)");
  }

  // 4. Modern tech (0-2 points)
  const modernTech = ["Next.js", "Nuxt", "Vue.js", "React", "Angular", "Laravel", "Tilda", "Webflow", "Squarespace"];
  const oldTech = ["Joomla", "Drupal", "1C-Bitrix"];

  if (opts.technologies.some((t) => modernTech.includes(t))) {
    points += 2;
  } else if (opts.technologies.some((t) => oldTech.includes(t))) {
    points += 0;
    notes.push(`🔧 ${opts.technologies.join(", ")} — застаріла технологія`);
  } else if (opts.technologies.length > 0) {
    points += 1;
  }

  // 5. HTML quality signals (0-2 points)
  let hasModernFeatures = 0;
  if (/charset\s*=\s*["']?utf-8/i.test(opts.html)) hasModernFeatures++;
  if (opts.$("meta[name=\"description\"]").length) hasModernFeatures++;
  if (opts.$('meta[property^="og:"]').length) hasModernFeatures++;
  if (opts.$("header, nav, main, footer").length >= 2) hasModernFeatures++;

  if (hasModernFeatures >= 3) points += 2;
  else if (hasModernFeatures >= 1) points += 1;

  // 6. Visual style heuristics from CSS/HTML
  const hasInlineStyles = /style="[^"]{100,}"/.test(opts.html);
  const hasModernCSS = /flexbox|grid|rem|var\(--/.test(opts.html);
  // A stray <table> on an otherwise modern site (flexbox/grid/CSS vars) is a data
  // table, not a table-based layout — don't flag it as outdated structure.
  const hasOldPatterns = /<table[^>]*>\s*(?:<tbody[^>]*>\s*)?<tr[^>]*>\s*<td/i.test(opts.html) && !opts.technologies.includes("WordPress") && !hasModernCSS;

  if (hasModernCSS) points += 1;
  if (hasInlineStyles && !hasModernCSS) {
    notes.push("🎨 Багато inline стилів — можливо старий дизайн");
  }
  if (hasOldPatterns) {
    notes.push("📐 Table-based layout — застаріла структура");
    points -= 1;
  }

  // Determine score
  let score: "ancient" | "outdated" | "modern" | "unknown";

  if (opts.copyrightYear === null && points <= 2) {
    score = "unknown";
  } else if (points <= 3) {
    score = "ancient";
    if (notes.length === 0) notes.push("Загалом застарілий сайт");
  } else if (points <= 6) {
    score = "outdated";
    if (notes.length === 0) notes.push("Є ознаки оновлення, але потребує покращення");
  } else {
    score = "modern";
  }

  return { score, notes };
}

// ─── Copyright year extraction ─────────────────────────────

function extractCopyrightYear(
  $: cheerio.CheerioAPI,
  html: string
): number | null {
  // A plausible copyright year only: not before the modern web, not in the future.
  // This rejects junk like phone numbers, prices or "© 1994" boilerplate that a
  // big company never updates — values that produced false "very old site" verdicts.
  const minYear = 2005;
  const maxYear = new Date().getFullYear() + 1;
  const plausible = (y: number) => y >= minYear && y <= maxYear;

  // 1. Meta copyright tag
  const metaCopyright = $('meta[name="copyright"], meta[name="Copyright"]');
  if (metaCopyright.length) {
    const content = metaCopyright.attr("content") || "";
    const years = (content.match(/\b(?:19|20)\d{2}\b/g) || []).map(Number).filter(plausible);
    if (years.length) return Math.max(...years);
  }

  // 2. Explicit ©/copyright marker immediately next to a year — the only reliable
  // signal. Take the max (covers "© 2018–2025" ranges).
  const footerText = $("footer").text() || "";
  const searchText = footerText || html;

  const explicit = searchText.match(
    /(?:©|&copy;|\(c\)|™|copyright)\s*(?:\d{4}\s*[-–—]\s*)?(\d{4})/gi
  );
  if (explicit) {
    const years = explicit
      .flatMap((m) => (m.match(/\d{4}/g) || []).map(Number))
      .filter(plausible);
    if (years.length) return Math.max(...years);
  }

  // No trustworthy copyright marker → unknown (do NOT guess from a bare footer year).
  return null;
}
