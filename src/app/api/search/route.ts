import { NextRequest, NextResponse } from "next/server";
import { searchOverpassAt, geocodeCity, validCoordinates } from "@/lib/osm-search";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const maxDuration = 60; // Vercel: Overpass API can take 30+ seconds

function parseCoordinate(value: unknown): number {
  if (typeof value === "number") return value;
  return typeof value === "string" && value.trim() ? Number(value) : NaN;
}

export async function POST(request: NextRequest) {
  try {
    const rl = rateLimit(`search:${clientIp(request)}`, 20, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Забагато запитів. Спробуйте через ${rl.retryAfter}с.`, businesses: [], total: 0 },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
      );
    }
    const body = await request.json();
    const { city, query, maxResults = 20, radius = 10, lat, lng, displayName, country } = body;

    const trimmedCity = String(city || "").trim();
    const trimmedQuery = String(query || "").trim();
    const trimmedCountry = String(country || "").trim().toLowerCase();

    if (!trimmedCity || !trimmedQuery) {
      return NextResponse.json(
        { error: "Вкажіть місто та ключове слово" },
        { status: 400 }
      );
    }
    if (trimmedCountry && !/^[a-z]{2}$/.test(trimmedCountry)) {
      return NextResponse.json({ error: "Некоректний код країни." }, { status: 400 });
    }
    const parsedMax = Math.min(Math.max(parseInt(maxResults) || 20, 1), 200);
    const parsedRadius = Math.min(Math.max(parseInt(radius) || 10, 1), 50);

    // If the client picked a city from autocomplete it sends exact coordinates,
    // so we skip geocoding entirely (more accurate, one less round-trip).
    const numLat = parseCoordinate(lat);
    const numLng = parseCoordinate(lng);
    const hasCoords = validCoordinates(numLat, numLng);

    const geo = hasCoords
      ? { lat: numLat, lng: numLng, displayName: String(displayName || trimmedCity) }
      : await geocodeCity(trimmedCity, trimmedCountry);

    const results = await searchOverpassAt(geo.lat, geo.lng, trimmedQuery, parsedMax, parsedRadius);

    const businesses = results.slice(0, parsedMax).map((r) => ({
      osmId: r.osmId,
      lat: r.lat,
      lng: r.lng,
      name: r.name,
      phone: r.phone,
      website: r.website,
      address: r.address,
      email: r.email,
      facebook: r.facebook,
      instagram: r.instagram,
      telegram: r.telegram,
      socialOnly: r.socialOnly,
      openingHours: r.openingHours,
      description: r.description,
      rating: null,
      reviews: 0,
      type: r.type,
    }));

    const note =
      businesses.length === 0
        ? `Не знайдено збігів для «${trimmedQuery}» у радіусі ${parsedRadius} км. ` +
          "Дані OpenStreetMap можуть бути неповними. Спробуйте іншу назву категорії або більший радіус."
        : undefined;

    return NextResponse.json({
      businesses,
      total: businesses.length,
      note,
      query: `${trimmedQuery} in ${trimmedCity}`,
      source: "OpenStreetMap (Overpass)",
      geoLocation: {
        lat: geo.lat,
        lng: geo.lng,
        displayName: geo.displayName,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Невідома помилка";
    console.error("[Search API] Error:", message);
    return NextResponse.json({ error: message, businesses: [], total: 0 }, { status: 500 });
  }
}
