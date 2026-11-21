import test from "node:test";
import assert from "node:assert/strict";
import { mergeSources, samePlace, similarNames, nameKey } from "../src/lib/merge-sources.ts";

const at = (lat, lng, fields) => ({ osmId: "", name: "", phone: "N/A", website: "N/A", address: "N/A", email: "", facebook: "", instagram: "", telegram: "", socialOnly: false, lat, lng, ...fields });
// ~1 m of latitude = 0.000009°
const north = (p, metres) => p + metres * 0.000009;
const LAT = 48.4647, LNG = 35.0462;

test("names match across Ukrainian/Russian spelling, quotes and generic words", () => {
  assert.ok(similarNames('Стоматологія "Посмішка"', "Посмішка"));
  assert.ok(similarNames("Стоматология Улыбка", "Стоматологія Улибка"));
  assert.ok(similarNames("Гранд Готель", "Grand Hotel"), nameKey("Гранд Готель") + " vs " + nameKey("Grand Hotel"));
  assert.ok(similarNames("А-Дент", "Стоматологія «А-Дент»"));
  assert.ok(!similarNames("Посмішка", "Перлина"));
  assert.ok(!similarNames("Стоматологія", "Аптека"));
});

test("the same clinic on both maps becomes one record that keeps the OSM id and gains Overture contacts", () => {
  const osm = [at(LAT, LNG, { osmId: "node/1", name: "Посмішка", address: "вул. Січеславська 1" })];
  const ov = [at(north(LAT, 60), LNG, { osmId: "overture/aaa", name: 'Стоматологія "Посмішка"', phone: "+380671112233", website: "https://posmishka.dp.ua/", facebook: "https://www.facebook.com/1" })];
  const out = mergeSources(osm, ov);
  assert.equal(out.length, 1);
  assert.equal(out[0].osmId, "node/1");
  assert.equal(out[0].phone, "+380671112233");
  assert.equal(out[0].website, "https://posmishka.dp.ua/");
  assert.equal(out[0].address, "вул. Січеславська 1", "OSM data is not overwritten");
  assert.equal(out[0].socialOnly, false, "a real site from Overture means the clinic has a site");
  assert.deepEqual(out[0].sources, ["osm", "overture"]);
});

test("a shared phone or own website matches nearby records even when the names differ", () => {
  const osm = [at(LAT, LNG, { osmId: "node/1", name: "Клініка доктора Петренка", phone: "+38 (067) 111-22-33" })];
  assert.equal(mergeSources(osm, [at(north(LAT, 200), LNG, { osmId: "overture/b", name: "Dr. Petrenko Dental", phone: "0671112233" })]).length, 1);
  assert.equal(mergeSources(osm, [at(north(LAT, 250), LNG, { osmId: "overture/c", name: "Petrenko", website: "https://www.petrenko.ua/uk/" })]).length, 2, "no common phone or site, different name");
  const withSite = [at(LAT, LNG, { osmId: "node/2", name: "X", website: "http://petrenko.ua" })];
  assert.equal(mergeSources(withSite, [at(north(LAT, 250), LNG, { osmId: "overture/c", name: "Petrenko", website: "https://www.petrenko.ua/uk/" })]).length, 1);
});

test("chain branches and different shops in one building stay separate", () => {
  const branchA = at(LAT, LNG, { osmId: "node/1", name: "Аптека АНЦ", phone: "0800500000" });
  const branchB = at(north(LAT, 900), LNG, { osmId: "overture/x", name: "Аптека АНЦ", phone: "0800500000" });
  assert.equal(mergeSources([branchA], [branchB]).length, 2, "same chain 900 m apart");
  const salon = at(LAT, LNG, { osmId: "node/5", name: "Салон краси Віола", phone: "+380501111111" });
  const dentist = at(north(LAT, 5), LNG, { osmId: "overture/y", name: "Стоматологія Перлина", phone: "+380502222222" });
  assert.equal(mergeSources([salon], [dentist]).length, 2, "two businesses at one address");
  assert.ok(!samePlace(salon, { ...salon, lat: north(LAT, 700) }), "same name and phone but 700 m away");
});

test("duplicates inside Overture itself are merged too", () => {
  const a = at(LAT, LNG, { osmId: "overture/1", name: 'Стоматологія "А-Дент"', phone: "+380969769418" });
  const b = at(north(LAT, 30), LNG, { osmId: "overture/2", name: 'Стоматологія "А-Дент"', phone: "+380969769418", instagram: "https://instagram.com/adent" });
  const out = mergeSources([], [a, b]);
  assert.equal(out.length, 1);
  assert.equal(out[0].instagram, "https://instagram.com/adent");
});

test("the closest matching record absorbs the duplicate; works across ~1 km grid edges", () => {
  // Points straddling a 0.01° grid line must still meet.
  const edge = 48.46;
  const osm = [at(edge - 0.0002, LNG, { osmId: "node/9", name: "Корал" })];
  const out = mergeSources(osm, [at(edge + 0.0002, LNG, { osmId: "overture/z", name: "Готель Корал", phone: "+380372000000" })]);
  assert.equal(out.length, 1);
  assert.equal(out[0].phone, "+380372000000");
});

test("generic names, different house numbers and look-alike prefixes do not merge on the name alone", () => {
  assert.ok(!similarNames("Стоматологія", "Клініка стоматології"));
  assert.ok(!similarNames("вул. Дюківська, 8", "вул. Дюківська, 14"));
  assert.ok(!similarNames("Барбершоп У Гольштейна", "Студия красоты Barbie Bar"));
  assert.ok(similarNames("Естетика Дніпро", "Эстетика"));
  assert.ok(similarNames("Consul Hotel", 'Отель "Консул"'));
  assert.ok(similarNames("Piramisa", "Пирамиса"));
  // Generic names still merge when the phone is the same.
  const a = at(LAT, LNG, { osmId: "node/1", name: "Стоматологія", phone: "+380671112233" });
  const b = at(north(LAT, 40), LNG, { osmId: "overture/q", name: "Стоматологія", phone: "067 111 22 33" });
  assert.equal(mergeSources([a], [b]).length, 1);
  assert.equal(mergeSources([a], [{ ...b, phone: "+380509998877" }]).length, 2);
});

test("long distinctive names merge up to 300 m (map pins drift), short ones only within 150 m", () => {
  const osm = [at(LAT, LNG, { osmId: "node/1", name: "Естетика" })];
  assert.equal(mergeSources(osm, [at(north(LAT, 250), LNG, { osmId: "overture/e", name: "Эстетика" })]).length, 1);
  const short = [at(LAT, LNG, { osmId: "node/2", name: "Ліра" })];
  assert.equal(mergeSources(short, [at(north(LAT, 250), LNG, { osmId: "overture/l", name: "Лира" })]).length, 2);
  assert.equal(mergeSources(short, [at(north(LAT, 100), LNG, { osmId: "overture/l", name: "Лира" })]).length, 1);
});

test("one place mapped twice in OSM is listed once; OSM branches 150 m apart stay separate", () => {
  const point = at(LAT, LNG, { osmId: "node/1", name: "Hotel de Paris" });
  const outline = at(north(LAT, 2), LNG, { osmId: "way/2", name: "Hotel de Paris", phone: "+380482000000" });
  const out = mergeSources([point, outline], []);
  assert.equal(out.length, 1);
  assert.equal(out[0].phone, "+380482000000");
  const branch = at(north(LAT, 160), LNG, { osmId: "node/3", name: "Hotel de Paris" });
  assert.equal(mergeSources([point, branch], []).length, 2);
  assert.ok(!similarNames("MVD Beauty Bar", "VD"));
  const sideBySide = at(north(LAT, 30), LNG, { osmId: "node/4", name: "Hotel de Paris", phone: "+380482111111" });
  assert.equal(mergeSources([outline, sideBySide], []).length, 2, "different phones: two branches");
});
