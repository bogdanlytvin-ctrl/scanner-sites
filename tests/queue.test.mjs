import assert from "node:assert/strict";
import test from "node:test";

// workspace.js imports nothing from cloudflare:, so it loads in plain Node.
const { pickQueue } = await import("../worker/workspace.js");
const biz = (i, site, phone = "+380501234567") => ({ osmId: "node/" + i, name: "B" + i, website: site ? "https://b" + i + ".example" : "N/A", phone });

test("website service gives half of the run to contactable companies without a site", () => {
  const list = [...Array(20)].map((_, i) => biz(i, i < 15));
  const q = pickQueue(list, new Map(), "website");
  assert.equal(q.length, 12);
  assert.equal(q.filter(b => b.website === "N/A").length, 5); // only 5 exist
  const many = [...Array(30)].map((_, i) => biz(i, i % 3 === 0));
  assert.equal(pickQueue(many, new Map(), "website").filter(b => b.website === "N/A").length, 6);
});

test("no-site companies without any contact are not prioritised; booking keeps sites first", () => {
  const list = [...Array(10)].map((_, i) => biz(i, false, "")).concat([...Array(10)].map((_, i) => biz(100 + i, true)));
  assert.ok(pickQueue(list, new Map(), "website").slice(0, 10).every(b => b.website !== "N/A"));
  assert.ok(pickQueue(list, new Map(), "booking").slice(0, 10).every(b => b.website !== "N/A"));
});

test("least recently checked companies come first", () => {
  const list = [biz(1, false), biz(2, false)];
  const q = pickQueue(list, new Map([["node/1", "2026-11-20"]]), "website");
  assert.equal(q[0].osmId, "node/2");
});

test("a chain branch without a site borrows the brand site of another branch", async () => {
  const { shareBrandSites } = await import("../worker/workspace.js");
  const out = shareBrandSites([
    { osmId: "n/1", name: "Челентано", website: "https://celentano.ua" },
    { osmId: "n/2", name: "Челентано піца", website: "N/A" },
    { osmId: "n/3", name: "Піца Марко", website: "N/A" },
    { osmId: "n/4", name: "Піцерія Ностра", website: "https://nostra.example" },
  ]);
  assert.equal(out[1].website, "https://celentano.ua");
  assert.equal(out[2].website, "N/A"); // "піца" is generic, no false match with "Піцерія Ностра"
});

test("chain branches collapse into one card with a branch count, addresses and borrowed contacts", async () => {
  const { groupBranches, shareBrandSites } = await import("../worker/workspace.js");
  const raw = [
    { osmId: "n/1", name: "Челентано", website: "https://celentano.ua/lviv-1", address: "Галицька 1", phone: "N/A" },
    { osmId: "n/2", name: "Піцерія «Челентано»", website: "N/A", address: "Городоцька 5", phone: "+380671112233" },
    { osmId: "n/3", name: "Челентано піца", website: "http://www.celentano.ua/lviv-2", address: "Наукова 7" },
    { osmId: "n/4", name: "Domino's", website: "https://dominos.ua/uk/lviv/", address: "A" },
    { osmId: "n/5", name: "Domino's", website: "https://dominos.ua/uk/lviv/", address: "B" },
    { osmId: "n/6", name: "Ай-К'ю піцца", website: "N/A", phone: "+380501" },
  ];
  const g = groupBranches(shareBrandSites(raw));
  assert.deepEqual(g.map(x => x.osmId), ["n/1", "n/4", "n/6"]);
  assert.equal(g[0].branches, 3);
  assert.deepEqual(g[0].branchAddresses, ["Городоцька 5", "Наукова 7"]);
  assert.deepEqual(g[0].branchIds, ["n/2", "n/3"]);
  assert.equal(g[0].phone, "+380671112233");
  assert.equal(g[1].branches, 2);
  assert.equal(g[2].branches, 1);
});

test("different companies are never merged", async () => {
  const { groupBranches, brandKey } = await import("../worker/workspace.js");
  const g = groupBranches([
    { osmId: "n/1", name: "Дента плюс", website: "N/A" },
    { osmId: "n/2", name: "Дента люкс", website: "N/A" },
    { osmId: "n/3", name: "Смайл", website: "https://smile-a.example" },
    { osmId: "n/4", name: "Смайл", website: "https://smile-b.example" },
    { osmId: "n/5", name: "Салон", website: "https://instagram.com/salon_one" },
    { osmId: "n/6", name: "Салон", website: "https://instagram.com/salon_two" },
    { osmId: "n/7", name: "Стоматологія", website: "N/A" },
    { osmId: "n/8", name: "Стоматологія", website: "N/A" },
  ]);
  assert.equal(g.length, 8);
  assert.equal(brandKey("Стоматологічна клініка Кузнєцова"), brandKey("Стоматологія Кузнєцова"));
});
