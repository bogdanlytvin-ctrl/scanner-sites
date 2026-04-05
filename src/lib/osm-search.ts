// OpenStreetMap integration — completely free, no API key needed
// Uses Nominatim for geocoding + Overpass API for business search
//
// Tested endpoints & queries — all verified working

import type { LeadBusiness } from "./scoring";

export interface GeoCoords {
  lat: number;
  lng: number;
  displayName: string;
}

export interface OSMResult {
  name: string;
  phone: string;
  website: string;
  address: string;
  lat: number;
  lng: number;
  tags: Record<string, string>;
  type: string;
}

// ─── Overpass endpoints (fallback chain) ────────────────────

const OVERPASS_ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

// ─── Keyword → OSM tag mapping ───────────────────────────────

const KEYWORD_MAP: Record<string, string[]> = {
  // Food & Drink
  restaurant: ["amenity=restaurant"],
  ресторан: ["amenity=restaurant"],
  pizza: ["amenity=restaurant", "cuisine=pizza"],
  піцерія: ["amenity=restaurant", "cuisine=pizza"],
  cafe: ["amenity=cafe"],
  café: ["amenity=cafe"],
  кафе: ["amenity=cafe"],
  coffee: ["amenity=cafe", "cuisine=coffee_shop"],
  кавʼярня: ["amenity=cafe", "cuisine=coffee_shop"],
  bakery: ["shop=bakery"],
  пекарня: ["shop=bakery"],
  bar: ["amenity=bar"],
  бар: ["amenity=bar"],
  sushi: ["amenity=restaurant", "cuisine=sushi"],
  фастфуд: ["amenity=fast_food"],
  fast_food: ["amenity=fast_food"],
  food: ["amenity=restaurant", "amenity=fast_food", "amenity=cafe"],
  їжа: ["amenity=restaurant", "amenity=fast_food", "amenity=cafe"],
  пиво: ["amenity=bar", "microbrewery=yes"],
  beer: ["amenity=bar", "microbrewery=yes"],

  // Health
  dentist: ["amenity=dentist"],
  стоматолог: ["amenity=dentist"],
  doctor: ["amenity=doctors"],
  лікар: ["amenity=doctors"],
  pharmacy: ["amenity=pharmacy"],
  аптека: ["amenity=pharmacy"],
  hospital: ["amenity=hospital"],
  лікарня: ["amenity=hospital"],
  veterinary: ["amenity=veterinary"],
  ветлікарня: ["amenity=veterinary"],
  gym: ["leisure=fitness_centre"],
  спортзал: ["leisure=fitness_centre"],
  beauty: ["shop=beauty"],
  салон: ["shop=beauty", "shop=hairdresser"],
  hairdresser: ["shop=hairdresser"],
  перукарня: ["shop=hairdresser"],
  massage: ["shop=massage"],
  масаж: ["shop=massage"],
  nails: ["shop=beauty"],
  нігті: ["shop=beauty"],
  spa: ["leisure=spa"],

  // Home & Auto Services
  plumber: ["craft=plumber"],
  сантехнік: ["craft=plumber"],
  electrician: ["craft=electrician"],
  електрик: ["craft=electrician"],
  car_repair: ["craft=car_repair", "shop=car_repair"],
  сто: ["craft=car_repair", "shop=car_repair"],
  auto: ["craft=car_repair", "shop=car", "shop=car_repair"],
  locksmith: ["craft=locksmith"],
  painter: ["craft=painter"],
  маляр: ["craft=painter"],
  carpenter: ["craft=carpenter"],
  тесляр: ["craft=carpenter"],
  roofer: ["craft=roofer"],
  дахівець: ["craft=roofer"],

  // Professional Services
  lawyer: ["office=lawyer"],
  юрист: ["office=lawyer"],
  accountant: ["office=accountant"],
  бухгалтер: ["office=accountant"],
  real_estate: ["office=estate_agent"],
  нерухомість: ["office=estate_agent"],
  insurance: ["office=insurance"],
  страхування: ["office=insurance"],
  bank: ["amenity=bank"],
  банк: ["amenity=bank"],
  notary: ["office=notary"],
  нотаріус: ["office=notary"],
  architect: ["office=architect"],
  архітектор: ["office=architect"],

  // Shopping
  clothes: ["shop=clothes"],
  одяг: ["shop=clothes"],
  supermarket: ["shop=supermarket"],
  супермаркет: ["shop=supermarket"],
  electronics: ["shop=electronics"],
  електроніка: ["shop=electronics"],
  flowers: ["shop=florist"],
  квіти: ["shop=florist"],
  bookstore: ["shop=books"],
  книжковий: ["shop=books"],
  shoes: ["shop=shoes"],
  взуття: ["shop=shoes"],
  jewelry: ["shop=jewelry"],
  ювелір: ["shop=jewelry"],
  optician: ["shop=optician"],
  оптик: ["shop=optician"],

  // Education
  school: ["amenity=school"],
  школа: ["amenity=school"],
  university: ["amenity=university"],
  університет: ["amenity=university"],
  kindergarten: ["amenity=kindergarten"],
  дитсадок: ["amenity=kindergarten"],
  courses: ["amenity=school", "school=language"],

  // Hotels & Tourism
  hotel: ["tourism=hotel"],
  готель: ["tourism=hotel"],
  hostel: ["tourism=hostel"],
  хостел: ["tourism=hostel"],
  travel: ["office=travel_agent"],
  турагенція: ["office=travel_agent"],

  // Fuel & Transport
  gas: ["amenity=fuel"],
  заправка: ["amenity=fuel"],
  parking: ["amenity=parking"],
  паркування: ["amenity=parking"],
  car_wash: ["amenity=car_wash"],
  мийка: ["amenity=car_wash"],

  // Religious
  church: ["amenity=place_of_worship"],
  церква: ["amenity=place_of_worship"],
};

// Broad tags for unknown keywords — combined with name search to avoid timeout
const BROAD_BUSINESS_TAGS = [
  "amenity=restaurant",
  "amenity=cafe",
  "amenity=fast_food",
  "amenity=bar",
  "shop",
  "office",
  "craft",
];

// ─── Geocoding cache (in-memory) ────────────────────────────
const geoCache = new Map<string, GeoCoords>();
const GEO_CACHE_TTL = 3600_000; // 1 hour

// ─── Geocoding (Photon + Nominatim fallback) ────────────────

export async function geocodeCity(city: string): Promise<GeoCoords> {
  const cacheKey = city.toLowerCase().trim();
  const cached = geoCache.get(cacheKey);
  if (cached && Date.now() - (cached as any)._ts < GEO_CACHE_TTL) {
    return cached;
  }

  // Try Photon first (no strict rate limits)
  let coords = await geocodePhoton(city);

  // Fallback to Nominatim
  if (!coords) {
    coords = await geocodeNominatim(city);
  }

  if (!coords) {
    throw new Error(
      `Місто "${city}" не знайдено. Спробуйте: Kyiv, London, New York, Berlin...`
    );
  }

  // Cache result
  (coords as any)._ts = Date.now();
  geoCache.set(cacheKey, coords);

  return coords;
}

async function geocodePhoton(city: string): Promise<GeoCoords | null> {
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(city)}&limit=1`;
    const resp = await fetch(url, {
      headers: { "User-Agent": "LeadFinder/1.0" },
    });

    if (!resp.ok) return null;

    const data = await resp.json();
    const features = data?.features;
    if (!features || features.length === 0) return null;

    const f = features[0];
    const props = f.properties || {};
    const coords = f.geometry?.coordinates;

    if (!coords) return null;

    return {
      lat: coords[1],
      lng: coords[0],
      displayName: props.name || city,
    };
  } catch {
    return null;
  }
}

async function geocodeNominatim(city: string): Promise<GeoCoords | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(city)}&limit=1&accept-language=en`;
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "LeadFinder/1.0 (educational tool; +https://github.com)",
      },
    });

    // Nominatim returns 403 when rate-limited
    if (!resp.ok) return null;

    const data = await resp.json();
    if (!data || data.length === 0) return null;

    return {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
      displayName: data[0].display_name || city,
    };
  } catch {
    return null;
  }
}

// ─── Main search function ───────────────────────────────────

export async function searchOverpass(
  city: string,
  keyword: string,
  maxResults: number = 20,
  radiusKm: number = 15
): Promise<OSMResult[]> {
  // Step 1: Geocode city
  const coords = await geocodeCity(city);

  // Step 2: Determine search strategy
  const keywordLower = keyword.toLowerCase().trim();
  const matchedTags = KEYWORD_MAP[keywordLower];

  // Step 3: Build & execute query with fallback
  let allElements: any[] = [];

  if (matchedTags) {
    // ── Known category: precise tag search (fast & reliable) ──
    // Search nodes and ways separately because output format differs
    const nodeElements = await executeQuery(
      buildTagQuery(matchedTags, coords.lat, coords.lng, radiusKm, maxResults, "node"),
    );
    allElements.push(...nodeElements);

    if (allElements.length < maxResults) {
      const wayElements = await executeQuery(
        buildTagQuery(matchedTags, coords.lat, coords.lng, radiusKm, maxResults, "way"),
      );
      allElements.push(...wayElements);
    }
  } else {
    // ── Unknown keyword: broad search with name filter ──
    const elements = await executeQuery(
      buildBroadQuery(keyword, coords.lat, coords.lng, radiusKm, maxResults),
    );
    allElements.push(...elements);
  }

  // Step 4: Parse & deduplicate
  if (allElements.length === 0) {
    return [];
  }

  return parseOverpassResults(allElements, maxResults);
}

// ─── Query builders ─────────────────────────────────────────

function buildTagQuery(
  tags: string[],
  lat: number,
  lng: number,
  radiusKm: number,
  maxResults: number,
  elementType: "node" | "way"
): string {
  const radius = Math.min(radiusKm * 1000, 50000); // Cap at 50km
  const conditions: string[] = [];

  for (const tag of tags) {
    const [key, value] = tag.split("=");
    if (value) {
      conditions.push(`${elementType}["${key}"="${value}"](around:${radius},${lat},${lng});`);
    } else {
      conditions.push(`${elementType}["${key}"](around:${radius},${lat},${lng});`);
    }
  }

  // Use "out body" for nodes (has lat/lon directly) or "out center" for ways
  const output = elementType === "node" ? "out body" : "out center";

  return (
    `[out:json][timeout:30];\n` +
    `(\n  ${conditions.join("\n  ")}\n);\n` +
    `${output};`
  );
}

function buildBroadQuery(
  keyword: string,
  lat: number,
  lng: number,
  radiusKm: number,
  maxResults: number
): string {
  const radius = Math.min(radiusKm * 1000, 25000); // Smaller radius for broad search (cap 25km)
  // Escape regex special chars (safe subset — no need for full escaping)
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const conditions: string[] = [];

  // Search by name across broad business categories
  for (const tag of BROAD_BUSINESS_TAGS) {
    const [key, value] = tag.split("=");
    if (value) {
      conditions.push(`node["${key}"="${value}"]["name"~"${escaped}",i](around:${radius},${lat},${lng});`);
      conditions.push(`way["${key}"="${value}"]["name"~"${escaped}",i](around:${radius},${lat},${lng});`);
    } else {
      conditions.push(`node["${key}"]["name"~"${escaped}",i](around:${radius},${lat},${lng});`);
      conditions.push(`way["${key}"]["name"~"${escaped}",i](around:${radius},${lat},${lng});`);
    }
  }

  return (
    `[out:json][timeout:30];\n` +
    `(\n  ${conditions.join("\n  ")}\n);\n` +
    `out body qt ${maxResults};`
  );
}

// ─── Query execution with fallback ──────────────────────────

async function executeQuery(query: string): Promise<any[]> {
  let lastError = "";

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "LeadFinder/1.0 (lead-generator-tool)",
        },
        body: `data=${encodeURIComponent(query)}`,
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        lastError = extractOverpassError(text, resp.status);
        console.warn(`[Overpass] ${endpoint} → ${resp.status}, trying next...`);
        continue;
      }

      // Check if response is JSON (not HTML error page)
      const contentType = resp.headers.get("content-type") || "";
      if (!contentType.includes("json")) {
        const text = await resp.text().catch(() => "");
        lastError = extractOverpassError(text, resp.status);
        console.warn(`[Overpass] ${endpoint} → non-JSON response, trying next...`);
        continue;
      }

      const data = await resp.json();

      if (!data.elements || data.elements.length === 0) {
        return [];
      }

      // Check for Overpass runtime errors in response
      if (data.remark && data.remark.includes("error")) {
        lastError = data.remark;
        console.warn(`[Overpass] ${endpoint} → runtime error: ${data.remark}`);
        continue;
      }

      return data.elements;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.warn(`[Overpass] ${endpoint} → ${lastError}, trying next...`);
    }
  }

  // All endpoints failed
  throw new Error(lastError || "Усі сервери Overpass недоступні. Спробуйте пізніше.");
}

function extractOverpassError(html: string, status: number): string {
  // Extract error message from HTML response
  const match = html.match(/<strong[^>]*>Error<\/strong>:\s*(.+?)(?:<\/p>|<br)/i);
  if (match) return match[1].trim();

  if (html.includes("timeout")) {
    return "Сервер Overpass перевантажений. Спробуйте зменшити радіус або кількість результатів.";
  }
  if (html.includes("too busy")) {
    return "Сервер Overpass перевантажений. Спробуйте через хвилину.";
  }

  return `Overpass API помилка ${status}. Спробуйте пізніше або зменште радіус пошуку.`;
}

// ─── Parse results ──────────────────────────────────────────

function parseOverpassResults(elements: any[], maxResults: number): OSMResult[] {
  const results: OSMResult[] = [];
  const seen = new Set<string>();

  for (const el of elements) {
    if (results.length >= maxResults) break;

    const name = (el.tags?.name || "").trim();
    if (!name) continue;

    // Coordinates: nodes have lat/lon directly, ways have center
    const lat = el.lat ?? el.center?.lat ?? 0;
    const lng = el.lon ?? el.center?.lon ?? 0;
    if (lat === 0 && lng === 0) continue;

    // Deduplicate by name + approximate location (0.001° ≈ 100m)
    const locKey = `${Math.round(lat * 1000)}_${Math.round(lng * 1000)}`;
    const dedupKey = `${name.toLowerCase()}@${locKey}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    results.push({
      name,
      phone: extractPhone(el.tags),
      website: extractWebsite(el.tags),
      address: buildAddress(el.tags),
      lat,
      lng,
      tags: el.tags || {},
      type: el.tags?.amenity || el.tags?.shop || el.tags?.craft || el.tags?.office || el.tags?.tourism || "business",
    });
  }

  return results;
}

function extractPhone(tags: Record<string, string> | undefined): string {
  if (!tags) return "N/A";
  const phone = tags["phone"] || tags["contact:phone"] || tags["contact:mobile"] || "";
  if (!phone) return "N/A";

  // Take first phone if multiple
  const first = phone.split(";")[0].split(",")[0].trim();
  return first;
}

function extractWebsite(tags: Record<string, string> | undefined): string {
  if (!tags) return "N/A";
  return tags["website"] || tags["contact:website"] || "N/A";
}

function buildAddress(tags: Record<string, string> | undefined): string {
  if (!tags) return "N/A";
  const parts: string[] = [];

  const street = tags["addr:street"];
  const number = tags["addr:housenumber"];
  if (street) {
    parts.push(number ? `${street} ${number}` : street);
  }

  const city = tags["addr:city"] || tags["addr:town"] || tags["addr:village"];
  if (city) parts.push(city);

  const postcode = tags["addr:postcode"];
  if (postcode) parts.push(postcode);

  return parts.length > 0 ? parts.join(", ") : "N/A";
}
