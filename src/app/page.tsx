"use client";

import { useState, useCallback } from "react";
import {
  Search,
  Download,
  FileSpreadsheet,
  FileText,
  Globe,
  Phone,
  MapPin,
  Smartphone,
  Loader2,
  Zap,
  Flame,
  Snowflake,
  ChevronDown,
  ChevronUp,
  Target,
  AlertCircle,
  MapPinned,
  WifiOff,
  ExternalLink,
  Mail,
  Clock,
  ChevronRight,
  Copy,
  Check,
  MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { scoreLead, getScoreColor, type LeadScore, type LeadBusiness } from "@/lib/scoring";

type Phase = "idle" | "searching" | "analyzing" | "done" | "error";

export default function Home() {
  const [city, setCity] = useState("");
  const [query, setQuery] = useState("");
  const [maxResults, setMaxResults] = useState("20");
  const [radius, setRadius] = useState("15");

  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [searchSource, setSearchSource] = useState("OpenStreetMap");
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const [leads, setLeads] = useState<LeadBusiness[]>([]);
  const [filterScore, setFilterScore] = useState<LeadScore | "ALL">("ALL");
  const [sortField, setSortField] = useState<string>("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

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
      <button
        onClick={(e) => { e.stopPropagation(); copyToClipboard(text, `${label}-${text}`); }}
        className="inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors ml-1"
        title="Копіювати"
      >
        {isCopied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
      </button>
    );
  };

  const handleExport = useCallback(async (format: "excel" | "csv") => {
    const resp = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leads, format }),
    });
    if (!resp.ok) { alert("Export failed"); return; }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = format === "excel" ? "leads_output.xlsx" : "leads_output.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [leads]);

  const handleSearch = useCallback(async () => {
    if (!city || !query) { setErrorMessage("Заповніть місто та нішу"); return; }

    setErrorMessage("");
    setLeads([]);
    setExpandedIdx(null);
    setPhase("searching");
    setProgress(0);
    setProgressLabel("Пошук бізнесів...");

    try {
      const searchResp = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city, query,
          maxResults: parseInt(maxResults) || 20,
          radius: parseInt(radius) || 15,
        }),
      });
      const searchData = await searchResp.json();
      if (!searchResp.ok) throw new Error(searchData.error || "Помилка пошуку");

      const businesses: Array<{
        name: string; phone: string; website: string; address: string;
        email: string; facebook: string; instagram: string; telegram: string;
        openingHours: string; description: string; rating: number | null; reviews: number;
      }> = searchData.businesses || [];

      setSearchSource(searchData.source || "OpenStreetMap");

      if (businesses.length === 0) {
        setPhase("done");
        setProgressLabel("Нічого не знайдено. Спробуйте інше місто або ключове слово.");
        return;
      }

      setPhase("analyzing");
      const analyzedLeads: LeadBusiness[] = [];

      for (let i = 0; i < businesses.length; i++) {
        const biz = businesses[i];
        setProgressLabel(`Аналіз: ${biz.name} (${i + 1}/${businesses.length})`);
        setProgress(Math.round(((i + 1) / businesses.length) * 100));

        let copyrightYear: number | null = null;
        let isMobileFriendly = false;

        if (biz.website && biz.website !== "N/A") {
          try {
            const analyzeResp = await fetch("/api/analyze", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url: biz.website }),
            });
            if (analyzeResp.ok) {
              const ad = await analyzeResp.json();
              copyrightYear = ad.copyrightYear;
              isMobileFriendly = ad.isMobileFriendly;
            }
          } catch { /* skip */ }
        }

        analyzedLeads.push({
          name: biz.name, phone: biz.phone, website: biz.website, address: biz.address,
          email: biz.email, facebook: biz.facebook, instagram: biz.instagram,
          telegram: biz.telegram, openingHours: biz.openingHours, description: biz.description,
          rating: biz.rating, reviews: biz.reviews,
          copyrightYear, isMobileFriendly,
          score: scoreLead(biz.website, copyrightYear, isMobileFriendly),
        });
        await new Promise((r) => setTimeout(r, 200));
        setLeads([...analyzedLeads]);
      }

      setPhase("done");
      setProgress(100);
      setProgressLabel(`Готово! Знайдено ${analyzedLeads.length} лідів`);
    } catch (err) {
      setPhase("error");
      setErrorMessage(err instanceof Error ? err.message : "Невідома помилка");
    }
  }, [city, query, maxResults, radius]);

  const filteredLeads = leads
    .filter((l) => filterScore === "ALL" || l.score === filterScore)
    .sort((a, b) => {
      const order = sortDir === "asc" ? 1 : -1;
      const so: Record<LeadScore, number> = { HOT: 0, WARM: 1, COLD: 2 };
      if (sortField === "score") return (so[a.score] - so[b.score]) * order;
      if (sortField === "name") return a.name.localeCompare(b.name) * order;
      return 0;
    });

  const hotCount = leads.filter((l) => l.score === "HOT").length;
  const warmCount = leads.filter((l) => l.score === "WARM").length;
  const coldCount = leads.filter((l) => l.score === "COLD").length;
  const noWebsite = leads.filter((l) => l.website === "N/A").length;
  const hasContacts = leads.filter((l) => l.phone !== "N/A" || l.email || l.website !== "N/A").length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      {/* Header */}
      <header className="border-b bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg">
              <Target className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Lead Finder</h1>
              <p className="text-xs text-muted-foreground">Безкоштовно • Без API ключів</p>
            </div>
          </div>
          {leads.length > 0 && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => handleExport("csv")}>
                <FileText className="w-4 h-4 mr-1" />
                <span className="hidden sm:inline">CSV</span>
              </Button>
              <Button size="sm" onClick={() => handleExport("excel")}>
                <FileSpreadsheet className="w-4 h-4 mr-1" />
                <span className="hidden sm:inline">Excel</span>
              </Button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Search Form */}
        <Card className="shadow-lg border-0">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground">🏙️ Місто</label>
                <Input placeholder="Kyiv, London, Berlin..." value={city} onChange={(e) => setCity(e.target.value)}
                  disabled={phase === "searching" || phase === "analyzing"}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground">🎯 Ніша</label>
                <Input placeholder="юрист, dentist, restaurant..." value={query} onChange={(e) => setQuery(e.target.value)}
                  disabled={phase === "searching" || phase === "analyzing"}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground">📊 Кількість</label>
                <Select value={maxResults} onValueChange={setMaxResults} disabled={phase === "searching" || phase === "analyzing"}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground">📍 Радіус</label>
                <Select value={radius} onValueChange={setRadius} disabled={phase === "searching" || phase === "analyzing"}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5 км</SelectItem>
                    <SelectItem value="15">15 км</SelectItem>
                    <SelectItem value="25">25 км</SelectItem>
                    <SelectItem value="50">50 км</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Quick picks */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="text-xs text-muted-foreground leading-6">Швидко:</span>
              {["юрист", "ресторан", "dentist", "plumber", "кафе", "beauty", "готель", "gym", "аптека", "супермаркет"].map((kw) => (
                <button key={kw} onClick={() => setQuery(kw)} disabled={phase !== "idle" && phase !== "done" && phase !== "error"}
                  className="text-xs px-2 py-0.5 rounded-full border hover:bg-accent disabled:opacity-50 transition-colors">
                  {kw}
                </button>
              ))}
            </div>

            {errorMessage && (
              <div className="mt-3 flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {errorMessage}
              </div>
            )}

            <div className="mt-4">
              <Button onClick={handleSearch} disabled={(phase === "searching" || phase === "analyzing") || !city || !query}
                className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-lg w-full sm:w-auto">
                {phase === "searching" || phase === "analyzing" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                {phase === "searching" ? "Пошук..." : phase === "analyzing" ? "Аналіз сайтів..." : "Знайти ліди"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Progress */}
        {(phase === "searching" || phase === "analyzing") && (
          <Card className="shadow-md border-0">
            <CardContent className="py-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium">{progressLabel}</span>
                <span className="text-sm text-muted-foreground">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        {leads.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            <MiniStat label="Всього" value={leads.length} />
            <MiniStat label="🔥 HOT" value={hotCount} color="text-red-600" />
            <MiniStat label="⚡ WARM" value={warmCount} color="text-yellow-600" />
            <MiniStat label="❄️ COLD" value={coldCount} color="text-green-600" />
            <MiniStat label="📞 Контакти" value={hasContacts} color="text-blue-600" />
          </div>
        )}

        {/* Filter */}
        {leads.length > 0 && (phase === "done" || phase === "analyzing") && (
          <div className="flex flex-wrap items-center gap-2">
            {(["ALL", "HOT", "WARM", "COLD"] as const).map((s) => (
              <Button key={s} variant={filterScore === s ? "default" : "outline"} size="sm" onClick={() => setFilterScore(s)}
                className={filterScore === s && s !== "ALL"
                  ? s === "HOT" ? "bg-red-600 hover:bg-red-700 text-white"
                    : s === "WARM" ? "bg-yellow-500 hover:bg-yellow-600 text-black"
                      : "bg-green-600 hover:bg-green-700 text-white" : ""}>
                {s === "ALL" ? `Всі (${leads.length})` : s === "HOT" ? `🔥 HOT (${hotCount})` : s === "WARM" ? `⚡ WARM (${warmCount})` : `❄️ COLD (${coldCount})`}
              </Button>
            ))}
            <span className="text-xs text-muted-foreground ml-auto">{filteredLeads.length} з {leads.length}</span>
          </div>
        )}

        {/* Lead Cards */}
        {filteredLeads.map((lead, idx) => {
          const sc = getScoreColor(lead.score);
          const isExpanded = expandedIdx === idx;
          const hasAnyContact = lead.phone !== "N/A" || lead.email || lead.website !== "N/A" || lead.facebook || lead.instagram || lead.telegram;

          return (
            <Card key={`${lead.name}-${idx}`} className={`border-l-4 shadow-sm overflow-hidden transition-all ${sc.border} hover:shadow-md`}>
              {/* Summary row */}
              <button
                onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                className="w-full text-left p-4 flex items-start gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-base truncate max-w-[250px]">{lead.name}</span>
                    <Badge className={`${sc.bg} ${sc.text} ${sc.border} font-bold text-xs`}>
                      {sc.emoji} {sc.label}
                    </Badge>
                  </div>
                  {/* Preview: phone + address */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-sm text-muted-foreground">
                    {lead.phone !== "N/A" && (
                      <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{lead.phone}</span>
                    )}
                    {lead.address !== "N/A" && (
                      <span className="flex items-center gap-1 truncate max-w-[250px]"><MapPin className="w-3.5 h-3.5 shrink-0" />{lead.address}</span>
                    )}
                    {lead.website !== "N/A" && (
                      <span className="flex items-center gap-1 truncate max-w-[180px]"><Globe className="w-3.5 h-3.5 shrink-0" />{lead.website.replace(/^https?:\/\//, "")}</span>
                    )}
                  </div>
                </div>

                {/* Right side: score icon + expand */}
                <div className="flex items-center gap-2 shrink-0">
                  {/* Contact dots */}
                  <div className="hidden sm:flex items-center gap-1">
                    {lead.phone !== "N/A" && <div className="w-2 h-2 rounded-full bg-green-400" title="Є телефон" />}
                    {lead.email && <div className="w-2 h-2 rounded-full bg-blue-400" title="Є email" />}
                    {lead.website !== "N/A" && <div className="w-2 h-2 rounded-full bg-purple-400" title="Є сайт" />}
                    {(lead.facebook || lead.instagram || lead.telegram) && (
                      <div className="w-2 h-2 rounded-full bg-pink-400" title="Є соцмережі" />
                    )}
                    {!hasAnyContact && (
                      <WifiOff className="w-3.5 h-3.5 text-red-400" title="Немає контактів" />
                    )}
                  </div>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </div>
              </button>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="border-t bg-muted/30 px-4 py-4 space-y-3">
                  {/* Contact grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Phone */}
                    <ContactField icon={<Phone className="w-4 h-4" />} label="Телефон" value={lead.phone}
                      copyable={lead.phone !== "N/A"} CopyBtn={CopyBtn} />
                    {/* Email */}
                    <ContactField icon={<Mail className="w-4 h-4" />} label="Email" value={lead.email}
                      copyable={!!lead.email} CopyBtn={CopyBtn} />
                    {/* Website */}
                    <div className="flex items-start gap-2">
                      <Globe className="w-4 h-4 mt-0.5 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-muted-foreground">Сайт</div>
                        {lead.website !== "N/A" ? (
                          <a href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                            target="_blank" rel="noopener noreferrer"
                            className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1 break-all">
                            {lead.website.replace(/^https?:\/\//, "")}
                            <ExternalLink className="w-3 h-3 shrink-0" />
                          </a>
                        ) : (
                          <span className="text-sm text-muted-foreground italic">Немає</span>
                        )}
                      </div>
                    </div>
                    {/* Address */}
                    <ContactField icon={<MapPin className="w-4 h-4" />} label="Адреса" value={lead.address}
                      copyable={lead.address !== "N/A"} CopyBtn={CopyBtn} />
                  </div>

                  {/* Social media */}
                  {(lead.facebook || lead.instagram || lead.telegram) && (
                    <div className="flex flex-wrap gap-2">
                      {lead.facebook && (
                        <a href={lead.facebook.startsWith("http") ? lead.facebook : `https://${lead.facebook}`}
                          target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/60 transition-colors">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                          Facebook <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      {lead.instagram && (
                        <a href={lead.instagram.startsWith("http") ? lead.instagram : `https://${lead.instagram}`}
                          target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-pink-100 text-pink-700 hover:bg-pink-200 dark:bg-pink-900/40 dark:text-pink-300 dark:hover:bg-pink-900/60 transition-colors">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                          Instagram <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      {lead.telegram && (
                        <a href={lead.telegram.startsWith("http") ? lead.telegram : `https://${lead.telegram}`}
                          target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-sky-100 text-sky-700 hover:bg-sky-200 dark:bg-sky-900/40 dark:text-sky-300 dark:hover:bg-sky-900/60 transition-colors">
                          <MessageCircle className="w-4 h-4" />
                          Telegram <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  )}

                  {/* Meta info row */}
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                    {lead.openingHours && (
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{lead.openingHours}</span>
                    )}
                    {lead.copyrightYear && (
                      <span>© {lead.copyrightYear}</span>
                    )}
                    <span>Mobile: {lead.isMobileFriendly ? "✅ Так" : "❌ Ні"}</span>
                    {lead.website !== "N/A" && !lead.copyrightYear && (
                      <span className="italic">Сайт є, але рік не визначено → {lead.score === "HOT" ? "не визначено" : ""}</span>
                    )}
                    {lead.website === "N/A" && (
                      <span className="text-red-500 font-medium">⚠️ Немає сайту — гарний prospect!</span>
                    )}
                  </div>

                  {lead.description && (
                    <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-2">{lead.description}</p>
                  )}
                </div>
              )}
            </Card>
          );
        })}

        {/* Empty state */}
        {phase === "idle" && (
          <div className="text-center py-20 space-y-4">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-950/40 dark:to-teal-950/40 flex items-center justify-center">
              <Target className="w-8 h-8 text-emerald-500" />
            </div>
            <h2 className="text-xl font-bold">Знайдіть ідеальних клієнтів</h2>
            <p className="text-muted-foreground max-w-md mx-auto text-sm">
              Повністю безкоштовно. Введіть місто та нішу — отримайте контакти,
              сайти, соцмережі та оцінку кожного ліда.
            </p>
          </div>
        )}

        {phase === "done" && leads.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">Нічого не знайдено. Спробуйте інші параметри.</div>
        )}
      </main>

      <footer className="border-t mt-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 text-center text-xs text-muted-foreground">
          Lead Finder — Безкоштовний генератор лідів • OpenStreetMap
        </div>
      </footer>
    </div>
  );
}

// ─── Small components ───────────────────────────────────────

function MiniStat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-lg p-2.5 bg-card border text-center">
      <div className={`text-lg font-bold ${color || ""}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
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
        <div className="text-xs text-muted-foreground">{label}</div>
        {value && value !== "N/A" ? (
          <span className="text-sm break-all">{value} {copyable && <CopyBtn text={value} label={label} />}</span>
        ) : (
          <span className="text-sm text-muted-foreground italic">Немає</span>
        )}
      </div>
    </div>
  );
}
