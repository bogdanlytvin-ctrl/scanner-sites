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
  scoreLead,
  getScoreColor,
  LeadScore,
  LeadBusiness,
} from "@/lib/scoring";

type Phase = "idle" | "searching" | "analyzing" | "done" | "error";

interface SearchBusiness {
  name: string;
  phone: string;
  website: string;
  address: string;
  rating: number | null;
  reviews: number;
  placeId: string;
}

export default function Home() {
  const [apiKey, setApiKey] = useState("");
  const [city, setCity] = useState("");
  const [query, setQuery] = useState("");
  const [maxResults, setMaxResults] = useState("20");

  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

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
      a.download = format === "excel" ? "leads_output.xlsx" : "leads_output.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    [leads]
  );

  const handleSearch = useCallback(async () => {
    if (!apiKey || !city || !query) {
      setErrorMessage("Заповніть всі поля: API ключ, місто та нішу");
      return;
    }

    setErrorMessage("");
    setLeads([]);
    setPhase("searching");
    setProgress(0);
    setProgressLabel("Пошук бізнесів у Google Maps...");

    try {
      // Phase 1: Search Google Maps
      const searchResp = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey,
          city,
          query,
          maxResults: parseInt(maxResults) || 20,
        }),
      });

      const searchData = await searchResp.json();

      if (!searchResp.ok) {
        throw new Error(searchData.error || "Помилка пошуку");
      }

      const businesses: SearchBusiness[] = searchData.businesses || [];
      if (businesses.length === 0) {
        setPhase("done");
        setProgressLabel("Нічого не знайдено");
        return;
      }

      setPhase("analyzing");

      // Phase 2: Analyze each website
      const analyzedLeads: LeadBusiness[] = [];

      for (let i = 0; i < businesses.length; i++) {
        const biz = businesses[i];
        setProgressLabel(`Аналіз сайту: ${biz.name} (${i + 1}/${businesses.length})`);
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
            // Skip analysis error for this business
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

        // Small delay to avoid overwhelming the server
        await new Promise((r) => setTimeout(r, 200));

        // Update leads progressively
        setLeads([...analyzedLeads]);
      }

      setPhase("done");
      setProgress(100);
      setProgressLabel(`Готово! Знайдено ${analyzedLeads.length} лідів`);
    } catch (err) {
      setPhase("error");
      setErrorMessage(
        err instanceof Error ? err.message : "Невідома помилка"
      );
    }
  }, [apiKey, city, query, maxResults]);

  // Filtering & sorting
  const filteredLeads = leads
    .filter((l) => filterScore === "ALL" || l.score === filterScore)
    .sort((a, b) => {
      const order = sortDir === "asc" ? 1 : -1;
      const scoreOrder: Record<LeadScore, number> = { HOT: 0, WARM: 1, COLD: 2 };

      if (sortField === "score") {
        return (scoreOrder[a.score] - scoreOrder[b.score]) * order;
      }
      if (sortField === "rating") {
        return ((a.rating || 0) - (b.rating || 0)) * order;
      }
      if (sortField === "reviews") {
        return (a.reviews - b.reviews) * order;
      }
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
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-lg">
              <Target className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Lead Finder</h1>
              <p className="text-xs text-muted-foreground">
                Google Maps Lead Generator
              </p>
            </div>
          </div>
          {leads.length > 0 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport("csv")}
              >
                <FileText className="w-4 h-4 mr-1" />
                CSV
              </Button>
              <Button
                size="sm"
                onClick={() => handleExport("excel")}
              >
                <FileSpreadsheet className="w-4 h-4 mr-1" />
                Excel
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
              <Search className="w-5 h-5" />
              Пошук лідів
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">
                  Google API Key
                </label>
                <Input
                  type="password"
                  placeholder="AIza..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  disabled={phase === "searching" || phase === "analyzing"}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">
                  Місто
                </label>
                <Input
                  placeholder="Київ, New York..."
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  disabled={phase === "searching" || phase === "analyzing"}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">
                  Ніша / Ключове слово
                </label>
                <Input
                  placeholder="піцерія, dentist..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  disabled={phase === "searching" || phase === "analyzing"}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">
                  Макс. результатів
                </label>
                <Input
                  type="number"
                  min="1"
                  max="60"
                  value={maxResults}
                  onChange={(e) => setMaxResults(e.target.value)}
                  disabled={phase === "searching" || phase === "analyzing"}
                />
              </div>
            </div>

            {errorMessage && (
              <div className="mt-4 flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {errorMessage}
              </div>
            )}

            <div className="mt-4 flex items-center gap-3">
              <Button
                onClick={handleSearch}
                disabled={
                  phase === "searching" ||
                  phase === "analyzing" ||
                  !apiKey ||
                  !city ||
                  !query
                }
                className="bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white shadow-lg"
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
              {phase === "searching" || phase === "analyzing" ? (
                <span className="text-sm text-muted-foreground">
                  {progressLabel}
                </span>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {/* Progress */}
        {(phase === "searching" || phase === "analyzing") && (
          <Card className="shadow-md border-0">
            <CardContent className="py-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">{progressLabel}</span>
                <span className="text-sm text-muted-foreground">
                  {progress}%
                </span>
              </div>
              <Progress value={progress} className="h-2" />
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
              icon={<Globe className="w-4 h-4" />}
            />
            <StatCard
              label="Mobile"
              value={mobileFriendlyCount}
              className="bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400"
              icon={<Smartphone className="w-4 h-4" />}
            />
          </div>
        )}

        {/* Filter + Sort Bar */}
        {leads.length > 0 && phase === "done" && (
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
                {s === "ALL" ? "Всі" : s === "HOT" ? "🔥 HOT" : s === "WARM" ? "⚡ WARM" : "❄️ COLD"}
              </Button>
            ))}
            <span className="text-sm text-muted-foreground ml-auto">
              Показано: {filteredLeads.length} / {leads.length}
            </span>
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
                      <TableHead>Назва</TableHead>
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
                      <TableHead className="hidden sm:table-cell">
                        Рік
                      </TableHead>
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
                          key={idx}
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
                                {lead.website.replace(/^https?:\/\//, "")}
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
                                className="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                              >
                                <Smartphone className="w-3 h-3 mr-1" />
                                So
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground">
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
          <div className="text-center py-20 space-y-4">
            <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-orange-100 to-red-100 dark:from-orange-950/40 dark:to-red-950/40 flex items-center justify-center">
              <Target className="w-10 h-10 text-orange-500" />
            </div>
            <h2 className="text-2xl font-bold">Знайдіть ідеальних клієнтів</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Введіть місто та нішу для пошуку бізнесів у Google Maps.
              Скрипт проаналізує сайти та оцінить кожен лід.
            </p>
            <div className="flex flex-wrap justify-center gap-4 pt-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="w-3 h-3 rounded-full bg-red-500" />
                <span className="text-muted-foreground">HOT — найкращі prospects</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="w-3 h-3 rounded-full bg-yellow-500" />
                <span className="text-muted-foreground">WARM — потенційні клієнти</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="w-3 h-3 rounded-full bg-green-500" />
                <span className="text-muted-foreground">COLD — сучасний сайт</span>
              </div>
            </div>
          </div>
        )}

        {phase === "done" && leads.length === 0 && (
          <div className="text-center py-20">
            <p className="text-muted-foreground">
              Нічого не знайдено. Спробуйте інше місто або нішу.
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 text-center text-sm text-muted-foreground">
          Lead Finder — Google Maps Lead Generator • Deploy on Vercel for free
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
