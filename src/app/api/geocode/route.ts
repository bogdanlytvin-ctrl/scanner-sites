import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientIp } from "@/lib/rate-limit";

// City autocomplete. Given a partial name + ISO country code, returns matching
// settlements with exact coordinates. The client passes those coordinates
// straight to /api/search, so business search never relies on fuzzy name
// geocoding (which mis-resolved e.g. "Львів" to a same-named village).

export const maxDuration = 15;

interface CityHit {
  name: string;
  displayName: string;
  lat: number;
  lng: number;
  country: string;
  type: string;
  importance: number;
}

const PLACE_TYPES = new Set([
  "city", "town", "village", "municipality", "borough", "hamlet", "suburb",
]);

// Lower = more important settlement. Used so a big city always ranks above a
// same-named village/hamlet in the autocomplete (e.g. Львів-the-city must beat
// the village "Львів" in Dnipro oblast).
const TYPE_RANK: Record<string, number> = {
  city: 0, municipality: 1, town: 2, borough: 3, suburb: 4, village: 5, hamlet: 6,
};

function rankHits(hits: CityHit[], q: string): CityHit[] {
  const nq = q.toLowerCase().trim();
  return hits.slice().sort((a, b) => {
    // Exact name matches first (a typed full city name should surface its match).
    const ax = a.name.toLowerCase() === nq ? 0 : 1;
    const bx = b.name.toLowerCase() === nq ? 0 : 1;
    if (ax !== bx) return ax - bx;
    // Then by settlement weight: city > town > … > hamlet.
    const at = TYPE_RANK[a.type] ?? 9;
    const bt = TYPE_RANK[b.type] ?? 9;
    if (at !== bt) return at - bt;
    // Finally by provider importance (Nominatim) — bigger place wins ties.
    return b.importance - a.importance;
  });
}

async function fromPhoton(q: string, country: string): Promise<CityHit[]> {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=15&osm_tag=place`;
  const resp = await fetch(url, {
    headers: { "User-Agent": "LeadFinder/1.0" },
    signal: AbortSignal.timeout(8000),
  });
  if (!resp.ok) return [];
  const ct = resp.headers.get("content-type") || "";
  if (!ct.includes("json")) return [];
  const data = await resp.json();
  const feats: any[] = data?.features || [];
  const hits: CityHit[] = [];
  for (const f of feats) {
    const p = f.properties || {};
    const cc = (p.countrycode || "").toLowerCase();
    if (country && cc !== country) continue;
    const type = (p.osm_value || p.type || "").toLowerCase();
    if (!PLACE_TYPES.has(type)) continue;
    const coords = f.geometry?.coordinates;
    if (!coords) continue;
    const region = p.state || p.county || "";
    hits.push({
      name: p.name || q,
      displayName: [p.name, region, p.country].filter(Boolean).join(", "),
      lat: coords[1],
      lng: coords[0],
      country: cc,
      type,
      importance: 0,
    });
  }
  return hits;
}

async function fromNominatim(q: string, country: string): Promise<CityHit[]> {
  let url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=10&accept-language=uk,en&featuretype=settlement`;
  if (country) url += `&countrycodes=${encodeURIComponent(country)}`;
  const resp = await fetch(url, {
    headers: { "User-Agent": "LeadFinder/1.0 (lead tool)" },
    signal: AbortSignal.timeout(8000),
  });
  if (!resp.ok) return [];
  const ct = resp.headers.get("content-type") || "";
  if (!ct.includes("json")) return [];
  const data = await resp.json();
  if (!Array.isArray(data)) return [];
  const hits: CityHit[] = [];
  for (const r of data) {
    const type = (r.type || "").toLowerCase();
    const cls = (r.class || "").toLowerCase();
    if (cls === "place" && !PLACE_TYPES.has(type) && type !== "administrative") continue;
    const lat = parseFloat(r.lat);
    const lng = parseFloat(r.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    hits.push({
      name: (r.display_name || "").split(",")[0] || q,
      displayName: r.display_name || q,
      lat,
      lng,
      country: (r.address?.country_code || country || "").toLowerCase(),
      type: type === "administrative" ? "city" : type,
      importance: typeof r.importance === "number" ? r.importance : 0,
    });
  }
  return hits;
}

function dedupe(hits: CityHit[]): CityHit[] {
  const seen = new Set<string>();
  const out: CityHit[] = [];
  for (const h of hits) {
    const key = `${h.name.toLowerCase()}|${h.lat.toFixed(2)}|${h.lng.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h);
  }
  return out.slice(0, 8);
}

export async function GET(request: NextRequest) {
  const rl = rateLimit(`geocode:${clientIp(request)}`, 60, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { cities: [], error: `Забагато запитів. Спробуйте через ${rl.retryAfter}с.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  const country = (searchParams.get("country") || "").trim().toLowerCase();

  if (q.length < 2) {
    return NextResponse.json({ cities: [] });
  }

  try {
    let hits = await fromPhoton(q, country);
    if (hits.length === 0) {
      hits = await fromNominatim(q, country);
    }
    return NextResponse.json({ cities: dedupe(rankHits(hits, q)) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "geocode error";
    console.error("[Geocode API] Error:", message);
    return NextResponse.json({ cities: [], error: message }, { status: 200 });
  }
}
