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
  Star,
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
  Wifi,
  WifiOff,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  scoreLead,
  getScoreColor,
  LeadScore,
  LeadBusiness,
} from "@/lib/scoring";

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

  const [leads, setLeads] = useState<LeadBusiness[]>([]);
  const [filterScore, setFilterScore] = useState<LeadScore | "ALL">("ALL");
  const [sortField, setSortField] = useState<string>("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const handleExport = useCallback(
    async (format: "excel" | "csv") => {
      const resp = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leads, format }),
      });

      if (!resp.ok) {
        alert("Export failed");
        return;
      }

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        format === "excel" ? "leads_output.xlsx" : "leads_output.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    [leads]
  );

  const handleSearch = useCallback(async () => {
    if (!city || !query) {
      setErrorMessage("Заповніть місто та нішу");
      return;
    }

    setErrorMessage("");
    setLeads([]);
    setPhase("searching");
    setProgress(0);
    setProgressLabel("Пошук бізнесів у OpenStreetMap...");

    try {
      // Phase 1: Search
      const searchResp = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city,
          query,
          maxResults: parseInt(maxResults) || 20,
          radius: parseInt(radius) || 15,
        }),
      });

      const searchData = await searchResp.json();

      if (!searchResp.ok) {
        throw new Error(searchData.error || "Помилка пошуку");
      }

      const businesses: Array<{
        name: string;
        phone: string;
        website: string;
        address: string;
        rating: number | null;
        reviews: number;
      }> = searchData.businesses || [];

      setSearchSource(searchData.source || "OpenStreetMap");

      if (businesses.length === 0) {
        setPhase("done");
        setProgressLabel("Нічого не знайдено. Спробуйте інше місто або ключове слово.");
        return;
      }

      setPhase("analyzing");

      // Phase 2: Analyze each website
      const analyzedLeads: LeadBusiness[] = [];

      for (let i = 0; i < businesses.length; i++) {
        const biz = businesses[i];
        setProgressLabel(
          `Аналіз: ${biz.name} (${i + 1}/${businesses.length})`
        );
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
              const analysisData = await analyzeResp.json();
              copyrightYear = analysisData.copyrightYear;
              isMobileFriendly = analysisData.isMobileFriendly;
            }
          } catch {
            // skip
          }
        }

        const score = scoreLead(biz.website, copyrightYear, isMobileFriendly);

        analyzedLeads.push({
          name: biz.name,
          phone: biz.phone,
          website: biz.website,
          address: biz.address,
          rating: biz.rating,
          reviews: biz.reviews,
          copyrightYear,
          isMobileFriendly,
          score,
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

  // Filtering & sorting
  const filteredLeads = leads
    .filter((l) => filterScore === "ALL" || l.score === filterScore)
    .sort((a, b) => {
      const order = sortDir === "asc" ? 1 : -1;
      const scoreOrder: Record<LeadScore, number> = { HOT: 0, WARM: 1, COLD: 2 };
      if (sortField === "score") return (scoreOrder[a.score] - scoreOrder[b.score]) * order;
      if (sortField === "name") return a.name.localeCompare(b.name) * order;
      if (sortField === "rating") return ((a.rating || 0) - (b.rating || 0)) * order;
      if (sortField === "reviews") return (a.reviews - b.reviews) * order;
      return 0;
    });

  // Summary stats
  const hotCount = leads.filter((l) => l.score === "HOT").length;
  const warmCount = leads.filter((l) => l.score === "WARM").length;
  const coldCount = leads.filter((l) => l.score === "COLD").length;
  const noWebsiteCount = leads.filter((l) => l.website === "N/A").length;
  const mobileFriendlyCount = leads.filter((l) => l.isMobileFriendly).length;

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return null;
    return sortDir === "asc" ? (
      <ChevronUp className="inline w-3 h-3 ml-1" />
    ) : (
      <ChevronDown className="inline w-3 h-3 ml-1" />
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      {/* Header */}
      <header className="border-b bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg">
              <Target className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Lead Finder</h1>
              <p className="text-xs text-muted-foreground">
                Безкоштовний пошук лідів • Без API ключів
              </p>
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Search Form */}
        <Card className="shadow-lg border-0">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <MapPinned className="w-5 h-5" />
              Пошук лідів
              <Badge variant="secondary" className="ml-2 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                <Wifi className="w-3 h-3 mr-1" />
                Без API ключа
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">
                  🏙️ Місто
                </label>
                <Input
                  placeholder="Київ, New York, London..."
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  disabled={phase === "searching" || phase === "analyzing"}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">
                  🎯 Ніша / Ключове слово
                </label>
                <Input
                  placeholder="ресторан, dentist, plumber..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  disabled={phase === "searching" || phase === "analyzing"}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">
                  📊 Макс. результатів
                </label>
                <Select
                  value={maxResults}
                  onValueChange={setMaxResults}
                  disabled={phase === "searching" || phase === "analyzing"}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="30">30</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">
                  📍 Радіус (км)
                </label>
                <Select
                  value={radius}
                  onValueChange={setRadius}
                  disabled={phase === "searching" || phase === "analyzing"}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5 км</SelectItem>
                    <SelectItem value="10">10 км</SelectItem>
                    <SelectItem value="15">15 км</SelectItem>
                    <SelectItem value="25">25 км</SelectItem>
                    <SelectItem value="50">50 км</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Quick keyword hints */}
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="text-xs text-muted-foreground">Швидкий вибір:</span>
              {[
                "ресторан", "dentist", "plumber", "юрист", "кафе",
                "пекарня", "салон", "auto", "electronician",
              ].map((kw) => (
                <button
                  key={kw}
                  onClick={() => setQuery(kw)}
                  disabled={phase === "searching" || phase === "analyzing"}
                  className="text-xs px-2 py-0.5 rounded-full border border-border hover:bg-accent disabled:opacity-50 transition-colors"
                >
                  {kw}
                </button>
              ))}
            </div>

            {errorMessage && (
              <div className="mt-4 flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {errorMessage}
              </div>
            )}

            <div className="mt-5 flex items-center gap-3">
              <Button
                onClick={handleSearch}
                disabled={
                  phase === "searching" ||
                  phase === "analyzing" ||
                  !city ||
                  !query
                }
                className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-lg"
                size="lg"
              >
                {phase === "searching" || phase === "analyzing" ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Search className="w-4 h-4 mr-2" />
                )}
                {phase === "searching"
                  ? "Пошук..."
                  : phase === "analyzing"
                    ? "Аналіз сайтів..."
                    : "Знайти ліди"}
              </Button>
              {(phase === "searching" || phase === "analyzing") && (
                <span className="text-sm text-muted-foreground animate-pulse">
                  {progressLabel}
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Progress */}
        {(phase === "searching" || phase === "analyzing") && (
          <Card className="shadow-md border-0">
            <CardContent className="py-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">{progressLabel}</span>
                <span className="text-sm text-muted-foreground">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2.5" />
            </CardContent>
          </Card>
        )}

        {/* Summary Stats */}
        {leads.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard
              label="Всього"
              value={leads.length}
              className="bg-slate-100 dark:bg-slate-800"
            />
            <StatCard
              label="HOT"
              value={hotCount}
              className="bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400"
              icon={<Flame className="w-4 h-4" />}
            />
            <StatCard
              label="WARM"
              value={warmCount}
              className="bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-400"
              icon={<Zap className="w-4 h-4" />}
            />
            <StatCard
              label="COLD"
              value={coldCount}
              className="bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400"
              icon={<Snowflake className="w-4 h-4" />}
            />
            <StatCard
              label="Без сайту"
              value={noWebsiteCount}
              className="bg-slate-100 dark:bg-slate-800"
              icon={<WifiOff className="w-4 h-4" />}
            />
            <StatCard
              label="Mobile OK"
              value={mobileFriendlyCount}
              className="bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400"
              icon={<Smartphone className="w-4 h-4" />}
            />
          </div>
        )}

        {/* Filter + Sort Bar */}
        {leads.length > 0 && (phase === "done" || phase === "analyzing") && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted-foreground font-medium">
              Фільтр:
            </span>
            {(["ALL", "HOT", "WARM", "COLD"] as const).map((s) => (
              <Button
                key={s}
                variant={filterScore === s ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterScore(s)}
                className={
                  filterScore === s && s !== "ALL"
                    ? s === "HOT"
                      ? "bg-red-600 hover:bg-red-700 text-white"
                      : s === "WARM"
                        ? "bg-yellow-500 hover:bg-yellow-600 text-black"
                        : "bg-green-600 hover:bg-green-700 text-white"
                    : ""
                }
              >
                {s === "ALL"
                  ? "Всі"
                  : s === "HOT"
                    ? "🔥 HOT"
                    : s === "WARM"
                      ? "⚡ WARM"
                      : "❄️ COLD"}
              </Button>
            ))}
            <div className="flex items-center gap-1 ml-auto">
              <Badge variant="outline" className="text-xs">
                <MapPinned className="w-3 h-3 mr-1" />
                {searchSource}
              </Badge>
              <span className="text-sm text-muted-foreground ml-2">
                {filteredLeads.length}/{leads.length}
              </span>
            </div>
          </div>
        )}

        {/* Results Table */}
        {leads.length > 0 && (
          <Card className="shadow-lg border-0 overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800">
                    <TableRow>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead
                        className="cursor-pointer select-none"
                        onClick={() => handleSort("name")}
                      >
                        Назва <SortIcon field="name" />
                      </TableHead>
                      <TableHead className="hidden md:table-cell">
                        Телефон
                      </TableHead>
                      <TableHead className="hidden lg:table-cell">
                        Сайт
                      </TableHead>
                      <TableHead className="hidden xl:table-cell">
                        Адреса
                      </TableHead>
                      <TableHead
                        className="cursor-pointer select-none"
                        onClick={() => handleSort("rating")}
                      >
                        Рейтинг <SortIcon field="rating" />
                      </TableHead>
                      <TableHead
                        className="cursor-pointer select-none"
                        onClick={() => handleSort("reviews")}
                      >
                        Відгуки <SortIcon field="reviews" />
                      </TableHead>
                      <TableHead className="hidden sm:table-cell">Рік</TableHead>
                      <TableHead className="hidden sm:table-cell">
                        Mobile
                      </TableHead>
                      <TableHead
                        className="cursor-pointer select-none"
                        onClick={() => handleSort("score")}
                      >
                        Score <SortIcon field="score" />
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLeads.map((lead, idx) => {
                      const scoreInfo = getScoreColor(lead.score);
                      return (
                        <TableRow
                          key={`${lead.name}-${idx}`}
                          className={`${scoreInfo.bg} hover:opacity-90 transition-opacity`}
                        >
                          <TableCell className="font-medium text-muted-foreground">
                            {idx + 1}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium max-w-[200px] truncate">
                              {lead.name}
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <div className="flex items-center gap-1.5 text-sm">
                              <Phone className="w-3 h-3 text-muted-foreground shrink-0" />
                              <span className="truncate max-w-[140px]">
                                {lead.phone}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            {lead.website !== "N/A" ? (
                              <a
                                href={
                                  lead.website.startsWith("http")
                                    ? lead.website
                                    : `https://${lead.website}`
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 truncate max-w-[200px]"
                              >
                                <Globe className="w-3 h-3 shrink-0" />
                                {lead.website
                                  .replace(/^https?:\/\//, "")
                                  .replace(/\/$/, "")}
                                <ExternalLink className="w-3 h-3 shrink-0 opacity-50" />
                              </a>
                            ) : (
                              <span className="text-sm text-muted-foreground italic">
                                Немає
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="hidden xl:table-cell">
                            <div className="flex items-center gap-1.5 text-sm text-muted-foreground max-w-[250px] truncate">
                              <MapPin className="w-3 h-3 shrink-0" />
                              {lead.address}
                            </div>
                          </TableCell>
                          <TableCell>
                            {lead.rating ? (
                              <div className="flex items-center gap-1">
                                <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                                <span className="text-sm font-medium">
                                  {lead.rating}
                                </span>
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">
                                —
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">{lead.reviews}</span>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <span className="text-sm">
                              {lead.copyrightYear || "—"}
                            </span>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            {lead.isMobileFriendly ? (
                              <Badge
                                variant="secondary"
                                className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                              >
                                <Smartphone className="w-3 h-3 mr-1" />
                                Yes
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-muted-foreground"
                              >
                                No
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={`${scoreInfo.bg} ${scoreInfo.text} ${scoreInfo.border} font-bold`}
                            >
                              {scoreInfo.emoji} {scoreInfo.label}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {phase === "idle" && (
          <div className="text-center py-20 space-y-6">
            <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-950/40 dark:to-teal-950/40 flex items-center justify-center">
              <Target className="w-10 h-10 text-emerald-500" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold">
                Знайдіть ідеальних клієнтів
              </h2>
              <p className="text-muted-foreground max-w-lg mx-auto">
                Повністю <strong>безкоштовно</strong>, без Google API ключів.
                Використовує OpenStreetMap для пошуку бізнесів у будь-якому
                місті світу, аналізує сайти та оцінює кожен лід.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row justify-center gap-6 pt-2">
              <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-card border">
                <div className="w-12 h-12 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                  <MapPinned className="w-6 h-6 text-emerald-600" />
                </div>
                <span className="text-sm font-medium">OpenStreetMap</span>
                <span className="text-xs text-muted-foreground">
                  Безкоштовна база даних
                </span>
              </div>
              <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-card border">
                <div className="w-12 h-12 rounded-lg bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center">
                  <Globe className="w-6 h-6 text-orange-600" />
                </div>
                <span className="text-sm font-medium">Аналіз сайтів</span>
                <span className="text-xs text-muted-foreground">
                  Вік + мобільність
                </span>
              </div>
              <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-card border">
                <div className="w-12 h-12 rounded-lg bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
                  <Flame className="w-6 h-6 text-red-600" />
                </div>
                <span className="text-sm font-medium">Скоринг лідів</span>
                <span className="text-xs text-muted-foreground">
                  HOT / WARM / COLD
                </span>
              </div>
            </div>
            <div className="flex flex-wrap justify-center gap-4 pt-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="w-3 h-3 rounded-full bg-red-500" />
                <span className="text-muted-foreground">
                  HOT — найкращі prospects
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="w-3 h-3 rounded-full bg-yellow-500" />
                <span className="text-muted-foreground">
                  WARM — потенційні клієнти
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="w-3 h-3 rounded-full bg-green-500" />
                <span className="text-muted-foreground">
                  COLD — сучасний сайт
                </span>
              </div>
            </div>
          </div>
        )}

        {phase === "done" && leads.length === 0 && (
          <div className="text-center py-20">
            <p className="text-muted-foreground">
              Нічого не знайдено. Спробуйте інше місто, ключове слово або
              збільшити радіус.
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 text-center text-sm text-muted-foreground">
          Lead Finder — Безкоштовний генератор лідів з OpenStreetMap • Deploy on
          Vercel
        </div>
      </footer>
    </div>
  );
}

function StatCard({
  label,
  value,
  className = "",
  icon,
}: {
  label: string;
  value: number;
  className?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-xl p-4 flex flex-col items-center justify-center gap-1 ${className}`}
    >
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-xs font-medium opacity-70">{label}</span>
      </div>
      <span className="text-2xl font-bold">{value}</span>
    </div>
  );
}
