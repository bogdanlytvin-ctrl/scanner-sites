import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, next) {
  return next(specifier === "./ssrf" ? "./ssrf.ts" : specifier, context);
} });
const { assessLead } = await import("../src/lib/lead-assessment.ts");
const clinic = { osmId: "node/123", name: "Клініка Волошка", phone: "+380501234567", email: "", website: "https://clinic.example/" };
// A modern baseline page: mobile viewport and a description, so only what a test adds is a gap.
const MODERN = '<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="Стоматологічна клініка Волошка: лікування, гігієна, імплантація.">';
const html = (content, title = "Волошка", meta = MODERN) => '<html><head><title>' + title + '</title>' + meta + '</head><body><h1>' + title + '</h1><p>Тут працює команда спеціалістів. Більше інформації про послуги нашої команди є на сайті.</p>' + content + '</body></html>';
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
  respond(t, html('<button>Записатися</button><a href="tel:+380501234567">+380 50 123 45 67</a><a href="https://t.me/voloshka">Telegram</a><form><input type="text"><input type="tel"></form><footer>© 2005</footer>'));
  assert.equal((await assessLead(clinic, "booking")).priority, "review");
  const site = await assessLead(clinic, "website");
  assert.equal(site.priority, "low");
  assert.ok(site.gaps.some(g => /© 2005/.test(g.label) && !g.strong));
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

test("selling a website: no own site with a phone is a high-priority lead", async t => {
  const calls = respond(t, "");
  const result = await assessLead({ ...clinic, website: "N/A" }, "website");
  assert.equal(result.priority, "high");
  assert.equal(result.confidence, "partial");
  assert.match(result.summary, /не вказано власного сайту/);
  assert.match(result.suggestion, /Google/);
  assert.deepEqual(calls, []);
});

test("selling a website: only a social profile is a high lead, without contact only review", async t => {
  respond(t, "");
  const social = await assessLead({ ...clinic, website: "instagram.com/voloshka" }, "website");
  assert.equal(social.priority, "high");
  assert.match(social.summary, /соцмережі/);
  assert.equal(social.evidence.at(-1).url, "https://instagram.com/voloshka");
  const viaField = await assessLead({ ...clinic, website: "", instagram: "https://www.instagram.com/voloshka" }, "website");
  assert.match(viaField.summary, /соцмережі/);
  const noContact = await assessLead({ ...clinic, website: "N/A", phone: "" }, "website");
  assert.equal(noContact.priority, "review");
});

function serve(t, handler) {
  const calls = [];
  t.mock.method(globalThis, "fetch", async input => {
    const url = new URL(input);
    if (url.hostname === "cloudflare-dns.com") return Response.json({ Answer: [{ type: 1, data: "93.184.216.34" }] });
    calls.push(url.href);
    return handler(url, calls.length);
  });
  return calls;
}

test("a site that fails twice (no answer / 5xx) is a verified high lead", async t => {
  const calls = serve(t, () => { throw new TypeError("fetch failed"); });
  const dead = await assessLead(clinic, "website");
  assert.equal(dead.priority, "high");
  assert.equal(dead.confidence, "verified");
  assert.match(dead.summary, /двічі не відкрився/);
  assert.equal(calls.length, 3); // two reads + one http:// check for a broken certificate
  t.mock.restoreAll();
  serve(t, () => new Response("bad gateway", { status: 522, headers: { "content-type": "text/html" } }));
  assert.equal((await assessLead(clinic, "booking")).priority, "high");
});

test("one failure followed by a working page, 503 walls and our own guard are not 'dead'", async t => {
  serve(t, (url, n) => n === 1 ? new Response("x", { status: 502 }) : new Response("ok", { headers: { "content-type": "text/html" } }));
  assert.notEqual((await assessLead(clinic, "website")).priority, "high");
  t.mock.restoreAll();
  serve(t, () => new Response("Just a moment", { status: 503, headers: { "content-type": "text/html" } }));
  const wall = await assessLead(clinic, "website");
  assert.equal(wall.priority, "review");
  assert.match(wall.summary, /захист від ботів/);
  t.mock.restoreAll();
  serve(t, () => assert.fail("guard must stop the request"));
  assert.equal((await assessLead({ ...clinic, website: "http://clinic.example:8080/" }, "website")).priority, "review");
});

test("a parked 'domain for sale' page is a high lead", async t => {
  serve(t, () => new Response("<html><head><title>clinic.example is for sale</title></head><body>Buy this domain today. Contact the registrar for the price of this premium domain name.</body></html>", { headers: { "content-type": "text/html" } }));
  const result = await assessLead(clinic, "website");
  assert.equal(result.priority, "high");
  assert.match(result.summary, /заглушка/);
});

const page = (body, status = 200) => new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });

test("requests look like a browser so bot walls on datacenter IPs let them through", async t => {
  let agent = "";
  t.mock.method(globalThis, "fetch", async (input, init) => {
    if (new URL(input).hostname === "cloudflare-dns.com") return Response.json({ Answer: [{ type: 1, data: "93.184.216.34" }] });
    agent = new Headers(init.headers).get("User-Agent");
    return page(html(""));
  });
  await assessLead(clinic, "website");
  assert.match(agent, /Mozilla\/5\.0/);
});

test("a script-rendered page with a title and a JSON-LD phone is readable and matched", async t => {
  serve(t, () => page('<html><head><title>Волошка — стоматологія</title><meta name="viewport" content="width=device-width"><script type="application/ld+json">{"@type":"Dentist","telephone":"+380 50 123 45 67"}</script></head><body><div id="root"></div></body></html>'));
  const result = await assessLead(clinic, "website");
  assert.equal(result.confidence, "partial");
  assert.equal(result.priority, "low");
  assert.match(result.summary, /скрипти/);
  assert.equal(result.contact.value, "+380 50 123 45 67");
});

test("a page above the size limit is parsed up to the limit instead of being dropped", async t => {
  serve(t, () => page(html("") + "<!--" + "x".repeat(900 * 1024) + "-->"));
  const result = await assessLead(clinic, "website");
  assert.doesNotMatch(result.summary, /не вдалося прочитати/);
});

test("a hosting 'website not configured' 404 is a verified high lead", async t => {
  serve(t, () => page("<html><head><title>Website clinic.example not configured</title></head><body>Website clinic.example not configured. Domain address record points to our server but this site is not served.</body></html>", 404));
  const result = await assessLead(clinic, "website");
  assert.equal(result.priority, "high");
  assert.match(result.summary, /заглушка хостингу/);
});

test("a plain homepage 404 twice counts as a dead site", async t => {
  const calls = serve(t, () => page("<html><body>Not Found</body></html>", 404));
  const result = await assessLead(clinic, "website");
  assert.equal(result.priority, "high");
  assert.equal(calls.length, 3);
});

test("a hosted menu page (choiceqr) is 'no own site' for website, but is read for booking", async t => {
  const calls = serve(t, () => page('<html><head><title>Волошка - Бронювання</title></head><body></body></html>'));
  const site = await assessLead({ ...clinic, website: "https://voloshka.choiceqr.com" }, "website");
  assert.equal(site.priority, "high");
  assert.match(site.summary, /платформі \(voloshka\.choiceqr\.com\)/);
  assert.equal(calls.length, 0);
  const booking = await assessLead({ ...clinic, website: "https://voloshka.choiceqr.com" }, "booking");
  assert.equal(calls.length, 1);
  assert.notEqual(booking.priority, "high");
});

test("names match across apostrophes and Cyrillic/Latin spelling, but not unrelated words", async t => {
  serve(t, () => page(html("", "Піца Celentano — доставка")));
  assert.notEqual((await assessLead({ ...clinic, name: "Челентано", phone: "" }, "website")).confidence, "unknown");
  t.mock.restoreAll();
  serve(t, () => page(html("", "LA П’ЄЦ нормальна доставка")));
  assert.notEqual((await assessLead({ ...clinic, name: "La П'єц", phone: "" }, "website")).summary, "Назву або контакт на сайті не вдалося звірити з карткою компанії.");
  t.mock.restoreAll();
  serve(t, () => page(html("", "Мармелад кондитерська")));
  assert.match((await assessLead({ ...clinic, name: "Маргарита", phone: "" }, "website")).summary, /не вдалося звірити/);
});

test("a removed branch page (deep link 404) is judged by the working home page, not as a dead site", async t => {
  const calls = serve(t, url => url.pathname === "/" ? page(html('<a href="tel:+380501234567">Подзвонити</a><a href="https://t.me/x">Telegram</a>')) : page("<html><body>Not found</body></html>", 404));
  const result = await assessLead({ ...clinic, website: "https://clinic.example/branch/lviv-1" }, "website");
  assert.notEqual(result.priority, "high");
  assert.doesNotMatch(result.summary, /не відкрився/);
  assert.equal(calls[1], "https://clinic.example/");
});

test("without phone or email an Instagram/Telegram profile is the contact for a no-site lead", async t => {
  respond(t, "");
  const ig = await assessLead({ ...clinic, website: "N/A", phone: "", instagram: "https://www.instagram.com/voloshka" }, "website");
  assert.equal(ig.priority, "high");
  assert.deepEqual(ig.contact, { kind: "social", value: "https://www.instagram.com/voloshka", source: "https://www.openstreetmap.org/node/123" });
  assert.match(ig.suggestion, /повідомленням у соцмережі/);
  const tg = await assessLead({ ...clinic, website: "N/A", phone: "", telegram: "@voloshka_dent" }, "website");
  assert.equal(tg.contact.value, "https://t.me/voloshka_dent");
  const none = await assessLead({ ...clinic, website: "N/A", phone: "", telegram: "not a handle!" }, "website");
  assert.equal(none.priority, "review");
});

const gapsOf = r => (r.gaps || []).map(g => (g.strong ? "!" : "") + g.label);

test("site gaps: no mobile viewport, no HTTPS, old WordPress and no contact way are serious and evidenced", async t => {
  serve(t, url => url.protocol === "https:" ? Promise.reject(new TypeError("connect ECONNREFUSED")) : page('<html><head><title>Волошка</title><meta name="generator" content="WordPress 4.9.8"></head><body><h1>Волошка</h1><p>Ми працюємо для вас щодня. Сучасне лікування зубів для всієї родини у Львові.</p><footer>© 2016 Волошка</footer></body></html>'));
  const r = await assessLead({ ...clinic, website: "http://clinic.example/" }, "website");
  const gaps = gapsOf(r).join(" | ");
  for (const re of [/!Немає HTTPS/, /!Не адаптований під телефон/, /!WordPress 4\.9/, /!Немає зворотного зв'язку/, /!Сайт давно не оновлювався \(у футері © 2016\)/, /Немає опису для Google/])
    assert.match(gaps, re);
  assert.equal(r.priority, "high");
  assert.equal(r.confidence, "verified");
  assert.equal(r.summary, "На сайті немає: HTTPS, мобільної версії, оновлень безпеки (WordPress 4.9), зворотного зв'язку, оновлень з 2016 року.");
  assert.match(r.suggestion, /^Запропонуйте /);
  assert.ok(r.evidence.some(e => /Сайт · Не адаптований/.test(e.label)));
});

test("site gaps: phone shown as text only — minor gaps, worth a look but not a call", async t => {
  serve(t, () => page(html('<p>Телефон: 050 123 45 67</p><p>вул. Зелена 1</p>')));
  const r = await assessLead(clinic, "website");
  const gaps = gapsOf(r).join(" | ");
  assert.match(gaps, /^Немає форми заявки чи месенджерів/);
  assert.match(gaps, /Телефон не натискається/);
  assert.doesNotMatch(gaps, /!/);
  assert.notEqual(r.priority, "high");
});

test("site gaps: a modern site with form, clickable phone and Telegram has nothing missing", async t => {
  serve(t, () => page(html('<a href="tel:+380501234567">050 123 45 67</a><a href="https://t.me/voloshka">Telegram</a><form><textarea name="m"></textarea></form><footer>© ' + new Date().getFullYear() + '</footer>')));
  const r = await assessLead(clinic, "website");
  assert.equal(r.gaps, undefined);
  assert.equal(r.priority, "low");
});

test("site gaps: a chat/callback widget counts as a way to get in touch; a search box is not a form", async t => {
  serve(t, () => page(html('<form><input type="search" name="s"></form><script src="//code.jivo.ru/widget/abc"></script>')));
  const r = await assessLead(clinic, "website");
  assert.doesNotMatch(gapsOf(r).join(" | "), /зворотного зв'язку|форми заявки/);
});

test("site gaps: an Instagram link or a contacts-button widget is a way to get in touch", async t => {
  serve(t, () => page(html('<a href="https://www.instagram.com/voloshka">Instagram</a><link rel="stylesheet" href="/css/contacts-button-widget.css">')));
  const r = await assessLead(clinic, "website");
  assert.doesNotMatch(gapsOf(r).join(" | "), /зворотного зв'язку/);
});

const contactable = '<a href="tel:+380501234567">050 123 45 67</a><a href="https://t.me/voloshka">Telegram</a><form><textarea></textarea></form>';

test("online booking: a dentist site without any booking control is missing online booking", async t => {
  serve(t, () => page(html(contactable)));
  const r = await assessLead({ ...clinic, type: "dentist" }, "website");
  assert.match(gapsOf(r).join(" | "), /!Немає онлайн-запису/);
  assert.equal(r.priority, "high");
  assert.equal(r.summary, "На сайті немає: онлайн-запису.");
  assert.equal(r.suggestion, "Запропонуйте додати онлайн-запис.");
});

test("online booking: a 'Записатися' button or a booking widget counts; other niches and hotels are handled", async t => {
  for (const extra of ['<button class="btn">Записатися на прийом</button>', '<script src="https://w123.alteg.io/widgetJS"></script>']) {
    t.mock.restoreAll();
    serve(t, () => page(html(contactable + extra)));
    assert.doesNotMatch(gapsOf(await assessLead({ ...clinic, type: "dentist" }, "website")).join(" | "), /онлайн-запису/);
  }
  t.mock.restoreAll();
  serve(t, () => page(html(contactable)));
  assert.doesNotMatch(gapsOf(await assessLead({ ...clinic, type: "pharmacy" }, "website")).join(" | "), /онлайн/);
  assert.match(gapsOf(await assessLead({ ...clinic, type: "hotel" }, "website")).join(" | "), /!Немає онлайн-бронювання/);
});

test("PageSpeed: a slow mobile score becomes a gap with a report link; without a key Google is not called", async t => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async input => {
    const url = new URL(input);
    if (url.hostname === "cloudflare-dns.com") return Response.json({ Answer: [{ type: 1, data: "93.184.216.34" }] });
    calls.push(url.hostname);
    if (url.hostname === "www.googleapis.com") {
      assert.equal(url.searchParams.get("key"), "K");
      assert.equal(url.searchParams.get("strategy"), "mobile");
      return Response.json({ lighthouseResult: { categories: { performance: { score: 0.34 } }, audits: { "largest-contentful-paint": { displayValue: "9,1 с" } } } });
    }
    return page(html(contactable + '<footer>© ' + new Date().getFullYear() + '</footer>'));
  });
  const slow = await assessLead(clinic, "website", { pageSpeedKey: "K" });
  assert.match(gapsOf(slow).join(" | "), /!Повільний на телефоні: швидкість 34\/100 \(основний вміст за 9,1 с\)/);
  assert.equal(slow.priority, "high");
  assert.ok(slow.evidence.some(e => e.url.startsWith("https://pagespeed.web.dev/analysis?url=")));
  calls.length = 0;
  await assessLead(clinic, "website");
  assert.ok(!calls.includes("www.googleapis.com"));
});

test("speed without a key: heavy render-blocking pages are 'probably slow'; one weak hint is not", async t => {
  const scripts = [...Array(8)].map((_, i) => '<script src="/js/' + i + '.js"></script>').join("");
  const imgs = [...Array(30)].map((_, i) => '<img src="/i/' + i + '.jpg">').join("");
  serve(t, () => page('<html><head><title>Волошка</title>' + MODERN + scripts + '</head><body><h1>Волошка</h1><p>Ми працюємо щодня для всієї родини, сучасне лікування та профілактика.</p>' + contactable + imgs + '</body></html>'));
  const r = await assessLead(clinic, "website");
  assert.match(gapsOf(r).join(" | "), /Сайт, ймовірно, повільний на телефоні: 8 скриптів у шапці гальмують показ, 30 картинок вантажаться одразу/);
  t.mock.restoreAll();
  serve(t, () => page('<html><head><title>Волошка</title>' + MODERN + scripts + '</head><body><h1>Волошка</h1><p>Ми працюємо щодня для всієї родини, сучасне лікування та профілактика.</p>' + contactable + '</body></html>'));
  assert.doesNotMatch(gapsOf(await assessLead(clinic, "website")).join(" | "), /повільний/);
});

test("dead site causes: a lapsed domain (NXDOMAIN) and a broken HTTPS certificate are named", async t => {
  t.mock.method(globalThis, "fetch", async input => {
    const url = new URL(input);
    if (url.hostname === "cloudflare-dns.com") return Response.json({ Status: 3 });
    throw new TypeError("fetch failed");
  });
  const gone = await assessLead(clinic, "website");
  assert.equal(gone.priority, "high");
  assert.match(gone.summary, /^Домен сайту clinic\.example більше не існує/);
  assert.ok(gone.evidence.some(e => /NXDOMAIN/.test(e.label)));
  t.mock.restoreAll();
  t.mock.method(globalThis, "fetch", async input => {
    if (new URL(input).hostname === "cloudflare-dns.com") return Response.json({ Status: 2, Comment: ["EDE(22): No Reachable Authority at delegation clinic.example."] });
    throw new TypeError("fetch failed");
  });
  assert.match((await assessLead(clinic, "website")).summary, /DNS-сервери домену clinic\.example не відповідають/);
  t.mock.restoreAll();
  serve(t, url => { if (url.protocol === "https:") throw new TypeError("certificate"); return page(html(contactable)); });
  const ssl = await assessLead(clinic, "website");
  assert.equal(ssl.priority, "high");
  assert.match(ssl.summary, /^Сайт не відкривається по HTTPS \(помилка сертифіката\)/);
  t.mock.restoreAll();
  serve(t, () => page("x", 526));
  assert.match((await assessLead(clinic, "website")).summary, /помилку SSL-сертифіката \(HTTP 526\)/);
});

test("real-browser probe: its score and phone screenshot are used; Google is not called; a failed probe is harmless", async t => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async input => {
    const url = new URL(input);
    if (url.hostname === "cloudflare-dns.com") return Response.json({ Answer: [{ type: 1, data: "93.184.216.34" }] });
    calls.push(url.hostname);
    return page(html(contactable + '<footer>© ' + new Date().getFullYear() + '</footer>'));
  });
  const shot = "data:image/jpeg;base64,/9j/AAAA";
  const r = await assessLead(clinic, "website", { pageSpeedKey: "K", probe: async url => (assert.equal(url, clinic.website), { score: 38, lcp: "28,1\u00a0с", screenshot: shot }) });
  assert.equal(r.screenshot, shot);
  assert.match(gapsOf(r).join(" | "), /!Повільний на телефоні: швидкість 38\/100 \(основний вміст за 28,1 с\)/);
  assert.ok(r.evidence.some(e => /^Перевірка в браузері \(телефон, Lighthouse\) · 38\/100/.test(e.label)));
  assert.ok(!calls.includes("www.googleapis.com"));
  const broken = await assessLead(clinic, "website", { probe: async () => { throw new Error("down"); } });
  assert.equal(broken.screenshot, undefined);
  const junk = await assessLead(clinic, "website", { probe: async () => ({ score: 90, screenshot: "javascript:alert(1)" }) });
  assert.equal(junk.screenshot, undefined);
});


test("http-only link to a site that also works on https is a small redirect fix, not «no HTTPS»", async t => {
  serve(t, () => page(html('<a href="tel:+380501234567">Подзвонити</a><a href="https://t.me/x">Telegram</a>')));
  const r = await assessLead({ ...clinic, website: "http://clinic.example/" }, "website");
  const gaps = gapsOf(r).join(" | ");
  assert.doesNotMatch(gaps, /Немає HTTPS/);
  assert.match(gaps, /^Немає переадресації з http:\/\/ на https:\/\//);
  assert.ok(r.evidence.some(e => /по https:\/\/ · HTTP 200/.test(e.label)));
});

test("an open copyright range finished by a script is not an old site; a closed old one is", async t => {
  serve(t, () => page(html('<a href="tel:+380501234567">Подзвонити</a><a href="https://t.me/x">Telegram</a><footer>© 2015 - <script>document.write(2026)</script> Волошка</footer>')));
  assert.doesNotMatch(gapsOf(await assessLead(clinic, "website")).join(" | "), /давно не оновлювався/);
  t.mock.restoreAll();
  serve(t, () => page(html('<a href="tel:+380501234567">Подзвонити</a><a href="https://t.me/x">Telegram</a><footer>© 2015 - 2019 Волошка</footer>')));
  assert.match(gapsOf(await assessLead(clinic, "website")).join(" | "), /давно не оновлювався \(у футері © 2019\)/);
});

test("WordPress version is read from core files when the generator tag is hidden", async t => {
  const core = '<script src="/wp-includes/js/jquery/jquery.js?ver=4.9.8"></script><script src="/wp-includes/js/wp-embed.min.js?ver=4.9.8"></script>';
  serve(t, () => page(html('<a href="tel:+380501234567">Подзвонити</a><a href="https://t.me/x">Telegram</a>', "Волошка", MODERN + core)));
  assert.match(gapsOf(await assessLead(clinic, "website")).join(" | "), /!WordPress 4\.9 — версія без оновлень безпеки/);
});

test("the domain spelling the company name confirms the site when the page title does not", async t => {
  serve(t, () => page(html('<a href="https://t.me/x">Telegram</a>', "Стоматологія на Подолі")));
  const r = await assessLead({ ...clinic, name: "Галси", phone: "", website: "https://www.galsi-dental.com.ua/" }, "website");
  assert.ok(r.evidence.some(e => /збігається з адресою сайту/.test(e.label)), r.summary);
  t.mock.restoreAll();
  serve(t, () => page(html('<a href="https://t.me/x">Telegram</a>', "Ресторани групи")));
  const other = await assessLead({ ...clinic, name: "Масони", phone: "", website: "https://www.fest.lviv.ua/uk/restaurants/x" }, "website");
  assert.match(other.summary, /не вдалося звірити/);
});

test("a QR-menu platform page instead of a site is a hot lead", async t => {
  respond(t, "");
  const r = await assessLead({ ...clinic, website: "https://qrboss.com.ua/poverh.restobar" }, "website");
  assert.equal(r.priority, "high");
  assert.match(r.summary, /платформі \(qrboss\.com\.ua\)/);
});

test("a resolving domain that is silent twice gets a slower third try before it is called dead", async t => {
  let n = 0;
  t.mock.method(globalThis, "fetch", async input => {
    const url = new URL(input);
    if (url.hostname === "cloudflare-dns.com") return Response.json({ Status: 0, Answer: [{ type: 1, data: "93.184.216.34" }] });
    if (++n <= 2) throw new TypeError("fetch failed");
    return page(html('<a href="tel:+380501234567">Подзвонити</a><a href="https://t.me/x">Telegram</a>'));
  });
  const r = await assessLead(clinic, "website");
  assert.doesNotMatch(r.summary, /не відкрився/);
  assert.ok(r.evidence.some(e => /Третя перевірка .* HTTP 200/.test(e.label)));
});

test("a closed Google business.site is named as such", async t => {
  serve(t, () => page("Not found", 404));
  const r = await assessLead({ ...clinic, website: "https://dental-clinic-7066.business.site/" }, "website");
  assert.equal(r.priority, "high");
  assert.match(r.summary, /business\.site .* Google закрив у 2024/);
});

test("a map link with a www. that does not exist is judged by the working bare domain", async t => {
  t.mock.method(globalThis, "fetch", async input => {
    const url = new URL(input);
    if (url.hostname === "cloudflare-dns.com") return Response.json({ Status: 3 });
    if (url.hostname.startsWith("www.")) throw new TypeError("getaddrinfo ENOTFOUND");
    return page(html('<a href="tel:+380501234567">Подзвонити</a><a href="https://t.me/x">Telegram</a>'));
  });
  const r = await assessLead({ ...clinic, website: "https://www.clinic.example/" }, "website");
  assert.doesNotMatch(r.summary, /не існує|не відкрився/);
  assert.ok(r.evidence.some(e => /без www · HTTP 200/.test(e.label)));
});

test("buttons added by scripts (seen only in the browser) are not reported as missing", async t => {
  serve(t, () => page(html('<a href="tel:+380501234567">Подзвонити</a><form><input type="tel"><textarea></textarea></form>')));
  const without = await assessLead(clinic, "website");
  assert.match(gapsOf(without).join(" | "), /Немає кнопок месенджерів/);
  const probe = async () => ({ score: 90, html: html('<a href="tel:+380501234567">Подзвонити</a><form><input type="tel"><textarea></textarea></form><a href="https://t.me/voloshka">Telegram</a>') });
  const withBrowser = await assessLead(clinic, "website", { probe });
  assert.doesNotMatch(gapsOf(withBrowser).join(" | "), /месенджерів/);
  assert.ok(withBrowser.evidence.some(e => /в браузері \(з виконаними скриптами\)/.test(e.label)));
});

test("a hosting «site has been created» placeholder is a hot lead", async t => {
  serve(t, () => page("<html><head><title>Congratulations!</title></head><body><h1>Congratulations, the site has been created!</h1><p>Your website is up and running! To put your site in this place, delete the index.html file in the site folder.</p></body></html>"));
  const r = await assessLead(clinic, "website");
  assert.equal(r.priority, "high");
  assert.match(r.summary, /заглушка хостингу/);
});

test("a site wrapped in an iframe is not reported as having no contact", async t => {
  serve(t, () => page('<html><head><title>Волошка</title>' + MODERN + '</head><body><h1>Волошка</h1><iframe src="/main.html" width="100%"></iframe></body></html>'));
  const gaps = gapsOf(await assessLead(clinic, "website")).join(" | ");
  assert.doesNotMatch(gaps, /зворотного зв'язку|онлайн-запису/);
});

test("phone or e-mail fields outside a <form> tag count as an enquiry form", async t => {
  serve(t, () => page(html('<div class="t-form"><input type="tel" name="phone"><button>Надіслати</button></div>')));
  assert.doesNotMatch(gapsOf(await assessLead(clinic, "website")).join(" | "), /зворотного зв'язку|Немає форми заявки/);
});

test("a map address without a scheme falls back to http when https does not answer", async t => {
  serve(t, url => url.protocol === "https:" ? Promise.reject(new TypeError("fetch failed")) : page(html('<a href="tel:+380501234567">Подзвонити</a><a href="https://t.me/x">Telegram</a>')));
  const r = await assessLead({ ...clinic, website: "clinic.example" }, "website");
  assert.doesNotMatch(r.summary, /не відкрився|не відкривається/);
  assert.match(gapsOf(r).join(" | "), /!Немає HTTPS/);
});

test("a match by domain only (name absent on the page) is never a hot lead", async t => {
  serve(t, () => page(html('<p>Національна лотерея: Золотий кубок</p>', "Лотерея")));
  const r = await assessLead({ ...clinic, name: "Галси", phone: "", website: "https://www.galsi-dental.com.ua/" }, "website");
  assert.notEqual(r.priority, "high");
  assert.match(r.summary, /^Назви компанії на сторінці немає/);
});

test("a Russian-language hosting placeholder title is recognised too", async t => {
  serve(t, () => page("<html><head><title>Поздравляем, сайт создан!</title></head><body><div><h1>Site is ready to use</h1><p>Upload your files to the site folder to replace this page.</p></div></body></html>"));
  assert.match((await assessLead(clinic, "website")).summary, /заглушка хостингу/);
});
