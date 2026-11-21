import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { regionalCity, validCoordinates } from "@/lib/osm-search";

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
}

const PLACE_TYPES = new Set([
  "city", "town", "village", "municipality", "borough", "hamlet", "suburb",
  "neighbourhood", "quarter", "district",
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
    return at - bt;
  });
}

async function fromPhoton(q: string, country: string): Promise<CityHit[]> {
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "15");
  url.searchParams.set("osm_tag", "place");
  if (country) url.searchParams.set("countrycode", country.toUpperCase());
  const resp = await fetch(url, {
    headers: { "User-Agent": "LeadFinder/1.0" },
    signal: AbortSignal.timeout(8000),
  });
  if (!resp.ok) throw new Error("Сервіс підказок міст тимчасово недоступний.");
  const ct = resp.headers.get("content-type") || "";
  if (!ct.includes("json")) throw new Error("Некоректна відповідь сервісу підказок міст.");
  const data = await resp.json();
  const feats: any[] = Array.isArray(data?.features) ? data.features : [];
  const hits: CityHit[] = [];
  for (const f of feats) {
    const p = f?.properties || {};
    const cc = (p.countrycode || "").toLowerCase();
    if (country && cc !== country) continue;
    const type = [p.osm_value, p.type].find((value) => PLACE_TYPES.has(value));
    if (!type) continue;
    const coords = f.geometry?.coordinates;
    if (!validCoordinates(coords?.[1], coords?.[0])) continue;
    const region = p.state || p.county || "";
    hits.push({
      name: p.name || q,
      displayName: [p.name, region, p.country].filter(Boolean).join(", "),
      lat: coords[1],
      lng: coords[0],
      country: cc,
      type,
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

  if (country && !/^[a-z]{2}$/.test(country)) {
    return NextResponse.json({ cities: [], error: "Некоректний код країни." }, { status: 400 });
  }
  if (q.length < 2) {
    return NextResponse.json({ cities: [] });
  }

  const region = regionalCity(q, country);
  if (region) {
    return NextResponse.json({ cities: [{ name: region.city, displayName: `${region.city}, Україна`, lat: region.lat, lng: region.lng, country: "ua", type: "city" }] });
  }
  try {
    // Photon supports autocomplete. Keep public Nominatim for submitted searches.
    const hits = await fromPhoton(q, country);
    return NextResponse.json({ cities: dedupe(rankHits(hits, q)) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "geocode error";
    console.error("[Geocode API] Error:", message);
    return NextResponse.json({ cities: [], error: message }, { status: 200 });
  }
}
