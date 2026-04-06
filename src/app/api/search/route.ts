import { NextRequest, NextResponse } from "next/server";
import { searchOverpass, geocodeCity } from "@/lib/osm-search";

export const maxDuration = 60; // Vercel: Overpass API can take 30+ seconds

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { city, query, maxResults = 20, radius = 15 } = body;

    const trimmedCity = String(city || "").trim();
    const trimmedQuery = String(query || "").trim();

    if (!trimmedCity || !trimmedQuery) {
      return NextResponse.json(
        { error: "Вкажіть місто та ключове слово" },
        { status: 400 }
      );
    }
    const parsedMax = Math.min(Math.max(parseInt(maxResults) || 20, 1), 200);
    const parsedRadius = Math.min(Math.max(parseInt(radius) || 15, 1), 100);

    // First geocode the city so we can return the resolved location
    const geo = await geocodeCity(trimmedCity);

    const results = await searchOverpass(
      trimmedCity,
      trimmedQuery,
      parsedMax,
      parsedRadius
    );

    const businesses = results.slice(0, parsedMax).map((r) => ({
      name: r.name,
      phone: r.phone,
      website: r.website,
      address: r.address,
      email: r.email,
      facebook: r.facebook,
      instagram: r.instagram,
      telegram: r.telegram,
      openingHours: r.openingHours,
      description: r.description,
      rating: null,
      reviews: 0,
      type: r.type,
    }));

    return NextResponse.json({
      businesses,
      total: businesses.length,
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
    // Return 200 with error field so the client sees the actual message
    // (some proxies/CDNs strip 500 response bodies)
    return NextResponse.json({ error: message, businesses: [], total: 0 }, { status: 500 });
  }
}
