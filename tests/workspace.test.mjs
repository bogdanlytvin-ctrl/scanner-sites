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
