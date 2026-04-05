// localStorage utilities for search history and favorites
// Used on the client side only

import type { LeadBusiness } from "./scoring";

// ─── Types ──────────────────────────────────────────────────

export interface SearchHistoryEntry {
  id: string;
  city: string;
  query: string;
  maxResults: number;
  radius: number;
  timestamp: number;
  totalResults: number;
}

// ─── Keys ───────────────────────────────────────────────────

const HISTORY_KEY = "leadfinder_search_history";
const FAVORITES_KEY = "leadfinder_favorites";

// ─── Search History ─────────────────────────────────────────

export function getSearchHistory(): SearchHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SearchHistoryEntry[];
    // Return last 20, sorted by timestamp desc
    return parsed.sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
  } catch {
    return [];
  }
}

export function saveSearchHistory(entry: Omit<SearchHistoryEntry, "id" | "timestamp">): SearchHistoryEntry {
  const history = getSearchHistory();
  const newEntry: SearchHistoryEntry = {
    ...entry,
    id: `sh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
  };
  // Add to beginning and trim to 20
  history.unshift(newEntry);
  const trimmed = history.slice(0, 20);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
  } catch { /* storage full */ }
  return newEntry;
}

export function removeSearchHistoryItem(id: string): void {
  const history = getSearchHistory();
  const filtered = history.filter((h) => h.id !== id);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered));
  } catch { /* storage full */ }
}

export function clearSearchHistory(): void {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch { /* ignore */ }
}

// ─── Favorites ──────────────────────────────────────────────

function getFavoritesRaw(): LeadBusiness[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as LeadBusiness[];
  } catch {
    return [];
  }
}

function setFavoritesRaw(favorites: LeadBusiness[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  } catch { /* storage full */ }
}

export function getFavorites(): LeadBusiness[] {
  return getFavoritesRaw();
}

export function toggleFavorite(lead: LeadBusiness): boolean {
  const favorites = getFavoritesRaw();
  const existingIdx = favorites.findIndex((f) => f.name === lead.name);
  if (existingIdx >= 0) {
    // Remove from favorites
    favorites.splice(existingIdx, 1);
    setFavoritesRaw(favorites);
    return false;
  } else {
    // Add to favorites
    favorites.push(lead);
    setFavoritesRaw(favorites);
    return true;
  }
}

export function isFavorite(leadName: string): boolean {
  const favorites = getFavoritesRaw();
  return favorites.some((f) => f.name === leadName);
}

// ─── Telegram Settings ──────────────────────────────────────

const TELEGRAM_SETTINGS_KEY = "leadfinder_telegram_settings";

export interface TelegramSettings {
  botToken: string;
  chatId: string;
  notifyNewLeads: boolean;
  hotLeadsOnly: boolean;
}

export function getTelegramSettings(): TelegramSettings {
  if (typeof window === "undefined") return { botToken: "", chatId: "", notifyNewLeads: false, hotLeadsOnly: false };
  try {
    const raw = localStorage.getItem(TELEGRAM_SETTINGS_KEY);
    if (!raw) return { botToken: "", chatId: "", notifyNewLeads: false, hotLeadsOnly: false };
    return JSON.parse(raw) as TelegramSettings;
  } catch {
    return { botToken: "", chatId: "", notifyNewLeads: false, hotLeadsOnly: false };
  }
}

export function saveTelegramSettings(settings: TelegramSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TELEGRAM_SETTINGS_KEY, JSON.stringify(settings));
  } catch { /* storage full */ }
}
