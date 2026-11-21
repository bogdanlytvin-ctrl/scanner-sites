// All user records live in a separate SQLite-backed Durable Object per private session.
const LIMITS = { campaigns: 5, perRun: 12, draftsPerDay: 40, reportsPerDay: 60 };
const REPORT_DAYS = 180;
const DAY = 86_400_000;
const MINUTE = 60_000;
const cookieName = "__Host-lead-workspace";
const activePhases = ["queued", "discovering", "checking", "retry"];
const hasWebsite = (b) => Boolean(b.website && b.website !== "N/A");
const statuses = [
  "new",
  "in_progress",
  "contacted",
  "replied",
  "won",
  "skipped",
];
const filled = (v) => Boolean(v && v !== "N/A");
const hasContact = (b) =>
  [b.phone, b.email, b.instagram, b.telegram, b.facebook].some(filled);
const genericWord =
  /^(піца|піци|пицца|піцерія|пиццерия|pizza|pizzeria|кафе|cafe|ресторан|restaurant|доставка|доставки|суші|sushi|бар|паб|кавярня|coffee|салон|студія|studio|клініка|клініки|клиника|clinic|стоматологія|стоматологічна|стоматологічний|стоматологічний|стоматология|стоматологическая|dental|dentistry|медична|медичний|медицинский|центр|center|centre|аптека|магазин|готель|hotel|кабінет|офіс|мережа|львів|львівська|львівський|київ|київська|київський|the|and|для|при|біля)$/;
// Brand identity of a name: its distinctive words, generic ones dropped, order ignored.
// "Піцерія «Челентано»" = "Челентано піца" = "Челентано", but "Дента плюс" ≠ "Дента люкс".
export const brandKey = (name) =>
  [
    ...new Set(
      (name || "")
        .toLowerCase()
        .normalize("NFKC")
        .replace(/['’ʼ`‘]/g, "")
        .split(/[^\p{L}\p{N}]+/u)
        .filter((w) => w.length >= 3 && !genericWord.test(w)),
    ),
  ]
    .sort()
    .join(" ");
const socialHost =
  /(^|\.)(instagram\.com|facebook\.com|fb\.com|fb\.me|t\.me|linktr\.ee|wa\.me|tiktok\.com)$/i;
// Same website = same company. Social profiles share a host, so for them the whole address counts.
const siteKey = (website) => {
  try {
    const url = new URL(/^https?:\/\//i.test(website) ? website : "https://" + website);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    return socialHost.test(host)
      ? host + url.pathname.replace(/\/+$/, "").toLowerCase()
      : host;
  } catch {
    return "";
  }
};
// A chain branch often has no website on the map while another branch does.
// Borrow that brand site so the branch is not mistaken for a company without a site.
export function shareBrandSites(businesses) {
  const sites = new Map();
  for (const b of businesses) {
    const key = hasWebsite(b) && brandKey(b.name);
    if (key && !sites.has(key)) sites.set(key, b.website);
  }
  return businesses.map((b) => {
    const site = !hasWebsite(b) && sites.get(brandKey(b.name));
    return site ? { ...b, website: site } : b;
  });
}
// One card per chain: branches with the same site or the same brand name collapse into the
// first (nearest) one, which keeps the branch count, the other addresses and missing contacts.
export function groupBranches(businesses) {
  const groups = [];
  const index = new Map();
  for (const b of businesses) {
    if (!b.osmId || !b.name) continue;
    const keys = [
      hasWebsite(b) && "site:" + siteKey(b.website),
      brandKey(b.name) && "name:" + brandKey(b.name),
    ].filter((k) => k && !k.endsWith(":"));
    let group = keys.map((k) => index.get(k)).find(Boolean);
    // Same name but two different own websites: two companies, not branches.
    if (group && hasWebsite(b) && hasWebsite(group) && siteKey(b.website) !== siteKey(group.website))
      group = undefined;
    if (!group) {
      const head = { ...b, branches: 1, branchAddresses: [], branchIds: [] };
      groups.push(head);
      keys.forEach((k) => index.has(k) || index.set(k, head));
      continue;
    }
    group.branches++;
    group.branchIds.push(b.osmId);
    if (b.address && b.address !== "N/A" && group.branchAddresses.length < 8)
      group.branchAddresses.push(b.address);
    for (const field of ["phone", "email", "website"])
      if ((!group[field] || group[field] === "N/A") && b[field] && b[field] !== "N/A")
        group[field] = b[field];
    keys.forEach((k) => index.has(k) || index.set(k, group));
  }
  return groups;
}
// Least recently checked first. For "booking" sites go first (the check needs a site);
// for "website" half of the run goes to contactable companies without an own site — the hottest leads.
export function pickQueue(businesses, seen, service) {
  const fresh = (a, b) =>
    (seen.get(a.osmId) || "").localeCompare(seen.get(b.osmId) || "");
  const all = businesses.filter((b) => b.osmId && b.name);
  if (service !== "website")
    return all
      .sort((a, b) => fresh(a, b) || Number(hasWebsite(b)) - Number(hasWebsite(a)))
      .slice(0, LIMITS.perRun);
  const noSite = all.filter((b) => !hasWebsite(b) && hasContact(b)).sort(fresh);
  const rest = all
    .filter((b) => !noSite.includes(b))
    .sort((a, b) => fresh(a, b) || Number(hasWebsite(b)) - Number(hasWebsite(a)));
  const picked = [...noSite.slice(0, LIMITS.perRun / 2)];
  for (const b of [...rest, ...noSite.slice(LIMITS.perRun / 2)]) {
    if (picked.length >= LIMITS.perRun) break;
    picked.push(b);
  }
  return picked;
}
const iso = (ms = Date.now()) => new Date(ms).toISOString();
// Leads checked before scores existed sort by their priority until the next check scores them.
const legacyScore = (l) => l.score ?? { high: 70, review: 40, low: 15 }[l.priority] ?? 0;
const json = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
const failure = (message, status = 400) => json({ error: message }, status);
const randomKey = () =>
  crypto.randomUUID().replaceAll("-", "") +
  crypto.randomUUID().replaceAll("-", "");
const clean = (value, limit) =>
  typeof value === "string" ? value.trim().slice(0, limit) : "";
const sha = async (value) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

/** Facts about a lead for the offer writer: only what the check found, nothing invented. */
export function offerFacts(lead, campaign) {
  const site = filled(lead.website);
  const situation = !site
    ? lead.contact?.kind === "social" ? "немає власного сайту, лише сторінка в соцмережі" : "немає власного сайту"
    : lead.priority === "high" ? "сайт не працює або це лише сторінка на платформі"
    : "сайт працює, але є що покращити";
  return {
    name: lead.name,
    city: campaign?.city || "",
    niche: campaign?.query || "",
    website: site ? lead.website : "",
    situation,
    summary: lead.summary || "",
    gaps: (lead.gaps || []).slice(0, 8),
    branches: lead.branches > 1 ? lead.branches : undefined,
    hasShot: Boolean(lead.shot),
  };
}

/** Plain offer used when Claude on the VPS is unavailable. */
export function templateOffer(f) {
  const where = f.city ? " у місті " + f.city : "";
  const lines = ["Добрий день! Я веб-розробник, переглядав компанії" + where + "."];
  if (!f.website) {
    lines.push(
      "Помітив, що в «" + f.name + "» немає власного сайту. Багато клієнтів спершу шукають у телефоні, і сайт з цінами, контактами та кнопкою «подзвонити» допомагає отримувати більше звернень.",
    );
  } else if (f.situation.startsWith("сайт не працює")) {
    lines.push(
      "Помітив, що з вашим сайтом проблема: " + f.summary.charAt(0).toLowerCase() + f.summary.slice(1).replace(/\.$/, "") + ". Люди, які шукають вас в інтернеті, бачать помилку й можуть піти до інших.",
    );
  } else {
    const top = [...f.gaps].sort((a, b) => b.strong - a.strong).slice(0, 3);
    lines.push(
      top.length
        ? "Переглянув сайт «" + f.name + "» і помітив кілька моментів:\n" + top.map((g) => "— " + g.label).join("\n") + "\nЦе можна виправити, щоб більше відвідувачів телефонували й записувалися."
        : "Переглянув сайт «" + f.name + "» і маю кілька ідей, як отримувати з нього більше звернень.",
    );
  }
  if (f.hasShot) lines.push("Можу надіслати знімок, як сайт виглядає на телефоні.");
  lines.push("Якщо цікаво, безкоштовно покажу, як це могло б виглядати, або коротко зідзвонимося.");
  lines.push("[Ваше ім'я], [телефон]");
  return {
    subject: f.website ? "Сайт «" + f.name + "»: що можна покращити" : "Сайт для «" + f.name + "»",
    text: lines.join("\n\n"),
  };
}

const STATUS_NAMES = { new: "Нова", in_progress: "У роботі", contacted: "Звернувся", replied: "Відповіли", won: "Є угода", skipped: "Пропущено" };
const PRIORITY_NAMES = { high: "Високий", review: "Уточнити", low: "Низький" };
// A cell that starts with = + - @ (or tab/CR) would run as a formula in Excel/Sheets: prefix it.
const cell = (value) => {
  let text = value == null ? "" : String(value).replace(/\r?\n/g, " ").trim();
  // A phone number (+380 …) is only digits and cannot run as a formula: leave it readable.
  if (/^[=+\-@\t\r]/.test(text) && !/^\+[\d\s().-]{6,}$/.test(text)) text = "'" + text;
  return /[",;]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
};
/** Leads as a CSV table (UTF-8 with BOM so Excel shows Ukrainian correctly). */
export function leadsCsv(leads, campaigns) {
  const byId = new Map(campaigns.map((c) => [c.id, c]));
  const head = ["Назва", "Ніша", "Місто", "Пріоритет", "Оцінка", "Статус", "Телефон", "Пошта", "Контакт для звернення", "Сайт", "Адреса",
    "Висновок", "Чого не вистачає", "Строк домену/SSL", "Нотатка", "Звіт для клієнта", "Перевірено"];
  const rows = leads.map((l) => {
    const c = byId.get(l.campaignId) || {};
    return [l.name, c.query, c.city, PRIORITY_NAMES[l.priority] || l.priority, l.score ?? "", STATUS_NAMES[l.status] || l.status,
      filled(l.phone) ? l.phone : "", l.email || "", l.contact?.value || "", filled(l.website) ? l.website : "", filled(l.address) ? l.address : "",
      l.summary, (l.gaps || []).map((g) => g.label).join("; "), l.expiry ? (l.expiry.what === "domain" ? "домен до " : "SSL до ") + l.expiry.date.slice(0, 10) : "",
      l.notes || "", l.report ? "/r/" + l.report.token : "", (l.checkedAt || "").slice(0, 10)];
  });
  return "\ufeff" + [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

export async function workspaceRequest(request, ns) {
  if (!["GET", "POST"].includes(request.method))
    return failure("Метод недоступний.", 405);
  const isPost = request.method === "POST";
  const cookie = (request.headers.get("Cookie") || "")
    .split(/;\s*/)
    .find((v) => v.startsWith(cookieName + "="))
    ?.split("=")[1];
  let token = /^[a-f0-9]{64}$/.test(cookie || "") ? cookie : randomKey();
  let data;
  const directory = () => ns.getByName("admission");
  if (isPost) {
    if (request.headers.get("Origin") !== new URL(request.url).origin)
      return failure("Оновіть сторінку й повторіть дію.", 403);
    if (!request.headers.get("content-type")?.includes("application/json"))
      return failure("Потрібен JSON.", 415);
    const reader = request.body?.getReader();
    if (!reader) return failure("Порожній запит.");
    let length = 0,
      raw = "";
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 8192) {
        await reader.cancel();
        return failure("Завеликий запит.", 413);
      }
      raw += decoder.decode(value, { stream: true });
    }
    try {
      data = JSON.parse(raw + decoder.decode());
    } catch {
      return failure("Некоректний JSON.");
    }
    if (!data || typeof data.action !== "string")
      return failure("Невідома дія.");
    if (
      ["create", "run", "resume", "transfer", "restore", "draft", "report"].includes(data.action)
    ) {
      const ip = await sha(request.headers.get("CF-Connecting-IP") || "local");
      const allowed = await directory().fetch("https://internal/admit", {
        method: "POST",
        // Offer drafts get their own hourly counter so they don't eat into search runs.
        body: (["draft", "report"].includes(data.action) ? data.action + ":" : "") + ip,
      });
      if (!allowed.ok)
        return failure("Ліміт запусків. Спробуйте за годину.", 429);
    }
    if (data.action === "transfer") {
      if (cookie !== token) return failure("Спершу відкрийте кабінет.", 403);
      const code = randomKey().slice(0, 32);
      await directory().fetch("https://internal/issue", {
        method: "POST",
        body: JSON.stringify({ hash: await sha(code), token }),
      });
      return json({ code });
    }
    if (data.action === "restore") {
      const code = clean(data.code, 80).toLowerCase();
      if (!/^[0-9a-f]{32}$/.test(code))
        return failure("Недійсний код підключення.");
      const result = await directory().fetch("https://internal/redeem", {
        method: "POST",
        body: await sha(code),
      });
      if (!result.ok) return failure("Код недійсний або строк дії минув.");
      token = await result.text();
      data = undefined;
    }
  }
  const stub = ns.getByName("user:" + token);
  // Phone screenshots are served only from the caller's own workspace (same cookie).
  const shot = !isPost && new URL(request.url).searchParams.get("shot");
  const exportCsv = !isPost && new URL(request.url).searchParams.get("export") === "csv";
  const campaign = (new URL(request.url).searchParams.get("campaign") || "").slice(0, 64);
  const response = await stub.fetch(
    shot
      ? "https://internal/shot?id=" + encodeURIComponent(shot.slice(0, 200))
      : exportCsv ? "https://internal/export?campaign=" + encodeURIComponent(campaign)
      : "https://internal/workspace",
    data ? { method: "POST", body: JSON.stringify(data) } : {},
  );
  const out = new Response(response.body, response);
  out.headers.set(
    "Set-Cookie",
    cookieName +
      "=" +
      token +
      "; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Strict",
  );
  return out;
}

export class Workspace {
  constructor(storage, services) {
    this.store = storage;
    this.sql = storage.sql;
    this.services = services;
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS campaigns (id TEXT PRIMARY KEY, body TEXT NOT NULL, due INTEGER)",
    );
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS leads (id TEXT PRIMARY KEY, campaign TEXT NOT NULL, body TEXT NOT NULL)",
    );
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS transient (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires INTEGER NOT NULL)",
    );
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS shots (id TEXT PRIMARY KEY, campaign TEXT NOT NULL, data TEXT NOT NULL)",
    );
    this.sql.exec("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    // Public client reports (kept in the shared "admission" object, looked up by their unguessable token).
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS reports (token TEXT PRIMARY KEY, owner TEXT NOT NULL, body TEXT NOT NULL, created INTEGER NOT NULL)",
    );
  }
  transient(key) {
    return this.sql
      .exec(
        "SELECT value FROM transient WHERE key=? AND expires>?",
        key,
        Date.now(),
      )
      .toArray()[0]?.value;
  }
  setTransient(key, value, expires) {
    this.sql.exec(
      "INSERT OR REPLACE INTO transient VALUES(?,?,?)",
      key,
      value,
      expires,
    );
  }
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/shot") {
      const id = new URL(request.url).searchParams.get("id") || "";
      const row = this.sql.exec("SELECT data FROM shots WHERE id=?", id).toArray()[0];
      const match = row && /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(row.data);
      if (!match) return failure("Знімка немає.", 404);
      const bytes = Uint8Array.from(atob(match[2]), (ch) => ch.charCodeAt(0));
      return new Response(bytes, {
        headers: { "Content-Type": match[1], "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" },
      });
    }
    if (path === "/export") {
      const only = new URL(request.url).searchParams.get("campaign") || "";
      const { campaigns, leads } = await (await this.snapshot()).json();
      const rows = leads.filter((l) => !only || l.campaignId === only);
      return new Response(leadsCsv(rows, campaigns), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="leads-${new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Kyiv" })}.csv"`,
          "Cache-Control": "private, no-store",
        },
      });
    }
    if (path !== "/workspace") {
      const body = await request.text(),
        now = Date.now();
      this.sql.exec("DELETE FROM transient WHERE expires<=?", now);
      if (path === "/issue") {
        const { hash, token } = JSON.parse(body);
        this.setTransient("transfer:" + hash, token, now + 10 * MINUTE);
        return json({ ok: true });
      }
      if (path === "/redeem") {
        const key = "transfer:" + body,
          token = this.transient(key);
        this.sql.exec("DELETE FROM transient WHERE key=?", key);
        return token ? new Response(token) : failure("Недійсний код", 404);
      }
      if (path === "/report-put") {
        const { token, owner, body: report } = JSON.parse(body);
        if (!/^[a-f0-9]{32}$/.test(token) || typeof report !== "string" || report.length > 600_000)
          return failure("Некоректний звіт.");
        this.sql.exec("DELETE FROM reports WHERE created<?", now - REPORT_DAYS * DAY);
        this.sql.exec("INSERT OR REPLACE INTO reports VALUES(?,?,?,?)", token, owner, report, now);
        return json({ ok: true });
      }
      if (path === "/report-get") {
        const row = this.sql.exec("SELECT body FROM reports WHERE token=? AND created>=?", body, now - REPORT_DAYS * DAY).toArray()[0];
        return row ? new Response(row.body, { headers: { "Content-Type": "application/json" } }) : failure("Звіт не знайдено.", 404);
      }
      if (path === "/report-del") {
        const { token, owner } = JSON.parse(body);
        this.sql.exec("DELETE FROM reports WHERE token=? AND owner=?", token, owner);
        return json({ ok: true });
      }
      if (!["/admit", "/budget"].includes(path))
        return failure("Невідомий шлях", 404);
      const window = path === "/budget" ? DAY : 60 * MINUTE;
      const key = path + Math.floor(now / window) + body;
      const count = Number(this.transient(key) || 0);
      if (count >= (path === "/budget" ? 120 : 25))
        return failure("Ліміт запитів", 429);
      this.setTransient(
        key,
        String(count + 1),
        (Math.floor(now / window) + 1) * window,
      );
      return json({ ok: true });
    }
    if (request.method === "GET") return this.snapshot();
    const data = await request.json();
    if (data?.action === "draft") return this.draft(data.id);
    if (data?.action === "report") return this.report(data.id);
    if (data?.action === "report-delete") return this.unreport(data.id);
    const result = this.change(data);
    if (this.pendingReportDeletes) {
      await Promise.all(this.pendingReportDeletes);
      this.pendingReportDeletes = null;
    }
    if (result) return result;
    await this.schedule();
    return this.snapshot();
  }
  allCampaigns() {
    return this.sql
      .exec("SELECT body FROM campaigns ORDER BY rowid DESC")
      .toArray()
      .map((r) => JSON.parse(r.body));
  }
  get(id) {
    if (typeof id !== "string") return null;
    const row = this.sql
      .exec("SELECT body FROM campaigns WHERE id=?", id)
      .toArray()[0];
    return row ? JSON.parse(row.body) : null;
  }
  save(c, due) {
    c.nextAt = due == null ? null : iso(due);
    c.updatedAt = iso();
    this.sql.exec(
      "INSERT INTO campaigns VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body,due=excluded.due",
      c.id,
      JSON.stringify(c),
      due ?? null,
    );
  }
  setting(key) {
    return this.sql.exec("SELECT value FROM settings WHERE key=?", key).toArray()[0]?.value;
  }
  sender() {
    try {
      return JSON.parse(this.setting("sender") || "null");
    } catch {
      return null;
    }
  }
  owner() {
    let id = this.setting("owner");
    if (!id) {
      id = randomKey();
      this.sql.exec("INSERT INTO settings VALUES('owner',?)", id);
    }
    return id;
  }
  /** Freeze what the check found into a shareable report; replaces the lead's previous report. */
  async report(id) {
    const lead = this.leadRow(id);
    if (!lead) return failure("Компанію не знайдено.", 404);
    if (!this.services.reportStore) return failure("Звіти тимчасово недоступні.", 503);
    const day = Math.floor(Date.now() / DAY),
      key = "reports:" + day,
      used = Number(this.transient(key) || 0);
    if (used >= LIMITS.reportsPerDay)
      return failure("На сьогодні вже створено " + LIMITS.reportsPerDay + " звітів. Завтра знову.", 429);
    this.setTransient(key, String(used + 1), (day + 1) * DAY);
    const campaign = this.get(lead.campaignId);
    const probe = (lead.evidence || []).find((e) => /Lighthouse/.test(e.label))?.label || "";
    const shot = this.sql.exec("SELECT data FROM shots WHERE id=?", id).toArray()[0]?.data;
    const body = {
      v: 1,
      name: lead.name,
      city: campaign?.city || "",
      website: filled(lead.website) ? lead.website : "",
      kind: lead.kind || "",
      summary: lead.summary || "",
      gaps: (lead.gaps || []).slice(0, 12),
      speed: /· (\d{1,3})\/100/.test(probe) ? Number(probe.match(/· (\d{1,3})\/100/)[1]) : null,
      lcp: probe.match(/основний вміст за ([^·]+?)\s*(?:·|$)/)?.[1] || "",
      checkedAt: lead.checkedAt,
      shot: shot && shot.length < 450_000 ? shot : null,
      sender: this.sender(),
    };
    const token = randomKey().slice(0, 32);
    const owner = this.owner();
    if (lead.report?.token) await this.services.reportStore("/report-del", { token: lead.report.token, owner }).catch(() => {});
    const saved = await this.services.reportStore("/report-put", { token, owner, body: JSON.stringify(body) });
    if (!saved) return failure("Не вдалося зберегти звіт. Спробуйте ще раз.", 502);
    const current = this.leadRow(id);
    if (!current) return failure("Компанію не знайдено.", 404);
    current.report = { token, at: iso() };
    this.sql.exec("UPDATE leads SET body=? WHERE id=?", JSON.stringify(current), id);
    return this.snapshot();
  }
  async unreport(id) {
    const lead = this.leadRow(id);
    if (!lead) return failure("Компанію не знайдено.", 404);
    if (lead.report?.token && this.services.reportStore)
      await this.services.reportStore("/report-del", { token: lead.report.token, owner: this.owner() }).catch(() => {});
    delete lead.report;
    this.sql.exec("UPDATE leads SET body=? WHERE id=?", JSON.stringify(lead), id);
    return this.snapshot();
  }
  leadRow(id) {
    if (typeof id !== "string") return null;
    const row = this.sql.exec("SELECT body FROM leads WHERE id=?", id).toArray()[0];
    return row ? JSON.parse(row.body) : null;
  }
  async draft(id) {
    const lead = this.leadRow(id);
    if (!lead) return failure("Компанію не знайдено.", 404);
    const day = Math.floor(Date.now() / DAY),
      key = "drafts:" + day,
      used = Number(this.transient(key) || 0);
    if (used >= LIMITS.draftsPerDay)
      return failure("На сьогодні вже написано " + LIMITS.draftsPerDay + " листів. Завтра знову.", 429);
    this.setTransient(key, String(used + 1), (day + 1) * DAY);
    const facts = offerFacts(lead, this.get(lead.campaignId));
    let written = null;
    try {
      written = this.services.writeOffer ? await this.services.writeOffer(facts) : null;
    } catch {
      written = null;
    }
    const text = typeof written?.text === "string" ? written.text.trim().slice(0, 3000) : "";
    // Sign with the sender's own contacts when they are filled in.
    const sender = this.sender();
    const signature = sender && [sender.name, sender.phone || sender.telegram || sender.email].filter(Boolean).join(", ");
    const draft = text
      ? { subject: clean(written.subject, 120), text, source: "claude", at: iso() }
      : { ...templateOffer(facts), source: "template", at: iso() };
    if (signature) draft.text = draft.text.replace("[Ваше ім'я], [телефон]", signature);
    // The lead may have been re-checked while Claude was writing: attach the draft to the current row.
    const current = this.leadRow(id);
    if (!current) return failure("Компанію не знайдено.", 404);
    current.draft = draft;
    this.sql.exec("UPDATE leads SET body=? WHERE id=?", JSON.stringify(current), id);
    return this.snapshot();
  }
  snapshot() {
    const campaigns = this.allCampaigns().map(
      ({ queue, geo, attempt, version, lastStarted, ...c }) => c,
    );
    const leads = this.sql
      .exec("SELECT body FROM leads")
      .toArray()
      .map((r) => JSON.parse(r.body));
    const rank = { high: 0, review: 1, low: 2 };
    leads.sort(
      (a, b) =>
        rank[a.priority] - rank[b.priority] ||
        legacyScore(b) - legacyScore(a) ||
        b.checkedAt.localeCompare(a.checkedAt),
    );
    return json({ campaigns, leads, limits: LIMITS, sender: this.sender() });
  }
  queue(c) {
    c.version = crypto.randomUUID();
    c.phase = "queued";
    c.queue = [];
    c.attempt = 0;
    c.total = 0;
    c.checked = 0;
    c.message = "Очікує фонового пошуку.";
    c.lastStarted = Date.now();
    this.save(c, Date.now() + 500);
  }
  change(data) {
    if (data.action === "create") {
      if (this.allCampaigns().length >= LIMITS.campaigns)
        return failure("Можна зберегти до 5 пошуків.", 409);
      const city = clean(data.city, 100),
        query = clean(data.query, 100),
        country = clean(data.country, 3).toLowerCase();
      const radius = Number(data.radius);
      if (
        !city ||
        !query ||
        !/^[a-z]{2}$/.test(country) ||
        !Number.isInteger(radius) ||
        radius < 1 ||
        radius > 50 ||
        !["website", "booking"].includes(data.service) ||
        !["manual", "daily", "weekly"].includes(data.cadence)
      )
        return failure(
          "Перевірте місто, країну, нішу, послугу та радіус (1–50 км).",
        );
      const params = {
        city,
        query,
        country,
        radius,
        service: data.service,
        cadence: data.cadence,
      };
      const same = this.allCampaigns().find((c) =>
        Object.entries(params).every(
          ([k, v]) => String(c[k]).toLowerCase() === String(v).toLowerCase(),
        ),
      );
      if (same) return failure("Такий пошук уже збережено.", 409);
      this.queue({ id: crypto.randomUUID(), ...params, paused: false });
      return;
    }
    if (data.action === "settings") {
      const raw = data.sender && typeof data.sender === "object" ? data.sender : {};
      const sender = {
        name: clean(raw.name, 80),
        phone: clean(raw.phone, 40),
        email: /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(clean(raw.email, 120)) ? clean(raw.email, 120) : "",
        telegram: /^@?[A-Za-z0-9_]{4,40}$/.test(clean(raw.telegram, 41)) ? clean(raw.telegram, 41) : "",
        site: /^https?:\/\/[^\s<>"]+$/.test(clean(raw.site, 200)) ? clean(raw.site, 200) : "",
      };
      this.sql.exec("INSERT OR REPLACE INTO settings VALUES('sender',?)", JSON.stringify(sender));
      return;
    }
    if (data.action === "status") {
      if (!statuses.includes(data.status) || typeof data.id !== "string")
        return failure("Некоректний статус.");
      const row = this.sql
        .exec("SELECT body FROM leads WHERE id=?", data.id)
        .toArray()[0];
      if (!row) return failure("Компанію не знайдено.", 404);
      const lead = JSON.parse(row.body);
      // When each status was set: sales analytics and "no reply for 3 days" reminders use it.
      if (lead.status !== data.status) {
        lead.statusAt = iso();
        lead.history = [...(lead.history || []), { status: data.status, at: lead.statusAt }].slice(-20);
      }
      lead.status = data.status;
      if (typeof data.notes === "string") lead.notes = clean(data.notes, 1600);
      this.sql.exec(
        "UPDATE leads SET body=? WHERE id=?",
        JSON.stringify(lead),
        lead.id,
      );
      return;
    }
    const c = this.get(data.id);
    if (!c) return failure("Пошук не знайдено.", 404);
    if (data.action === "delete") {
      // Client links of this search stop working with it.
      const tokens = this.sql.exec("SELECT body FROM leads WHERE campaign=?", c.id).toArray()
        .map((r) => JSON.parse(r.body).report?.token).filter(Boolean);
      if (tokens.length && this.services.reportStore) {
        const owner = this.owner();
        this.pendingReportDeletes = tokens.map((token) => this.services.reportStore("/report-del", { token, owner }).catch(() => {}));
      }
      this.sql.exec("DELETE FROM transient WHERE key=?", "candidates:" + c.id);
      this.sql.exec("DELETE FROM leads WHERE campaign=?", c.id);
      this.sql.exec("DELETE FROM shots WHERE campaign=?", c.id);
      this.sql.exec("DELETE FROM campaigns WHERE id=?", c.id);
    } else if (data.action === "cadence") {
      if (!["manual", "daily", "weekly"].includes(data.cadence))
        return failure("Некоректний розклад.");
      c.cadence = data.cadence;
      const period = { daily: DAY, weekly: 7 * DAY }[c.cadence];
      // A running check keeps its own timer; an idle search gets the next run from now (or none for manual).
      if (!c.paused && activePhases.includes(c.phase))
        this.save(c, c.nextAt ? Date.parse(c.nextAt) : Date.now() + 500);
      else this.save(c, period && !c.paused ? Date.now() + period : null);
    } else if (data.action === "pause") {
      c.paused = true;
      c.version = crypto.randomUUID();
      c.queue = [];
      c.phase = "done";
      c.message = "Пошук призупинено.";
      this.save(c, null);
    } else if (data.action === "run" || data.action === "resume") {
      if (!c.paused && activePhases.includes(c.phase)) return;
      if (Date.now() - c.lastStarted < MINUTE)
        return failure("Наступний запуск доступний за хвилину.", 429);
      c.paused = false;
      this.queue(c);
    } else return failure("Невідома дія.");
  }
  async schedule() {
    const due = this.sql
      .exec("SELECT MIN(due) AS due FROM campaigns")
      .one().due;
    if (due != null) await this.store.setAlarm(Math.max(Date.now() + 150, due));
    else await this.store.deleteAlarm();
  }
  finish(c, phase, message) {
    c.phase = phase;
    c.message = message;
    c.queue = [];
    const period = { daily: DAY, weekly: 7 * DAY }[c.cadence];
    this.save(c, period ? Date.now() + period : null);
  }
  async alarm() {
    const row = this.sql
      .exec(
        "SELECT body FROM campaigns WHERE due<=? ORDER BY due LIMIT 1",
        Date.now() + 150,
      )
      .toArray()[0];
    if (!row) {
      await this.schedule();
      return;
    }
    const c = JSON.parse(row.body);
    if (c.phase === "done" || c.phase === "error") {
      this.queue(c);
    } else if (c.phase === "checking") {
      await this.checkOne(c);
    } else {
      await this.discover(c);
    }
    await this.schedule();
  }
  async discover(c) {
    c.phase = "discovering";
    c.message = "Шукаємо заклади на карті.";
    this.save(c, Date.now() + 3 * MINUTE);
    const current = () => this.get(c.id)?.version === c.version;
    try {
      if (!(await this.services.reserve())) {
        if (current()) {
          c.phase = "retry";
          c.message = "Денний ліміт перевірок. Пошук продовжиться завтра.";
          this.save(
            c,
            (Math.floor(Date.now() / DAY) + 1) * DAY + Math.random() * MINUTE,
          );
        }
        return;
      }
      const geo = c.geo || (await this.services.geocodeCity(c.city, c.country));
      c.geo = geo;
      const cachedKey = "candidates:" + c.id;
      let discovery;
      try {
        discovery = await this.services.discoverBusinessesAt(
          geo.lat,
          geo.lng,
          c.query,
          LIMITS.perRun * 5,
          c.radius,
          c.service === "booking",
        );
        if (!current()) return;
        this.setTransient(
          cachedKey,
          JSON.stringify({ ...discovery, savedAt: iso() }),
          Date.now() + 7 * DAY,
        );
      } catch (err) {
        const cached = this.transient(cachedKey);
        if (!cached) throw err;
        discovery = JSON.parse(cached);
        discovery.note =
          "Джерело тимчасово недоступне. Використано список від " +
          discovery.savedAt.slice(0, 10) +
          ".";
      }
      const businesses = discovery.businesses;
      c.source = discovery.source;
      c.sourceNote = discovery.note || "";
      c.sourceDate = discovery.asOf || null;
      if (!current()) return;
      const seen = new Map(
        this.sql
          .exec("SELECT body FROM leads WHERE campaign=?", c.id)
          .toArray()
          .map((row) => {
            const lead = JSON.parse(row.body);
            return [lead.osmId, lead.checkedAt];
          }),
      );
      const groups = groupBranches(shareBrandSites(businesses));
      // Cards of branches now folded into a chain card go away unless the user already worked on them.
      for (const g of groups)
        for (const osmId of g.branchIds) {
          const id = c.id + "/" + osmId;
          const row = this.sql.exec("SELECT body FROM leads WHERE id=?", id).toArray()[0];
          if (!row) continue;
          const old = JSON.parse(row.body);
          if (old.status === "new" && !old.notes) {
            this.sql.exec("DELETE FROM leads WHERE id=?", id);
            this.sql.exec("DELETE FROM shots WHERE id=?", id);
          }
        }
      c.queue = pickQueue(groups, seen, c.service);
      c.checked = 0;
      c.total = c.queue.length;
      c.attempt = 0;
      if (!c.total) {
        this.finish(
          c,
          "done",
          "У вибраному радіусі джерело не повернуло збігів.",
        );
        return;
      }
      c.phase = "checking";
      c.message = "Перевіряємо компанії й контактні дані.";
      this.save(c, Date.now() + 300);
    } catch {
      if (!current()) return;
      c.attempt++;
      if (c.attempt >= 3)
        this.finish(
          c,
          "error",
          "Дані мапи або координати міста зараз недоступні. Перевірте назву міста й запустіть ще раз. Попередні картки збережено.",
        );
      else {
        c.phase = "retry";
        c.message = "Джерело тимчасово недоступне. Сервер повторить пошук.";
        this.save(c, Date.now() + MINUTE * 5 * c.attempt);
      }
    }
  }
  async checkOne(c) {
    const b = c.queue[0];
    if (!b) {
      this.finish(c, "done", "Перевірку завершено.");
      return;
    }
    const id = c.id + "/" + b.osmId;
    let assessment;
    try {
      assessment = await this.services.assessLead(b, c.service);
    } catch {
      assessment = {
        checkedAt: iso(),
        priority: "review",
        confidence: "unknown",
        summary: "Автоматичну перевірку не завершено.",
        suggestion: "Відкрийте сайт і перевірте вручну.",
        evidence: [],
        contact: null,
      };
    }
    if (this.get(c.id)?.version !== c.version) return;
    const old = this.sql
      .exec("SELECT body FROM leads WHERE id=?", id)
      .toArray()[0];
    const previous = old ? JSON.parse(old.body) : {};
    const { screenshot, ...result } = assessment;
    if (screenshot) this.sql.exec("INSERT OR REPLACE INTO shots VALUES(?,?,?)", id, c.id, screenshot);
    else this.sql.exec("DELETE FROM shots WHERE id=?", id);
    const lead = {
      id,
      campaignId: c.id,
      service: c.service,
      osmId: b.osmId,
      name: b.name,
      website: b.website,
      phone: b.phone,
      email: b.email,
      address: b.address,
      branches: b.branches || 1,
      branchAddresses: b.branchAddresses || [],
      ...result,
      shot: Boolean(screenshot),
      status: previous.status || "new",
      notes: previous.notes || "",
      ...(previous.draft && { draft: previous.draft }),
      ...(previous.report && { report: previous.report }),
      ...(previous.statusAt && { statusAt: previous.statusAt, history: previous.history || [] }),
    };
    this.sql.exec(
      "INSERT OR REPLACE INTO leads VALUES(?,?,?)",
      id,
      c.id,
      JSON.stringify(lead),
    );
    c.queue.shift();
    c.checked++;
    if (c.queue.length) this.save(c, Date.now() + 1000);
    else this.finish(c, "done", "Перевірено компаній: " + c.checked + ".");
  }
}
