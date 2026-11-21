import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Workspace, workspaceRequest } from "../worker/workspace.js";

function storage() {
  const db = new DatabaseSync(":memory:");
  return {
    sql: {
      exec(query, ...args) {
        const stmt = db.prepare(query);
        const rows = stmt.all(...args);
        return { toArray: () => rows, one: () => rows[0] };
      },
    },
    setAlarm(time) {
      this.due = time;
    },
    deleteAlarm() {
      this.due = null;
    },
  };
}
const site = {
  name: "Clinic",
  osmId: "node/42",
  website: "https://example.org",
  phone: "+380000000000",
  address: "Street",
  email: "",
};
const params = {
  action: "create",
  city: "Львів",
  country: "ua",
  query: "стоматологія",
  radius: 5,
  cadence: "daily",
  service: "booking",
};
const assessment = {
  priority: "review",
  confidence: "partial",
  checkedAt: new Date().toISOString(),
  evidence: [],
  contact: null,
  summary: "test",
  suggestion: "",
};
function environment(extra) {
  const objects = new Map();
  const ns = {
    getByName(name) {
      if (!objects.has(name))
        objects.set(
          name,
          new Workspace(storage(), {
            geocodeCity: async () => ({ lat: 1, lng: 1 }),
            discoverBusinessesAt: async () => ({
              businesses: [site],
              source: "Map",
            }),
            assessLead: async () => assessment,
            reserve: async () => true,
            ...extra,
          }),
        );
      return {
        fetch: (url, init) => objects.get(name).fetch(new Request(url, init)),
      };
    },
  };
  return { objects, ns };
}
const makeReq = (body, cookie, origin = "https://scanner.example") =>
  new Request("https://scanner.example/api/workspace", {
    method: body ? "POST" : "GET",
    headers: {
      origin,
      "content-type": "application/json",
      cookie: cookie || "",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
const post = (w, data) =>
  w.fetch(
    new Request("https://internal/workspace", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  );
async function tick(w, id) {
  const c = w.get(id);
  w.save(c, Date.now() - 50);
  await w.alarm();
}
test("private workspace background discovery, recurring checks and status persistence", async () => {
  const { objects, ns } = environment();
  const r = await workspaceRequest(makeReq(params), ns);
  const cookie = r.headers.get("set-cookie").split(";")[0];
  assert.match(r.headers.get("set-cookie"), /HttpOnly; Secure/);
  const {
    campaigns: [c],
  } = await r.json();
  const w = [...objects.entries()].find(([name]) =>
    name.startsWith("user:"),
  )[1];
  assert.equal(c.phase, "queued");
  await tick(w, c.id);
  assert.equal(w.get(c.id).phase, "checking");
  await tick(w, c.id);
  assert.equal(w.get(c.id).phase, "done");
  assert.ok(w.store.due > Date.now() + 80000000);
  let snap = await (await workspaceRequest(makeReq(null, cookie), ns)).json();
  assert.equal(snap.leads.length, 1);
  const id = snap.leads[0].id;
  await post(w, {
    action: "status",
    id,
    status: "contacted",
    notes: "зателефонувати в четвер",
  });
  for (let i = 0; i < 3; i++) await tick(w, c.id);
  snap = await (await workspaceRequest(makeReq(null, cookie), ns)).json();
  assert.equal(snap.leads.length, 1);
  assert.equal(snap.leads[0].notes, "зателефонувати в четвер");
  assert.equal(snap.leads[0].status, "contacted");
  assert.equal(
    (await (await workspaceRequest(makeReq(null), ns)).json()).campaigns.length,
    0,
  );
  const { code } = await (
    await workspaceRequest(makeReq({ action: "transfer" }, cookie), ns)
  ).json();
  assert.equal(
    (
      await (
        await workspaceRequest(makeReq({ action: "restore", code }), ns)
      ).json()
    ).leads.length,
    1,
  );
  assert.equal(
    (await workspaceRequest(makeReq({ action: "restore", code }), ns)).status,
    400,
  );
  assert.equal(
    (
      await workspaceRequest(
        makeReq(
          { action: "delete", id: c.id },
          cookie,
          "https://other.example",
        ),
        ns,
      )
    ).status,
    403,
  );
  await post(w, { action: "pause", id: c.id });
  assert.equal(w.store.due, null);
  await post(w, { action: "delete", id: c.id });
  assert.equal((await w.snapshot().json()).leads.length, 0);
});
test("bounded retries preserve errors and manual jobs end unscheduled", async () => {
  const { ns, objects } = environment({
    discoverBusinessesAt: async () => {
      throw Error("timeout");
    },
  });
  const {
    campaigns: [c],
  } = await (
    await workspaceRequest(makeReq({ ...params, cadence: "manual" }), ns)
  ).json();
  const w = [...objects.values()].at(-1);
  await tick(w, c.id);
  assert.equal(w.get(c.id).phase, "retry");
  await tick(w, c.id);
  await tick(w, c.id);
  assert.equal(w.get(c.id).phase, "error");
  assert.equal(w.store.due, null);
});
test("a paused in-flight discovery cannot resurrect its queue", async () => {
  let release, started;
  const entered = new Promise((r) => (started = r));
  const { ns, objects } = environment({
    discoverBusinessesAt: () => {
      started();
      return new Promise((r) => (release = r));
    },
  });
  const {
    campaigns: [c],
  } = await (await workspaceRequest(makeReq(params), ns)).json();
  const w = [...objects.values()].at(-1);
  const running = tick(w, c.id);
  await entered;
  await post(w, { action: "pause", id: c.id });
  release({ businesses: [site], source: "Map" });
  await running;
  assert.equal(w.get(c.id).paused, true);
  assert.equal(w.store.due, null);
});

test("phone screenshots are stored apart from leads, served only to the owner and removed with the search", async () => {
  const jpeg = "data:image/jpeg;base64," + Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString("base64");
  const { objects, ns } = environment({ assessLead: async () => ({ ...assessment, screenshot: jpeg }) });
  const r = await workspaceRequest(makeReq(params), ns);
  const cookie = r.headers.get("set-cookie").split(";")[0];
  const { campaigns: [c] } = await r.json();
  const w = [...objects.entries()].find(([name]) => name.startsWith("user:"))[1];
  await tick(w, c.id);
  await tick(w, c.id);
  const snap = await (await workspaceRequest(makeReq(null, cookie), ns)).json();
  const lead = snap.leads[0];
  assert.equal(lead.shot, true);
  assert.equal(lead.screenshot, undefined, "the image is not inside the lead list");
  const shotReq = cookie => new Request("https://scanner.example/api/workspace?shot=" + encodeURIComponent(lead.id), { headers: { cookie } });
  const img = await workspaceRequest(shotReq(cookie), ns);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get("content-type"), "image/jpeg");
  assert.deepEqual([...new Uint8Array(await img.arrayBuffer())], [0xff, 0xd8, 0xff, 0xd9]);
  assert.equal((await workspaceRequest(shotReq(""), ns)).status, 404, "another visitor gets nothing");
  await post(w, { action: "delete", id: c.id });
  assert.equal((await workspaceRequest(shotReq(cookie), ns)).status, 404);
});

test("offer drafts: Claude text when available, a template otherwise, kept across re-checks and capped per day", async () => {
  let facts = null;
  let writerUp = true;
  const { objects, ns } = environment({
    assessLead: async () => ({ ...assessment, priority: "low", gaps: [{ label: "Немає онлайн-запису", strong: true }] }),
    writeOffer: async (f) => { facts = f; if (!writerUp) throw new Error("down"); return { subject: "Тема", text: "  Лист від Claude  " }; },
  });
  const r = await workspaceRequest(makeReq(params), ns);
  const cookie = r.headers.get("set-cookie").split(";")[0];
  const { campaigns: [c] } = await r.json();
  const w = [...objects.entries()].find(([name]) => name.startsWith("user:"))[1];
  await tick(w, c.id);
  await tick(w, c.id);
  const id = w.snapshot && (await (await workspaceRequest(makeReq(null, cookie), ns)).json()).leads[0].id;

  let snap = await (await workspaceRequest(makeReq({ action: "draft", id }, cookie), ns)).json();
  assert.deepEqual(snap.leads[0].draft.text, "Лист від Claude");
  assert.equal(snap.leads[0].draft.source, "claude");
  assert.equal(facts.city, "Львів");
  assert.equal(facts.niche, "стоматологія");
  assert.equal(facts.situation, "сайт працює, але є що покращити");
  assert.deepEqual(facts.gaps, [{ label: "Немає онлайн-запису", strong: true }]);

  writerUp = false;
  snap = await (await workspaceRequest(makeReq({ action: "draft", id }, cookie), ns)).json();
  assert.equal(snap.leads[0].draft.source, "template");
  assert.match(snap.leads[0].draft.text, /Немає онлайн-запису/);
  assert.match(snap.leads[0].draft.text, /\[Ваше ім'я\], \[телефон\]/);

  await post(w, { action: "run", id: c.id });
  await tick(w, c.id);
  await tick(w, c.id);
  snap = await (await workspaceRequest(makeReq(null, cookie), ns)).json();
  assert.equal(snap.leads[0].draft.source, "template", "a re-check keeps the draft");

  const missing = await workspaceRequest(makeReq({ action: "draft", id: "nope" }, cookie), ns);
  assert.equal(missing.status, 404);
  for (let i = 0; i < 40; i++) await post(w, { action: "draft", id });
  const capped = await post(w, { action: "draft", id });
  assert.equal(capped.status, 429);
});

test("offer templates cover a missing site and a dead site", async () => {
  const { templateOffer, offerFacts } = await import("../worker/workspace.js");
  const none = templateOffer(offerFacts({ name: "Ромашка", website: "N/A", summary: "", priority: "high" }, { city: "Львів", query: "кафе" }));
  assert.match(none.subject, /Сайт для «Ромашка»/);
  assert.match(none.text, /немає власного сайту/);
  const dead = templateOffer(offerFacts({ name: "Europa", website: "http://x.ua", summary: "Домен сайту x.ua більше не існує.", priority: "high" }, { city: "Ужгород" }));
  assert.match(dead.text, /проблема: домен сайту x\.ua більше не існує\./);
});


test("a saved search can switch between manual and daily runs", async () => {
  const { objects, ns } = environment();
  const r = await workspaceRequest(makeReq({ ...params, cadence: "manual" }), ns);
  const { campaigns: [c] } = await r.json();
  const w = [...objects.entries()].find(([name]) => name.startsWith("user:"))[1];
  await tick(w, c.id);
  await tick(w, c.id);
  assert.equal(w.get(c.id).phase, "done");
  assert.equal(w.get(c.id).nextAt, null);
  await post(w, { action: "cadence", id: c.id, cadence: "daily" });
  const daily = w.get(c.id);
  assert.equal(daily.cadence, "daily");
  const wait = Date.parse(daily.nextAt) - Date.now();
  assert.ok(wait > 23 * 3600_000 && wait <= 24 * 3600_000, "next run in a day");
  await post(w, { action: "cadence", id: c.id, cadence: "manual" });
  assert.equal(w.get(c.id).nextAt, null);
  assert.equal((await post(w, { action: "cadence", id: c.id, cadence: "hourly" })).status, 400);
});

test("leads keep their score and expiry and are listed by score within a priority", async () => {
  const scores = { "node/1": 55, "node/2": 91, "node/3": 70 };
  const { objects, ns } = environment({
    discoverBusinessesAt: async () => ({ businesses: Object.keys(scores).map(osmId => ({ ...site, osmId, name: "Clinic " + osmId, website: "https://" + osmId.replace("/", "") + ".example" })), source: "Map" }),
    assessLead: async b => ({ ...assessment, priority: "high", score: scores[b.osmId], expiry: b.osmId === "node/2" ? { what: "domain", date: "2026-12-01T00:00:00.000Z" } : undefined }),
  });
  const r = await workspaceRequest(makeReq(params), ns);
  const { campaigns: [c] } = await r.json();
  const w = [...objects.entries()].find(([name]) => name.startsWith("user:"))[1];
  for (let i = 0; i < 5; i++) await tick(w, c.id);
  const snap = await (await w.snapshot()).json();
  assert.deepEqual(snap.leads.map(l => l.score), [91, 70, 55]);
  assert.deepEqual(snap.leads[0].expiry, { what: "domain", date: "2026-12-01T00:00:00.000Z" });
});

test("leads checked before scores existed keep a sensible place in the list", async () => {
  const { objects, ns } = environment();
  await workspaceRequest(makeReq(params), ns);
  const w = [...objects.entries()].find(([name]) => name.startsWith("user:"))[1];
  const put = (id, body) => w.sql.exec("INSERT INTO leads VALUES(?,?,?)", id, "c", JSON.stringify({ id, checkedAt: "2026-11-01T00:00:00Z", ...body }));
  put("old-high", { priority: "high" });
  put("new-high", { priority: "high", score: 60 });
  put("new-hot", { priority: "high", score: 90 });
  const snap = await (await w.snapshot()).json();
  assert.deepEqual(snap.leads.map(l => l.id), ["new-hot", "old-high", "new-high"]);
});

test("client report: a public snapshot without notes, signed with the sender's contacts, removable and gone with its search", async () => {
  const jpeg = "data:image/jpeg;base64," + Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString("base64");
  const services = {
    assessLead: async () => ({ ...assessment, priority: "high", kind: "site", summary: "На сайті немає: HTTPS.", gaps: [{ label: "Немає HTTPS — браузер позначає сайт як «Не захищено»", strong: true }],
      evidence: [{ label: "Перевірка в браузері (телефон, Lighthouse) · 41/100 · основний вміст за 6,2 с · повний звіт Google", url: "https://pagespeed.web.dev/x" }], screenshot: jpeg }),
    writeOffer: async () => ({ subject: "Тема", text: "Добрий день!\n\n[Ваше ім'я], [телефон]" }),
  };
  const { objects, ns } = environment(services);
  services.reportStore = async (path, payload) => (await ns.getByName("admission").fetch("https://internal" + path, { method: "POST", body: JSON.stringify(payload) })).ok;
  const r = await workspaceRequest(makeReq(params), ns);
  const cookie = r.headers.get("set-cookie").split(";")[0];
  const { campaigns: [c] } = await r.json();
  const w = [...objects.entries()].find(([name]) => name.startsWith("user:"))[1];
  await tick(w, c.id);
  await tick(w, c.id);
  const id = (await (await w.snapshot()).json()).leads[0].id;
  await post(w, { action: "status", id, status: "in_progress", notes: "SECRET NOTE про ціну" });
  await post(w, { action: "settings", sender: { name: "Богдан <b>", phone: "+380 50 123 45 67", telegram: "@bogdan_web", email: "bad email", site: "javascript:alert(1)" } });
  let snap = await (await workspaceRequest(makeReq({ action: "report", id }, cookie), ns)).json();
  const token = snap.leads[0].report.token;
  assert.match(token, /^[a-f0-9]{32}$/);
  assert.deepEqual(snap.sender, { name: "Богдан <b>", phone: "+380 50 123 45 67", email: "", telegram: "@bogdan_web", site: "" }, "bad e-mail and non-http site are dropped");
  const stored = await ns.getByName("admission").fetch("https://internal/report-get", { method: "POST", body: token });
  const body = await stored.json();
  assert.equal(body.speed, 41);
  assert.equal(body.lcp, "6,2 с");
  assert.equal(body.shot, jpeg);
  assert.equal(body.sender.telegram, "@bogdan_web");
  assert.ok(!JSON.stringify(body).includes("SECRET"), "notes never reach the public report");
  assert.ok(!("score" in body) && !("status" in body));
  // The letter is signed with the saved contacts.
  snap = await (await workspaceRequest(makeReq({ action: "draft", id }, cookie), ns)).json();
  assert.match(snap.leads[0].draft.text, /Богдан <b>, \+380 50 123 45 67$/);
  // A new report replaces the old link; deleting removes it.
  snap = await (await workspaceRequest(makeReq({ action: "report", id }, cookie), ns)).json();
  const second = snap.leads[0].report.token;
  assert.notEqual(second, token);
  assert.equal((await ns.getByName("admission").fetch("https://internal/report-get", { method: "POST", body: token })).status, 404, "old link stops working");
  await post(w, { action: "report-delete", id });
  assert.equal((await ns.getByName("admission").fetch("https://internal/report-get", { method: "POST", body: second })).status, 404);
  assert.equal((await (await w.snapshot()).json()).leads[0].report, undefined);
  // Deleting the search removes its reports too.
  snap = await (await workspaceRequest(makeReq({ action: "report", id }, cookie), ns)).json();
  const third = snap.leads[0].report.token;
  await post(w, { action: "delete", id: c.id });
  assert.equal((await ns.getByName("admission").fetch("https://internal/report-get", { method: "POST", body: third })).status, 404);
});

test("report page escapes everything, accepts only image data, and explains findings in plain words", async () => {
  const { renderReport, REPORT_HEADERS } = await import("../worker/report.js");
  const html = renderReport({
    name: '<img src=x onerror=alert(1)>"', kind: "site", website: "https://clinic.example/", city: "Львів",
    gaps: [{ label: "Повільний на телефоні: швидкість 41/100", strong: true }, { label: "Немає опису для Google (meta description)", strong: false }],
    speed: 41, lcp: "6,2 с", checkedAt: "2026-11-22T10:00:00Z", shot: "javascript:alert(1)",
    sender: { name: "<script>alert(1)</script>", phone: "+380501234567", telegram: "@bogdan_web", email: "", site: "" },
  });
  assert.ok(!/<script|<img src=x/.test(html), "no live markup from data");
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.ok(!html.includes("javascript:"), "a non-image screenshot is dropped");
  assert.match(html, /понад половина відвідувачів з телефона/);
  assert.match(html, /href="tel:\+380501234567"/);
  assert.match(html, /href="https:\/\/t\.me\/bogdan_web"/);
  assert.match(REPORT_HEADERS["Content-Security-Policy"], /default-src 'none'/);
  assert.equal(REPORT_HEADERS["X-Robots-Tag"], "noindex, nofollow");
  const noSite = renderReport({ name: "Ромашка", kind: "no-site", summary: "На карті не вказано власного сайту компанії.", checkedAt: "2026-11-22T10:00:00Z" });
  assert.match(noSite, /У компанії немає власного сайту/);
});

test("status changes are dated and kept in a short history that survives re-checks", async () => {
  const { objects, ns } = environment();
  const r = await workspaceRequest(makeReq(params), ns);
  const { campaigns: [c] } = await r.json();
  const w = [...objects.entries()].find(([name]) => name.startsWith("user:"))[1];
  await tick(w, c.id);
  await tick(w, c.id);
  const id = (await (await w.snapshot()).json()).leads[0].id;
  await post(w, { action: "status", id, status: "contacted" });
  await post(w, { action: "status", id, status: "contacted", notes: "та сама" });
  await post(w, { action: "status", id, status: "replied" });
  let lead = (await (await w.snapshot()).json()).leads[0];
  assert.deepEqual(lead.history.map(h => h.status), ["contacted", "replied"], "repeating a status adds nothing");
  assert.ok(Date.now() - Date.parse(lead.statusAt) < 5000);
  for (let i = 0; i < 30; i++) await post(w, { action: "status", id, status: i % 2 ? "in_progress" : "contacted" });
  lead = (await (await w.snapshot()).json()).leads[0];
  assert.equal(lead.history.length, 20, "history is capped");
  await post(w, { action: "run", id: c.id }).catch(() => {});
  w.save({ ...w.get(c.id), lastStarted: 0 }, null);
  await post(w, { action: "run", id: c.id });
  await tick(w, c.id);
  await tick(w, c.id);
  lead = (await (await w.snapshot()).json()).leads[0];
  assert.equal(lead.history.length, 20);
  assert.ok(lead.statusAt);
});

test("CSV export: the user's own leads, per search or all, Excel-safe and formula-safe", async () => {
  const { objects, ns } = environment({ assessLead: async () => ({ ...assessment, priority: "high", score: 88, summary: '=HYPERLINK("http://evil")', gaps: [{ label: "Немає HTTPS", strong: true }] }) });
  const r = await workspaceRequest(makeReq(params), ns);
  const cookie = r.headers.get("set-cookie").split(";")[0];
  const { campaigns: [c] } = await r.json();
  const w = [...objects.entries()].find(([name]) => name.startsWith("user:"))[1];
  await tick(w, c.id);
  await tick(w, c.id);
  const id = (await (await w.snapshot()).json()).leads[0].id;
  await post(w, { action: "status", id, status: "contacted", notes: "Дзвонив, кажуть \"передзвоніть\"; +380" });
  const get = (query, ck = cookie) => workspaceRequest(new Request("https://scanner.example/api/workspace?" + query, { headers: { cookie: ck } }), ns);
  const res = await get("export=csv");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/csv/);
  assert.match(res.headers.get("content-disposition"), /attachment; filename="leads-\d{4}-\d{2}-\d{2}\.csv"/);
  const bytes = new Uint8Array(await res.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], "UTF-8 BOM for Excel");
  const text = new TextDecoder().decode(bytes);
  const [head, row] = text.trim().split("\r\n");
  assert.match(head, /^Назва,Ніша,Місто,Пріоритет,Оцінка,Статус/);
  assert.match(row, /^Clinic,стоматологія,Львів,Високий,88,Звернувся,/);
  assert.match(row, /,"'=HYPERLINK\(""http:\/\/evil""\)",/, "a formula is neutralised");
  assert.match(row, /,\+380000000000,/, "a phone stays a plain phone");
  assert.match(row, /"Дзвонив, кажуть ""передзвоніть""; \+380"/);
  assert.equal((await (await get("export=csv&campaign=nope")).text()).trim().split("\r\n").length, 1, "only the header for another search");
  const stranger = await (await get("export=csv", "")).text();
  assert.equal(stranger.trim().split("\r\n").length, 1, "a new visitor gets an empty table, never someone else's leads");
});

test("CSV cells: formula tricks are neutralised, plain phones are not", async () => {
  const { leadsCsv } = await import("../worker/workspace.js");
  const csv = leadsCsv([{ campaignId: "x", name: "+cmd|' /C calc'!A0", phone: "-2+3", notes: "@SUM(1)", summary: "\tx", status: "new", priority: "low" }], []);
  const row = csv.trim().split("\r\n")[1];
  assert.match(row, /^'\+cmd\|' \/C calc'!A0,/);
  assert.match(row, /,'-2\+3,/);
  assert.match(row, /,'@SUM\(1\),/);
});
