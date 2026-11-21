"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Activity, ArrowUpRight, CalendarClock, Check, ChevronDown, BarChart3, CircleHelp, ClipboardList, Copy, Download, FileText, Mail, PenLine, UserRound, ExternalLink, KeyRound, ListFilter, LoaderCircle, MapPin, Pause, Play, Plus, Radar, RefreshCw, Search, Trash2, X } from "lucide-react";
import { COUNTRIES, citiesForCountry, nicheChipsForCountry } from "@/lib/countries";
import { salesAnalytics } from "@/lib/analytics";
import "./workspace.css";

const services = { website: "Сайт для бізнесу", booking: "Онлайн-запис" };
const cadences = { manual: "Вручну", daily: "Щодня", weekly: "Щотижня" };
const phases = { queued: "У черзі", discovering: "Шукаємо компанії", checking: "Перевіряємо сайти", done: "Завершено", retry: "Очікує повтору", error: "Потрібна увага" };
const priorities = { high: "Високий пріоритет", review: "Варто уточнити", low: "Низький пріоритет" };
const confidenceNames = { verified: "Підтверджено", partial: "Частково підтверджено", unknown: "Бракує даних" };
const statuses = { new: "Нова", in_progress: "У роботі", contacted: "Звернувся", replied: "Відповіли", won: "Є угода", skipped: "Пропущено" };

type Service = keyof typeof services;
type Cadence = keyof typeof cadences;
type Phase = keyof typeof phases;
type Priority = keyof typeof priorities;
type Confidence = keyof typeof confidenceNames;
type Status = keyof typeof statuses;
type Campaign = {
  id: string; city: string; country: string; query: string; radius: number; service: Service; cadence: Cadence;
  paused: boolean; phase: Phase; updatedAt: string; nextAt: string | null; checked: number; total: number; message: string; source?: string; sourceNote?: string; sourceDate?: string | null;
};
type Lead = {
  id: string; campaignId: string; name: string; website: string; phone: string; email: string; address: string;
  osmId: string; status: Status; notes: string; service: Service; priority: Priority; confidence: Confidence; checkedAt: string;
  summary: string; suggestion: string; evidence: { label: string; url: string }[];
  contact: { value: string; source: string; kind: "phone" | "email" | "social" } | null;
  branches?: number; branchAddresses?: string[]; gaps?: { label: string; strong: boolean }[]; shot?: boolean;
  draft?: { subject: string; text: string; source: "claude" | "template"; at: string };
  score?: number; expiry?: { what: "domain" | "ssl"; date: string };
  report?: { token: string; at: string };
  kind?: string; statusAt?: string; history?: { status: string; at: string }[];
};
type Sender = { name: string; phone: string; email: string; telegram: string; site: string };
type Snapshot = { campaigns: Campaign[]; leads: Lead[]; limits: { campaigns: number; perRun: number }; sender?: Sender | null };
type Action = Record<string, unknown>;
const activePhases: Phase[] = ["queued", "discovering", "checking"];

function dateLabel(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "—" : date.toLocaleString("uk-UA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function known(value?: string | null) {
  return value && value.trim() && value !== "N/A" ? value : "";
}

function publicLink(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}

async function api<T>(body?: Action): Promise<T> {
  const response = await fetch("/api/workspace", {
    method: body ? "POST" : "GET", credentials: "same-origin", cache: "no-store",
    ...(body && { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(data?.error || "Кабінет тимчасово недоступний. Спробуйте оновити дані.");
  return data as T;
}

function SearchForm({ onCreate, busy }: { onCreate: (form: Action) => void; busy: boolean }) {
  const [country, setCountry] = useState("ua");
  const [city, setCity] = useState("");
  const [query, setQuery] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!query.trim() || !city.trim()) return;
    const fields = new FormData(event.currentTarget);
    onCreate({ country, city: city.trim(), query: query.trim(), radius: Number(fields.get("radius")), service: fields.get("service"), cadence: fields.get("cadence") });
  }
  return <form className="lf-form" onSubmit={submit}>
    <div className="lf-field-pair">
      <label>Країна<select value={country} onChange={(e) => { setCountry(e.target.value); setCity(""); }}>{COUNTRIES.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
      <label>Радіус<select name="radius" defaultValue="5">{[1, 3, 5, 10, 20, 50].map(r => <option value={r} key={r}>{r} км</option>)}</select></label>
    </div>
    <label>Місто<input list="lf-cities" placeholder="Наприклад, Львів" value={city} maxLength={90} required onChange={e => setCity(e.target.value)} /></label>
    <datalist id="lf-cities">{citiesForCountry(country).map(name => <option key={name} value={name} />)}</datalist>
    <label>Вид бізнесу<input list="lf-niches" placeholder="Наприклад, стоматологія" value={query} maxLength={80} required onChange={e => setQuery(e.target.value)} /></label>
    <datalist id="lf-niches">{nicheChipsForCountry(country, "ua").map(chip => <option key={chip.token} value={chip.label} />)}</datalist>
    <label>Що пропоную<select name="service">{Object.entries(services).map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select></label>
    <label>Повторювати пошук<select name="cadence" defaultValue="manual">{Object.entries(cadences).map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select></label>
    <button className="lf-btn lf-primary" type="submit" disabled={busy || !city.trim() || !query.trim()}><Play size={16} /> Зберегти й запустити</button>
  </form>;
}

function CampaignItem({ item, busy, selected, select, act, setCadence }: { item: Campaign; busy: boolean; selected: boolean; select: () => void; act: (action: string) => void; setCadence: (cadence: Cadence) => void }) {
  const running = [...activePhases, "retry"].includes(item.phase) && !item.paused;
  const nextLabel = item.phase === "retry" ? "Повтор після збою" : activePhases.includes(item.phase) ? "Наступний етап перевірки" : "Наступний пошук";
  const [confirm, setConfirm] = useState(false);
  return <article className={'lf-campaign' + (selected ? ' selected' : '')}>
    <button className="lf-campaign-select" aria-pressed={selected} onClick={select}>
      <strong>{item.query}</strong><span><MapPin size={14} /> {item.city} · {item.radius} км</span>
    </button>
    <div className="lf-campaign-info">
      <div className="lf-inline"><span className={'lf-phase ' + item.phase}>{item.paused ? "На паузі" : phases[item.phase]}</span><select className="lf-cadence" aria-label={"Розклад пошуку " + item.query} value={item.cadence} disabled={busy} onChange={e => setCadence(e.target.value as Cadence)}>{Object.entries(cadences).map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select></div>
      <div>{services[item.service]}</div>
      {item.message && <p>{item.message}</p>}
      {item.total > 0 && <p>Перевірено {item.checked} із {item.total}</p>}
      {item.nextAt && !item.paused && <p>{nextLabel} · {dateLabel(item.nextAt)}</p>}
      {item.source && <details className="lf-source"><summary>Джерело списку <ChevronDown size={13}/></summary>
        <p><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">{item.source}</a></p>
        {/Overture/.test(item.source) && <p><a href="https://docs.overturemaps.org/attribution/" target="_blank" rel="noreferrer">Overture Maps Foundation, CDLA-Permissive-2.0</a></p>}
        {item.sourceNote && <p>{item.sourceNote}</p>}
        {item.sourceDate && <p>Дані станом на {item.sourceDate.slice(0, 10)}</p>}
      </details>}
      <div className="lf-tools">
        <button className="lf-btn lf-small" disabled={busy || running || item.paused} onClick={() => act("run")}><Play /> Запустити</button>
        {item.cadence !== "manual" && <button className="lf-btn lf-small" disabled={busy} onClick={() => act(item.paused ? "resume" : "pause")}>{item.paused ? <Play /> : <Pause />}{item.paused ? "Відновити" : "Пауза"}</button>}
        <button className="lf-icon-btn" aria-label={'Видалити пошук ' + item.query} title="Видалити пошук" disabled={busy} onClick={() => setConfirm(v => !v)}><Trash2 size={15}/></button>
      </div>
      {confirm && <div className="lf-confirm"><p>Видалити цей пошук і його результати?</p><div className="lf-tools"><button className="lf-btn lf-small" disabled={busy} onClick={() => act("delete")}>Так, видалити</button><button className="lf-btn lf-small" onClick={() => setConfirm(false)}>Скасувати</button></div></div>}
    </div>
  </article>;
}

/** Leads checked before scores existed sort by priority until their next check. */
const legacyScore = (l: Lead) => l.score ?? { high: 70, review: 40, low: 15 }[l.priority] ?? 0;

function expiryLabel(e: NonNullable<Lead["expiry"]>) {
  const days = Math.floor((Date.parse(e.date) - Date.now()) / 86_400_000);
  const what = e.what === "domain" ? "Домен" : "SSL-сертифікат";
  const date = new Date(e.date).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" });
  return days < 0 ? "⏳ " + what + " закінчився " + date : "⏳ " + what + " закінчується " + date + " (через " + days + " дн.)";
}

const percent = (v: number | null) => (v === null ? "—" : v + "%");

/** Sales funnel and what works: computed from the statuses you set on the leads. */
function AnalyticsPanel({ data }: { data: Snapshot }) {
  const a = salesAnalytics(data.leads, data.campaigns);
  const t = a.total;
  const stage = (label: string, value: number, hint?: string) => <div className="lf-stat"><strong>{value}</strong><span>{label}</span>{hint && <small>{hint}</small>}</div>;
  return <section className="lf-panel lf-analytics" aria-labelledby="lf-analytics-title">
    <h2 id="lf-analytics-title">Аналітика продажів</h2>
    <div className="lf-stats">
      {stage("лідів", t.leads)}{stage("гарячих", t.hot)}{stage("написав", t.contacted)}
      {stage("відповіли", t.replied, t.contacted ? percent(t.replyRate) + " від написаних" : undefined)}
      {stage("угод", t.won, t.contacted ? percent(Math.round(t.won / t.contacted * 100)) + " від написаних" : undefined)}
    </div>
    <p className="lf-muted">За 7 днів: написав {a.activity.contacted7}, відповіли {a.activity.replied7}, угод {a.activity.won7} · за 30 днів: написав {a.activity.contacted30}, відповіли {a.activity.replied30}, угод {a.activity.won30}{a.waiting ? ` · чекають нагадування: ${a.waiting}` : ""}</p>
    {!t.contacted && <p className="lf-muted">Цифри з'являться, коли почнете ставити статуси «Звернувся», «Відповіли», «Є угода».</p>}
    {a.byCampaign.length > 0 && <div className="lf-table-wrap"><table className="lf-table"><caption>Які пошуки працюють</caption>
      <thead><tr><th>Пошук</th><th>Лідів</th><th>Гарячих</th><th>Написав</th><th>Відповіли</th><th>Угод</th><th>% відповідей</th></tr></thead>
      <tbody>{a.byCampaign.map(r => <tr key={r.key}><td>{r.label}</td><td>{r.leads}</td><td>{r.hot}</td><td>{r.contacted}</td><td>{r.replied}</td><td>{r.won}</td><td>{percent(r.replyRate)}</td></tr>)}</tbody></table></div>}
    {a.byKind.length > 0 && <div className="lf-table-wrap"><table className="lf-table"><caption>З якою причиною звернення відповідають частіше</caption>
      <thead><tr><th>Причина</th><th>Написав</th><th>Відповіли</th><th>Угод</th><th>% відповідей</th></tr></thead>
      <tbody>{a.byKind.map(r => <tr key={r.key}><td>{r.label}</td><td>{r.contacted}</td><td>{r.replied}</td><td>{r.won}</td><td>{percent(r.replyRate)}</td></tr>)}</tbody></table></div>}
  </section>;
}

function daysAgo(iso?: string) {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? Math.floor((Date.now() - t) / 86_400_000) : null;
}

function pointsLabel(n: number) {
  const tail = n % 10, teen = n % 100 >= 11 && n % 100 <= 14;
  return n + (teen || tail === 0 || tail >= 5 ? " точок" : tail === 1 ? " точка" : " точки");
}

/** One-click manual lookups for companies the map has no contact for (automated Google search is not allowed). */
function lookupLinks(lead: Lead, city?: string) {
  const place = [known(lead.address), city].filter(Boolean).join(", ");
  return {
    google: "https://www.google.com/search?q=" + encodeURIComponent('"' + lead.name + '" ' + (city || "") + " телефон"),
    maps: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(lead.name + (place ? ", " + place : "")),
  };
}

const reportUrl = (lead: Lead) => lead.report ? window.location.origin + "/r/" + lead.report.token : "";

/** Shareable client report: a public snapshot page (no notes or statuses), created and removed on request. */
function ReportBox({ lead, busy, act }: { lead: Lead; busy: boolean; act: (action: "report" | "report-delete") => void }) {
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState(false);
  if (!lead.report) return <div className="lf-report"><button className="lf-btn lf-small" disabled={busy} onClick={() => act("report")}><FileText /> Звіт для клієнта</button></div>;
  const url = reportUrl(lead);
  return <div className="lf-report">
    <p><strong>Звіт для клієнта:</strong> <a href={url} target="_blank" rel="noreferrer">{url.replace(/^https?:\/\//, "")} <ExternalLink size={13} /></a></p>
    <div className="lf-tools">
      <button className="lf-btn lf-small" onClick={async () => { try { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { /* the link stays selectable */ } }}>{copied ? <Check /> : <Copy />}{copied ? "Скопійовано" : "Копіювати посилання"}</button>
      <button className="lf-btn lf-small" disabled={busy} onClick={() => act("report")} title="Створити новий звіт з останньої перевірки (старе посилання перестане працювати)"><RefreshCw /> Оновити</button>
      <button className="lf-btn lf-small" disabled={busy} onClick={() => { if (confirm) { setConfirm(false); act("report-delete"); } else setConfirm(true); }}><Trash2 />{confirm ? "Так, видалити" : "Видалити"}</button>
    </div>
    <p className="lf-draft-hint">Посилання бачить кожен, кому ви його надішлете. Нотатки, статуси й оцінка в звіт не потрапляють.</p>
  </div>;
}

/** Offer letter: drafted on request, edited and sent by a person (never sent automatically). */
function DraftBox({ lead, busy, drafting, write }: { lead: Lead; busy: boolean; drafting: boolean; write: () => void }) {
  const [text, setText] = useState(lead.draft?.text || "");
  const [copied, setCopied] = useState(false);
  useEffect(() => { setText(lead.draft?.text || ""); }, [lead.draft?.text]);
  if (drafting) return <div className="lf-draft"><p className="lf-draft-wait"><LoaderCircle className="animate-spin" size={15}/> Claude пише лист… це 5–30 секунд.</p></div>;
  if (!lead.draft) return <div className="lf-draft"><button className="lf-btn lf-small" disabled={busy} onClick={write}><PenLine /> Написати пропозицію</button></div>;
  const email = known(lead.email);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked: the text stays selectable */ }
  };
  return <details className="lf-draft" open>
    <summary>Лист-пропозиція{lead.draft.source === "template" ? " (шаблон)" : ""} <ChevronDown size={15}/></summary>
    {lead.draft.subject && <p className="lf-draft-subject"><strong>Тема:</strong> {lead.draft.subject}</p>}
    <label><span className="sr-only">Текст пропозиції для {lead.name}</span><textarea value={text} maxLength={3000} rows={9} onChange={e => setText(e.target.value)} /></label>
    <p className="lf-draft-hint">Перечитайте, підставте своє ім'я й телефон і надішліть самі.{lead.draft.source === "template" ? " Claude зараз недоступний, тому це шаблон." : ""}</p>
    <div className="lf-tools">
      <button className="lf-btn lf-small" onClick={() => void copy()}>{copied ? <Check /> : <Copy />}{copied ? "Скопійовано" : "Копіювати"}</button>
      {email && <a className="lf-btn lf-small" href={"mailto:" + encodeURIComponent(email) + "?subject=" + encodeURIComponent(lead.draft.subject || "") + "&body=" + encodeURIComponent(text)}><Mail /> Відкрити в пошті</a>}
      {lead.report && !text.includes(reportUrl(lead)) && <button className="lf-btn lf-small" onClick={() => setText(t => t.replace(/\s*$/, "") + "\n\nКороткий аудит вашого сайту: " + reportUrl(lead))}><FileText /> Додати посилання на звіт</button>}
      <button className="lf-btn lf-small" disabled={busy} onClick={write}><RefreshCw /> Написати інакше</button>
    </div>
  </details>;
}

function LeadCard({ lead, campaign, busy, drafting, save, write, reportAct }: { lead: Lead; campaign?: Campaign; busy: boolean; drafting: boolean; save: (status: Status, notes?: string) => void; write: () => void; reportAct: (action: "report" | "report-delete") => void }) {
  const [notes, setNotes] = useState(lead.notes || "");
  useEffect(() => { setNotes(lead.notes || ""); }, [lead.notes]);
  const rawSite = known(lead.website);
  const website = publicLink(rawSite) || (/^[\da-z.-]+\.[a-z]{2,}(?:[/?#]|$)/i.test(rawSite) ? publicLink("https://" + rawSite) : undefined);
  const source = publicLink(lead.contact?.source);
  const osm = /^(node|way|relation)\/\d+$/.test(lead.osmId) ? "https://www.openstreetmap.org/" + lead.osmId
    : publicLink(lead.evidence.find(e => e.label.startsWith("Місце на карті"))?.url);
  return <article className="lf-lead">
    <div className="lf-lead-head"><span className={'lf-priority ' + lead.priority}>{priorities[lead.priority]}</span>
      {typeof lead.score === "number" && <span className={"lf-score " + (lead.score >= 75 ? "hot" : lead.score >= 50 ? "warm" : "cold")} title="Наскільки перспективний лід: причина звернутися, впевненість перевірки й наявність контакту">{lead.score}<small>/100</small></span>}
      <time dateTime={lead.checkedAt}>{dateLabel(lead.checkedAt)}</time></div>
    {lead.expiry && <div className="lf-expiry">{expiryLabel(lead.expiry)}</div>}
    {lead.status === "contacted" && (daysAgo(lead.statusAt) ?? 0) >= 3 && <div className="lf-remind">🔔 Написали {daysAgo(lead.statusAt)} дн. тому, відповіді ще немає — час нагадати про себе.</div>}
    <h3>{lead.name}</h3>
    <div className="lf-place"><MapPin size={15} /> {known(lead.address) || campaign?.city || "Адресу не вказано"}</div>
    {(lead.branches || 1) > 1 && <div className="lf-branches">Мережа · {pointsLabel(lead.branches || 1)} у радіусі пошуку</div>}
    <p className="lf-summary">{lead.summary}</p>
    {!!lead.gaps?.length && <div className="lf-gaps"><strong>Чого не вистачає на сайті</strong><ul>{lead.gaps.map((g, i) => <li key={i} className={g.strong ? "strong" : undefined}>{g.label}</li>)}</ul></div>}
    {lead.shot && (() => { const src = "/api/workspace?shot=" + encodeURIComponent(lead.id); return <details className="lf-shot"><summary>Як сайт виглядає на телефоні <ChevronDown size={15} /></summary>
      <a href={src} target="_blank" rel="noreferrer"><img src={src} loading="lazy" alt={"Знімок сайту " + lead.name + " на телефоні"} /></a>
      <p>Знімок з перевірки в браузері — можна показати клієнту.</p>
    </details>; })()}
    {!lead.contact && (() => { const links = lookupLinks(lead, campaign?.city); return <div className="lf-lookup" aria-label="Знайти контакт компанії">
      <a className="lf-btn lf-small" href={links.google} target="_blank" rel="noreferrer"><Search /> Знайти телефон у Google</a>
      <a className="lf-btn lf-small" href={links.maps} target="_blank" rel="noreferrer"><MapPin /> Google Карти</a>
    </div>; })()}
    {lead.suggestion && <p className="lf-suggestion"><strong>{lead.priority === "high" ? "Що запропонувати" : "Наступна дія"}</strong> {lead.suggestion}</p>}
    <ReportBox lead={lead} busy={busy} act={reportAct}/>
    <DraftBox lead={lead} busy={busy} drafting={drafting} write={write}/>
    <details><summary>Докази й контакти <ChevronDown size={15} /></summary>
      <div className="lf-proof"><strong>{confidenceNames[lead.confidence]}</strong>
        {lead.evidence.map((item, i) => <div key={i}>{publicLink(item.url) ? <a href={publicLink(item.url)} target="_blank" rel="noreferrer">{item.label} <ExternalLink size={13}/></a> : item.label}</div>)}
        {!lead.evidence.length && <div>Підтверджених спостережень поки немає.</div>}
        {website && <div><a href={website} target="_blank" rel="noreferrer">Сайт компанії <ExternalLink size={13} /></a></div>}
        {osm && <div><a href={osm} target="_blank" rel="noreferrer">Картка на мапі <ExternalLink size={13}/></a></div>}
        {!!lead.branchAddresses?.length && <div>Інші точки мережі · {lead.branchAddresses.join("; ")}</div>}
        {known(lead.phone) && <div>Телефон · {lead.phone}</div>}
        {known(lead.email) && <div>Пошта · {lead.email}</div>}
        {lead.contact && <div>Контакт для звернення · {lead.contact.kind === "social" && publicLink(lead.contact.value) ? <a href={publicLink(lead.contact.value)} target="_blank" rel="noreferrer">написати в соцмережі ({new URL(lead.contact.value).hostname.replace(/^www\./, "")}) <ExternalLink size={13}/></a> : lead.contact.value} {source && <a href={source} target="_blank" rel="noreferrer">Джерело <ExternalLink size={13}/></a>}</div>}
        {!lead.contact && !known(lead.phone) && !known(lead.email) && <div>Публічний контакт поки не підтверджено.</div>}
      </div>
    </details>
    <div className="lf-status-row"><label>Мій статус<select aria-label={'Статус компанії ' + lead.name} value={lead.status} disabled={busy} onChange={e => save(e.target.value as Status)}>{Object.entries(statuses).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <details className="lf-note"><summary>Нотатка{lead.notes && <Check size={14}/>}</summary><label><span className="sr-only">Нотатка про компанію</span><textarea value={notes} maxLength={1000} onChange={e => setNotes(e.target.value)} /></label><button className="lf-btn lf-small" disabled={busy || notes === (lead.notes || "")} onClick={() => save(lead.status, notes)}>Зберегти нотатку</button></details>
    </div>
  </article>;
}

/** The contacts shown at the end of every client report and used to sign letters. */
function SenderPanel({ sender, busy, save }: { sender?: Sender | null; busy: boolean; save: (s: Sender) => void }) {
  const empty: Sender = { name: "", phone: "", email: "", telegram: "", site: "" };
  const [form, setForm] = useState<Sender>({ ...empty, ...(sender || {}) });
  useEffect(() => { setForm({ ...empty, ...(sender || {}) }); }, [sender?.name, sender?.phone, sender?.email, sender?.telegram, sender?.site]); // eslint-disable-line react-hooks/exhaustive-deps
  const field = (key: keyof Sender, label: string, placeholder: string) =>
    <label key={key}>{label}<input value={form[key]} placeholder={placeholder} maxLength={key === "site" ? 200 : 80} onChange={e => setForm({ ...form, [key]: e.target.value })} /></label>;
  return <details className="lf-access"><summary><UserRound size={15} /> Мої контакти для звітів <ChevronDown size={15} /></summary>
    <p>Їх побачить клієнт унизу звіту, ними ж підписуються листи.</p>
    {field("name", "Ім'я", "Богдан")}{field("phone", "Телефон", "+380…")}{field("telegram", "Telegram", "@username")}{field("email", "Пошта", "name@example.com")}{field("site", "Сайт-портфоліо", "https://…")}
    <button className="lf-btn lf-small" disabled={busy} onClick={() => save(form)}>Зберегти контакти</button>
  </details>;
}

function AccessPanel({ busy, transfer, restore }: { busy: boolean; transfer: () => Promise<string | null>; restore: (code: string) => Promise<boolean> }) {
  const [code, setCode] = useState("");
  const [input, setInput] = useState("");
  const [confirm, setConfirm] = useState(false);
  return <details className="lf-access"><summary><KeyRound size={15} /> Доступ з іншого пристрою <ChevronDown size={15} /></summary>
    <p>Цей браузер має доступ до кабінету. Очищення cookie прибере доступ із цього браузера. Для входу з іншого пристрою отримайте тут одноразовий код і введіть його там протягом 10 хвилин.</p>
    <button className="lf-btn lf-small" disabled={busy} onClick={async () => { const value = await transfer(); if (value) setCode(value); }}>Отримати код</button>
    {code && <p className="lf-code"><code>{code}</code></p>}
    <label>Код з іншого пристрою<input autoComplete="off" value={input} onChange={e => { setInput(e.target.value); setConfirm(false); }} /></label>
    {confirm && <p>Цей браузер відкриє кабінет, з якого отримано код. Збережіть код поточного кабінету, якщо хочете повернутися до нього.</p>}
    <button className="lf-btn lf-small" disabled={busy || !input.trim()} onClick={async () => {
      if (!confirm) { setConfirm(true); return; }
      if (await restore(input.trim())) { setInput(""); setCode(""); setConfirm(false); }
    }}>{confirm ? "Підтвердити вхід" : "Увійти за кодом"}</button>
  </details>;
}

export default function Home() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState("");
  const [priority, setPriority] = useState<Priority | "all">("all");
  const [status, setStatus] = useState<Status | "all">("all");
  const [drafting, setDrafting] = useState("");
  const [showAnalytics, setShowAnalytics] = useState(false);
  const currentRequest = useRef(0);
  const locked = useRef(false);
  const read = useRef(false);

  const refresh = useCallback(async () => {
    if (locked.current || read.current) return;
    read.current = true;
    const id = ++currentRequest.current;
    try {
      const next = await api<Snapshot>();
      if (id === currentRequest.current) { setData(next); setError(""); }
    } catch (e) {
      if (id === currentRequest.current) setError(e instanceof Error ? e.message : "Не вдалося отримати дані.");
    } finally {
      read.current = false;
      if (id === currentRequest.current) setLoading(false);
    }
  }, []);
  const running = data?.campaigns.some(c => !c.paused && activePhases.includes(c.phase));
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, running ? 4000 : 30000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [refresh, running]);

  async function mutate(action: Action) {
    if (locked.current) return false;
    locked.current = true; ++currentRequest.current; setMutating(true); setError("");
    try {
      const next = await api<Snapshot>(action);
      setData(next);
      if (action.action === "create") { setShowForm(false); setSelected(""); setPriority("all"); setStatus("all"); }
      if (action.action === "restore" || (action.action === "delete" && action.id === selected)) setSelected("");
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : "Не вдалося зберегти зміни."); return false; }
    finally { locked.current = false; setMutating(false); setLoading(false); }
  }
  async function transfer() {
    if (locked.current) return null;
    locked.current = true; ++currentRequest.current; setMutating(true); setError("");
    try { return (await api<{ code: string }>({ action: "transfer" })).code; }
    catch (e) { setError(e instanceof Error ? e.message : "Не вдалося отримати код."); return null; }
    finally { locked.current = false; setMutating(false); }
  }
  const campaigns = data?.campaigns ?? [];
  const leads = data?.leads ?? [];
  const scoped = leads.filter(l => !selected || l.campaignId === selected);
  const byStatus = scoped.filter(l => status === "all" || l.status === status);
  const ranks: Record<Priority, number> = { high: 0, review: 1, low: 2 };
  const visible = byStatus.filter(l => priority === "all" || priority === l.priority).sort((a, b) => ranks[a.priority] - ranks[b.priority] || legacyScore(b) - legacyScore(a) || b.checkedAt.localeCompare(a.checkedAt));
  const chosen = campaigns.find(c => c.id === selected);
  const checkingSelection = chosen ? !chosen.paused && activePhases.includes(chosen.phase) : running;
  const formVisible = showForm || !campaigns.length;
  return <div className="lf-app">
    <header className="lf-header"><div className="lf-container lf-head-inner">
      <a href="/" className="lf-brand"><span><Radar size={22} /></span>Lead Finder</a>
      <nav aria-label="Навігація"><a href="/" aria-current="page">Кабінет</a><a href="/manual">Разовий пошук <ArrowUpRight size={14}/></a></nav>
    </div></header>
    <main className="lf-container lf-main">
      <div className="lf-title-row"><div><h1>Пошук клієнтів</h1><p>Задайте нішу та місто. Перевірки продовжаться, коли ви закриєте сайт.</p></div><div className="lf-tools"><button className="lf-btn" aria-pressed={showAnalytics} disabled={!data} onClick={() => setShowAnalytics(v => !v)}><BarChart3 size={15}/> Аналітика</button><button className="lf-btn" disabled={mutating || loading} onClick={() => void refresh()}><RefreshCw size={15}/> Оновити</button></div></div>
      {showAnalytics && data && <AnalyticsPanel data={data}/>}
      <div className="lf-metrics" aria-label="Зведення кабінету">
        <div><span><CalendarClock /> Збережені пошуки</span><strong>{data ? campaigns.length : "—"}</strong></div>
        <div><span><ClipboardList /> Компанії в кабінеті</span><strong>{data ? leads.length : "—"}</strong></div>
        <div><span><Activity /> Високий пріоритет</span><strong>{data ? leads.filter(l => l.priority === "high").length : "—"}</strong></div>
      </div>
      {error && <div className="lf-error" role="alert"><span>{error}</span><button onClick={() => void refresh()}>Повторити</button></div>}
      {leads.length > 0 && <a className="lf-skip" href="#lf-results-title">До списку компаній ({leads.length})</a>}
      <div className="lf-columns">
        <aside className="lf-sidebar"><section className="lf-panel">
          <div className="lf-panel-head"><div><h2>Мої пошуки</h2>{data && <p className="lf-limit">До {data.limits.perRun} компаній за запуск · {campaigns.length}/{data.limits.campaigns} пошуків</p>}</div>{campaigns.length > 0 && <button className="lf-icon-btn" aria-label={showForm ? "Закрити форму пошуку" : "Додати пошук"} title={showForm ? "Закрити" : "Додати пошук"} disabled={!showForm && !!data && campaigns.length >= data.limits.campaigns} onClick={() => setShowForm(!showForm)}>{showForm ? <X size={18}/> : <Plus size={18}/>}</button>}</div>
          {formVisible && <SearchForm onCreate={form => void mutate({ action: "create", ...form })} busy={mutating || !data}/>}
          {campaigns.length > 0 && <div className="lf-campaigns">
            <button className={'lf-all ' + (!selected ? "selected" : "")} onClick={() => setSelected("")} aria-pressed={!selected}>Усі пошуки <span>{campaigns.length}</span></button>
            {campaigns.map(c => <CampaignItem key={c.id} item={c} selected={selected === c.id} select={() => setSelected(c.id)} busy={mutating} act={action => void mutate({ action, id: c.id })} setCadence={cadence => void mutate({ action: "cadence", id: c.id, cadence })} />)}
          </div>}
        </section>{data && <SenderPanel sender={data.sender} busy={mutating} save={sender => void mutate({ action: "settings", sender })}/>}{data && <AccessPanel busy={mutating} transfer={transfer} restore={code => mutate({ action: "restore", code })}/>}</aside>
        <section className="lf-panel lf-results" aria-labelledby="lf-results-title">
          <div className="lf-panel-head"><div><h2 id="lf-results-title">Компанії <span className="lf-count">{scoped.length}</span></h2>{chosen && <p>{chosen.query} · {chosen.city}</p>}</div><a className="lf-btn lf-small" href={"/api/workspace?export=csv" + (selected ? "&campaign=" + encodeURIComponent(selected) : "")} download title="Завантажити таблицю для Excel або Google Таблиць"><Download size={15}/> Таблиця</a><label className="lf-status-filter"><ListFilter size={16}/><span className="sr-only">Фільтр за статусом</span><select value={status} onChange={e => setStatus(e.target.value as Status | "all")}><option value="all">Усі статуси</option>{Object.entries(statuses).map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select></label></div>
          <div className="lf-tabs" aria-label="Пріоритет компаній">{(["all", "high", "review", "low"] as const).map(id => <button key={id} aria-pressed={priority === id} onClick={() => setPriority(id)}>{id === "all" ? "Усі" : id === "high" ? "Високий" : id === "review" ? "Уточнити" : "Низький"} <span>{id === "all" ? byStatus.length : byStatus.filter(l => l.priority === id).length}</span></button>)}</div>
          {visible.length ? <div className="lf-lead-list">{visible.map(l => <LeadCard key={l.id} lead={l} campaign={campaigns.find(c => c.id === l.campaignId)} busy={mutating} drafting={drafting === l.id} write={() => { setDrafting(l.id); void mutate({ action: "draft", id: l.id }).finally(() => setDrafting("")); }} reportAct={action => void mutate({ action, id: l.id })} save={(value, notes) => void mutate({ action: "status", id: l.id, status: value, ...(notes !== undefined && { notes }) })}/>)}</div> :
            <div className="lf-empty" aria-live="polite"><span className="lf-empty-icon">{loading || checkingSelection ? <LoaderCircle className="animate-spin"/> : <Search/>}</span>
              <h3>{loading ? "Відкриваємо кабінет" : !data ? "Не вдалося відкрити кабінет" : scoped.length ? "За цими фільтрами компаній немає" : checkingSelection ? "Пошук триває" : campaigns.length ? "Для цього пошуку ще немає компаній" : "Тут з’являться знайдені компанії"}</h3>
              <p>{loading ? "Завантажуємо збережені пошуки та результати." : !data ? "Спробуйте оновити дані." : scoped.length ? "Змініть пріоритет або статус, щоб побачити інші результати." : checkingSelection ? "Результати з’являтимуться в міру перевірки сайтів." : campaigns.length ? "Стан останньої перевірки вказано в картці пошуку." : "Створіть перший пошук. У кожній картці будуть висновок перевірки, його джерела та статус роботи."}</p>
              {scoped.length > 0 && <button className="lf-btn lf-small" onClick={() => { setPriority("all"); setStatus("all"); }}>Скинути фільтри</button>}
            </div>}
          <details className="lf-ranking"><summary><CircleHelp size={16}/> Як визначається пріоритет <ChevronDown size={15}/></summary><p>Високий пріоритет отримують компанії з підтвердженим контактом і конкретною проблемою, пов’язаною з вашою послугою. Неповні відомості потрапляють на уточнення. Відкрийте «Докази й контакти», щоб перевірити висновок.</p></details>
        </section>
      </div>
    </main><footer className="lf-foot"><div className="lf-container">Lead Finder <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a></div></footer>
  </div>;
}
