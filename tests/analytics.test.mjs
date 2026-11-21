import test from "node:test";
import assert from "node:assert/strict";
import { salesAnalytics, reminders, reached } from "../src/lib/analytics.ts";

const NOW = Date.parse("2026-11-22T12:00:00Z");
const ago = d => new Date(NOW - d * 86_400_000).toISOString();
const L = (campaignId, status, extra = {}) => ({ campaignId, status, priority: "high", kind: "no-site", ...extra });
const campaigns = [{ id: "a", query: "стоматологія", city: "Дніпро" }, { id: "b", query: "готель", city: "Одеса" }, { id: "c", query: "порожній", city: "Київ" }];

test("funnel counts the furthest stage a lead reached; reply rate is per written lead", () => {
  const leads = [
    L("a", "contacted", { statusAt: ago(1), history: [{ status: "contacted", at: ago(1) }] }),
    L("a", "replied", { history: [{ status: "contacted", at: ago(10) }, { status: "replied", at: ago(5) }] }),
    L("a", "won", { kind: "dead", history: [{ status: "contacted", at: ago(40) }, { status: "replied", at: ago(20) }, { status: "won", at: ago(2) }] }),
    // Replied, then the owner skipped it: still a reply in the funnel.
    L("b", "skipped", { kind: "site", history: [{ status: "contacted", at: ago(3) }, { status: "replied", at: ago(2) }, { status: "skipped", at: ago(1) }] }),
    L("b", "new", { priority: "review" }),
  ];
  const a = salesAnalytics(leads, campaigns, NOW);
  assert.deepEqual([a.total.leads, a.total.hot, a.total.contacted, a.total.replied, a.total.won, a.total.replyRate], [5, 4, 4, 3, 1, 75]);
  assert.equal(reached(leads[3]), 3);
  assert.deepEqual(a.byCampaign.map(r => [r.label, r.contacted, r.replied, r.won, r.replyRate]), [["стоматологія · Дніпро", 3, 2, 1, 67], ["готель · Одеса", 1, 1, 0, 100]]);
  assert.ok(!a.byCampaign.some(r => r.key === "c"), "empty searches are hidden");
  assert.deepEqual(a.byKind.map(r => [r.key, r.replyRate]), [["dead", 100], ["site", 100], ["no-site", 50]]);
  assert.deepEqual(a.activity, { contacted7: 2, replied7: 2, won7: 1, contacted30: 3, replied30: 3, won30: 1 });
});

test("reminders: written 3+ days ago and still no reply, oldest first; other statuses and unknown dates are skipped", () => {
  const leads = [
    { ...L("a", "contacted", { statusAt: ago(2) }), name: "fresh" },
    { ...L("a", "contacted", { statusAt: ago(4) }), name: "four" },
    { ...L("a", "contacted", { statusAt: ago(9) }), name: "nine" },
    { ...L("a", "replied", { statusAt: ago(9) }), name: "answered" },
    { ...L("a", "contacted"), name: "old status, no date" },
  ];
  assert.deepEqual(reminders(leads, NOW).map(l => [l.name, l.daysSince]), [["nine", 9], ["four", 4]]);
  assert.equal(salesAnalytics(leads, campaigns, NOW).waiting, 2);
});

test("no leads, no division by zero", () => {
  const a = salesAnalytics([], campaigns, NOW);
  assert.equal(a.total.replyRate, null);
  assert.deepEqual(a.byCampaign, []);
});
