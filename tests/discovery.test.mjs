import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { discoverBusinessesAt, geocodeCity, regionalCity } from "../src/lib/osm-search.ts";

const readAsset = async path => new Response(await readFile(new URL("../public" + path, import.meta.url)));
const unavailable = () => new Response(null, { status: 503 });

test("real city snapshots return dated places with valid OSM references and contacts", async t => {
  t.mock.method(globalThis, "fetch", unavailable);
  for (const [city, niche, type] of [["Львів", "піцерія", "restaurant"], ["Київ", "стоматологія", "dentist"]]) {
    const { lat, lng } = await geocodeCity(city, "ua");
    const found = await discoverBusinessesAt(lat, lng, niche, 5, 5, true, readAsset);
    assert.equal(found.businesses.length, 5);
    assert.match(found.asOf, /^\d{4}-\d\d-\d\dT/);
    assert.ok(found.source.includes(city));
    assert.ok(found.note.includes("20 км"));
    assert.ok(found.businesses.some(place => place.type === type));
    assert.ok(found.businesses.every(place => /^(node|way)\/\d+$/.test(place.osmId)));
    assert.ok(found.businesses.every(place => place.website !== "N/A"));
    assert.ok(found.businesses.some(place => place.phone !== "N/A" || place.email));
    const withinMeters = Math.hypot((found.businesses[0].lat-lat)*111000, (found.businesses[0].lng-lng)*111000*Math.cos(lat*Math.PI/180));
    assert.ok(withinMeters < 5000);
  }
});

test("a saved city alias stays country-specific", () => {
  assert.equal(regionalCity("Lviv, Ukraine", "ua").city, "Львів");
  assert.equal(regionalCity("Lviv, Canada"), undefined);
  assert.equal(regionalCity("Київ", "pl"), undefined);
});

test("an unavailable feed cannot become a successful empty result or substitute another city", async t => {
  t.mock.method(globalThis, "fetch", unavailable);
  await assert.rejects(discoverBusinessesAt(49.839, 24.031, "unmatched987654", 5, 1, true, readAsset), /недоступне/);
  let assetRequested = false;
  await assert.rejects(discoverBusinessesAt(52.23, 21.01, "dentist", 5, 5, true, async () => {
    assetRequested = true;
    return unavailable();
  }), /недоступне/);
  assert.equal(assetRequested, false);
});

test("uses a newer weekly directory and reuses it in a warm worker", async t => {
  const snapshot = await (await readAsset("/osm/lviv-osm.json")).json();
  const day = 86_400_000;
  const clock = Date.parse(snapshot.asOf) + day * 60;
  const updated = new Date(clock - day).toISOString();
  t.mock.method(Date, "now", () => clock);
  let calls = 0;
  t.mock.method(globalThis, "fetch", url => {
    assert.ok(String(url).includes("/osm-data/lviv-osm.json"));
    calls += 1;
    return Response.json({ ...snapshot, asOf: updated });
  });
  for (let i = 0; i < 2; i++) {
    const result = await discoverBusinessesAt(49.84195, 24.03159, "піцерія", 3, 3, true, readAsset);
    assert.equal(result.asOf, updated);
    assert.equal(result.businesses.length, 3);
  }
  assert.equal(calls, 1);
});

test("an unreadable weekly file falls back to the shipped directory during a live outage", async t => {
  const snapshot = await (await readAsset("/osm/kyiv-osm.json")).json();
  const clock = Date.parse(snapshot.asOf) + 100 * 86_400_000;
  t.mock.method(Date, "now", () => clock);
  t.mock.method(globalThis, "fetch", url => String(url).includes("/osm-data/")
    ? Response.json({ ...snapshot, asOf: new Date(clock).toISOString(), groups: { '{"amenity":"dentist"}': "!!broken-gzip!!" } })
    : unavailable());
  const result = await discoverBusinessesAt(50.45, 30.52, "dentist", 3, 3, true, readAsset);
  assert.equal(result.asOf, snapshot.asOf);
  assert.equal(result.businesses.length, 3);
});

import { gzipSync } from "node:zlib";
import { tileCells } from "../src/lib/osm-search.ts";

const tileOf = (cell, rows) => ({
  city: "tile:" + cell, asOf: "2026-11-19T01:48:17Z",
  groups: { '{"amenity":"dentist"}': gzipSync(JSON.stringify(rows)).toString("base64") },
});

test("a city outside Lviv/Kyiv is served from country tiles, falling back to the CDN mirror", async t => {
  const rows = [...Array(8)].map((_, i) => ["n", 1000 + i, 48.4647 + i * 0.002, 35.0462, { amenity: "dentist", name: "Дент " + i, phone: "+38056" + (1000000 + i) }]);
  rows.push(["n", 2000, 48.9, 35.0462, { amenity: "dentist", name: "Далеко" }]);
  const urls = [];
  t.mock.method(globalThis, "fetch", async input => {
    const url = String(input);
    urls.push(url);
    if (url.includes("raw.githubusercontent.com") && url.includes("/tiles/")) return new Response(null, { status: 503 });
    if (url.endsWith("index.json")) return Response.json({ asOf: "2026-11-19T01:48:17Z", tiles: { "48_35": 9 } });
    if (url.endsWith("tiles/48_35.json")) return Response.json(tileOf("48_35", rows));
    return new Response(null, { status: 503 });
  });
  const found = await discoverBusinessesAt(48.4647, 35.0462, "стоматологія", 20, 5, false, readAsset);
  assert.equal(found.businesses.length, 8);
  assert.match(found.source, /OpenStreetMap · 2026-11-19/);
  assert.ok(urls.some(u => u.includes("cdn.jsdelivr.net") && u.endsWith("tiles/48_35.json")));
  assert.ok(!urls.some(u => u.includes("overpass")));
});

test("tile cells cover the search circle", () => {
  assert.deepEqual(tileCells(48.46, 35.04, 5), ["48_34", "48_35"]);
  assert.equal(tileCells(50.45, 30.52, 50).length, 6);
});
