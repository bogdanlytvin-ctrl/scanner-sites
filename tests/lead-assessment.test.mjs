import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, next) {
  return next(specifier === "./ssrf" ? "./ssrf.ts" : specifier, context);
} });
const { assessLead } = await import("../src/lib/lead-assessment.ts");
const clinic = { osmId: "node/123", name: "Клініка Волошка", phone: "+380501234567", email: "", website: "https://clinic.example/" };
const html = (content, title = "Волошка", meta = "") => '<html><head><title>' + title + '</title>' + meta + '</head><body><h1>' + title + '</h1><p>Тут працює команда спеціалістів. Більше інформації про послуги нашої команди є на сайті.</p>' + content + '</body></html>';
const cta = '<a href="/appointments">Записатися</a>';
function respond(t, home, statuses = []) {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = new URL(input);
    if (url.hostname === "cloudflare-dns.com") return Response.json({ Answer: [{ type: 1, data: "93.184.216.34" }] });
    calls.push(url.href);
    if (url.href === clinic.website) return new Response(home, { headers: { "content-type": "text/html; charset=utf-8" } });
    assert.ok(statuses.length, "unexpected URL " + url);
    return new Response("other page", { status: statuses.shift(), headers: { "content-type": "text/html" } });
  });
  return calls;
}

test("verified booking issue needs a matched company, a contact and two matching failures", async t => {
  const calls = respond(t, html(cta), [404, 404]);
  const result = await assessLead(clinic, "booking");
  assert.deepEqual(calls, [clinic.website, clinic.website + "appointments", clinic.website + "appointments"]);
  assert.equal(result.priority, "high");
  assert.equal(result.confidence, "verified");
  assert.match(result.summary, /двічі.*404/);
  assert.equal(result.contact.source, "https://www.openstreetmap.org/node/123");
  assert.equal(result.evidence.at(-1).url, clinic.website + "appointments");
  assert.ok(Number.isFinite(Date.parse(result.checkedAt)));
});

test("a one-off failure or response denied by the origin needs review", async t => {
  respond(t, html(cta), [404, 200, 403]);
  for (let i = 0; i < 2; i++) assert.equal((await assessLead(clinic, "booking")).priority, "review");
});

test("working booking link on an external service does not flag a missing booking system", async t => {
  respond(t, html('<a href="https://booking-provider.example/salon">Book now</a>'), [200]);
  const assessment = await assessLead(clinic, "booking");
  assert.equal(assessment.priority, "low");
  assert.equal(assessment.evidence.at(-1).url, "https://booking-provider.example/salon");
});

test("old copyright and a JS-only booking button do not justify high priority", async t => {
  respond(t, html('<button>Записатися</button><footer>© 2005</footer>'));
  assert.equal((await assessLead(clinic, "booking")).priority, "review");
  assert.equal((await assessLead(clinic, "website")).priority, "low");
});

test("company mismatch, absent website and third-party profile stay unverified", async t => {
  const calls = respond(t, html(cta, "Інша стоматологія"));
  for (const website of [clinic.website, "N/A", "instagram.com/voloshka", "mailto:a@example.com"]) {
    const assessment = await assessLead({ ...clinic, website }, "booking");
    assert.equal(assessment.confidence, "unknown");
    assert.equal(assessment.priority, "review");
  }
  assert.deepEqual(calls, [clinic.website]);
});

test("a public site contact can match identity and is shown with its source", async t => {
  respond(t, html('<a href="tel:0501234567">Телефон</a>', "Дентальний центр", '<meta name="viewport" content="width=1024">'));
  const result = await assessLead(clinic, "website");
  assert.equal(result.priority, "high");
  assert.equal(result.contact.source, clinic.website);
  assert.match(result.summary, /1024/);
});

test("without a contact a confirmed issue stays in the review queue", async t => {
  respond(t, html(cta), [410, 410]);
  const result = await assessLead({ ...clinic, phone: "" }, "booking");
  assert.equal(result.confidence, "verified");
  assert.equal(result.priority, "review");
});

test("a linked official contact page can supply a public contact", async t => {
  t.mock.method(globalThis, "fetch", async input => {
    const url = new URL(input);
    if (url.hostname === "cloudflare-dns.com") return Response.json({ Answer: [{ type: 1, data: "93.184.216.34" }] });
    const body = url.pathname === "/contacts" ? html('<a href="mailto:office@clinic.example">Пошта</a>')
      : html('<a href="/contacts">Контакти</a>', "Волошка", '<meta name="viewport" content="width=1024">');
    return new Response(body, { headers: { "content-type": "text/html" } });
  });
  const result = await assessLead({ ...clinic, phone: "" }, "website");
  assert.deepEqual(result.contact, { kind: "email", value: "office@clinic.example", source: clinic.website + "contacts" });
  assert.equal(result.priority, "high");
});
