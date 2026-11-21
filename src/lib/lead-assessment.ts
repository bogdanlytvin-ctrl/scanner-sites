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
  contact: { kind: "phone" | "email"; value: string; source: string } | null;
}

type Candidate = { name: string; website: string; phone?: string; email?: string; osmId: string; facebook?: string; instagram?: string };
type Contact = NonNullable<LeadAssessment["contact"]>;

const bookingLabel = /записат|запис на|онлайн.запис|заброню|бронюва|book (?:now|online|a |an )|appointment|reserv(?:e|ation)|umów|rezerw|записать/i;
const contactsLabel = /контакт|contact|kontakt|зв[’'ʼ]?яз/i;
const genericName = /^(стоматологія|стоматологічна|стоматологічний|медична|медичний|приватна|міська|лікарня|клініка|піцерія|кафе|ресторан|готель|магазин|салон|краси|львів|київ|центр|dental|clinic|dentist|hotel|studio|restaurant|cafe|the|and|salon)$/;
const socialDomain = /(^|\.)(instagram\.com|facebook\.com|fb\.com|fb\.me|t\.me|linktr\.ee|wa\.me|tiktok\.com)$/i;

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
  return text.toLowerCase().normalize("NFKC").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

function parsePage(html: string, url: string) {
  const $ = cheerio.load(html);
  const links: { label: string; url: string }[] = [];
  const contacts: Contact[] = [];
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
  const identityText = [$("title").first().text(), $("h1").first().text(), $('meta[property="og:site_name"]').attr("content") || ""].join(" ");
  const body = $("body").text().replace(/\s+/g, " ").trim();
  const title = $("title").text().trim();
  const blocked = /^(just a moment|access denied|attention required|verify you are human|checking your browser|captcha|domain for sale)/i.test(title);
  // Registrar/parking placeholders: the company no longer has a working site on this domain.
  const parked = /domain (?:is )?for sale|buy this domain|this domain (?:is|may be) (?:for sale|parked)|domain (?:has )?expired|parked (?:free|domain)|домен продається|домен продается|купити цей домен|купить этот домен/i.test(title + " " + body.slice(0, 600));
  const viewport = $('meta[name="viewport" i]').first().attr("content") || "";
  const fixedWidth = Number(viewport.match(/(?:^|[,;\s])width\s*=\s*(\d+)(?=[,;\s]|$)/i)?.[1] || 0);
  return { identityText, contacts, links, fixedWidth, parked, readable: !blocked && !parked && body.length >= 60 };
}

type PageReading = { url: string; status: number; page: ReturnType<typeof parsePage> | null; refused?: boolean };

/** No answer at all (DNS/connection failure, timeout) or an origin-down error. 503/429 are skipped: anti-bot walls use them. */
function looksDead(r: PageReading): boolean {
  if (r.refused) return false;
  return r.status === 0 || [500, 502, 504].includes(r.status) || (r.status >= 520 && r.status <= 530);
}
const statusLabel = (r: PageReading) => (r.status ? "HTTP " + r.status : "немає відповіді");

async function readPage(url: string, statusOnly = false): Promise<PageReading> {
  const result: PageReading = { url, status: 0, page: null };
  try {
    const response = await safeFetch(url, {
      headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "LeadFinder/1.0 (+https://scanner-sites.b-litvin2023.workers.dev/)" },
      cache: "no-store", signal: AbortSignal.timeout(7500),
    });
    result.url = response.url || url;
    result.status = response.status;
    if (statusOnly || !response.ok || !/text\/html|application\/xhtml\+xml/i.test(response.headers.get("content-type") || "")) {
      await response.body?.cancel();
      return result;
    }
    const reader = response.body?.getReader();
    if (!reader) return result;
    const charset = response.headers.get("content-type")?.match(/charset=["']?([a-z0-9_-]+)/i)?.[1];
    const decoder = new TextDecoder(charset || "utf-8");
    const limit = 768 * 1024;
    let html = "";
    let size = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        return result;
      }
      html += decoder.decode(value, { stream: true });
    }
    result.page = parsePage(html + decoder.decode(), result.url);
  } catch (err) {
    // Our own safety guard (private IP, odd port, redirect loop) is not evidence that the site is down.
    if (/^(Заблоковано|Дозволені|Некоректний|Забагато)/.test(err instanceof Error ? err.message : "")) result.refused = true;
  }
  return result;
}

function sameContact(candidate: Candidate, item: Contact): boolean {
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
  const nameMatches = distinctive.length > 0 && distinctive.every(word => pageWords.has(word));
  return nameMatches || page.contacts.some(item => sameContact(candidate, item));
}

/** Check only links advertised by the business. Confirm an actionable issue before ranking it high. */
export async function assessLead(candidate: Candidate, service: LeadService): Promise<LeadAssessment> {
  const mapUrl = /^(node|way|relation)\/\d+$/.test(candidate.osmId) ? "https://www.openstreetmap.org/" + candidate.osmId : "";
  const assessment: LeadAssessment = {
    priority: "review", confidence: "unknown", checkedAt: new Date().toISOString(),
    summary: "У картці немає підтвердженого власного сайту.", suggestion: "Уточніть офіційну адресу сайту компанії.",
    evidence: mapUrl ? [{ label: "Картка компанії в OpenStreetMap", url: mapUrl }] : [],
    contact: contact("phone", candidate.phone, mapUrl) || contact("email", candidate.email, mapUrl),
  };
  const home = candidate.website && candidate.website !== "N/A" ? webUrl(candidate.website) : null;
  const hotLead = (summary: string, suggestion: string) => {
    assessment.summary = summary;
    assessment.priority = assessment.contact ? "high" : "review";
    assessment.suggestion = assessment.contact ? suggestion : "Знайдіть телефон або пошту компанії перед зверненням.";
    return assessment;
  };
  if (!home || socialDomain.test(new URL(home).hostname)) {
    if (service !== "website") return assessment;
    // Selling a website: no own site on the map (or only a social profile) is the classic lead.
    // OSM can be incomplete, so this stays "partial" and the suggestion asks for a quick Google check.
    const profile = [candidate.website, candidate.instagram, candidate.facebook]
      .map(v => (v && v !== "N/A" ? webUrl(v) : null))
      .find(url => url && socialDomain.test(new URL(url).hostname));
    assessment.confidence = "partial";
    if (profile) assessment.evidence.push({ label: "Сторінка в соцмережі замість сайту", url: profile });
    return hotLead(
      profile ? "Замість власного сайту — лише сторінка в соцмережі." : "На карті не вказано власного сайту компанії.",
      "Перед дзвінком перевірте в Google, чи сайту справді немає. Запропонуйте простий сайт із контактами, цінами й онлайн-записом.",
    );
  }

  const reading = await readPage(home);
  assessment.evidence.push({ label: reading.status ? "Головна сторінка · HTTP " + reading.status : "Спроба відкрити головну сторінку", url: reading.url });
  if (reading.page?.parked) {
    assessment.confidence = "verified";
    assessment.evidence.push({ label: "Домен показує заглушку продажу / паркування", url: reading.url });
    return hotLead("На домені компанії замість сайту — заглушка «домен продається».",
      "Запропонуйте новий сайт: зараз клієнти з карти потрапляють на чужу заглушку.");
  }
  if (looksDead(reading)) {
    const repeat = await readPage(home, true);
    assessment.evidence.push({ label: "Повторна перевірка · " + statusLabel(repeat), url: repeat.url });
    if (looksDead(repeat)) {
      assessment.confidence = "verified";
      return hotLead("Сайт компанії двічі не відкрився (" + statusLabel(reading) + ", потім " + statusLabel(repeat) + ").",
        "Запропонуйте відновити або зробити новий сайт: зараз клієнти бачать помилку.");
    }
  }
  const page = reading.page;
  if (!page?.readable || socialDomain.test(new URL(reading.url).hostname)) {
    assessment.summary = "Сторінку не вдалося прочитати достатньо для висновку.";
    assessment.suggestion = "Перевірте сторінку пізніше або відкрийте її у браузері.";
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
    assessment.summary = service === "booking" ? "У прочитаному HTML не виявлено прямого посилання на запис." : "Явної проблеми з перевірених ознак не виявлено.";
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
  return assessment;
}
