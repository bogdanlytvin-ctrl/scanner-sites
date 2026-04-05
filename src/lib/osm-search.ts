// OpenStreetMap integration — completely free, no API key needed
// Uses Nominatim for geocoding + Overpass API for business search

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

// ─── Keyword → OSM tag mapping ───────────────────────────────
// Maps common business keywords to OSM amenity/craft/shop tags

const KEYWORD_MAP: Record<string, string[]> = {
  // Food & Drink
  restaurant: ["amenity=restaurant"],
  ресторан: ["amenity=restaurant"],
  pizza: ["amenity=restaurant", "amenity=fast_food", "cuisine=pizza"],
  піцерія: ["amenity=restaurant", "amenity=fast_food", "cuisine=pizza"],
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
  spa: ["leisure=spa"],

  // Home & Auto Services
  plumber: ["craft=plumber"],
  сантехнік: ["craft=plumber"],
  electrician: ["craft=electrician"],
  електрик: ["craft=electrician"],
  car_repair: ["craft=car_repair", "shop=car_repair"],
  сТО: ["craft=car_repair", "shop=car_repair"],
  auto: ["craft=car_repair", "shop=car", "shop=car_repair"],
  locksmith: ["craft=locksmith"],
  painter: ["craft=painter"],
  маляр: ["craft=painter"],
  carpenter: ["craft=carpenter"],
  тесляр: ["craft=carpenter"],

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
  atm: ["amenity=atm"],

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

  // Education
  school: ["amenity=school"],
  школа: ["amenity=school"],
  university: ["amenity=university"],
  університет: ["amenity=university"],
  kindergarten: ["amenity=kindergarten"],
  дитсадок: ["amenity=kindergarten"],

  // Hotels & Tourism
  hotel: ["tourism=hotel"],
  готель: ["tourism=hotel"],
  hostel: ["tourism=hostel"],
  hostел: ["tourism=hostel"],
  travel: ["office=travel_agent"],
  турагенція: ["office=travel_agent"],
};

// Generic fallback tags to search broadly
const GENERIC_TAGS = [
  "shop",
  "office",
  "craft",
];

/**
 * Geocode a city name to coordinates using Nominatim (free, no key)
 */
export async function geocodeCity(city: string): Promise<GeoCoords> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(city)}&limit=1`;

  const resp = await fetch(url, {
    headers: {
      "User-Agent": "LeadFinder/1.0 (lead-generator-app)",
    },
  });

  if (!resp.ok) {
    throw new Error(`Geocoding failed: ${resp.status}`);
  }

  const data = await resp.json();

  if (!data || data.length === 0) {
    throw new Error(`Місто "${city}" не знайдено. Спробуйте англійською або точніше.`);
  }

  const result = data[0];
  return {
    lat: parseFloat(result.lat),
    lng: parseFloat(result.lon),
    displayName: result.display_name,
  };
}

/**
 * Search businesses using OSM Overpass API (free, no key)
 */
export async function searchOverpass(
  city: string,
  keyword: string,
  maxResults: number = 20,
  radiusKm: number = 15
): Promise<OSMResult[]> {
  // Step 1: Geocode city
  const coords = await geocodeCity(city);

  // Step 2: Build Overpass query
  const query = buildOverpassQuery(keyword, coords.lat, coords.lng, radiusKm, maxResults);

  // Step 3: Execute query
  const url = "https://overpass-api.de/api/interpreter";
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "LeadFinder/1.0 (lead-generator-app)",
    },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!resp.ok) {
    // Try to read error body for details
    let detail = "";
    try {
      detail = await resp.text();
      // Extract meaningful part from HTML error pages
      const match = detail.match(/<p>([^<]{10,})<\/p>/i);
      if (match) detail = match[1].trim();
    } catch {}
    throw new Error(`Overpass API error ${resp.status}: ${detail || "bad request. Try a different keyword or city."}`);
  }

  const data = await resp.json();

  if (!data.elements || data.elements.length === 0) {
    return [];
  }

  // Step 4: Parse results
  return parseOverpassResults(data.elements, keyword);
}

function escapeOverpassRegex(str: string): string {
  // Escape special regex characters for Overpass QL
  return str.replace(/[\\^$.*+?()|[\]{}]/g, "\\$&");
}

function buildOverpassQuery(
  keyword: string,
  lat: number,
  lng: number,
  radiusKm: number,
  maxResults: number
): string {
  const keywordLower = keyword.toLowerCase().trim();
  const radius = radiusKm * 1000; // Convert to meters

  let tagConditions: string[] = [];

  // Check if keyword matches a known category
  const matchedTags = KEYWORD_MAP[keywordLower];
  if (matchedTags) {
    // Use specific tags for known categories
    for (const tag of matchedTags) {
      const [key, value] = tag.split("=");
      tagConditions.push(`node["${key}"="${value}"](around:${radius},${lat},${lng})`);
      tagConditions.push(`way["${key}"="${value}"](around:${radius},${lat},${lng})`);
    }
  } else {
    // No known category → name-based search + generic tags
    const escaped = escapeOverpassRegex(keyword);
    tagConditions.push(`node["name"~"${escaped}",i](around:${radius},${lat},${lng})`);
    tagConditions.push(`way["name"~"${escaped}",i](around:${radius},${lat},${lng})`);

    // Also add generic business tags
    for (const tag of GENERIC_TAGS) {
      tagConditions.push(`node["${tag}"~"${escaped}",i](around:${radius},${lat},${lng})`);
      tagConditions.push(`way["${tag}"~"${escaped}",i](around:${radius},${lat},${lng})`);
    }
  }

  const conditions = tagConditions.join("\n  ");

  return `[out:json][timeout:30];
(
  ${conditions}
);
out center;`.trim();
}

function parseOverpassResults(
  elements: any[],
  _searchKeyword: string
): OSMResult[] {
  const results: OSMResult[] = [];
  const seen = new Set<string>();

  for (const el of elements) {
    // Deduplicate by name + location
    const name = (el.tags?.name || "").trim();
    if (!name) continue;

    const key = `${name}_${el.lat || el.center?.lat}_${el.lon || el.center?.lon}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Get coordinates
    const lat = el.lat || el.center?.lat;
    const lng = el.lon || el.center?.lon;

    // Get address
    const address = buildAddress(el.tags);

    // Get phone
    const phone = el.tags?.phone || el.tags?.["contact:phone"] || "N/A";

    // Get website
    const website = el.tags?.website || el.tags?.["contact:website"] || "N/A";

    // Determine type from tags
    const type = el.tags?.amenity || el.tags?.shop || el.tags?.craft || el.tags?.office || el.tags?.tourism || "business";

    results.push({
      name,
      phone: cleanPhone(phone),
      website,
      address,
      lat: lat || 0,
      lng: lng || 0,
      tags: el.tags || {},
      type,
    });
  }

  return results;
}

function buildAddress(tags: Record<string, string>): string {
  const parts: string[] = [];

  if (tags["addr:street"]) {
    let street = tags["addr:street"];
    if (tags["addr:housenumber"]) {
      street += ` ${tags["addr:housenumber"]}`;
    }
    parts.push(street);
  }

  if (tags["addr:city"] || tags["addr:town"] || tags["addr:village"]) {
    parts.push(tags["addr:city"] || tags["addr:town"] || tags["addr:village"] || "");
  }

  if (tags["addr:postcode"]) {
    parts.push(tags["addr:postcode"]);
  }

  return parts.length > 0 ? parts.join(", ") : "N/A";
}

function cleanPhone(phone: string): string {
  if (!phone || phone === "N/A") return "N/A";

  // Take the first phone if multiple are listed
  const first = phone.split(";")[0].split(",")[0].trim();

  // Remove extra formatting
  return first;
}

/**
 * Convert OSM results to LeadBusiness format (before website analysis)
 */
export function osmToLeadBusiness(result: OSMResult): Omit<LeadBusiness, "copyrightYear" | "isMobileFriendly" | "score"> {
  return {
    name: result.name,
    phone: result.phone,
    website: result.website,
    address: result.address,
    rating: null, // OSM doesn't provide ratings
    reviews: 0,
  };
}
