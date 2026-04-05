// Website analysis utilities using cheerio
// Extracts: copyright year, mobile friendliness, technology, SSL, design score

import * as cheerio from "cheerio";

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
  };

  if (!url || url === "N/A") return empty;

  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }

  let html = "";
  let finalUrl = url;
  let hasSsl = url.startsWith("https://");

  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT),
    });

    finalUrl = resp.url || url;
    hasSsl = finalUrl.startsWith("https://");

    if (!resp.ok) return { ...empty, hasSsl, finalUrl };

    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return { ...empty, hasSsl, finalUrl };

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
      finalUrl = resp.url || httpUrl;
      hasSsl = finalUrl.startsWith("https://");
      if (!resp.ok) return { ...empty, hasSsl, finalUrl };
      html = await resp.text();
    } catch {
      return { ...empty, hasSsl, finalUrl };
    }
  }

  if (!html) return { ...empty, hasSsl, finalUrl };

  const $ = cheerio.load(html);

  // ─── Page title ──────────────────────────────────────────
  const pageTitle = $("title").text().trim();

  // ─── Mobile viewport ─────────────────────────────────────
  const viewport = $('meta[name="viewport"]');
  const isMobileFriendly = !!(viewport.length && viewport.attr("content"));

  // ─── Copyright year ──────────────────────────────────────
  const copyrightYear = extractCopyrightYear($, html);

  // ─── Technology detection ────────────────────────────────
  const technologies = detectTechnologies($, html);

  // ─── Contact form detection ──────────────────────────────
  const hasContactForm = detectContactForm($);

  // ─── Design scoring ──────────────────────────────────────
  const { score, notes } = scoreDesign({
    copyrightYear,
    isMobileFriendly,
    hasSsl,
    technologies,
    html,
    $,
  });

  return {
    copyrightYear,
    isMobileFriendly,
    hasSsl,
    finalUrl,
    technologies,
    designScore: score,
    designNotes: notes,
    pageTitle,
    hasContactForm,
  };
}

// ─── Technology detection ──────────────────────────────────

function detectTechnologies($: cheerio.CheerioAPI, html: string): string[] {
  const techs: string[] = [];

  // Meta generator tag
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
    else if (g) techs.push(generator.split(/[;,\s]/)[0].trim());
  }

  // HTML patterns
  if (/wp-content|wp-includes/i.test(html)) techs.push("WordPress");
  if (/\/bitrix\//i.test(html)) techs.push("1C-Bitrix");
  if (/shopify\.com/i.test(html)) techs.push("Shopify");
  if (/wix\.com/i.test(html)) techs.push("Wix");
  if (/tilda\.ws|tilda\.cc/i.test(html)) techs.push("Tilda");
  if (/joomla/i.test(html)) techs.push("Joomla");
  if (/drupal/i.test(html)) techs.push("Drupal");
  if (/webflow\.com/i.test(html)) techs.push("Webflow");
  if (/squarespace/i.test(html)) techs.push("Squarespace");
  if (/modx/i.test(html)) techs.push("MODX");
  if (/next\.js|__next/i.test(html)) techs.push("Next.js");
  if (/nuxt/i.test(html)) techs.push("Nuxt");
  if (/react/i.test(html) && /__next/i.test(html)) {} // already Next.js
  if (/vue\.js|vue\.min/i.test(html)) techs.push("Vue.js");
  if (/angular/i.test(html)) techs.push("Angular");
  if (/laravel/i.test(html)) techs.push("Laravel");

  // Deduplicate
  return [...new Set(techs)];
}

// ─── Contact form detection ────────────────────────────────

function detectContactForm($: cheerio.CheerioAPI): boolean {
  return (
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
  );
}

// ─── Design scoring ────────────────────────────────────────

function scoreDesign(opts: {
  copyrightYear: number | null;
  isMobileFriendly: boolean;
  hasSsl: boolean;
  technologies: string[];
  html: string;
  $: cheerio.CheerioAPI;
}): { score: "ancient" | "outdated" | "modern" | "unknown"; notes: string[] } {
  const notes: string[] = [];
  let points = 0; // 0 = worst, 10 = best
  const now = new Date().getFullYear();

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
  if (opts.html.includes("charset=\"utf-8") || opts.html.includes("charset=UTF-8")) hasModernFeatures++;
  if (opts.$("meta[name=\"description\"]").length) hasModernFeatures++;
  if (opts.$("meta[property=\"og:\"]").length || opts.$('meta[property="og:title"]').length) hasModernFeatures++;
  if (opts.$("header, nav, main, footer").length >= 2) hasModernFeatures++;

  if (hasModernFeatures >= 3) points += 2;
  else if (hasModernFeatures >= 1) points += 1;

  // 6. Visual style heuristics from CSS/HTML
  const hasInlineStyles = /style="[^"]{100,}"/.test(opts.html);
  const hasModernCSS = /flexbox|grid|rem|var\(--/.test(opts.html);
  const hasOldPatterns = /<table[^>]*><tr><td>/i.test(opts.html) && !opts.technologies.includes("WordPress");

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
  // 1. Meta copyright tag
  const metaCopyright = $('meta[name="copyright"], meta[name="Copyright"]');
  if (metaCopyright.length) {
    const content = metaCopyright.attr("content") || "";
    const years = content.match(/\b(19|20)\d{2}\b/g);
    if (years && years.length) return parseInt(years[years.length - 1], 10);
  }

  // 2. Footer first
  const footerText = $("footer").text() || "";
  const searchText = footerText || html;

  const explicit = searchText.match(
    /(?:©|&copy;|\(c\)|™)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/g
  );
  if (explicit) {
    const years = explicit
      .map((m) => { const match = m.match(/(\d{4})/g); return match ? match.map(Number) : []; })
      .flat();
    if (years.length) return Math.max(...years);
  }

  // 3. "copyright" near year
  const broad = searchText.match(/(?:copyright|©|&copy;)[^0-9]*((?:19|20)\d{2})/i);
  if (broad) return parseInt(broad[1], 10);

  // 4. Any year in footer
  if (footerText) {
    const footerYears = footerText.match(/\b(19|20)\d{2}\b/g);
    if (footerYears) return parseInt(footerYears[0], 10);
  }

  return null;
}

// ─── Website Validity Check ─────────────────────────────────

import type { LeadBusiness } from "./scoring";

export interface WorthinessResult {
  worth: boolean;
  reason: string;
  score: number;
}

export function isWorthContacting(lead: LeadBusiness): WorthinessResult {
  let score = 0;
  const reasons: string[] = [];

  // No website: best prospect
  if (!lead.website || lead.website === "N/A") {
    score = 95;
    reasons.push("Немає сайту — найкращий prospect для створення нового сайту");
    return {
      worth: true,
      reason: reasons.join("; "),
      score,
    };
  }

  // Ancient design
  const currentYear = new Date().getFullYear();
  if (lead.copyrightYear && lead.copyrightYear <= 2016) {
    score += 30;
    reasons.push(`Дуже старий дизайн (© ${lead.copyrightYear})`);
  } else if (lead.designScore === "ancient") {
    score += 25;
    reasons.push("Дуже старий дизайн сайту");
  }

  // No mobile
  if (!lead.isMobileFriendly) {
    score += 20;
    reasons.push("Не адаптивний для мобільних");
  }

  // No SSL
  if (!lead.hasSsl) {
    score += 10;
    reasons.push("Немає SSL сертифікату");
  }

  // Old technology
  const oldTechs = ["Joomla", "Drupal", "uCoz", "1C-Bitrix", "Bitrix"];
  if (lead.technologies.some((t) => oldTechs.some((ot) => t.toLowerCase().includes(ot.toLowerCase())))) {
    score += 15;
    reasons.push(`Застаріла технологія: ${lead.technologies.join(", ")}`);
  }

  // No contact form
  if (!lead.hasContactForm) {
    score += 10;
    reasons.push("Немає контактної форми");
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
