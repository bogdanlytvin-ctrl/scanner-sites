import * as cheerio from "cheerio/slim";
import { safeFetch } from "./ssrf";

export type LeadService = "website" | "booking";

export interface LeadAssessment {
  priority: "high" | "review" | "low";
  confidence: "verified" | "partial" | "unknown";
  checkedAt: string;
  summary: string;
  suggestion: string;
  evidence: { label: string; url: string }[];
  contact: { kind: "phone" | "email" | "social"; value: string; source: string } | null;
  /** What the site is missing, each backed by something visible in its HTML. */
  gaps?: { label: string; strong: boolean }[];
}

type Candidate = { name: string; website: string; phone?: string; email?: string; osmId: string; facebook?: string; instagram?: string; telegram?: string; type?: string };
export type AssessOptions = { pageSpeedKey?: string };

// Niches where clients expect to book online; hotels book rooms, the rest book a visit.
const BOOKING_TYPES = new Set("dentist doctors clinic veterinary beauty hairdresser massage tattoo car_repair tyres car_wash driving_school language_school dancing_school music_school photographer spa sauna fitness_centre hotel hostel guest_house apartment motel".split(" "));
const STAY_TYPES = new Set(["hotel", "hostel", "guest_house", "apartment", "motel"]);
// Hosted booking systems used in Ukraine and Europe (widgets load from scripts, so match raw HTML).
const bookingWidget = /alteg\.io|altegio|yclients|booksy|easyweek|dikidi|helsi\.me|doc\.ua|likarni\.com|bookon|simplybook|calendly|fresha|treatwell|appointer|onlinezapis|cleverbox|beautypro|booking\.com|travelline|exely|otelms|servio|wubook|hotellook|reservationsteps|bnovo|bookingengine|ibooking/i;

/** Many small businesses on the map have only Instagram/Telegram/Facebook: a direct message is still a way to reach them. */
function socialContact(c: Candidate, source: string): Contact | null {
  for (const raw of [c.instagram, c.telegram, c.facebook, c.website]) {
    const value = (raw || "").trim();
    if (!value || value === "N/A") continue;
    const url = /^@?[a-z0-9_]{4,32}$/i.test(value) && raw === c.telegram ? "https://t.me/" + value.replace(/^@/, "") : webUrl(value);
    if (url && socialDomain.test(new URL(url).hostname)) return { kind: "social", value: url, source };
  }
  return null;
}
type Contact = NonNullable<LeadAssessment["contact"]>;

const bookingLabel = /записат|запис на|онлайн.запис|заброню|бронюва|book (?:now|online|a |an )|appointment|reserv(?:e|ation)|umów|rezerw|записать/i;
const contactsLabel = /контакт|contact|kontakt|зв[’'ʼ]?яз/i;
const genericName = /^(стоматологія|стоматологічна|стоматологічний|медична|медичний|приватна|міська|лікарня|клініка|піцерія|кафе|ресторан|готель|магазин|салон|краси|львів|київ|центр|dental|clinic|dentist|hotel|studio|restaurant|cafe|the|and|salon)$/;
const socialDomain = /(^|\.)(instagram\.com|facebook\.com|fb\.com|fb\.me|t\.me|linktr\.ee|wa\.me|tiktok\.com)$/i;
// Hosted menu / link-in-bio pages: a business that has only these has no own website.
const platformDomain = /(^|\.)(choiceqr\.com|taplink\.cc|taplink\.at|taplink\.ws|linkr\.bio|mssg\.me|beacons\.ai)$/i;
// Sites behind bot protection reject non-browser agents from datacenter IPs; the analyzer route uses the same header.
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const deadPage = /website [^<]{0,80} (?:is )?not configured|site not found|account (?:has been )?suspended|hosting (?:account )?(?:is )?suspended|this site can.t be reached|сайт не знайдено|сайт заблоковано|аккаунт заблокирован|хостинг призупинено/i;

function webUrl(value: string, base?: string): string | null {
  try {
    const url = base ? new URL(value, base) : new URL(/^https?:\/\//i.test(value) ? value : "https://" + value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || !url.hostname.includes(".")) return null;
    return url.href;
  } catch { return null; }
}

function contact(kind: Contact["kind"], text: string | undefined, source: string): Contact | null {
  const value = (text || "").split(/[;?]/)[0].trim();
  const plausible = kind === "phone" ? /^\+?[\d\s().-]+$/.test(value) && /^\d{7,15}$/.test(value.replace(/\D/g, "")) : /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value);
  return plausible && value.length < 200 ? { kind, value, source } : null;
}

function words(text: string): string[] {
  return text.toLowerCase().normalize("NFKC").replace(/['’ʼ`‘]/g, "").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

const LATIN: Record<string, string> = { а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ie", ж: "zh", з: "z", и: "y", і: "i", ї: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ь: "", ю: "iu", я: "ia", ё: "e", ы: "y", э: "e", ъ: "" };
const latin = (word: string) => [...word].map(ch => LATIN[ch] ?? ch).join("");

function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length];
}

/** Exact word, or the same word across Cyrillic/Latin spelling (Челентано ≈ Celentano) with ~1 typo per 5 letters. */
function hasWord(pageWords: Set<string>, word: string): boolean {
  if (pageWords.has(word)) return true;
  const a = latin(word);
  if (a.length < 5) return false;
  for (const candidate of pageWords) {
    const b = latin(candidate);
    if (Math.abs(a.length - b.length) <= 2 && distance(a, b) <= Math.floor(Math.max(a.length, b.length) / 5)) return true;
  }
  return false;
}

function parsePage(html: string, url: string) {
  const $ = cheerio.load(html);
  const links: { label: string; url: string }[] = [];
  const contacts: Contact[] = [];
  // Script-rendered sites keep phones in JSON-LD or app data; read them before scripts are removed.
  const rawContacts: Contact[] = [];
  for (const m of html.matchAll(/"telephone"\s*:\s*"([^"]{7,30})"|tel:(\+?\d[\d\s().-]{6,18}\d)/gi)) {
    const item = contact("phone", m[1] || m[2], url);
    if (item) rawContacts.push(item);
  }
  for (const m of html.matchAll(/"email"\s*:\s*"([^"@\s]{1,64}@[^"\s]{3,80})"|mailto:([^"'<>\s?]{3,120})/gi)) {
    const item = contact("email", m[1] || m[2], url);
    if (item) rawContacts.push(item);
  }
  const metaText = [$('meta[name="description" i]').attr("content"), $('meta[property="og:title"]').attr("content"), $('meta[property="og:description"]').attr("content")].filter(Boolean).join(" ");
  // Speed hints, counted before scripts are stripped: render-blocking files and unlazy images.
  const weight = {
    blockingScripts: $("head script[src]").filter((_, el) => { const e = $(el); return e.attr("async") === undefined && e.attr("defer") === undefined && e.attr("type") !== "module"; }).length,
    stylesheets: $('link[rel~="stylesheet" i]').length,
    images: $("img").length,
    lazyImages: $('img[loading="lazy" i], img[data-src], img[data-lazy-src], img[data-srcset]').length,
  };
  $("script, style, template, noscript, [hidden], [aria-hidden=true]").remove();
  $("a[href]").each((_, el) => {
    const anchor = $(el);
    const href = anchor.attr("href")?.trim() || "";
    if (/^(tel|mailto):/i.test(href)) {
      const item = contact(/^tel:/i.test(href) ? "phone" : "email", href.replace(/^(tel|mailto):/i, ""), url);
      if (item) contacts.push(item);
      return;
    }
    if (!href || href.startsWith("#")) return;
    const target = webUrl(href, url);
    const label = (anchor.attr("aria-label") || anchor.text() || anchor.attr("title") || "").replace(/\s+/g, " ").trim();
    if (target && label) links.push({ label: label.slice(0, 120), url: target });
  });
  for (const item of rawContacts) if (!contacts.some(c => c.value === item.value)) contacts.push(item);
  const identityText = [$("title").first().text(), $("h1").first().text(), $('meta[property="og:site_name"]').attr("content") || "", $('meta[property="og:title"]').attr("content") || ""].join(" ");
  const body = $("body").text().replace(/\s+/g, " ").trim();
  const title = $("title").text().trim();
  const blocked = /^(just a moment|access denied|attention required|verify you are human|checking your browser|captcha|domain for sale)/i.test(title);
  // Registrar/parking placeholders: the company no longer has a working site on this domain.
  const parked = /domain (?:is )?for sale|buy this domain|this domain (?:is|may be) (?:for sale|parked)|domain (?:has )?expired|parked (?:free|domain)|домен продається|домен продается|купити цей домен|купить этот домен/i.test(title + " " + body.slice(0, 600));
  const unconfigured = deadPage.test(title + " " + body.slice(0, 600));
  // Little visible text but a real title/description: the page is built by scripts, still a working site.
  const scripted = body.length < 60 && (title.length >= 3 || metaText.length >= 20);
  const viewport = $('meta[name="viewport" i]').first().attr("content") || "";
  const fixedWidth = Number(viewport.match(/(?:^|[,;\s])width\s*=\s*(\d+)(?=[,;\s]|$)/i)?.[1] || 0);
  const hrefs = $("a[href]").map((_, el) => ($(el).attr("href") || "").trim()).get();
  const signals = {
    viewport: Boolean(viewport.trim()),
    // A real enquiry form, not a site search box.
    form: $("form").filter((_, el) => {
      const f = $(el);
      return f.find("textarea, input[type=tel], input[type=email]").length > 0 || f.find("input[type=text], input:not([type])").length >= 2;
    }).length > 0,
    telLink: hrefs.some(h => /^tel:/i.test(h)),
    mailLink: hrefs.some(h => /^mailto:/i.test(h)),
    messengers: hrefs.some(h => /^(viber|whatsapp|tg):|(^|\/\/)(t\.me|telegram\.me|wa\.me|api\.whatsapp\.com|m\.me)\//i.test(h)),
    // Chat / callback widgets load from scripts, so look at the raw HTML.
    widget: /contacts?[-_]?(?:button|widget)|call-?back[-_]?(?:button|widget)|jivosite|jivo_|code\.jivo|tawk\.to|binotel|ringostat|helpcrunch|livechat|chatra|tidio|crisp\.chat|bitrix24\.(?:ua|ru|com)\/b\d|b24-widget|kommo|callbackkiller|elfsight|wa-widget|getbutton\.io|sendpulse.*widget/i.test(html),
    socials: hrefs.some(h => { try { return socialDomain.test(new URL(h, url).hostname); } catch { return false; } }),
    contactLink: links.some(l => contactsLabel.test(l.label)) || hrefs.some(h => /contact|kontakt|контакт/i.test(h)),
    phoneText: /(?:\+?38\s?)?\(?0\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}\b/.test(body),
    copyright: copyrightYear($("footer").text() || body),
    deadTech: /\.swf\b|application\/x-shockwave-flash|<frameset|<marquee/i.test(html),
    cms: oldCms($('meta[name="generator" i]').attr("content") || ""),
    description: ($('meta[name="description" i]').attr("content") || "").trim().length >= 30,
    // A "Записатися"/"Book now" control of any kind, or a known booking system on the page.
    booking: bookingWidget.test(html) || $("a, button, [role=button], input[type=submit]").filter((_, el) => bookingLabel.test(($(el).text() || $(el).attr("value") || $(el).attr("aria-label") || "").trim())).length > 0,
  };
  return { identityText, contacts, links, fixedWidth, signals, weight, parked, unconfigured, scripted, blocked, readable: !blocked && !parked && !unconfigured && (body.length >= 60 || scripted) };
}

/** Latest plausible year next to a ©/copyright marker; null when there is no trustworthy marker. */
function copyrightYear(text: string): number | null {
  const now = new Date().getFullYear();
  const years = [...text.matchAll(/(?:©|&copy;|\(c\)|copyright)\s*(?:\d{4}\s*[-–—]\s*)?(\d{4})/gi)]
    .flatMap(m => (m[0].match(/\d{4}/g) || []).map(Number))
    .filter(y => y >= 2005 && y <= now + 1);
  return years.length ? Math.max(...years) : null;
}

/** CMS versions that are out of support (security updates stopped). */
function oldCms(generator: string): string | null {
  const wp = generator.match(/wordpress\s+(\d+)\.(\d+)/i);
  if (wp && Number(wp[1]) < 5) return "WordPress " + wp[1] + "." + wp[2];
  const joomla = generator.match(/joomla!?\s*(?:-\s*open source content management\s*)?(?:version\s*)?([123])(?:\.\d+)?/i);
  if (joomla) return "Joomla " + joomla[1];
  if (/drupal\s+[4-7]\b/i.test(generator)) return generator.match(/drupal\s+\d+/i)![0];
  return null;
}

type Gap = { label: string; strong: boolean; pitch: string; missing?: string };

/** What a visitor would miss, judged only from what the HTML shows. Script-built pages skip checks they cannot see. */
/** Rough speed estimate without Google PageSpeed: only what the HTML and the response show. */
const plural = (n: number, one: string, few: string, many: string) => {
  const t = n % 10, teen = n % 100 >= 11 && n % 100 <= 14;
  return n + " " + (teen || t === 0 || t >= 5 ? many : t === 1 ? one : few);
};

function slowHints(page: NonNullable<PageReading["page"]>, ms: number, bytes: number): string[] {
  const w = page.weight, hints: string[] = [];
  if (ms > 2000) hints.push("сервер відповідає за " + (ms / 1000).toFixed(1).replace(".", ",") + " с");
  if (bytes > 1_500_000) hints.push("сама сторінка важить " + (bytes / 1_048_576).toFixed(1).replace(".", ",") + " МБ");
  if (w.blockingScripts >= 6) hints.push(plural(w.blockingScripts, "скрипт", "скрипти", "скриптів") + " у шапці гальмують показ");
  if (w.stylesheets >= 10) hints.push(plural(w.stylesheets, "окремий файл", "окремі файли", "окремих файлів") + " стилів");
  if (w.images >= 25 && w.lazyImages < w.images / 3) hints.push(plural(w.images, "картинка вантажиться", "картинки вантажаться", "картинок вантажаться") + " одразу");
  // One weak hint alone is noise; a very slow server is a hint on its own.
  return hints.length >= 2 || ms > 3500 ? hints : [];
}

function siteGaps(page: NonNullable<PageReading["page"]>, finalUrl: string, ms: number, type = "", bytes = 0): Gap[] {
  const s = page.signals, gaps: Gap[] = [];
  const now = new Date().getFullYear();
  const old = s.copyright !== null && s.copyright <= now - 5;
  if (finalUrl.startsWith("http://"))
    gaps.push({ label: "Немає HTTPS — браузер позначає сайт як «Не захищено»", strong: true, pitch: "налаштувати HTTPS (SSL-сертифікат)", missing: "HTTPS" });
  if (!s.viewport)
    gaps.push({ label: "Не адаптований під телефон (немає налаштування viewport)", strong: true, pitch: "зробити мобільну версію", missing: "мобільної версії" });
  if (s.deadTech)
    gaps.push({ label: "Застарілі технології (Flash, рамки або бігучий рядок)", strong: true, pitch: "перезібрати сайт на сучасній основі", missing: "сучасної основи (застарілі Flash/рамки)" });
  if (s.cms)
    gaps.push({ label: s.cms + " — версія без оновлень безпеки", strong: true, pitch: "оновити систему керування сайтом", missing: "оновлень безпеки (" + s.cms + ")" });
  if (!page.scripted) {
    const anyWay = s.form || s.telLink || s.mailLink || s.messengers || s.widget || s.contactLink || s.phoneText || s.socials;
    if (!anyWay)
      gaps.push({ label: "Немає зворотного зв'язку: ні форми заявки, ні кнопки дзвінка, ні месенджерів", strong: true, pitch: "додати форму заявки, кнопку дзвінка й месенджери", missing: "зворотного зв'язку" });
    else {
      if (!s.form && !s.messengers && !s.widget && !s.contactLink)
        gaps.push({ label: s.phoneText || s.telLink ? "Немає форми заявки чи месенджерів — тільки телефон" : "Немає форми заявки чи месенджерів — тільки соцмережі або пошта", strong: false, pitch: "додати форму заявки й кнопки Telegram/Viber" });
      if (s.phoneText && !s.telLink)
        gaps.push({ label: "Телефон не натискається на мобільному (немає посилання tel:)", strong: false, pitch: "зробити телефон клікабельним" });
      if (!s.messengers && !s.widget && (s.form || s.contactLink))
        gaps.push({ label: "Немає кнопок месенджерів (Telegram, Viber, WhatsApp)", strong: false, pitch: "додати кнопки месенджерів" });
    }
    if (BOOKING_TYPES.has(type) && !s.booking) {
      const stay = STAY_TYPES.has(type);
      gaps.push(stay
        ? { label: "Немає онлайн-бронювання (кнопки чи модуля бронювання номерів)", strong: true, pitch: "додати онлайн-бронювання номерів", missing: "онлайн-бронювання" }
        : { label: "Немає онлайн-запису (кнопки «Записатися» чи віджета запису)", strong: true, pitch: "додати онлайн-запис", missing: "онлайн-запису" });
    }
    if (s.copyright !== null && s.copyright <= now - 3)
      // An old © alone is weak (big companies forget it); with another strong gap it confirms an abandoned site.
      gaps.push({ label: "Сайт давно не оновлювався (у футері © " + s.copyright + ")", strong: old && gaps.some(g => g.strong), pitch: "оновити дизайн і зміст", missing: "оновлень з " + s.copyright + " року" });
  }
  if (!s.description)
    gaps.push({ label: "Немає опису для Google (meta description)", strong: false, pitch: "налаштувати базове SEO" });
  const speed = slowHints(page, ms, bytes);
  if (speed.length)
    gaps.push({
      label: "Сайт, ймовірно, повільний на телефоні: " + speed.join(", "),
      strong: speed.length >= 3, pitch: "прискорити сайт", missing: "швидкості (" + speed.join(", ") + ")",
    });
  return gaps;
}

type PageReading = { url: string; status: number; page: ReturnType<typeof parsePage> | null; refused?: boolean; placeholder?: "parked" | "unconfigured"; ms?: number; bytes?: number };

/** No answer at all (DNS/connection failure, timeout) or an origin-down error. 503/429 are skipped: anti-bot walls use them. */
function looksDead(r: PageReading): boolean {
  if (r.refused) return false;
  return r.status === 0 || [404, 410, 500, 502, 504].includes(r.status) || (r.status >= 520 && r.status <= 530);
}
const statusLabel = (r: PageReading) => (r.status ? "HTTP " + r.status : "немає відповіді");

async function readPage(url: string, statusOnly = false): Promise<PageReading> {
  const result: PageReading = { url, status: 0, page: null };
  const started = Date.now();
  try {
    const response = await safeFetch(url, {
      headers: { Accept: "text/html,application/xhtml+xml", "Accept-Language": "uk,ru;q=0.8,en;q=0.6", "User-Agent": BROWSER_UA },
      cache: "no-store", signal: AbortSignal.timeout(7500),
    });
    result.url = response.url || url;
    result.status = response.status;
    result.ms = Date.now() - started;
    const isHtml = /text\/html|application\/xhtml\+xml/i.test(response.headers.get("content-type") || "");
    if (statusOnly || !isHtml) {
      await response.body?.cancel();
      return result;
    }
    const reader = response.body?.getReader();
    if (!reader) return result;
    const charset = response.headers.get("content-type")?.match(/charset=["']?([a-z0-9_-]+)/i)?.[1];
    const decoder = new TextDecoder(charset || "utf-8");
    // Error pages are only read for hosting placeholders; big pages are parsed up to the limit.
    const limit = response.ok ? 768 * 1024 : 64 * 1024;
    let html = "";
    let size = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      html += decoder.decode(value, { stream: true });
      if (size > limit) {
        await reader.cancel();
        break;
      }
    }
    result.bytes = size;
    const page = parsePage(html + decoder.decode(), result.url);
    result.placeholder = page.parked ? "parked" : page.unconfigured ? "unconfigured" : undefined;
    if (response.ok) result.page = page;
  } catch (err) {
    // Our own safety guard (private IP, odd port, redirect loop) is not evidence that the site is down.
    if (/^(Заблоковано|Дозволені|Некоректний|Забагато)/.test(err instanceof Error ? err.message : "")) result.refused = true;
  }
  return result;
}

function sameContact(candidate: Candidate, item: Contact): boolean {
  if (item.kind === "social") return false;
  if (item.kind === "email") return item.value.toLowerCase() === candidate.email?.trim().toLowerCase();
  const map = candidate.phone || "";
  const mapDigits = map.replace(/\D/g, "");
  const siteDigits = item.value.replace(/\D/g, "");
  if (Math.min(mapDigits.length, siteDigits.length) < 9) return false;
  if (mapDigits === siteDigits) return true;
  // Only compare national digits across different formats (e.g. 050… vs +38050…).
  // Two fully qualified numbers in different countries must never corroborate identity.
  if (map.trim().startsWith("+") === item.value.startsWith("+")) return false;
  const local = (item.value.startsWith("+") ? mapDigits : siteDigits).replace(/^0/, "");
  return local.length >= 9 && (item.value.startsWith("+") ? siteDigits : mapDigits).endsWith(local);
}

function matchesBusiness(candidate: Candidate, page: ReturnType<typeof parsePage>) {
  const pageWords = new Set(words(page.identityText));
  const distinctive = words(candidate.name).filter(word => word.length >= 3 && !genericName.test(word));
  const nameMatches = distinctive.length > 0 && distinctive.every(word => hasWord(pageWords, word));
  return nameMatches || page.contacts.some(item => sameContact(candidate, item));
}

/** Check only links advertised by the business. Confirm an actionable issue before ranking it high. */
/** DNS over HTTPS: "missing" = the domain is not registered any more (NXDOMAIN). */
async function dnsStatus(host: string): Promise<"missing" | "dead-dns" | "ok" | "unknown"> {
  try {
    const response = await fetch("https://cloudflare-dns.com/dns-query?name=" + encodeURIComponent(host) + "&type=A", {
      headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return "unknown";
    const data = await response.json() as { Status?: number; Comment?: string[] };
    if (data.Status === 3) return "missing";
    // SERVFAIL because the domain's own name servers are gone: the hosting was switched off.
    if (data.Status === 2 && /no reachable authority/i.test((data.Comment || []).join(" "))) return "dead-dns";
    return data.Status === 0 ? "ok" : "unknown";
  } catch { return "unknown"; }
}

/** Google PageSpeed Insights (mobile). Needs an API key: the keyless quota is shared worldwide and is usually exhausted. */
async function pageSpeed(url: string, key: string): Promise<{ score: number; lcp: string } | null> {
  try {
    const api = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
    api.searchParams.set("url", url);
    api.searchParams.set("strategy", "mobile");
    api.searchParams.set("category", "performance");
    api.searchParams.set("key", key);
    const response = await fetch(api, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) return null;
    const data = await response.json() as any;
    const score = data?.lighthouseResult?.categories?.performance?.score;
    if (typeof score !== "number") return null;
    return { score: Math.round(score * 100), lcp: data.lighthouseResult.audits?.["largest-contentful-paint"]?.displayValue || "" };
  } catch { return null; }
}

export async function assessLead(candidate: Candidate, service: LeadService, options: AssessOptions = {}): Promise<LeadAssessment> {
  const mapUrl = /^(node|way|relation)\/\d+$/.test(candidate.osmId) ? "https://www.openstreetmap.org/" + candidate.osmId : "";
  const assessment: LeadAssessment = {
    priority: "review", confidence: "unknown", checkedAt: new Date().toISOString(),
    summary: "У картці немає підтвердженого власного сайту.", suggestion: "Уточніть офіційну адресу сайту компанії.",
    evidence: mapUrl ? [{ label: "Картка компанії в OpenStreetMap", url: mapUrl }] : [],
    contact: contact("phone", candidate.phone, mapUrl) || contact("email", candidate.email, mapUrl) || socialContact(candidate, mapUrl),
  };
  const home = candidate.website && candidate.website !== "N/A" ? webUrl(candidate.website) : null;
  const hotLead = (summary: string, suggestion: string) => {
    assessment.summary = summary;
    assessment.priority = assessment.contact ? "high" : "review";
    assessment.suggestion = !assessment.contact ? "Знайдіть телефон або пошту компанії перед зверненням."
      : assessment.contact.kind === "social" ? suggestion.replace("Перед дзвінком", "Перед повідомленням у соцмережі") : suggestion;
    return assessment;
  };
  const homeHost = home ? new URL(home).hostname : "";
  if (!home || socialDomain.test(homeHost) || (service === "website" && platformDomain.test(homeHost))) {
    if (service !== "website") return assessment;
    // Selling a website: no own site on the map (or only a social profile) is the classic lead.
    // OSM can be incomplete, so this stays "partial" and the suggestion asks for a quick Google check.
    const profile = [candidate.website, candidate.instagram, candidate.facebook]
      .map(v => (v && v !== "N/A" ? webUrl(v) : null))
      .find(url => url && (socialDomain.test(new URL(url).hostname) || platformDomain.test(new URL(url).hostname)));
    assessment.confidence = "partial";
    if (profile) assessment.evidence.push({ label: "Сторінка в соцмережі замість сайту", url: profile });
    return hotLead(
      !profile ? "На карті не вказано власного сайту компанії."
        : platformDomain.test(new URL(profile).hostname) ? "Замість власного сайту — лише сторінка на платформі (" + new URL(profile).hostname + ")."
        : "Замість власного сайту — лише сторінка в соцмережі.",
      "Перед дзвінком перевірте в Google, чи сайту справді немає. Запропонуйте простий сайт із контактами, цінами й онлайн-записом.",
    );
  }

  let reading = await readPage(home);
  assessment.evidence.push({ label: reading.status ? "Головна сторінка · HTTP " + reading.status : "Спроба відкрити головну сторінку", url: reading.url });
  if (reading.placeholder) {
    const parked = reading.placeholder === "parked";
    assessment.confidence = "verified";
    assessment.evidence.push({ label: parked ? "Домен показує заглушку продажу / паркування" : "Хостинг показує заглушку «сайт не налаштовано»", url: reading.url });
    return hotLead(parked ? "На домені компанії замість сайту — заглушка «домен продається»." : "На домені компанії замість сайту — технічна заглушка хостингу (сайт не налаштовано).",
      "Запропонуйте новий сайт: зараз клієнти з карти потрапляють на заглушку.");
  }
  // The map often links a branch page that the chain has since removed: judge the site by its home page.
  const root = new URL("/", reading.url).href;
  if ((reading.status === 404 || reading.status === 410) && reading.url !== root) {
    const rootReading = await readPage(root);
    assessment.evidence.push({ label: "Посилання з карти не існує; головна сайту · " + statusLabel(rootReading), url: rootReading.url });
    if (rootReading.status >= 200 && rootReading.status < 300) reading = rootReading;
  }
  if (looksDead(reading)) {
    // Full second read: after a transient failure it gives a page we can still assess.
    const repeat = await readPage(home);
    assessment.evidence.push({ label: "Повторна перевірка · " + statusLabel(repeat), url: repeat.url });
    if (looksDead(repeat)) {
      assessment.confidence = "verified";
      // Name the cause when it can be confirmed: a lapsed domain or a broken certificate sells better than "it is down".
      const host = new URL(home).hostname;
      const dns = await dnsStatus(host);
      if (dns === "dead-dns") {
        assessment.evidence.push({ label: "DNS · сервери імен домену " + host + " не відповідають", url: "https://cloudflare-dns.com/dns-query?name=" + host + "&type=A" });
        return hotLead("Сайт не працює: DNS-сервери домену " + host + " не відповідають — схоже, хостинг відключено.",
          "Запропонуйте перенести сайт на робочий хостинг або зробити новий.");
      }
      if (dns === "missing") {
        assessment.evidence.push({ label: "DNS · домену " + host + " не існує (NXDOMAIN)", url: "https://cloudflare-dns.com/dns-query?name=" + host + "&type=A" });
        return hotLead("Домен сайту " + host + " більше не існує (не продовжено) — посилання з карти веде в нікуди.",
          "Запропонуйте відновити домен або зробити новий сайт.");
      }
      if (home.startsWith("https://")) {
        const plain = await readPage(home.replace(/^https:/i, "http:"), true);
        if (plain.status >= 200 && plain.status < 300 && plain.url.startsWith("http://")) {
          assessment.evidence.push({ label: "Та сама адреса по http:// · HTTP " + plain.status, url: plain.url });
          return hotLead("Сайт не відкривається по HTTPS (помилка сертифіката) — браузер показує «Підключення не захищене», працює лише по http.",
            "Запропонуйте полагодити SSL-сертифікат і налаштувати HTTPS.");
        }
      }
      if (reading.status === 525 || reading.status === 526)
        return hotLead("Сайт не відкривається через помилку SSL-сертифіката (" + statusLabel(reading) + ").",
          "Запропонуйте полагодити SSL-сертифікат і налаштувати HTTPS.");
      return hotLead("Сайт компанії двічі не відкрився (" + statusLabel(reading) + ", потім " + statusLabel(repeat) + ").",
        "Запропонуйте відновити або зробити новий сайт: зараз клієнти бачать помилку.");
    }
    reading = repeat;
  }
  const page = reading.page;
  if (!page?.readable || socialDomain.test(new URL(reading.url).hostname)) {
    // Bot protection is respected, not bypassed: say so instead of a vague "unreadable".
    const wall = [401, 403, 429, 503].includes(reading.status) || page?.blocked;
    assessment.summary = wall ? "Сайт працює, але закритий від автоматичних перевірок (захист від ботів)." : "Сторінку не вдалося прочитати достатньо для висновку.";
    assessment.suggestion = wall ? "Відкрийте сайт у браузері й перегляньте вручну." : "Перевірте сторінку пізніше або відкрийте її у браузері.";
    return assessment;
  }
  const contactLink = page.links.find(link => contactsLabel.test(link.label));
  let contactPage: PageReading | null = null;
  // A chain's footer may name the group while an official contact page carries
  // the individual branch phone. Only borrow contacts from the same host.
  if (contactLink && new URL(contactLink.url).hostname === new URL(reading.url).hostname
      && (!matchesBusiness(candidate, page) || (!page.contacts.length && !assessment.contact))) {
    const extra = await readPage(contactLink.url);
    if (extra.page?.readable && new URL(extra.url).hostname === new URL(reading.url).hostname) contactPage = extra;
  }
  const identityPage = matchesBusiness(candidate, page) ? reading
    : contactPage?.page && matchesBusiness(candidate, contactPage.page) ? contactPage : null;
  if (!identityPage) {
    assessment.summary = "Назву або контакт на сайті не вдалося звірити з карткою компанії.";
    assessment.suggestion = "Звірте, чи це офіційний сайт саме цієї компанії.";
    return assessment;
  }

  assessment.confidence = "partial";
  assessment.evidence.push({ label: "Назва або контакт збігається з карткою компанії", url: identityPage.url });
  const siteContacts = [...page.contacts, ...(contactPage?.page?.contacts || [])];
  assessment.contact = siteContacts.find(item => sameContact(candidate, item)) || siteContacts[0] || assessment.contact;
  const booking = page.links.find(link => bookingLabel.test(link.label));
  const action = service === "booking" ? booking : booking || contactLink;
  let issue = "";
  let suggestion = "";

  if (action) {
    const target = contactPage && action.url === contactLink?.url ? contactPage : await readPage(action.url, true);
    assessment.evidence.push({ label: "«" + action.label + "» · " + (target.status ? "HTTP " + target.status : "відповіді немає"), url: target.url });
    if (target.status === 404 || target.status === 410) {
      const repeat = await readPage(action.url, true);
      assessment.evidence.push({ label: "Повторна перевірка · " + (repeat.status ? "HTTP " + repeat.status : "відповіді немає"), url: repeat.url });
      if (repeat.status === target.status && repeat.url === target.url) {
        issue = "Посилання «" + action.label + "» двічі повернуло HTTP " + target.status + ".";
        suggestion = "Запропонуйте відновити перехід зі сторінки компанії.";
      }
    }
    if (!issue && target.status >= 200 && target.status < 300) {
      assessment.priority = "low";
      assessment.confidence = "verified";
      assessment.summary = "Сторінка за посиланням «" + action.label + "» відкрилася.";
      assessment.suggestion = "За цим переходом підстав для звернення не виявлено.";
    } else if (!issue) {
      assessment.summary = "Результат переходу потребує перевірки у браузері.";
      assessment.suggestion = "Відкрийте посилання з картки та повторіть перехід.";
    }
  } else {
    assessment.summary = page.scripted && !page.links.length
      ? "Сайт відкривається, але сторінку будують скрипти — кнопки автоматично не перевірено."
      : service === "booking" ? "У прочитаному HTML не виявлено прямого посилання на запис." : "Явної проблеми з перевірених ознак не виявлено.";
    assessment.suggestion = service === "booking" ? "Перевірте віджети, меню й сторонні сервіси запису у браузері." : "Перегляньте сторінку, якщо маєте іншу конкретну пропозицію.";
    if (service === "website") assessment.priority = "low";
  }

  if (!issue && service === "website" && page.fixedWidth >= 900) {
    issue = "У налаштуваннях головної сторінки задано фіксовану ширину " + page.fixedWidth + " px.";
    suggestion = "Запропонуйте перевірити читабельність і навігацію на телефоні.";
    assessment.evidence.push({ label: "HTML · viewport width=" + page.fixedWidth, url: reading.url });
  }
  if (issue) {
    assessment.confidence = "verified";
    assessment.priority = assessment.contact ? "high" : "review";
    assessment.summary = issue;
    assessment.suggestion = assessment.contact ? suggestion : "Знайдіть офіційний контакт компанії перед зверненням.";
  }

  const gaps = siteGaps(page, reading.url, reading.ms || 0, candidate.type, reading.bytes || 0);
  if (service === "website" && options.pageSpeedKey) {
    const speed = await pageSpeed(reading.url, options.pageSpeedKey);
    if (speed) {
      // The real measurement replaces the rough estimate.
      const rough = gaps.findIndex(g => g.label.startsWith("Сайт, ймовірно, повільний"));
      if (rough >= 0) gaps.splice(rough, 1);
      const report = "https://pagespeed.web.dev/analysis?url=" + encodeURIComponent(reading.url) + "&form_factor=mobile";
      assessment.evidence.push({ label: "Google PageSpeed (телефон) · " + speed.score + "/100" + (speed.lcp ? " · основний вміст за " + speed.lcp : ""), url: report });
      if (speed.score < 70)
        gaps.push({
          label: "Повільний на телефоні: Google PageSpeed " + speed.score + "/100" + (speed.lcp ? " (основний вміст за " + speed.lcp + ")" : ""),
          strong: speed.score < 50, pitch: "прискорити сайт на телефоні", missing: "швидкості на телефоні (PageSpeed " + speed.score + "/100)",
        });
    }
  }
  if (gaps.length) {
    assessment.gaps = gaps.map(({ label, strong }) => ({ label, strong }));
    const strong = gaps.filter(g => g.strong);
    // Script-built pages keep their "buttons not checked" summary unless a serious gap is certain.
    if (service === "website" && !issue && (strong.length || !page.scripted)) {
      // One confirmed serious gap is a reason to call; several small ones are worth a look.
      const pitch = (strong.length ? strong : gaps).slice(0, 3).map(g => g.pitch).join(", ");
      assessment.summary = strong.length
        ? "На сайті немає: " + strong.map(g => g.missing || g.label).join(", ") + "."
        : "Сайт працює, але є що покращити (" + gaps.length + " " + (gaps.length === 1 ? "пункт" : gaps.length < 5 ? "пункти" : "пунктів") + ").";
      assessment.suggestion = assessment.contact ? "Запропонуйте " + pitch + "." : "Знайдіть телефон або пошту компанії перед зверненням.";
      if (strong.length) {
        assessment.confidence = "verified";
        assessment.priority = assessment.contact ? "high" : "review";
      } else if (gaps.length >= 3 && assessment.priority === "low") assessment.priority = "review";
    }
    if (service === "website") for (const g of strong) assessment.evidence.push({ label: "Сайт · " + g.label, url: reading.url });
  }
  return assessment;
}
