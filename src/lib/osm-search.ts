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
  email: string;
  facebook: string;
  instagram: string;
  telegram: string;
  openingHours: string;
  description: string;
  lat: number;
  lng: number;
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

  // For Cyrillic queries: verify Photon result is actually in UA
  // If not, try Nominatim which supports country filter
  const isCyrillicQuery = /[а-яА-ЯёЁіІїЇєЄґҐ]/.test(city);
  if (coords && isCyrillicQuery) {
    // Check if the Photon result is in Ukraine by trying Nominatim with UA filter
    const nominatimResult = await geocodeNominatim(city);
    if (nominatimResult) {
      // If Photon returned non-UA result (e.g. Belarus), prefer Nominatim
      // Simple heuristic: if Nominatim display name contains "Україн", prefer it
      if (nominatimResult.displayName.includes("Україн") || nominatimResult.displayName.includes("Ukraine")) {
        coords = nominatimResult;
      }
    }
  }

  // Fallback to Nominatim
  if (!coords) {
    coords = await geocodeNominatim(city);
  }

  // Second attempt: append "місто" (Ukrainian for "city") to prioritize city results
  if (!coords) {
    coords = await geocodePhoton(`${city} місто`);
    if (!coords) {
      coords = await geocodeNominatim(`${city} місто`);
    }
  }

  if (!coords) {
    throw new Error(
      `Місто "${city}" не знайдено. Спробуйте: Kyiv, Дніпро, Львів, London...`
    );
  }

  console.log(`[Geo] "${city}" → ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)} (${coords.displayName})`);

  // Cache result
  (coords as any)._ts = Date.now();
  geoCache.set(cacheKey, coords);

  return coords;
}

async function geocodePhoton(city: string): Promise<GeoCoords | null> {
  try {
    // Request multiple results so we can filter for city/settlement types
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(city)}&limit=10`;
    const resp = await fetch(url, {
      headers: { "User-Agent": "LeadFinder/1.0" },
    });

    if (!resp.ok) return null;

    // Check content-type before parsing JSON
    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.includes("json")) {
      console.warn(`[Photon] Non-JSON response (content-type: ${contentType}, status: ${resp.status}) for city: ${city}`);
      return null;
    }

    let data: any;
    try {
      data = await resp.json();
    } catch (parseErr) {
      console.warn(`[Photon] JSON parse error for city: ${city}`, parseErr);
      return null;
    }

    const features = data?.features;
    if (!features || features.length === 0) return null;

    // Types that should NEVER be selected as a city (rivers, stations, etc.)
    const excludedTypes = new Set([
      "river", "water", "stream", "waterway", "canal", "lake",
      "station", "bus_stop", "tram_stop", "railway",
      "industrial", "garages", "quarry", "water_tower",
      "hotel", "motel", "hostel", "guest_house",
    ]);

    // Priority order for settlement types (higher = better)
    const typePriority: Record<string, number> = {
      city: 10,
      town: 8,
      municipality: 7,
      borough: 6,
      village: 5,
      suburb: 4,
      hamlet: 3,
      neighbourhood: 2,
      quarter: 2,
      district: 1,
    };

    // Detect if query is in Cyrillic → prefer Ukrainian results
    const isCyrillic = /[а-яА-ЯёЁіІїЇєЄґҐ]/.test(city);

    // Score and sort results
    const scored = features.map((f: any) => {
      const props = f.properties || {};
      const osmType = props.osm_value || props.type || "";
      const country = (props.countrycode || "").toUpperCase();
      const state = props.state || "";

      // Skip excluded types entirely
      if (excludedTypes.has(osmType)) return { feature: f, score: -999 };

      let score = typePriority[osmType] || 0;

      // Bonus for Cyrillic query → prefer UA results
      if (isCyrillic && country === "UA") score += 20;
      // Small bonus for BY/RU if Cyrillic (but much less than UA)
      if (isCyrillic && (country === "BY" || country === "RU")) score += 5;

      // Check for oblast/state names that indicate major Ukrainian cities
      const majorCityStates = [
        "Дніпропетровська", "Київська", "Львівська", "Одеська",
        "Харківська", "Донецька", "Запорізька", "Вінницька",
      ];
      if (majorCityStates.some((s) => state.includes(s))) score += 15;

      return { feature: f, score };
    });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Find best valid result
    const best = scored.find((s) => s.score > 0);
    if (!best) return null;

    const f = best.feature;
    const props = f.properties || {};
    const coords = f.geometry?.coordinates;

    if (!coords) return null;

    // Build display name with country context
    const state = props.state ? `, ${props.state}` : "";
    const country = props.country ? ` (${props.country})` : "";
    const displayName = `${props.name || city}${state}${country}`;

    return {
      lat: coords[1],
      lng: coords[0],
      displayName,
    };
  } catch {
    return null;
  }
}

async function geocodeNominatim(city: string): Promise<GeoCoords | null> {
  try {
    // Detect Cyrillic for language/country preference
    const isCyrillic = /[а-яА-ЯёЁіІїЇєЄґҐ]/.test(city);
    const lang = isCyrillic ? "uk,en" : "en";

    // Request more results for better filtering
    let url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(city)}&limit=10&accept-language=${lang}`;

    // For Cyrillic queries, prioritize Ukrainian results
    if (isCyrillic) {
      url += `&countrycodes=ua`; // Only Ukrainian results for Cyrillic queries
    }

    const resp = await fetch(url, {
      headers: {
        "User-Agent": "LeadFinder/1.0 (educational tool; +https://github.com)",
      },
    });

    // Nominatim returns 403 when rate-limited
    if (!resp.ok) return null;

    // Check content-type before parsing JSON
    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.includes("json")) {
      console.warn(`[Nominatim] Non-JSON response (content-type: ${contentType}, status: ${resp.status}) for city: ${city}`);
      return null;
    }

    let data: any;
    try {
      data = await resp.json();
    } catch (parseErr) {
      console.warn(`[Nominatim] JSON parse error for city: ${city}`, parseErr);
      return null;
    }

    if (!data || data.length === 0) return null;

    // Excluded types: rivers, waterways, stations, etc.
    const excludedClasses = new Set(["waterway", "railway", "highway", "natural"]);
    const excludedTypes = new Set(["river", "stream", "lake", "canal", "station", "bus_stop"]);

    // Filter out non-settlement results
    const settlementTypes = new Set(["city", "town", "village", "hamlet", "municipality", "borough"]);

    // Priority: city with class=place > administrative boundary > town/village
    const typePriority: Record<string, number> = {
      city: 10,
      town: 7,
      village: 5,
      municipality: 6,
      borough: 4,
      hamlet: 3,
      administrative: 2,
    };

    const scored = data.map((r: any) => {
      const type = (r.type || "").toLowerCase();
      const cls = String(r.class || "");

      // Exclude waterways, railways, highways
      if (excludedClasses.has(cls) || excludedTypes.has(type)) {
        return { result: r, score: -999 };
      }

      let score = typePriority[type] || 0;

      // Bonus for class=place
      if (cls === "place") score += 5;

      // Bonus for importance
      score += (r.importance || 0) * 10;

      return { result: r, score };
    });

    scored.sort((a, b) => b.score - a.score);

    const best = scored.find((s) => s.score > 0);
    if (!best) return null;

    const result = best.result;

    return {
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
      displayName: result.display_name || city,
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
      email: extractEmail(el.tags),
      facebook: el.tags?.["contact:facebook"] || "",
      instagram: el.tags?.["contact:instagram"] || "",
      telegram: el.tags?.["contact:telegram"] || "",
      openingHours: el.tags?.["opening_hours"] || "",
      description: el.tags?.["description"] || "",
      lat,
      lng,
      type: el.tags?.amenity || el.tags?.shop || el.tags?.craft || el.tags?.office || el.tags?.tourism || "business",
    });
  }

  return results;
}

function extractEmail(tags: Record<string, string> | undefined): string {
  if (!tags) return "";
  return tags["email"] || tags["contact:email"] || "";
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
