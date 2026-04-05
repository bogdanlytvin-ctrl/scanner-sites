"use client";

import { useState, useCallback } from "react";
import {
  Search, Download, FileSpreadsheet, FileText, Globe, Phone, MapPin,
  Smartphone, Loader2, Target, AlertCircle, MapPinned, ExternalLink,
  Mail, Clock, ChevronDown, ChevronUp, Copy, Check, MessageCircle,
  Shield, ShieldOff, Monitor, MonitorX, Layout, Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  scoreLead, getScoreColor, getDesignColor,
  type LeadScore, type LeadBusiness, type DesignScore,
} from "@/lib/scoring";

type Phase = "idle" | "searching" | "analyzing" | "done" | "error";

// ─── Screenshot URL builder (thum.io — free, no key) ────────
function getScreenshotUrl(url: string): string {
  if (!url || url === "N/A") return "";
  const cleanUrl = url.startsWith("http") ? url : `https://${url}`;
  return `https://image.thum.io/get/width/1280/crop/640/allowJPG/wait/3/${cleanUrl}`;
}

export default function Home() {
  const [city, setCity] = useState("");
  const [query, setQuery] = useState("");
  const [maxResults, setMaxResults] = useState("20");
  const [radius, setRadius] = useState("15");

  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const [leads, setLeads] = useState<LeadBusiness[]>([]);
  const [filterScore, setFilterScore] = useState<LeadScore | "ALL">("ALL");

  const copyToClipboard = useCallback((text: string, field: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
    });
  }, []);

  const CopyBtn = ({ text, label }: { text: string; label: string }) => {
    if (!text) return null;
    const isCopied = copiedField === `${label}-${text}`;
    return (
      <button onClick={(e) => { e.stopPropagation(); copyToClipboard(text, `${label}-${text}`); }}
        className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors ml-1" title="Копіювати">
        {isCopied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
      </button>
    );
  };

  const handleExport = useCallback(async (format: "excel" | "csv") => {
    const resp = await fetch("/api/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leads, format }) });
    if (!resp.ok) { alert("Export failed"); return; }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = format === "excel" ? "leads_output.xlsx" : "leads_output.csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }, [leads]);

  const handleSearch = useCallback(async () => {
    if (!city || !query) { setErrorMessage("Заповніть місто та нішу"); return; }
    setErrorMessage(""); setLeads([]); setExpandedIdx(null);
    setPhase("searching"); setProgress(0); setProgressLabel("Пошук бізнесів...");

    try {
      const searchResp = await fetch("/api/search", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city, query, maxResults: parseInt(maxResults) || 20, radius: parseInt(radius) || 15 }) });
      const searchData = await searchResp.json();
      if (!searchResp.ok) throw new Error(searchData.error || "Помилка");
      const businesses = searchData.businesses || [];
      if (businesses.length === 0) { setPhase("done"); setProgressLabel("Нічого не знайдено."); return; }

      setPhase("analyzing");
      const analyzed: LeadBusiness[] = [];

      for (let i = 0; i < businesses.length; i++) {
        const b = businesses[i];
        setProgressLabel(`Аналіз: ${b.name} (${i + 1}/${businesses.length})`);
        setProgress(Math.round(((i + 1) / businesses.length) * 100));

        let copyrightYear: number | null = null, isMobileFriendly = false, hasSsl = false;
        let finalUrl = "", technologies: string[] = [], designScore: DesignScore = "unknown";
        let designNotes: string[] = [], pageTitle = "", hasContactForm = false;

        if (b.website && b.website !== "N/A") {
          try {
            const r = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: b.website }) });
            if (r.ok) {
              const d = await r.json();
              copyrightYear = d.copyrightYear; isMobileFriendly = d.isMobileFriendly;
              hasSsl = d.hasSsl; finalUrl = d.finalUrl || b.website;
              technologies = d.technologies || []; designScore = d.designScore || "unknown";
              designNotes = d.designNotes || []; pageTitle = d.pageTitle || "";
              hasContactForm = d.hasContactForm || false;
            }
          } catch { /* skip */ }
        }

        analyzed.push({
          name: b.name, phone: b.phone, website: b.website, address: b.address,
          email: b.email, facebook: b.facebook, instagram: b.instagram, telegram: b.telegram,
          openingHours: b.openingHours, description: b.description,
          rating: b.rating, reviews: b.reviews,
          copyrightYear, isMobileFriendly, hasSsl, finalUrl, technologies,
          designScore, designNotes, pageTitle, hasContactForm,
          score: scoreLead(b.website, copyrightYear, isMobileFriendly),
        });
        await new Promise((r) => setTimeout(r, 250));
        setLeads([...analyzed]);
      }
      setPhase("done"); setProgress(100); setProgressLabel(`Готово! ${analyzed.length} лідів`);
    } catch (err) {
      setPhase("error"); setErrorMessage(err instanceof Error ? err.message : "Помилка");
    }
  }, [city, query, maxResults, radius]);

  const filteredLeads = leads
    .filter((l) => filterScore === "ALL" || l.score === filterScore)
    .sort((a, b) => {
      const order: Record<LeadScore, number> = { HOT: 0, WARM: 1, COLD: 2 };
      return (order[a.score] - order[b.score]);
    });

  const hotCount = leads.filter((l) => l.score === "HOT").length;
  const warmCount = leads.filter((l) => l.score === "WARM").length;
  const coldCount = leads.filter((l) => l.score === "COLD").length;
  const ancientCount = leads.filter((l) => l.designScore === "ancient").length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      {/* Header */}
      <header className="border-b bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg">
              <Target className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Lead Finder</h1>
              <p className="text-[10px] text-muted-foreground">Безкоштовно • Скріншоти сайтів • Аналіз дизайну</p>
            </div>
          </div>
          {leads.length > 0 && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => handleExport("csv")}><FileText className="w-4 h-4 mr-1" /><span className="hidden sm:inline">CSV</span></Button>
              <Button size="sm" onClick={() => handleExport("excel")}><FileSpreadsheet className="w-4 h-4 mr-1" /><span className="hidden sm:inline">Excel</span></Button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Search */}
        <Card className="shadow-lg border-0">
          <CardContent className="pt-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">🏙️ Місто</label>
                <Input placeholder="Kyiv, London..." value={city} onChange={(e) => setCity(e.target.value)}
                  disabled={phase === "searching" || phase === "analyzing"} onKeyDown={(e) => e.key === "Enter" && handleSearch()} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">🎯 Ніша</label>
                <Input placeholder="юрист, dentist..." value={query} onChange={(e) => setQuery(e.target.value)}
                  disabled={phase === "searching" || phase === "analyzing"} onKeyDown={(e) => e.key === "Enter" && handleSearch()} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">📊 Кількість</label>
                <Select value={maxResults} onValueChange={setMaxResults} disabled={phase !== "idle" && phase !== "done" && phase !== "error"}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="10">10</SelectItem><SelectItem value="20">20</SelectItem><SelectItem value="50">50</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">📍 Радіус</label>
                <Select value={radius} onValueChange={setRadius} disabled={phase !== "idle" && phase !== "done" && phase !== "error"}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="5">5 км</SelectItem><SelectItem value="15">15 км</SelectItem><SelectItem value="25">25 км</SelectItem><SelectItem value="50">50 км</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5 items-center">
              <span className="text-[10px] text-muted-foreground">Швидко:</span>
              {["юрист", "ресторан", "dentist", "plumber", "кафе", "beauty", "готель", "gym", "аптека"].map((kw) => (
                <button key={kw} onClick={() => setQuery(kw)} disabled={phase !== "idle" && phase !== "done" && phase !== "error"}
                  className="text-[11px] px-1.5 py-0.5 rounded-full border hover:bg-accent disabled:opacity-50 transition-colors">{kw}</button>
              ))}
            </div>
            {errorMessage && (
              <div className="mt-2 flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg p-2.5">
                <AlertCircle className="w-4 h-4 shrink-0" />{errorMessage}
              </div>
            )}
            <div className="mt-3">
              <Button onClick={handleSearch} disabled={(phase === "searching" || phase === "analyzing") || !city || !query}
                className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-lg">
                {phase === "searching" || phase === "analyzing" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                {phase === "searching" ? "Пошук..." : phase === "analyzing" ? "Аналіз сайтів..." : "Знайти ліди"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Progress */}
        {(phase === "searching" || phase === "analyzing") && (
          <Card className="shadow-md border-0"><CardContent className="py-3">
            <div className="flex items-center justify-between mb-1"><span className="text-sm font-medium">{progressLabel}</span><span className="text-sm text-muted-foreground">{progress}%</span></div>
            <Progress value={progress} className="h-2" />
          </CardContent></Card>
        )}

        {/* Stats */}
        {leads.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            <MiniStat label="Всього" value={leads.length} />
            <MiniStat label="🔥 HOT" value={hotCount} color="text-red-600" />
            <MiniStat label="🏚️ Дуже старі" value={ancientCount} color="text-orange-600" />
            <MiniStat label="⚡ WARM" value={warmCount} color="text-yellow-600" />
            <MiniStat label="❄️ COLD" value={coldCount} color="text-green-600" />
          </div>
        )}

        {/* Filters */}
        {leads.length > 0 && (phase === "done" || phase === "analyzing") && (
          <div className="flex flex-wrap items-center gap-2">
            {(["ALL", "HOT", "WARM", "COLD"] as const).map((s) => (
              <Button key={s} variant={filterScore === s ? "default" : "outline"} size="sm" onClick={() => setFilterScore(s)}
                className={filterScore === s && s !== "ALL"
                  ? s === "HOT" ? "bg-red-600 hover:bg-red-700 text-white" : s === "WARM" ? "bg-yellow-500 hover:bg-yellow-600 text-black" : "bg-green-600 hover:bg-green-700 text-white" : ""}>
                {s === "ALL" ? `Всі (${leads.length})` : s === "HOT" ? `🔥 HOT (${hotCount})` : s === "WARM" ? `⚡ WARM (${warmCount})` : `❄️ COLD (${coldCount})`}
              </Button>
            ))}
            <span className="text-xs text-muted-foreground ml-auto">{filteredLeads.length}/{leads.length}</span>
          </div>
        )}

        {/* Lead Cards */}
        {filteredLeads.map((lead, idx) => {
          const sc = getScoreColor(lead.score);
          const dc = getDesignColor(lead.designScore);
          const isExpanded = expandedIdx === idx;
          const screenshotUrl = getScreenshotUrl(lead.finalUrl || lead.website);
          const websiteUrl = (lead.finalUrl || lead.website);

          return (
            <Card key={`${lead.name}-${idx}`} className={`border-l-4 shadow-sm overflow-hidden transition-all ${sc.border} hover:shadow-md`}>
              {/* Header row */}
              <button onClick={() => setExpandedIdx(isExpanded ? null : idx)} className="w-full text-left p-3 sm:p-4 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm sm:text-base truncate max-w-[220px]">{lead.name}</span>
                    <Badge className={`${sc.bg} ${sc.text} ${sc.border} font-bold text-[10px] px-1.5`}>{sc.emoji} {sc.label}</Badge>
                    {lead.website !== "N/A" && (
                      <Badge className={`${dc.bg} ${dc.text} text-[10px] px-1.5`}>{dc.emoji} {dc.label}</Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs sm:text-sm text-muted-foreground">
                    {lead.phone !== "N/A" && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{lead.phone}</span>}
                    {lead.address !== "N/A" && <span className="flex items-center gap-1 truncate max-w-[200px]"><MapPin className="w-3 h-3 shrink-0" />{lead.address}</span>}
                    {lead.website !== "N/A" && <span className="flex items-center gap-1 truncate max-w-[160px]"><Globe className="w-3 h-3 shrink-0" />{lead.website.replace(/^https?:\/\//, "")}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 mt-1">
                  {/* Mini preview thumbnail */}
                  {screenshotUrl && (
                    <div className="hidden sm:block w-16 h-10 rounded overflow-hidden border bg-muted relative">
                      <img src={screenshotUrl} alt="" className="w-full h-full object-cover object-top" loading="lazy" />
                    </div>
                  )}
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </div>
              </button>

              {/* Expanded: full details + screenshot */}
              {isExpanded && (
                <div className="border-t bg-muted/20">
                  {/* Screenshot */}
                  {screenshotUrl && (
                    <div className="p-3 sm:p-4 pb-0">
                      <div className="rounded-xl overflow-hidden border shadow-inner bg-white relative group">
                        <a href={websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`} target="_blank" rel="noopener noreferrer">
                          <img src={screenshotUrl} alt={`Скріншот ${lead.name}`} className="w-full h-auto block" loading="lazy" />
                        </a>
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <a href={websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 bg-black/70 text-white text-xs px-2 py-1 rounded-lg hover:bg-black/90 backdrop-blur-sm">
                            <ExternalLink className="w-3 h-3" /> Відкрити
                          </a>
                        </div>
                        {lead.pageTitle && (
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-3 py-2">
                            <p className="text-white text-xs truncate">{lead.pageTitle}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Design analysis */}
                  {lead.website !== "N/A" && (
                    <div className="px-3 sm:px-4 pt-3">
                      <div className="flex flex-wrap gap-2 mb-2">
                        {lead.technologies.length > 0 && lead.technologies.map((t) => (
                          <Badge key={t} variant="outline" className="text-[10px]"><Layout className="w-3 h-3 mr-1" />{t}</Badge>
                        ))}
                        {lead.hasSsl ? (
                          <Badge variant="outline" className="text-[10px] text-green-600 border-green-300"><Shield className="w-3 h-3 mr-1" />HTTPS</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-red-600 border-red-300"><ShieldOff className="w-3 h-3 mr-1" />No SSL</Badge>
                        )}
                        {lead.isMobileFriendly ? (
                          <Badge variant="outline" className="text-[10px] text-green-600 border-green-300"><Smartphone className="w-3 h-3 mr-1" />Mobile OK</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-red-600 border-red-300"><MonitorX className="w-3 h-3 mr-1" />No Mobile</Badge>
                        )}
                        {lead.hasContactForm && (
                          <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-300"><Mail className="w-3 h-3 mr-1" />Форма</Badge>
                        )}
                      </div>
                      {lead.designNotes.length > 0 && (
                        <div className="space-y-0.5">
                          {lead.designNotes.map((note, ni) => (
                            <p key={ni} className="text-xs text-muted-foreground">{note}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Contacts */}
                  <div className="px-3 sm:px-4 pt-3 pb-3 sm:pb-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <ContactField icon={<Phone className="w-3.5 h-3.5" />} label="Телефон" value={lead.phone} copyable={lead.phone !== "N/A"} CopyBtn={CopyBtn} />
                      <ContactField icon={<Mail className="w-3.5 h-3.5" />} label="Email" value={lead.email} copyable={!!lead.email} CopyBtn={CopyBtn} />
                      <ContactField icon={<MapPin className="w-3.5 h-3.5" />} label="Адреса" value={lead.address} copyable={lead.address !== "N/A"} CopyBtn={CopyBtn} />
                      <div className="flex items-start gap-2">
                        <Globe className="w-3.5 h-3.5 mt-0.5 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <div className="text-[10px] text-muted-foreground">Сайт</div>
                          {lead.website !== "N/A" ? (
                            <a href={websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 flex items-center gap-1 break-all">
                              {websiteUrl.replace(/^https?:\/\//, "")} <ExternalLink className="w-3 h-3 shrink-0" />
                            </a>
                          ) : <span className="text-xs text-red-500 font-medium">⚠️ Немає сайту — топ prospect!</span>}
                        </div>
                      </div>
                    </div>

                    {/* Social */}
                    {(lead.facebook || lead.instagram || lead.telegram) && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {lead.facebook && (
                          <a href={lead.facebook.startsWith("http") ? lead.facebook : `https://${lead.facebook}`} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300">
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>Facebook</a>
                        )}
                        {lead.instagram && (
                          <a href={lead.instagram.startsWith("http") ? lead.instagram : `https://${lead.instagram}`} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg bg-pink-50 text-pink-700 hover:bg-pink-100 dark:bg-pink-900/30 dark:text-pink-300">
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>Instagram</a>
                        )}
                        {lead.telegram && (
                          <a href={lead.telegram.startsWith("http") ? lead.telegram : `https://${lead.telegram}`} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg bg-sky-50 text-sky-700 hover:bg-sky-100 dark:bg-sky-900/30 dark:text-sky-300">
                            <MessageCircle className="w-3.5 h-3.5" />Telegram</a>
                        )}
                      </div>
                    )}

                    {/* Hours */}
                    {lead.openingHours && (
                      <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />{lead.openingHours}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Card>
          );
        })}

        {/* Empty state */}
        {phase === "idle" && (
          <div className="text-center py-16 space-y-3">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-950/40 dark:to-teal-950/40 flex items-center justify-center">
              <Eye className="w-7 h-7 text-emerald-500" />
            </div>
            <h2 className="text-lg font-bold">Знайдіть та перегляньте сайти конкурентів</h2>
            <p className="text-muted-foreground max-w-md mx-auto text-xs">
              Скріншоти сайтів, аналіз дизайну, контакти, соцмережі.
              Все що потрібно для пошуку клієнтів.
            </p>
          </div>
        )}

        {phase === "done" && leads.length === 0 && (
          <div className="text-center py-12 text-sm text-muted-foreground">Нічого не знайдено.</div>
        )}
      </main>

      <footer className="border-t mt-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 text-center text-[10px] text-muted-foreground">
          Lead Finder • Скріншоти через thum.io • OpenStreetMap
        </div>
      </footer>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-lg p-2 bg-card border text-center">
      <div className={`text-base font-bold ${color || ""}`}>{value}</div>
      <div className="text-[9px] text-muted-foreground">{label}</div>
    </div>
  );
}

function ContactField({ icon, label, value, copyable, CopyBtn }: {
  icon: React.ReactNode; label: string; value: string;
  copyable: boolean; CopyBtn: (props: { text: string; label: string }) => React.ReactNode | null;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] text-muted-foreground">{label}</div>
        {value && value !== "N/A" ? (
          <span className="text-xs break-all">{value} {copyable && <CopyBtn text={value} label={label} />}</span>
        ) : <span className="text-xs text-muted-foreground italic">Немає</span>}
      </div>
    </div>
  );
}
