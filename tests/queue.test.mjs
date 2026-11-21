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
