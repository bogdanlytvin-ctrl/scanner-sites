"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Search, FileSpreadsheet, FileText, Globe, Phone, MapPin,
  Smartphone, Loader2, Target, AlertCircle, ExternalLink,
  Mail, Clock, ChevronDown, ChevronUp, Copy, Check, MessageCircle,
  ShieldOff, Monitor, MonitorX, Layout, Eye, DollarSign,
  Filter, StickyNote,
  AlertTriangle, Flame, ShieldCheck, PhoneCall, Send,
  Star, StarOff, Settings, X, History, Trash2, ThumbsUp, ThumbsDown, Bot, Zap, RotateCcw, Gauge,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  getTemplates, fillTemplate, getIssuesText, estimatePrice, getProblemsForLead,
} from "@/lib/outreach-templates";
import {
  getSearchHistory, saveSearchHistory, removeSearchHistoryItem, clearSearchHistory,
  getFavorites, toggleFavorite, isFavorite,
  getTelegramSettings, saveTelegramSettings,
  type SearchHistoryEntry, type TelegramSettings,
} from "@/lib/storage";
import { buildLeadNotificationMessage } from "@/lib/telegram-bot";
import { getTranslations, AVAILABLE_LOCALES, type Locale } from "@/lib/i18n";
import { parseQuery, type ParsedQuery } from "@/lib/query-parser";
import { COUNTRIES, flagEmoji } from "@/lib/countries";
import {
  scoreLead, getScoreColor, getDesignColor, getStatusColor, getStatusList,
  calculateLeadScoreDetailed, getDetailedScoreColor, isWorthContacting,
  type LeadScore, type LeadBusiness, type DesignScore, type LeadStatus, type ScoreBreakdown,
} from "@/lib/scoring";

type Phase = "idle" | "searching" | "analyzing" | "done" | "error";

// ─── PageSpeed types ─────────────────────────────────────
interface PageSpeedResult {
  performanceScore: number | null;
  firstContentfulPaint: number | null;  // ms
  largestContentfulPaint: number | null; // ms
  totalBlockingTime: number | null; // ms
  cumulativeLayoutShift: number | null; // decimal
  speedIndex: number | null; // ms
  diagnostics: string[];
  error?: string;
}

// ─── Safe fetch helper ──────────────────────────────────────
async function safeJsonFetch(url: string, options: RequestInit & { timeoutMs?: number }, errorMsg: string): Promise<any> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs || 30000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const { timeoutMs: _t, ...fetchOpts } = options;

  try {
    const resp = await fetch(url, { ...fetchOpts, signal: controller.signal });
    const contentType = resp.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
      const text = await resp.text().catch(() => "");
      const truncated = text.slice(0, 200);
      throw new Error(`${errorMsg}: сервер повернув HTML замість JSON (${resp.status}). ${truncated}`);
    }

    const data = await resp.json();

    if (!resp.ok) {
      throw new Error(data.error || `${errorMsg} (HTTP ${resp.status})`);
    }

    return data;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`${errorMsg}: таймаут (${timeoutMs / 1000}с). Спробуйте зменшити кількість результатів.`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

function getScreenshotUrl(url: string): string {
  if (!url || url === "N/A") return "";
  const cleanUrl = url.startsWith("http") ? url : `https://${url}`;
  return `https://image.thum.io/get/width/1280/crop/640/allowJPG/wait/3/${cleanUrl}`;
}

function getMobileScreenshotUrl(url: string): string {
  if (!url || url === "N/A") return "";
  const cleanUrl = url.startsWith("http") ? url : `https://${url}`;
  return `https://image.thum.io/get/width/375/crop/812/allowJPG/wait/3/${cleanUrl}`;
}

function formatUrl(url: string): string {
  return url.startsWith("http") ? url : `https://${url}`;
}

function hasIssues(lead: LeadBusiness): boolean {
  if (!lead.website || lead.website === "N/A") return true;
  if (lead.designScore === "ancient") return true;
  if (!lead.isMobileFriendly) return true;
  if (!lead.hasSsl) return true;
  if (lead.technologies.some((t) =>
    ["Joomla", "Drupal", "uCoz", "1C-Bitrix", "Bitrix"].some((ot) =>
      t.toLowerCase().includes(ot.toLowerCase())
    )
  )) return true;
  return false;
}

const QUICK_KEYWORDS = ["юрист", "ресторан", "dentist", "plumber", "кафе", "beauty", "готель", "gym", "аптека"];

export default function Home() {
  const [city, setCity] = useState("");
  const [query, setQuery] = useState("");
  const [maxResults, setMaxResults] = useState("20");
  const [radius, setRadius] = useState("15");

  // Country + city autocomplete. selectedGeoRef holds the exact coords of a
  // picked city so the search skips fuzzy geocoding (which mis-resolved some
  // city names to same-named villages).
  const [country, setCountry] = useState("ua");
  const [cityHits, setCityHits] = useState<Array<{ name: string; displayName: string; lat: number; lng: number; country: string }>>([]);
  const [cityOpen, setCityOpen] = useState(false);
  const [cityLoading, setCityLoading] = useState(false);
  const selectedGeoRef = useRef<{ name: string; lat: number; lng: number; displayName: string } | null>(null);
  const cityDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchCities = useCallback((q: string, cc: string) => {
    if (cityDebounceRef.current) clearTimeout(cityDebounceRef.current);
    if (q.trim().length < 2) { setCityHits([]); setCityOpen(false); return; }
    cityDebounceRef.current = setTimeout(async () => {
      setCityLoading(true);
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}&country=${encodeURIComponent(cc)}`);
        const data = await res.json();
        setCityHits(data.cities || []);
        setCityOpen(true);
      } catch { setCityHits([]); } finally { setCityLoading(false); }
    }, 350);
  }, []);

  const pickCity = useCallback((hit: { name: string; displayName: string; lat: number; lng: number }) => {
    setCity(hit.name);
    selectedGeoRef.current = { name: hit.name, lat: hit.lat, lng: hit.lng, displayName: hit.displayName };
    setCityHits([]); setCityOpen(false);
  }, []);

  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const [leads, setLeads] = useState<LeadBusiness[]>([]);
  const [filterScore, setFilterScore] = useState<LeadScore | "ALL">("ALL");
  const [filterStatus, setFilterStatus] = useState<LeadStatus | "ALL">("ALL");
  const [onlyWithIssues, setOnlyWithIssues] = useState(false);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("formal-email");
  const [previewOpen, setPreviewOpen] = useState<Set<number>>(new Set());

  // Search History
  const [searchHistory, setSearchHistory] = useState<SearchHistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Favorites
  const [favoritesSet, setFavoritesSet] = useState<Set<string>>(new Set());
  const [geoLocations, setGeoLocations] = useState<Array<{ city: string; displayName: string; lat: number; lng: number }>>([]);

  // Telegram Settings
  const [tgSettingsOpen, setTgSettingsOpen] = useState(false);
  const [tgSettings, setTgSettings] = useState<TelegramSettings>({ botToken: "", chatId: "", notifyNewLeads: false, hotLeadsOnly: false });
  const [tgTesting, setTgTesting] = useState(false);

  // i18n — always start with 'ua' to match SSR, load saved locale after hydration
  const [locale, setLocale] = useState<Locale>('ua');

  // Smart Query Parser
  const [smartQuery, setSmartQuery] = useState("");
  const [parsedQuery, setParsedQuery] = useState<ParsedQuery | null>(null);

  // Websites Only filter
  const [onlyWithWebsite, setOnlyWithWebsite] = useState(false);

  // Pagination
  const [visibleCount, setVisibleCount] = useState(20);

  // PageSpeed
  const [pageSpeedResults, setPageSpeedResults] = useState<Record<number, PageSpeedResult>>({});
  const [psBulkChecking, setPsBulkChecking] = useState(false);
  const [psBulkProgress, setPsBulkProgress] = useState(0);
  const [psBulkTotal, setPsBulkTotal] = useState(0);
  const [psSingleChecking, setPsSingleChecking] = useState<number | null>(null);

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load history, favorites, and saved locale on mount (after hydration)
  useEffect(() => {
    setSearchHistory(getSearchHistory());
    const favNames = getFavorites().map((f) => f.name);
    setFavoritesSet(new Set(favNames));
    setTgSettings(getTelegramSettings());
    // Load saved locale after hydration to avoid SSR mismatch
    const savedLocale = localStorage.getItem('leadfinder_locale') as Locale | null;
    if (savedLocale && ['ua', 'en', 'ru'].includes(savedLocale)) {
      setLocale(savedLocale);
    }
  }, []);

  // Persist locale
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('leadfinder_locale', locale);
    }
  }, [locale]);

  // Translations
  const t = getTranslations(locale);

  // Reset visibleCount on filter changes
  useEffect(() => {
    setVisibleCount(20);
  }, [filterScore, filterStatus, onlyWithIssues, onlyFavorites, onlyWithWebsite, leads]);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMsg(null), 2000);
  }, []);

  const copyToClipboard = useCallback((text: string, field: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      showToast("Скопійовано!");
      setTimeout(() => setCopiedField(null), 1500);
    });
  }, [showToast]);

  const CopyBtn = ({ text, label }: { text: string; label: string }) => {
    if (!text) return null;
    const isCopied = copiedField === `${label}-${text}`;
    return (
      <button onClick={(e) => { e.stopPropagation(); copyToClipboard(text, `${label}-${text}`); }}
        className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors ml-1" title={t.copied}>
        {isCopied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
      </button>
    );
  };

  const updateLead = useCallback((idx: number, updates: Partial<LeadBusiness>) => {
    setLeads((prev) => prev.map((l, i) => i === idx ? { ...l, ...updates } : l));
  }, []);

  // ─── Toggle favorite ──────────────────────────────────────
  const handleToggleFavorite = useCallback((lead: LeadBusiness, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const isNowFav = toggleFavorite(lead);
    setFavoritesSet((prev) => {
      const next = new Set(prev);
      if (isNowFav) next.add(lead.name); else next.delete(lead.name);
      return next;
    });
    showToast(isNowFav ? "⭐ Додано в обране" : "Видалено з обраного");
  }, [showToast]);

  // ─── Telegram notification ────────────────────────────────
  const sendTelegramNotification = useCallback(async (lead: LeadBusiness) => {
    if (!tgSettings.notifyNewLeads) return;
    if (tgSettings.hotLeadsOnly && lead.score !== "HOT") return;
    if (!tgSettings.botToken || !tgSettings.chatId) return;

    const worthiness = isWorthContacting(lead);
    const issues = getIssuesText(lead);
    const message = buildLeadNotificationMessage({
      name: lead.name,
      website: lead.website,
      score: lead.score,
      phone: lead.phone,
      address: lead.address,
      issues,
      worthinessScore: worthiness.score,
      worthinessReason: worthiness.reason,
    });

    try {
      await fetch("/api/telegram-notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken: tgSettings.botToken, chatId: tgSettings.chatId, message }),
      });
    } catch { /* silent fail */ }
  }, [tgSettings]);

  // ─── Telegram test ────────────────────────────────────────
  const handleTestTelegram = useCallback(async () => {
    if (!tgSettings.botToken || !tgSettings.chatId) {
      showToast("Вкажіть Bot Token та Chat ID");
      return;
    }
    setTgTesting(true);
    try {
      const resp = await fetch("/api/telegram-notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botToken: tgSettings.botToken,
          chatId: tgSettings.chatId,
          message: "✅ <b>Lead Finder</b> — тестове повідомлення.\nTelegram бот налаштований успішно! 🚀",
        }),
      });
      const data = await resp.json();
      if (data.success) {
        showToast("✅ Тест пройдено успішно!");
      } else {
        showToast(`❌ Помилка: ${data.error}`);
      }
    } catch {
      showToast("❌ Не вдалося надіслати повідомлення");
    } finally {
      setTgTesting(false);
    }
  }, [tgSettings, showToast]);

  // ─── Export ───────────────────────────────────────────────
  const handleExport = useCallback(async (format: "excel" | "csv", hotOnly = false) => {
    const data = hotOnly ? leads.filter((l) => l.score === "HOT") : leads;
    if (data.length === 0) { showToast("Немає даних для експорту"); return; }
    const controller = new AbortController();
    const exportTimeout = setTimeout(() => controller.abort(), 30000);
    let resp: Response;
    try {
      resp = await fetch("/api/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leads: data, format }), signal: controller.signal });
    } catch {
      clearTimeout(exportTimeout);
      showToast("Таймаут експорту"); return;
    }
    clearTimeout(exportTimeout);
    if (!resp.ok) { showToast("Помилка експорту"); return; }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = format === "excel" ? "leads_output.xlsx" : "leads_output.csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    showToast(`Експортовано ${data.length} лідів`);
  }, [leads, showToast]);

  // ─── Search ───────────────────────────────────────────────
  const handleSearch = useCallback(async (searchCity?: string, searchQuery?: string, searchMax?: string, searchRadius?: string) => {
    const c = searchCity || city;
    const q = searchQuery || query;
    const mr = searchMax || maxResults;
    const r = searchRadius || radius;

    if (!c || !q) { setErrorMessage("Заповніть місто та нішу"); return; }
    setErrorMessage(""); setLeads([]); setExpandedIdx(null);
    setPhase("searching"); setProgress(0);
    setGeoLocations([]);

    if (searchCity) setCity(searchCity);
    if (searchQuery) setQuery(searchQuery);

    const cities = c.split(",").map((cc) => cc.trim()).filter(Boolean);
    if (cities.length === 0) { setErrorMessage("Вкажіть місто"); setPhase("error"); return; }

    try {
      const allBusinesses: Array<{ name: string; phone: string; website: string; address: string; email: string; facebook: string; instagram: string; telegram: string; openingHours: string; description: string; rating: number | null; reviews: number }> = [];
      const seenNames = new Set<string>();

      for (let ci = 0; ci < cities.length; ci++) {
        const currentCity = cities[ci];
        setProgressLabel(`Пошук у: ${currentCity} (${ci + 1}/${cities.length})`);
        setProgress(Math.round((ci / cities.length) * 30));

        const sel = selectedGeoRef.current;
        const useCoords = sel && sel.name.toLowerCase() === currentCity.toLowerCase();
        const searchData = await safeJsonFetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            city: currentCity, query: q,
            maxResults: parseInt(mr) || 20, radius: parseInt(r) || 15,
            ...(useCoords ? { lat: sel!.lat, lng: sel!.lng, displayName: sel!.displayName } : {}),
          }),
          timeoutMs: 60000,
        }, `Помилка пошуку у ${currentCity}`);

        const businesses = searchData.businesses || [];

        // Save geocoded location for display
        if (searchData.geoLocation) {
          setGeoLocations((prev) => [
            ...prev,
            { city: currentCity, displayName: searchData.geoLocation.displayName, lat: searchData.geoLocation.lat, lng: searchData.geoLocation.lng },
          ]);
        }

        for (const b of businesses) {
          const key = b.name.toLowerCase().trim();
          if (!seenNames.has(key)) {
            seenNames.add(key);
            allBusinesses.push(b);
          }
        }
      }

      if (allBusinesses.length === 0) {
        setPhase("done"); setProgress(100); setProgressLabel("Нічого не знайдено.");
        saveSearchHistory({ city: c, query: q, maxResults: parseInt(mr) || 20, radius: parseInt(r) || 15, totalResults: 0 });
        setSearchHistory(getSearchHistory());
        return;
      }

      setPhase("analyzing");
      const analyzed: LeadBusiness[] = [];

      for (let i = 0; i < allBusinesses.length; i++) {
        const b = allBusinesses[i];
        setProgressLabel(`Аналіз: ${b.name} (${i + 1}/${allBusinesses.length})`);
        setProgress(30 + Math.round(((i + 1) / allBusinesses.length) * 70));

        let copyrightYear: number | null = null, isMobileFriendly = false, hasSsl = false;
        let finalUrl = "", technologies: string[] = [], designScore: DesignScore = "unknown";
        let designNotes: string[] = [], pageTitle = "", hasContactForm = false;
        let securityIssues: string[] = [];

        if (b.website && b.website !== "N/A") {
          try {
            const d = await safeJsonFetch("/api/analyze", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url: b.website }),
              timeoutMs: 30000,
            }, `Помилка аналізу ${b.website}`);
            copyrightYear = d.copyrightYear; isMobileFriendly = d.isMobileFriendly;
            hasSsl = d.hasSsl; finalUrl = d.finalUrl || b.website;
            technologies = d.technologies || []; designScore = d.designScore || "unknown";
            designNotes = d.designNotes || []; pageTitle = d.pageTitle || "";
            hasContactForm = d.hasContactForm || false;
            securityIssues = d.securityIssues || [];
          } catch { /* skip failed analysis */ }
        }

        const lead: LeadBusiness = {
          name: b.name, phone: b.phone, website: b.website, address: b.address,
          email: b.email, facebook: b.facebook, instagram: b.instagram, telegram: b.telegram,
          openingHours: b.openingHours, description: b.description,
          rating: b.rating, reviews: b.reviews,
          copyrightYear, isMobileFriendly, hasSsl, finalUrl, technologies,
          designScore, designNotes, securityIssues, pageTitle, hasContactForm,
          score: scoreLead(b.website, copyrightYear, isMobileFriendly, hasSsl),
          status: "new", notes: "", contactDate: null,
        };
        analyzed.push(lead);

        // Send Telegram notification for this lead
        await sendTelegramNotification(lead);

        await new Promise((rr) => setTimeout(rr, 250));
        setLeads([...analyzed]);
      }

      // Save to search history
      saveSearchHistory({ city: c, query: q, maxResults: parseInt(mr) || 20, radius: parseInt(r) || 15, totalResults: analyzed.length });
      setSearchHistory(getSearchHistory());

      setPhase("done"); setProgress(100); setProgressLabel(`Готово! ${analyzed.length} лідів з ${cities.length} міст`);
    } catch (err) {
      setPhase("error"); setErrorMessage(err instanceof Error ? err.message : "Помилка");
    }
  }, [city, query, maxResults, radius, sendTelegramNotification]);

  // Filtering
  const filteredLeads = leads
    .filter((l) => filterScore === "ALL" || l.score === filterScore)
    .filter((l) => filterStatus === "ALL" || l.status === filterStatus)
    .filter((l) => !onlyWithIssues || hasIssues(l))
    .filter((l) => !onlyFavorites || favoritesSet.has(l.name))
    .filter((l) => !onlyWithWebsite || (l.website && l.website !== "N/A"))
    .sort((a, b) => {
      const order: Record<LeadScore, number> = { HOT: 0, WARM: 1, COLD: 2 };
      return order[a.score] - order[b.score];
    });

  // Stats
  const hotCount = leads.filter((l) => l.score === "HOT").length;
  const warmCount = leads.filter((l) => l.score === "WARM").length;
  const coldCount = leads.filter((l) => l.score === "COLD").length;
  const ancientCount = leads.filter((l) => l.designScore === "ancient").length;
  const noMobileCount = leads.filter((l) => l.website !== "N/A" && !l.isMobileFriendly).length;
  const noSslCount = leads.filter((l) => l.website !== "N/A" && !l.hasSsl).length;
  const noWebsiteCount = leads.filter((l) => !l.website || l.website === "N/A").length;

  // Average price
  const avgPrice = leads.length > 0
    ? (() => {
        const prices = leads.map((l) => estimatePrice(l));
        const avgMin = Math.round(prices.reduce((s, p) => s + p.min, 0) / prices.length);
        const avgMax = Math.round(prices.reduce((s, p) => s + p.max, 0) / prices.length);
        return { min: avgMin, max: avgMax };
      })()
    : { min: 0, max: 0 };

  const templates = getTemplates();
  const statusList = getStatusList();

  const togglePreview = useCallback((idx: number) => {
    setPreviewOpen((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }, []);

  const handleCopyEmail = useCallback(async (lead: LeadBusiness) => {
    const tmpl = templates.find((t) => t.id === selectedTemplateId);
    if (!tmpl) return;
    const issues = getIssuesText(lead);
    const filled = fillTemplate(tmpl, { bizName: lead.name, issues, city: city.split(",")[0].trim() });
    const fullText = `Subject: ${filled.subject}\n\n${filled.body}`;
    await navigator.clipboard.writeText(fullText);
    showToast("Email шаблон скопійовано!");
  }, [selectedTemplateId, templates, city, showToast]);

  const handleMailto = useCallback((lead: LeadBusiness) => {
    const tmpl = templates.find((t) => t.id === selectedTemplateId);
    if (!tmpl || !lead.email) return;
    const issues = getIssuesText(lead);
    const filled = fillTemplate(tmpl, { bizName: lead.name, issues, city: city.split(",")[0].trim() });
    const subject = encodeURIComponent(filled.subject);
    const body = encodeURIComponent(filled.body);
    window.open(`mailto:${lead.email}?subject=${subject}&body=${body}`, "_blank");
  }, [selectedTemplateId, templates, city]);

  const handleTelegram = useCallback((lead: LeadBusiness) => {
    const tmpl = templates.find((t) => t.id === selectedTemplateId);
    if (!tmpl || !lead.telegram) return;
    const issues = getIssuesText(lead);
    const filled = fillTemplate(tmpl, { bizName: lead.name, issues, city: city.split(",")[0].trim() });
    const tgUrl = lead.telegram.startsWith("http") ? lead.telegram : `https://${lead.telegram}`;
    const text = encodeURIComponent(filled.body);
    const username = tgUrl.match(/t\.me\/([^/]+)/)?.[1];
    if (username) {
      window.open(`https://t.me/${username}?text=${text}`, "_blank");
    } else {
      window.open(tgUrl, "_blank");
    }
  }, [selectedTemplateId, templates, city]);

  const handleStatusChange = useCallback((idx: number, newStatus: string) => {
    updateLead(idx, {
      status: newStatus as LeadStatus,
      contactDate: newStatus === "contacted" && !leads[idx].contactDate
        ? new Date().toISOString()
        : leads[idx].contactDate,
    });
  }, [updateLead, leads]);

  const handleRunHistorySearch = useCallback((entry: SearchHistoryEntry) => {
    setCity(entry.city);
    setQuery(entry.query);
    setMaxResults(String(entry.maxResults));
    setRadius(String(entry.radius));
    handleSearch(entry.city, entry.query, String(entry.maxResults), String(entry.radius));
  }, [handleSearch]);

  const handleRemoveHistoryItem = useCallback((id: string) => {
    removeSearchHistoryItem(id);
    setSearchHistory(getSearchHistory());
  }, []);

  const handleClearHistory = useCallback(() => {
    clearSearchHistory();
    setSearchHistory([]);
    showToast(t.historyCleared);
  }, [showToast, t.historyCleared]);

  // ─── Smart Query Handler ───────────────────────────────
  const handleSmartQuery = useCallback((input: string) => {
    const trimmed = input.trim();
    if (!trimmed) {
      setParsedQuery(null);
      return;
    }
    const parsed = parseQuery(trimmed);
    setParsedQuery(parsed);
    if (parsed.city) setCity(parsed.city);
    if (parsed.query) setQuery(parsed.query);
    // Auto-switch locale based on detected language
    if (parsed.language === "en") setLocale("en");
    else if (parsed.language === "ru") setLocale("ru");
    else if (parsed.language === "ua") setLocale("ua");
    // If both city and query are present, trigger search
    if (parsed.city && parsed.query) {
      handleSearch(parsed.city, parsed.query);
    }
  }, [handleSearch]);

  // ─── Single PageSpeed check ──────────────────────────────
  const checkSinglePageSpeed = useCallback(async (lead: LeadBusiness, idx: number) => {
    if (!lead.website || lead.website === "N/A") return;
    const urlToCheck = lead.finalUrl || lead.website;
    setPsSingleChecking(idx);
    try {
      const result = await safeJsonFetch("/api/pagespeed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlToCheck, strategy: "mobile" }),
        timeoutMs: 45000,
      }, `PageSpeed error for ${lead.name}`);
      setPageSpeedResults((prev) => ({
        ...prev,
        [idx]: {
          performanceScore: result.performanceScore ?? null,
          firstContentfulPaint: result.firstContentfulPaint ?? null,
          largestContentfulPaint: result.largestContentfulPaint ?? null,
          totalBlockingTime: result.totalBlockingTime ?? null,
          cumulativeLayoutShift: result.cumulativeLayoutShift ?? null,
          speedIndex: result.speedIndex ?? null,
          diagnostics: result.diagnostics || [],
          error: result.error,
        },
      }));
    } catch (err) {
      setPageSpeedResults((prev) => ({
        ...prev,
        [idx]: {
          performanceScore: null,
          firstContentfulPaint: null,
          largestContentfulPaint: null,
          totalBlockingTime: null,
          cumulativeLayoutShift: null,
          speedIndex: null,
          diagnostics: [],
          error: err instanceof Error ? err.message : t.pageSpeedError,
        },
      }));
    } finally {
      setPsSingleChecking(null);
    }
  }, [t.pageSpeedError]);

  // ─── Bulk PageSpeed check ────────────────────────────────
  const handleBulkPageSpeed = useCallback(async () => {
    const leadsWithWebsites = leads
      .map((l, i) => ({ lead: l, idx: i }))
      .filter(({ lead }) => lead.website && lead.website !== "N/A");

    if (leadsWithWebsites.length === 0) {
      showToast(t.pageSpeedNoResults);
      return;
    }

    setPsBulkChecking(true);
    setPsBulkProgress(0);
    setPsBulkTotal(leadsWithWebsites.length);

    for (let i = 0; i < leadsWithWebsites.length; i++) {
      const { lead, idx } = leadsWithWebsites[i];
      setPsBulkProgress(i + 1);

      const urlToCheck = lead.finalUrl || lead.website;
      try {
        const result = await safeJsonFetch("/api/pagespeed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: urlToCheck, strategy: "mobile" }),
          timeoutMs: 45000,
        }, `PageSpeed error for ${lead.name}`);

        setPageSpeedResults((prev) => ({
          ...prev,
          [idx]: {
            performanceScore: result.performanceScore ?? null,
            firstContentfulPaint: result.firstContentfulPaint ?? null,
            largestContentfulPaint: result.largestContentfulPaint ?? null,
            totalBlockingTime: result.totalBlockingTime ?? null,
            cumulativeLayoutShift: result.cumulativeLayoutShift ?? null,
            speedIndex: result.speedIndex ?? null,
            diagnostics: result.diagnostics || [],
            error: result.error,
          },
        }));
      } catch (err) {
        setPageSpeedResults((prev) => ({
          ...prev,
          [idx]: {
            performanceScore: null,
            firstContentfulPaint: null,
            largestContentfulPaint: null,
            totalBlockingTime: null,
            cumulativeLayoutShift: null,
            speedIndex: null,
            diagnostics: [],
            error: err instanceof Error ? err.message : t.pageSpeedError,
          },
        }));
      }

      // 3-second delay between checks to avoid rate limits
      if (i < leadsWithWebsites.length - 1) {
        await new Promise((r) => setTimeout(r, 3000));
      }
    }

    setPsBulkChecking(false);
    showToast(`${t.pageSpeedDone} (${leadsWithWebsites.length})`);
  }, [leads, showToast, t.pageSpeedError, t.pageSpeedNoResults, t.pageSpeedDone]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      {/* Toast */}
      {toastMsg && (
        <div className="fixed top-4 right-4 z-[100] animate-in fade-in slide-in-from-top-2">
          <div className="bg-emerald-600 text-white text-sm px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
            <Check className="w-4 h-4" /> {toastMsg}
          </div>
        </div>
      )}

      {/* Header */}
      <header className="border-b bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg">
              <Target className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">{t.appTitle}</h1>
              <p className="text-[10px] text-muted-foreground">{t.appSubtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Language Switcher */}
            <div className="flex items-center gap-0.5 mr-1">
              {AVAILABLE_LOCALES.map((loc) => (
                <button
                  key={loc.value}
                  onClick={() => setLocale(loc.value)}
                  className={`text-sm px-1 py-0.5 rounded transition-colors ${locale === loc.value ? 'bg-muted ring-1 ring-border' : 'hover:bg-muted/50 opacity-60 hover:opacity-100'}`}
                  title={loc.label}
                >
                  {loc.flag}
                </button>
              ))}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setTgSettingsOpen(true)} title={t.settings}>
              <Settings className="w-4 h-4" />
            </Button>
            {leads.length > 0 && (
              <>
                <Button variant="outline" size="sm" onClick={() => handleExport("csv")} title="CSV">
                  <FileText className="w-4 h-4" /><span className="hidden sm:inline ml-1">{t.exportCsv}</span>
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleExport("excel")} title="Excel">
                  <FileSpreadsheet className="w-4 h-4" /><span className="hidden sm:inline ml-1">{t.exportExcel}</span>
                </Button>
                {hotCount > 0 && (
                  <Button size="sm" onClick={() => handleExport("excel", true)} className="bg-red-600 hover:bg-red-700 text-white" title="Тільки HOT">
                    <Flame className="w-4 h-4" /><span className="hidden sm:inline ml-1">HOT ({hotCount})</span>
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBulkPageSpeed}
                  disabled={psBulkChecking}
                  title={t.bulkPageSpeedDesc}
                  className="border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                >
                  {psBulkChecking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gauge className="w-4 h-4" />}
                  <span className="hidden sm:inline ml-1">{t.pageSpeed}</span>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Search Card */}
        <Card className="shadow-lg border-0">
          <CardContent className="pt-5">
            {/* Smart Query Input */}
            <div className="space-y-1 mb-3">
              <label className="text-xs font-medium text-muted-foreground">🔍 {t.nicheLabel}</label>
              <div className="relative">
                <Input
                  placeholder={t.nichePlaceholder}
                  value={smartQuery}
                  onChange={(e) => setSmartQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSmartQuery(smartQuery);
                    }
                  }}
                  disabled={phase === "searching" || phase === "analyzing"}
                  className="pr-20"
                />
                {smartQuery && (
                  <button
                    onClick={() => { setSmartQuery(""); setParsedQuery(null); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {parsedQuery && smartQuery && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {parsedQuery.city && (
                    <Badge variant="outline" className="text-[10px]">
                      <MapPin className="w-2.5 h-2.5 mr-0.5" />{parsedQuery.city}
                    </Badge>
                  )}
                  {parsedQuery.query && (
                    <Badge variant="outline" className="text-[10px]">
                      <Target className="w-2.5 h-2.5 mr-0.5" />{parsedQuery.query}
                    </Badge>
                  )}
                  <Badge variant="secondary" className="text-[10px]">
                    {parsedQuery.language === 'ua' ? '🇺🇦' : parsedQuery.language === 'en' ? '🇬🇧' : parsedQuery.language === 'ru' ? '🇷🇺' : '🌐'}
                  </Badge>
                </div>
              )}
            </div>
            <div className="relative flex items-center my-2">
              <div className="flex-grow border-t"></div>
              <span className="flex-shrink mx-2 text-[10px] text-muted-foreground">— {t.advanced} —</span>
              <div className="flex-grow border-t"></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Країна</label>
                <Select value={country} onValueChange={(v) => { setCountry(v); selectedGeoRef.current = null; if (city.trim().length >= 2) fetchCities(city, v); }}
                  disabled={phase === "searching" || phase === "analyzing"}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {COUNTRIES.map((co) => (
                      <SelectItem key={co.code} value={co.code}>{flagEmoji(co.code)} {co.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 relative">
                <label className="text-xs font-medium text-muted-foreground">{t.cityLabel}</label>
                <Input placeholder={t.cityPlaceholder} value={city} autoComplete="off"
                  onChange={(e) => { setCity(e.target.value); selectedGeoRef.current = null; fetchCities(e.target.value, country); }}
                  onFocus={() => { if (cityHits.length > 0) setCityOpen(true); }}
                  onBlur={() => setTimeout(() => setCityOpen(false), 150)}
                  disabled={phase === "searching" || phase === "analyzing"}
                  onKeyDown={(e) => { if (e.key === "Enter") { setCityOpen(false); handleSearch(); } }} />
                {cityLoading && <Loader2 className="w-3.5 h-3.5 animate-spin absolute right-2 top-[30px] text-muted-foreground" />}
                {cityOpen && cityHits.length > 0 && (
                  <div className="absolute z-50 left-0 right-0 top-[58px] bg-popover border rounded-md shadow-lg max-h-60 overflow-auto">
                    {cityHits.map((hit, i) => (
                      <button key={`${hit.lat}-${hit.lng}-${i}`} type="button"
                        onMouseDown={(e) => { e.preventDefault(); pickCity(hit); }}
                        className="w-full text-left px-2.5 py-1.5 text-sm hover:bg-accent flex items-start gap-1.5">
                        <MapPin className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground" />
                        <span><span className="font-medium">{hit.name}</span>
                          <span className="text-[11px] text-muted-foreground block leading-tight">{hit.displayName}</span></span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">{t.nicheLabel}</label>
                <Input placeholder={t.nichePlaceholder} value={query} onChange={(e) => setQuery(e.target.value)}
                  disabled={phase === "searching" || phase === "analyzing"} onKeyDown={(e) => e.key === "Enter" && handleSearch()} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">{t.countLabel}</label>
                <Select value={maxResults} onValueChange={setMaxResults} disabled={phase !== "idle" && phase !== "done" && phase !== "error"}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem><SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">{t.radiusLabel}</label>
                <Select value={radius} onValueChange={setRadius} disabled={phase !== "idle" && phase !== "done" && phase !== "error"}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5 {t.km}</SelectItem><SelectItem value="15">15 {t.km}</SelectItem>
                    <SelectItem value="25">25 {t.km}</SelectItem><SelectItem value="50">50 {t.km}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5 items-center">
              <span className="text-[10px] text-muted-foreground">{t.quickKeywords}</span>
              {QUICK_KEYWORDS.map((kw) => (
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
              <Button onClick={() => handleSearch()} disabled={(phase === "searching" || phase === "analyzing") || !city || !query}
                className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-lg">
                {phase === "searching" || phase === "analyzing" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                {phase === "searching" ? t.searching : phase === "analyzing" ? t.analyzing : t.searchButton}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Search History */}
        {searchHistory.length > 0 && (
          <Card className="shadow-sm border-0">
            <div onClick={() => setHistoryOpen(!historyOpen)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setHistoryOpen(!historyOpen)} className="w-full text-left p-3 flex items-center justify-between cursor-pointer select-none">
              <div className="flex items-center gap-2 text-sm font-medium">
                <History className="w-4 h-4 text-muted-foreground" />
                {t.searchHistory} ({searchHistory.length})
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleClearHistory(); }} className="text-xs text-red-500 hover:text-red-600 h-6 px-2">
                  <Trash2 className="w-3 h-3 mr-1" />{t.clearAll}
                </Button>
                {historyOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </div>
            </div>
            {historyOpen && (
              <div className="border-t max-h-60 overflow-y-auto">
                {searchHistory.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between px-3 py-2 hover:bg-muted/50 border-b last:border-b-0 group">
                    <button onClick={() => handleRunHistorySearch(entry)} className="flex-1 text-left min-w-0">
                      <div className="text-xs font-medium truncate">
                        {entry.city} → {entry.query}
                        <span className="text-muted-foreground ml-1.5">({entry.totalResults})</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {new Date(entry.timestamp).toLocaleString("uk-UA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        <span className="ml-2">{entry.maxResults} {t.results} • {entry.radius} {t.km}</span>
                      </div>
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); handleRemoveHistoryItem(entry.id); }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-red-500 transition-all" title={t.delete}>
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* Geo Locations Found */}
        {geoLocations.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="w-3.5 h-3.5" />
              <span className="font-medium">{t.foundLocations}:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {geoLocations.map((geo, i) => (
                <a
                  key={`${geo.city}-${i}`}
                  href={`https://www.openstreetmap.org/?mlat=${geo.lat}&mlon=${geo.lng}#map=13/${geo.lat}/${geo.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 px-2.5 py-1 rounded-lg border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-950/50 transition-colors"
                >
                  <MapPin className="w-3 h-3" />
                  {geo.displayName}
                  <span className="text-[10px] text-muted-foreground">({geo.lat.toFixed(2)}, {geo.lng.toFixed(2)})</span>
                  <ExternalLink className="w-2.5 h-2.5 opacity-50" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Progress */}
        {(phase === "searching" || phase === "analyzing") && (
          <Card className="shadow-md border-0"><CardContent className="py-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium">{progressLabel}</span>
              <span className="text-sm text-muted-foreground">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </CardContent></Card>
        )}

        {/* PageSpeed Bulk Progress */}
        {psBulkChecking && (
          <Card className="shadow-md border-0 border-l-4 border-l-blue-500"><CardContent className="py-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium flex items-center gap-1.5">
                <Gauge className="w-4 h-4 text-blue-600" />
                {t.pageSpeedProgress}: {psBulkProgress}/{psBulkTotal}
              </span>
              <span className="text-sm text-muted-foreground">{psBulkTotal > 0 ? Math.round((psBulkProgress / psBulkTotal) * 100) : 0}%</span>
            </div>
            <Progress value={psBulkTotal > 0 ? (psBulkProgress / psBulkTotal) * 100 : 0} className="h-2" />
          </CardContent></Card>
        )}

        {/* Summary Dashboard */}
        {leads.length > 0 && phase === "done" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              <MiniStat label={t.totalLeads} value={leads.length} />
              <MiniStat label={`🔥 ${t.hot}`} value={hotCount} color="text-red-600" />
              <MiniStat label={t.veryOldSites} value={ancientCount} color="text-orange-600" />
              <MiniStat label={t.notMobile} value={noMobileCount} color="text-amber-600" />
              <MiniStat label={t.noSsl} value={noSslCount} color="text-red-600" />
              <MiniStat label={t.noWebsite} value={noWebsiteCount} color="text-purple-600" />
              <MiniStat label={t.avgEstimate} value={`${avgPrice.min}-${avgPrice.max}$`} color="text-emerald-600" />
            </div>
            <div className="text-center text-xs text-muted-foreground bg-muted/50 rounded-lg py-2 px-4">
              🎯 <span className="font-semibold text-foreground">{filteredLeads.length}</span> {t.filteredLeads} •
              {onlyFavorites && <span className="ml-1">{t.onlyFavorites} •</span>}
              {t.readyToContact}
            </div>
          </div>
        )}

        {/* Filters */}
        {leads.length > 0 && (phase === "done" || phase === "analyzing") && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              {(["ALL", "HOT", "WARM", "COLD"] as const).map((s) => (
                <Button key={s} variant={filterScore === s ? "default" : "outline"} size="sm" onClick={() => setFilterScore(s)}
                  className={filterScore === s && s !== "ALL"
                    ? s === "HOT" ? "bg-red-600 hover:bg-red-700 text-white" : s === "WARM" ? "bg-yellow-500 hover:bg-yellow-600 text-black" : "bg-green-600 hover:bg-green-700 text-white" : ""}>
                  {s === "ALL" ? `${t.allFilter} (${leads.length})` : s === "HOT" ? `🔥 ${t.hot} (${hotCount})` : s === "WARM" ? `⚡ ${t.warm} (${warmCount})` : `❄️ ${t.cold} (${coldCount})`}
                </Button>
              ))}
              <div className="h-4 w-px bg-border mx-1" />
              <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as LeadStatus | "ALL")}>
                <SelectTrigger className="h-8 w-auto text-xs min-w-[120px]">
                  <SelectValue placeholder={t.status} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t.allStatuses}</SelectItem>
                  {statusList.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.emoji} {s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-3 ml-auto">
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-muted-foreground">{t.onlyFavorites}</label>
                  <Switch checked={onlyFavorites} onCheckedChange={setOnlyFavorites} />
                </div>
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-muted-foreground">{t.onlyWithIssues}</label>
                  <Switch checked={onlyWithIssues} onCheckedChange={setOnlyWithIssues} />
                </div>
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-muted-foreground">{t.websitesOnly}</label>
                  <Switch checked={onlyWithWebsite} onCheckedChange={setOnlyWithWebsite} />
              </div>
            </div>
          </div>
        </div>
        )}

        {/* Lead Cards */}
        <div className="space-y-3">
          {filteredLeads.slice(0, visibleCount).map((lead, idx) => {
            const realIdx = leads.indexOf(lead);
            const sc = getScoreColor(lead.score);
            const dc = getDesignColor(lead.designScore);
            const stc = getStatusColor(lead.status);
            const isExpanded = expandedIdx === idx;
            const screenshotUrl = getScreenshotUrl(lead.finalUrl || lead.website);
            const mobileScreenshotUrl = getMobileScreenshotUrl(lead.finalUrl || lead.website);
            const websiteUrl = formatUrl(lead.finalUrl || lead.website);
            const price = estimatePrice(lead);
            const issues = getIssuesText(lead);
            const selectedTmpl = templates.find((t) => t.id === selectedTemplateId);
            const isPreviewOpen = previewOpen.has(idx);
            const isFav = favoritesSet.has(lead.name);
            const worthiness = isWorthContacting(lead);
            const problems = getProblemsForLead(lead);

            return (
              <Card key={`${lead.name}-${realIdx}`} className={`border-l-4 shadow-sm overflow-hidden transition-all ${sc.border} hover:shadow-md`}>
                {/* Header row */}
                <div onClick={() => setExpandedIdx(isExpanded ? null : idx)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setExpandedIdx(isExpanded ? null : idx)} className="w-full text-left p-3 sm:p-4 flex items-start gap-3 cursor-pointer select-none">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-sm sm:text-base truncate max-w-[200px] sm:max-w-[260px]">{lead.name}</span>
                      <Badge className={`${sc.bg} ${sc.text} ${sc.border} font-bold text-[10px] px-1.5`}>{sc.emoji} {sc.label}</Badge>
                      {lead.website !== "N/A" && (
                        <Badge className={`${dc.bg} ${dc.text} text-[10px] px-1.5`}>{dc.emoji} {dc.label}</Badge>
                      )}
                      <Badge className={`${stc.bg} ${stc.text} text-[10px] px-1.5`}>{stc.emoji} {stc.label}</Badge>
                      <Badge className="bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 text-[10px] px-1.5">
                        <DollarSign className="w-2.5 h-2.5 mr-0.5" />${price.min}-{price.max}
                      </Badge>
                      {/* Contact Worthiness Badge */}
                      <Badge className={`${worthiness.worth
                        ? "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                      } text-[10px] px-1.5 border`}>
                        {worthiness.worth ? <ThumbsUp className="w-2.5 h-2.5 mr-0.5" /> : <ThumbsDown className="w-2.5 h-2.5 mr-0.5" />}
                        {worthiness.score}/100
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs sm:text-sm text-muted-foreground">
                      {lead.phone !== "N/A" && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{lead.phone}</span>}
                      {lead.address !== "N/A" && <span className="flex items-center gap-1 truncate max-w-[180px]"><MapPin className="w-3 h-3 shrink-0" />{lead.address}</span>}
                      {lead.website !== "N/A" && <span className="flex items-center gap-1 truncate max-w-[140px]"><Globe className="w-3 h-3 shrink-0" />{lead.website.replace(/^https?:\/\//, "")}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 mt-1">
                    {/* Favorite star */}
                    <button onClick={(e) => handleToggleFavorite(lead, e)} className="p-1 rounded-md hover:bg-muted transition-colors" title={isFav ? t.removeFromFavorites : t.addToFavorites}>
                      {isFav ? <Star className="w-4 h-4 text-amber-500 fill-amber-500" /> : <Star className="w-4 h-4 text-muted-foreground/40" />}
                    </button>
                    {screenshotUrl && (
                      <div className="hidden sm:block w-16 h-10 rounded overflow-hidden border bg-muted relative">
                        <img src={screenshotUrl} alt="" className="w-full h-full object-cover object-top" loading="lazy" />
                      </div>
                    )}
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="border-t bg-muted/20">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-3 sm:p-4">
                      {/* LEFT: Screenshots */}
                      <div className="space-y-3">
                        {screenshotUrl && (
                          <div>
                            <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1"><Monitor className="w-3 h-3" />{t.desktop}</p>
                            <div className="rounded-xl overflow-hidden border shadow-inner bg-white relative group">
                              <a href={websiteUrl} target="_blank" rel="noopener noreferrer">
                                <img src={screenshotUrl} alt={`Скріншот ${lead.name}`} className="w-full h-auto block" loading="lazy" />
                              </a>
                              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <a href={websiteUrl} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 bg-black/70 text-white text-xs px-2 py-1 rounded-lg hover:bg-black/90 backdrop-blur-sm">
                                  <ExternalLink className="w-3 h-3" /> {t.openSite}
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

                        {mobileScreenshotUrl && (
                          <div>
                            <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1"><Smartphone className="w-3 h-3" />{t.mobile}</p>
                            <div className="rounded-xl overflow-hidden border shadow-inner bg-white relative group max-w-[200px] mx-auto">
                              <a href={websiteUrl} target="_blank" rel="noopener noreferrer">
                                <img src={mobileScreenshotUrl} alt={`Мобільний скріншот ${lead.name}`} className="w-full h-auto block" loading="lazy" />
                              </a>
                              <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <a href={websiteUrl} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded-md hover:bg-black/90 backdrop-blur-sm">
                                  <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              </div>
                            </div>
                          </div>
                        )}

                        {!screenshotUrl && !mobileScreenshotUrl && (
                          <div className="text-center py-8 text-sm text-muted-foreground">
                            {t.noSiteBestProspect}
                          </div>
                        )}

                        {/* PageSpeed Check Button */}
                        {lead.website !== "N/A" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => { e.stopPropagation(); checkSinglePageSpeed(lead, realIdx); }}
                            disabled={psSingleChecking === realIdx || psBulkChecking}
                            className="w-full text-xs border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                          >
                            {psSingleChecking === realIdx
                              ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />{t.pageSpeedChecking}</>
                              : <><Gauge className="w-3.5 h-3.5 mr-1.5" />{t.checkPageSpeed}</>}
                          </Button>
                        )}
                      </div>

                      {/* RIGHT: Details */}
                      <div className="space-y-4">
                        {/* Design Issues Section */}
                        <div className="bg-red-50 dark:bg-red-950/20 rounded-lg p-3 border border-red-200 dark:border-red-900/50">
                          <h4 className="text-xs font-semibold text-red-700 dark:text-red-400 mb-2 flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            {t.problems} ({(() => {
                              const lines = issues.split("\n").filter((l) => l && !l.startsWith("✅"));
                              return lines.length;
                            })()})
                          </h4>
                          <div className="space-y-1">
                            {issues.split("\n").filter(Boolean).map((line, li) => (
                              <p key={li} className={`text-xs ${line.startsWith("✅") ? "text-green-600 dark:text-green-400" : "text-red-700 dark:text-red-300"}`}>
                                {line}
                              </p>
                            ))}
                          </div>
                        </div>

                        {/* Problem Library Details */}
                        {problems.length > 0 && (
                          <div className="bg-amber-50 dark:bg-amber-950/20 rounded-lg p-3 border border-amber-200 dark:border-amber-900/50">
                            <h4 className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-2 flex items-center gap-1.5">
                              <Zap className="w-3.5 h-3.5" />
                              {t.detailedAnalysis}
                            </h4>
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                              {problems.map((prob) => (
                                <div key={prob.id} className="bg-white dark:bg-slate-900/50 rounded-md p-2 border">
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <span>{prob.icon}</span>
                                    <span className="text-xs font-semibold">{prob.problem}</span>
                                    <Badge variant="outline" className="text-[9px] ml-auto">${prob.priceRange.min}-${prob.priceRange.max}</Badge>
                                  </div>
                                  <p className="text-[10px] text-muted-foreground mb-1">{prob.solution}</p>
                                  <div className="flex flex-wrap gap-1">
                                    {prob.benefits.slice(0, 3).map((b, bi) => (
                                      <span key={bi} className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800">
                                        {b}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Technologies & Badges */}
                        {lead.website !== "N/A" && (
                          <div>
                            <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                              <Layout className="w-3.5 h-3.5" /> {t.technologies}
                            </h4>
                            <div className="flex flex-wrap gap-1.5">
                              {lead.technologies.length > 0 && lead.technologies.map((t) => (
                                <Badge key={t} variant="outline" className="text-[10px]"><Layout className="w-3 h-3 mr-1" />{t}</Badge>
                              ))}
                              {lead.hasSsl ? (
                                <Badge variant="outline" className="text-[10px] text-green-600 border-green-300 dark:border-green-700"><ShieldCheck className="w-3 h-3 mr-1" />HTTPS</Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] text-red-600 border-red-300 dark:border-red-700"><ShieldOff className="w-3 h-3 mr-1" />No SSL</Badge>
                              )}
                              {lead.isMobileFriendly ? (
                                <Badge variant="outline" className="text-[10px] text-green-600 border-green-300 dark:border-green-700"><Smartphone className="w-3 h-3 mr-1" />Mobile OK</Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] text-red-600 border-red-300 dark:border-red-700"><MonitorX className="w-3 h-3 mr-1" />No Mobile</Badge>
                              )}
                              {lead.hasContactForm && (
                                <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-300 dark:border-blue-700"><Mail className="w-3 h-3 mr-1" />{t.formBadge}</Badge>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Security findings (header-derived, factual) */}
                        {lead.website !== "N/A" && lead.securityIssues && lead.securityIssues.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                              <ShieldOff className="w-3.5 h-3.5 text-red-500" /> {t.securityTitle}
                            </h4>
                            <ul className="space-y-1">
                              {lead.securityIssues.map((issue, ii) => (
                                <li key={ii} className="flex items-start gap-1.5 text-[11px] text-red-600 dark:text-red-400">
                                  <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                                  <span>{issue}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* PageSpeed Results */}
                        {pageSpeedResults[realIdx] && (() => {
                          const ps = pageSpeedResults[realIdx];
                          const scoreColor = ps.performanceScore !== null
                            ? ps.performanceScore >= 90 ? "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800"
                              : ps.performanceScore >= 50 ? "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800"
                              : "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800"
                            : "";

                          const formatMs = (val: number | null) => {
                            if (val === null) return "—";
                            if (val >= 1000) return `${(val / 1000).toFixed(1)}s`;
                            return `${Math.round(val)}ms`;
                          };

                          return (
                            <div className={`rounded-lg p-3 border ${scoreColor || "bg-muted/50"}`}>
                              <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                                <Gauge className="w-3.5 h-3.5" /> {t.pageSpeedScore}
                              </h4>
                              {ps.error ? (
                                <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
                                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                  <span>{ps.error}</span>
                                </div>
                              ) : (
                                <>
                                  {/* Score Badge */}
                                  <div className="flex items-center gap-2 mb-2">
                                    <div className={`inline-flex items-center justify-center w-12 h-12 rounded-full font-bold text-lg border-2 ${
                                      ps.performanceScore !== null
                                        ? ps.performanceScore >= 90 ? "border-green-500 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/50"
                                          : ps.performanceScore >= 50 ? "border-orange-500 text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/50"
                                          : "border-red-500 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/50"
                                        : "border-muted text-muted-foreground bg-muted/50"
                                    }`}>
                                      {ps.performanceScore !== null ? ps.performanceScore : "—"}
                                    </div>
                                    {ps.performanceScore !== null && (
                                      <span className="text-[10px] text-muted-foreground">/ 100</span>
                                    )}
                                  </div>

                                  {/* Core Web Vitals Grid */}
                                  <div className="grid grid-cols-2 gap-1.5">
                                    <div className="bg-white/60 dark:bg-slate-900/40 rounded-md px-2 py-1.5">
                                      <div className="text-[9px] text-muted-foreground">{t.pageSpeedFcp}</div>
                                      <div className="text-xs font-semibold">{formatMs(ps.firstContentfulPaint)}</div>
                                    </div>
                                    <div className="bg-white/60 dark:bg-slate-900/40 rounded-md px-2 py-1.5">
                                      <div className="text-[9px] text-muted-foreground">{t.pageSpeedLcp}</div>
                                      <div className="text-xs font-semibold">{formatMs(ps.largestContentfulPaint)}</div>
                                    </div>
                                    <div className="bg-white/60 dark:bg-slate-900/40 rounded-md px-2 py-1.5">
                                      <div className="text-[9px] text-muted-foreground">{t.pageSpeedTbt}</div>
                                      <div className="text-xs font-semibold">{formatMs(ps.totalBlockingTime)}</div>
                                    </div>
                                    <div className="bg-white/60 dark:bg-slate-900/40 rounded-md px-2 py-1.5">
                                      <div className="text-[9px] text-muted-foreground">{t.pageSpeedCls}</div>
                                      <div className="text-xs font-semibold">{ps.cumulativeLayoutShift !== null ? ps.cumulativeLayoutShift.toFixed(2) : "—"}</div>
                                    </div>
                                    <div className="bg-white/60 dark:bg-slate-900/40 rounded-md px-2 py-1.5 col-span-2">
                                      <div className="text-[9px] text-muted-foreground">{t.pageSpeedSi}</div>
                                      <div className="text-xs font-semibold">{formatMs(ps.speedIndex)}</div>
                                    </div>
                                  </div>

                                  {/* Diagnostics */}
                                  {ps.diagnostics.length > 0 && (
                                    <div className="mt-2 space-y-1">
                                      <div className="text-[10px] font-medium text-muted-foreground">{t.pageSpeedDiagnostics}:</div>
                                      {ps.diagnostics.map((d, di) => (
                                        <div key={di} className="flex items-start gap-1 text-[10px] text-muted-foreground">
                                          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0 text-amber-500" />
                                          <span>{d}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          );
                        })()}

                        {/* Price estimation */}
                        <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-lg p-3 border border-emerald-200 dark:border-emerald-900/50">
                          <h4 className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-1 flex items-center gap-1.5">
                            <DollarSign className="w-3.5 h-3.5" /> {t.priceEstimate}
                          </h4>
                          <div className="text-lg font-bold text-emerald-700 dark:text-emerald-400">${price.min} — ${price.max}</div>
                          <div className="text-[10px] text-muted-foreground">{price.note}</div>
                        </div>

                        {/* Scoring Breakdown — Why HOT? */}
                        {(() => {
                          const breakdown = calculateLeadScoreDetailed(lead);
                          const dsc = getDetailedScoreColor(breakdown.rating);
                          const severityColors: Record<string, string> = { critical: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30", warning: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30", info: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30" };
                          return (
                            <div className={`rounded-lg p-3 border ${dsc.bg} ${dsc.text}`}>
                              <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                                <Flame className="w-3.5 h-3.5" /> {t.whyHot} — {t.scoringBreakdown}
                              </h4>
                              <div className="flex items-center gap-2 mb-2">
                                <div className="flex-1">
                                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                                    <div className={`h-full rounded-full transition-all ${breakdown.rating === "HOT" ? "bg-red-500" : breakdown.rating === "WARM" ? "bg-yellow-500" : breakdown.rating === "COLD" ? "bg-green-500" : "bg-emerald-500"}`} style={{ width: `${breakdown.score}%` }} />
                                  </div>
                                </div>
                                <Badge className={`${dsc.bg} ${dsc.text} text-[10px] font-bold`}>{dsc.emoji} {dsc.label} ({breakdown.score}/100)</Badge>
                              </div>
                              <div className="space-y-1">
                                {breakdown.factors.map((f, fi) => (
                                  <div key={fi} className={`flex items-center gap-1.5 text-[10px] px-1.5 py-0.5 rounded ${severityColors[f.severity] || ""}`}>
                                    <span>{f.icon}</span>
                                    <span className="font-medium">{f.name}</span>
                                    <span className="ml-auto">+{f.points}</span>
                                  </div>
                                ))}
                              </div>
                              {breakdown.opportunityText && (
                                <p className="text-[10px] mt-2 leading-relaxed opacity-80">{breakdown.opportunityText}</p>
                              )}
                            </div>
                          );
                        })()}

                        {/* Contacts */}
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                            <PhoneCall className="w-3.5 h-3.5" /> {t.contacts}
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <ContactField icon={<Phone className="w-3.5 h-3.5" />} label={t.phone} value={lead.phone} copyable={lead.phone !== "N/A"} CopyBtn={CopyBtn} notAvailableText={t.notAvailable} />
                            <ContactField icon={<Mail className="w-3.5 h-3.5" />} label={t.email} value={lead.email} copyable={!!lead.email} CopyBtn={CopyBtn} notAvailableText={t.notAvailable} />
                            <ContactField icon={<MapPin className="w-3.5 h-3.5" />} label={t.address} value={lead.address} copyable={lead.address !== "N/A"} CopyBtn={CopyBtn} notAvailableText={t.notAvailable} />
                            <div className="flex items-start gap-2">
                              <Globe className="w-3.5 h-3.5 mt-0.5 text-muted-foreground" />
                              <div className="min-w-0 flex-1">
                                <div className="text-[10px] text-muted-foreground">{t.website}</div>
                                {lead.website !== "N/A" ? (
                                  <a href={websiteUrl} target="_blank" rel="noopener noreferrer"
                                    className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 flex items-center gap-1 break-all">
                                    {websiteUrl.replace(/^https?:\/\//, "")} <ExternalLink className="w-3 h-3 shrink-0" />
                                  </a>
                                ) : <span className="text-xs text-red-500 font-medium">{t.noSiteTopProspect}</span>}
                              </div>
                            </div>
                          </div>

                          {/* Social */}
                          {(lead.facebook || lead.instagram || lead.telegram) && (
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              {lead.facebook && (
                                <a href={formatUrl(lead.facebook)} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300">
                                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>Facebook</a>
                              )}
                              {lead.instagram && (
                                <a href={formatUrl(lead.instagram)} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg bg-pink-50 text-pink-700 hover:bg-pink-100 dark:bg-pink-900/30 dark:text-pink-300">
                                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>Instagram</a>
                              )}
                              {lead.telegram && (
                                <a href={formatUrl(lead.telegram)} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg bg-sky-50 text-sky-700 hover:bg-sky-100 dark:bg-sky-900/30 dark:text-sky-300">
                                  <Send className="w-3.5 h-3.5" />Telegram</a>
                              )}
                            </div>
                          )}

                          {/* Hours */}
                          {lead.openingHours && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="w-3 h-3" />{lead.openingHours}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Outreach Section */}
                    <div className="border-t px-3 sm:px-4 py-3 bg-blue-50/50 dark:bg-blue-950/10">
                      <h4 className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-2 flex items-center gap-1.5">
                        <Send className="w-3.5 h-3.5" /> {t.writeToOwner}
                      </h4>
                      <div className="flex flex-wrap gap-2 mb-2">
                        <Button size="sm" variant="outline" onClick={() => handleCopyEmail(lead)} className="text-xs">
                          <Copy className="w-3 h-3 mr-1" /> {t.copyEmail}
                        </Button>
                        {lead.telegram && (
                          <Button size="sm" variant="outline" onClick={() => handleTelegram(lead)} className="text-xs">
                            <MessageCircle className="w-3 h-3 mr-1" /> {t.openTelegram}
                          </Button>
                        )}
                        {lead.email && (
                          <Button size="sm" variant="outline" onClick={() => handleMailto(lead)} className="text-xs">
                            <Mail className="w-3 h-3 mr-1" /> mailto:
                          </Button>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="text-[10px] text-muted-foreground">{t.template}</label>
                        <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                          <SelectTrigger className="h-7 w-auto text-[11px] min-w-[180px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {templates.map((tmpl) => (
                              <SelectItem key={tmpl.id} value={tmpl.id}>
                                <span className="flex items-center gap-1.5">
                                  {tmpl.channel === "email" ? "📧" : tmpl.channel === "telegram" ? "💬" : "✉️"}
                                  {tmpl.name}
                                  <span className="text-muted-foreground">({tmpl.tone === "formal" ? t.formal : tmpl.tone === "friendly" ? t.friendly : t.direct})</span>
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button variant="ghost" size="sm" onClick={() => togglePreview(idx)} className="text-[11px] h-7 px-2">
                          {isPreviewOpen ? <ChevronUp className="w-3 h-3 mr-0.5" /> : <ChevronDown className="w-3 h-3 mr-0.5" />}
                          {isPreviewOpen ? t.hide : t.preview}
                        </Button>
                      </div>
                      {isPreviewOpen && selectedTmpl && (
                        <div className="mt-2 bg-white dark:bg-slate-900 rounded-lg border p-3 text-xs space-y-2 max-h-60 overflow-y-auto">
                          {selectedTmpl.subject && (
                            <div>
                              <span className="font-semibold text-muted-foreground">{t.theme} </span>
                              <span>{selectedTmpl.subject.replace(/{BIZ_NAME}/g, lead.name).replace(/{CITY}/g, city.split(",")[0].trim())}</span>
                            </div>
                          )}
                          <pre className="whitespace-pre-wrap font-sans text-xs text-muted-foreground leading-relaxed">
                            {selectedTmpl.body
                              .replace(/{BIZ_NAME}/g, lead.name)
                              .replace(/{ISSUES}/g, issues)
                              .replace(/{CITY}/g, city.split(",")[0].trim())}
                          </pre>
                        </div>
                      )}
                    </div>

                    {/* Lead Management Section */}
                    <div className="border-t px-3 sm:px-4 py-3 bg-amber-50/50 dark:bg-amber-950/10">
                      <h4 className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-2 flex items-center gap-1.5">
                        <StickyNote className="w-3.5 h-3.5" /> {t.leadManagement}
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] text-muted-foreground">{t.status}</label>
                          <Select value={lead.status} onValueChange={(v) => handleStatusChange(realIdx, v)}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {statusList.map((s) => (
                                <SelectItem key={s.value} value={s.value}>{s.emoji} {s.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-muted-foreground">{t.contactDate}</label>
                          <div className="text-xs py-1.5 px-2 rounded-md border bg-muted/50">
                            {lead.contactDate
                              ? new Date(lead.contactDate).toLocaleDateString("uk-UA", { day: "numeric", month: "short", year: "numeric" })
                              : "—"}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 space-y-1">
                        <label className="text-[10px] text-muted-foreground">{t.notes}</label>
                        <Textarea
                          placeholder={t.notesPlaceholder}
                          value={lead.notes}
                          onChange={(e) => updateLead(realIdx, { notes: e.target.value })}
                          className="text-xs min-h-[60px] resize-y"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>

            {visibleCount < filteredLeads.length && (
          <div className="text-center py-4">
            <Button variant="outline" onClick={() => setVisibleCount((prev) => prev + 20)} className="gap-2">
              <ChevronDown className="w-4 h-4" />
              {t.loadMore} ({filteredLeads.length - visibleCount})
            </Button>
          </div>
        )}

        {/* Empty state */}
        {phase === "idle" && (
          <div className="text-center py-16 space-y-3">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-950/40 dark:to-teal-950/40 flex items-center justify-center">
              <Eye className="w-7 h-7 text-emerald-500" />
            </div>
            <h2 className="text-lg font-bold">{t.emptyTitle}</h2>
            <p className="text-muted-foreground max-w-md mx-auto text-xs">
              {t.emptyDescription}
            </p>
          </div>
        )}

        {phase === "done" && leads.length === 0 && (
          <div className="text-center py-12 text-sm text-muted-foreground">{t.noResults}</div>
        )}

        {phase === "done" && filteredLeads.length === 0 && leads.length > 0 && (
          <div className="text-center py-12 text-sm text-muted-foreground">
            <Filter className="w-8 h-8 mx-auto mb-2 opacity-50" />
            {t.noFiltersResults}
          </div>
        )}
      </main>

      <footer className="border-t mt-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 text-center text-[10px] text-muted-foreground">
          {t.footer}
        </div>
      </footer>

      {/* Telegram Settings Dialog */}
      <Dialog open={tgSettingsOpen} onOpenChange={setTgSettingsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="w-5 h-5" />
              {t.telegramSettings}
            </DialogTitle>
            <DialogDescription>
              {t.telegramSettingsDesc}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div className="space-y-1">
              <label className="text-xs font-medium">Bot Token</label>
              <Input
                placeholder="123456789:ABCdefGhIjKlMnOpQrStUvWxYz"
                value={tgSettings.botToken}
                onChange={(e) => setTgSettings((s) => ({ ...s, botToken: e.target.value }))}
                type="password"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Chat ID</label>
              <Input
                placeholder="123456789"
                value={tgSettings.chatId}
                onChange={(e) => setTgSettings((s) => ({ ...s, chatId: e.target.value }))}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-medium">{t.notifyNewLeads}</div>
                <div className="text-[10px] text-muted-foreground">{t.notifyNewLeadsDesc}</div>
              </div>
              <Switch
                checked={tgSettings.notifyNewLeads}
                onCheckedChange={(v) => setTgSettings((s) => ({ ...s, notifyNewLeads: v }))}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-medium">{t.hotLeadsOnly}</div>
                <div className="text-[10px] text-muted-foreground">{t.hotLeadsOnlyDesc}</div>
              </div>
              <Switch
                checked={tgSettings.hotLeadsOnly}
                onCheckedChange={(v) => setTgSettings((s) => ({ ...s, hotLeadsOnly: v }))}
                disabled={!tgSettings.notifyNewLeads}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleTestTelegram}
                disabled={tgTesting || !tgSettings.botToken || !tgSettings.chatId}
                variant="outline"
                className="flex-1"
              >
                {tgTesting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Bot className="w-4 h-4 mr-2" />}
                {t.test}
              </Button>
              <Button
                onClick={() => {
                  saveTelegramSettings(tgSettings);
                  showToast(t.settingsSaved);
                  setTgSettingsOpen(false);
                }}
                className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white"
              >
                <Check className="w-4 h-4 mr-2" />
                {t.save}
              </Button>
            </div>

            {/* Setup instructions */}
            <details className="mt-2">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground flex items-center gap-1">
                <RotateCcw className="w-3 h-3" />
                {t.howToSetupBot}
              </summary>
              <div className="mt-2 text-[11px] text-muted-foreground space-y-1 pl-4 border-l-2 border-muted">
                <p>1. {t.botSetupStep1}</p>
                <p>2. {t.botSetupStep2}</p>
                <p>3. {t.botSetupStep3}</p>
                <p>4. {t.botSetupStep4}</p>
                <p className="break-all"><code className="bg-muted px-1 rounded text-[10px]">https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code></p>
                <p>5. {t.botSetupStep5}</p>
              </div>
            </details>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="rounded-lg p-2.5 bg-card border text-center">
      <div className={`text-sm sm:text-base font-bold ${color || ""}`}>{value}</div>
      <div className="text-[9px] sm:text-[10px] text-muted-foreground leading-tight">{label}</div>
    </div>
  );
}

function ContactField({ icon, label, value, copyable, CopyBtn, notAvailableText }: {
  icon: React.ReactNode; label: string; value: string;
  copyable: boolean; CopyBtn: (props: { text: string; label: string }) => React.ReactNode | null;
  notAvailableText?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] text-muted-foreground">{label}</div>
        {value && value !== "N/A" ? (
          <span className="text-xs break-all">{value} {copyable && <CopyBtn text={value} label={label} />}</span>
        ) : <span className="text-xs text-muted-foreground italic">{notAvailableText || "—"}</span>}
      </div>
    </div>
  );
}
