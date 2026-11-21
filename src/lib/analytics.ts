// Sales analytics from the leads in the cabinet: the funnel, which searches and which kinds of
// leads bring replies, and recent activity. Pure functions so the page and tests share them.

export type AnalyticsLead = {
  campaignId: string; status: string; priority: string; kind?: string; statusAt?: string;
  history?: { status: string; at: string }[];
};
export type AnalyticsCampaign = { id: string; query: string; city: string };

const RANK: Record<string, number> = { new: 0, in_progress: 1, contacted: 2, replied: 3, won: 4 };
/** Furthest stage the lead ever reached (a lead that replied and was later skipped still counts as replied). */
export function reached(l: AnalyticsLead): number {
  const stages = [l.status, ...(l.history || []).map(h => h.status)].map(s => RANK[s] ?? -1);
  return Math.max(...stages, 0);
}

export const KIND_NAMES: Record<string, string> = {
  "no-site": "Немає сайту", social: "Лише соцмережа", dead: "Сайт не працює", closed: "Закритий сайт Google",
  placeholder: "Заглушка замість сайту", site: "Сайт з недоліками", unclear: "Без висновку",
};

type Row = { key: string; label: string; leads: number; hot: number; contacted: number; replied: number; won: number; replyRate: number | null };
const row = (key: string, label: string, leads: AnalyticsLead[]): Row => {
  const contacted = leads.filter(l => reached(l) >= 2).length;
  const replied = leads.filter(l => reached(l) >= 3).length;
  return {
    key, label, leads: leads.length, hot: leads.filter(l => l.priority === "high").length,
    contacted, replied, won: leads.filter(l => reached(l) >= 4).length,
    replyRate: contacted ? Math.round((replied / contacted) * 100) : null,
  };
};

export function salesAnalytics(leads: AnalyticsLead[], campaigns: AnalyticsCampaign[], now = Date.now()) {
  const total = row("all", "Усі", leads);
  const byCampaign = campaigns.map(c => row(c.id, c.query + " · " + c.city, leads.filter(l => l.campaignId === c.id)))
    .filter(r => r.leads).sort((a, b) => b.replied - a.replied || b.hot - a.hot);
  const kinds = [...new Set(leads.map(l => l.kind || "unclear"))];
  const byKind = kinds.map(k => row(k, KIND_NAMES[k] || k, leads.filter(l => (l.kind || "unclear") === k)))
    .filter(r => r.contacted).sort((a, b) => (b.replyRate ?? 0) - (a.replyRate ?? 0));
  // Activity: status changes in the last 7 / 30 days, from the history.
  const events = leads.flatMap(l => l.history || []);
  const since = (days: number, status: string) => events.filter(e => e.status === status && now - Date.parse(e.at) <= days * 86_400_000).length;
  const activity = {
    contacted7: since(7, "contacted"), replied7: since(7, "replied"), won7: since(7, "won"),
    contacted30: since(30, "contacted"), replied30: since(30, "replied"), won30: since(30, "won"),
  };
  return { total, byCampaign, byKind, activity, waiting: reminders(leads, now).length };
}

/** Leads written to 3+ days ago with no reply yet: time for a gentle follow-up. */
export function reminders<T extends AnalyticsLead>(leads: T[], now = Date.now(), days = 3): (T & { daysSince: number })[] {
  return leads
    .filter(l => l.status === "contacted" && l.statusAt && Number.isFinite(Date.parse(l.statusAt)))
    .map(l => ({ ...l, daysSince: Math.floor((now - Date.parse(l.statusAt!)) / 86_400_000) }))
    .filter(l => l.daysSince >= days)
    .sort((a, b) => b.daysSince - a.daysSince);
}
