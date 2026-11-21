import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { registerHooks } from "node:module";
registerHooks({ resolve(specifier, context, next) {
  return next(/^\.\/[\w-]+$/.test(specifier) && context.parentURL?.includes("/src/lib/") ? specifier + ".ts" : specifier, context);
} });
const { discoverBusinessesAt } = await import("../src/lib/osm-search.ts");
// Own file: the tile index cache is per process, so this test sees only its own tiles.
const readAsset = async path => new Response(await readFile(new URL("../public" + path, import.meta.url)));
const tileOf = (cell, rows) => ({
  city: "tile:" + cell, asOf: "2026-11-19T01:48:17Z",
  groups: { '{"amenity":"dentist"}': gzipSync(JSON.stringify(rows)).toString("base64") },
});

test("OSM and Overture tiles are merged: shared places once, Overture-only places added with their own ids", async t => {
  // Zaporizhzhia cell 47_35 (not used by other tests, so the tile cache is cold).
  const osmRows = [["n", 501, 47.8388, 35.1396, { amenity: "dentist", name: "Посмішка" }]];
  const ovRows = [
    ["o", "aaaa-1111-overture", 47.8392, 35.1397, { amenity: "dentist", healthcare: "dentist", name: 'Стоматологія "Посмішка"', phone: "+380612223344", website: "https://posmishka.zp.ua/", source: "overture" }],
    ["o", "bbbb-2222-overture", 47.8450, 35.1500, { amenity: "dentist", healthcare: "dentist", name: "Перлина", phone: "+380613334455", "contact:facebook": "https://www.facebook.com/42", source: "overture" }],
  ];
  const ovTile = { city: "tile:47_35", asOf: "2026-11-18T00:00:00Z", groups: { '{"amenity":"dentist","healthcare":"dentist"}': gzipSync(JSON.stringify(ovRows)).toString("base64") } };
  t.mock.method(globalThis, "fetch", async input => {
    const url = String(input);
    const overture = url.includes("overture-tiles");
    if (url.endsWith("index.json")) return Response.json({ asOf: overture ? "2026-11-18T00:00:00Z" : "2026-11-19T01:48:17Z", tiles: { "47_35": 1 } });
    if (url.endsWith("tiles/47_35.json")) return Response.json(overture ? ovTile : tileOf("47_35", osmRows));
    return new Response(null, { status: 503 });
  });
  const found = await discoverBusinessesAt(47.8388, 35.1396, "стоматологія", 20, 5, false, readAsset);
  assert.equal(found.businesses.length, 2);
  const merged = found.businesses.find(b => b.osmId === "node/501");
  assert.equal(merged.phone, "+380612223344");
  assert.equal(merged.website, "https://posmishka.zp.ua/");
  const added = found.businesses.find(b => b.osmId === "overture/bbbb-2222-overture");
  assert.ok(added, "Overture-only place is added");
  assert.equal(added.socialOnly, true);
  assert.equal(added.facebook, "https://www.facebook.com/42");
  assert.match(found.source, /OpenStreetMap · 2026-11-19 \+ Overture Maps · 2026-11-18/);
  assert.match(found.note, /Overture Maps/);
});
