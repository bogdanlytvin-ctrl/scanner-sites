import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
registerHooks({ resolve(specifier, context, next) {
  return next(/^\.\/[\w-]+$/.test(specifier) && context.parentURL?.includes("/src/lib/") ? specifier + ".ts" : specifier, context);
} });
const { geocodeCity, searchOverpassAt, validCoordinates } = await import("../src/lib/osm-search.ts");
import { parseQuery } from "../src/lib/query-parser.ts";
import { calculateLeadScoreDetailed, getWebsiteEvidence, scoreLead } from "../src/lib/scoring.ts";

const center = { lat: 49.84, lon: 24.03 };

function place(id, { type = "node", tags = {}, point = center } = {}) {
  return {
    id,
    type,
    ...(type === "node" ? point : { center: point }),
    tags: { name: "Branch " + id, ...tags },
  };
}

function mockOverpass(t, response) {
  return t.mock.method(globalThis, "fetch", (_url, options) => {
    const query = new URLSearchParams(options.body).get("data");
    return Response.json(response(query, String(_url)));
  });
}

test("smart query recognizes Ukrainian cases and multi-word cities", () => {
  assert.deepEqual(parseQuery("ресторани у Львові"), {
    city: "Львів", query: "ресторани", language: "ua",
  });
  assert.equal(parseQuery("стоматології в Києві").city, "Київ");
  assert.equal(parseQuery("dentists New York").city, "New York");
  assert.equal(parseQuery("Dnipro, Ukraine lawyer").city, "Dnipro, Ukraine");
  assert.equal(parseQuery("Dnipro, Ukraine lawyer").query, "lawyer");
});

test("pizza query requires cuisine for all geometry types", async (t) => {
  mockOverpass(t, (query) => {
    assert.match(query, /nwr\["amenity"="restaurant"\]\["cuisine"~"\(\^\|;\) \*pizza \*\(;\|\$\)",i\]\["name"\]/);
    assert.doesNotMatch(query, /\["amenity"="restaurant"\]\["name"\]/);
    return { elements: [place(1, { type: "relation" })] };
  });
  const leads = await searchOverpassAt(center.lat, center.lon, "піца", 10);
  assert.equal(leads[0].osmId, "relation/1");
});

test("specialized shop queries avoid an unfiltered shop selector", async (t) => {
  mockOverpass(t, (query) => {
    assert.match(query, /nwr\["shop"="clothes"\]/);
    assert.doesNotMatch(query, /nwr\["shop"\]\["name"\]/);
    return { elements: [] };
  });
  assert.deepEqual(await searchOverpassAt(center.lat, center.lon, "магазин одягу", 10), []);
});

test("ranking considers the full batch and preserves geographically distinct branches", async (t) => {
  const common = { name: "Same Brand" };
  const earlyLeads = Array.from({ length: 70 }, (_, i) => place(i + 10));
  const branchA = place(100, { type: "way", tags: { ...common, phone: "+380123456789" } });
  const branchB = place(101, { tags: { ...common, phone: "+380123456780" }, point: { ...center, lat: center.lat + .0003 } });
  const distant = place(103, { tags: { phone: "+380123456781" }, point: { ...center, lat: center.lat + 1 } });
  mockOverpass(t, (query) => {
    assert.match(query, /\["healthcare"="dentist"\]/);
    return { elements: [...earlyLeads, branchB, branchA, branchA, distant] };
  });
  const leads = await searchOverpassAt(center.lat, center.lon, "стоматологія", 8);
  assert.deepEqual(leads.slice(0, 2).map(({ osmId }) => osmId), ["way/100", "node/101"]);
  assert.equal(leads.filter(({ osmId }) => osmId === "way/100").length, 1);
  assert.equal(leads.some(({ osmId }) => osmId === "node/103"), false);
});

test("preserves an independent site when the other website field is a social profile", async (t) => {
  mockOverpass(t, () => ({
    elements: [
      place(201, { tags: { website: "instagram.com/branch", "contact:website": "https://example.org" } }),
      place(202, { tags: { website: "https://facebook.com.example.org" } }),
      place(203, { tags: { website: "https://t.me/branch" } }),
    ],
  }));
  const leads = await searchOverpassAt(center.lat, center.lon, "пекарня", 10);
  const byId = Object.fromEntries(leads.map((lead) => [lead.osmId, lead]));
  assert.equal(byId["node/201"].website, "https://example.org");
  assert.equal(byId["node/201"].socialOnly, false);
  assert.equal(byId["node/201"].instagram, "instagram.com/branch");
  assert.equal(byId["node/202"].website, "https://facebook.com.example.org");
  assert.equal(byId["node/203"].website, "N/A");
  assert.equal(byId["node/203"].socialOnly, true);
});

test("duplicate point and outline retain contact details and an existing site", async (t) => {
  mockOverpass(t, () => ({
    elements: [
      place(210, { tags: { name: "Same location", phone: "+380123456789" } }),
      place(211, { type: "way", tags: { name: "Same location", website: "https://example.org" } }),
    ],
  }));
  const leads = await searchOverpassAt(center.lat, center.lon, "ресторан", 10);
  assert.equal(leads.length, 1);
  assert.equal(leads[0].phone, "+380123456789");
  assert.equal(leads[0].website, "https://example.org");
});

test("a malformed mirror response cannot win as an empty search", async (t) => {
  mockOverpass(t, (_query, url) => url.includes("kumi") ? {} : { elements: [place(301)] });
  const leads = await searchOverpassAt(center.lat, center.lon, "аптека", 10);
  assert.equal(leads[0].osmId, "node/301");
});

test("selected country excludes foreign geocoder results and unrelated venues", async (t) => {
  const requestedUrls = [];
  t.mock.method(globalThis, "fetch", (target) => {
    const url = new URL(target);
    requestedUrls.push(url);
    if (url.hostname.includes("photon")) {
      return Response.json({
        features: [
          {
            properties: { countrycode: "BY", name: "Одеса", osm_value: "city" },
            geometry: { coordinates: [25, 55] },
          },
          {
            properties: { countrycode: "UA", name: "Одеса", osm_value: "restaurant" },
            geometry: { coordinates: [30, 46] },
          },
        ],
      });
    }
    return Response.json([{
      category: "boundary", addresstype: "city",
      lat: "46.48", lon: "30.72", display_name: "Одеса, Україна",
      address: { country_code: "ua" },
    }]);
  });
  const { lat, lng, displayName } = await geocodeCity("Одеса", "ua");
  assert.deepEqual({ lat, lng, displayName }, { lat: 46.48, lng: 30.72, displayName: "Одеса, Україна" });
  assert.equal(requestedUrls[0].searchParams.get("countrycode"), "UA");
  assert.equal(requestedUrls[1].searchParams.get("countrycodes"), "ua");
  assert.equal(validCoordinates(null, null), false);
  assert.equal(validCoordinates(91, 24), false);
});

test("unknown website evidence cannot create a HOT ranking or defect scores", () => {
  for (const [website, analysisLimited, evidence] of [
    ["N/A", true, "not-listed"],
    ["https://example.org", true, "limited"],
  ]) {
    assert.equal(getWebsiteEvidence({ website, analysisLimited }), evidence);
    assert.equal(scoreLead(website, 2015, false, false, analysisLimited), "WARM");
    const result = calculateLeadScoreDetailed({ website, analysisLimited });
    assert.equal(result.score, 0);
    assert.deepEqual(result.factors, []);
  }
  assert.equal(scoreLead("https://example.org", 2015, false, true, false), "WARM");
});
