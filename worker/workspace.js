// All user records live in a separate SQLite-backed Durable Object per private session.
const LIMITS = { campaigns: 5, perRun: 12 };
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
const hasContact = (b) =>
  Boolean((b.phone && b.phone !== "N/A") || (b.email && b.email !== "N/A"));
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
      ["create", "run", "resume", "transfer", "restore"].includes(data.action)
    ) {
      const ip = await sha(request.headers.get("CF-Connecting-IP") || "local");
      const allowed = await directory().fetch("https://internal/admit", {
        method: "POST",
        body: ip,
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
  const response = await stub.fetch(
    "https://internal/workspace",
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
    const result = this.change(data);
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
        b.checkedAt.localeCompare(a.checkedAt),
    );
    return json({ campaigns, leads, limits: LIMITS });
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
    if (data.action === "status") {
      if (!statuses.includes(data.status) || typeof data.id !== "string")
        return failure("Некоректний статус.");
      const row = this.sql
        .exec("SELECT body FROM leads WHERE id=?", data.id)
        .toArray()[0];
      if (!row) return failure("Компанію не знайдено.", 404);
      const lead = JSON.parse(row.body);
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
      this.sql.exec("DELETE FROM transient WHERE key=?", "candidates:" + c.id);
      this.sql.exec("DELETE FROM leads WHERE campaign=?", c.id);
      this.sql.exec("DELETE FROM campaigns WHERE id=?", c.id);
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
      c.queue = pickQueue(businesses, seen, c.service);
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
      ...assessment,
      status: previous.status || "new",
      notes: previous.notes || "",
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
