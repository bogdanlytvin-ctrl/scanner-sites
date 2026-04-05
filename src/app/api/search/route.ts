import { NextRequest, NextResponse } from "next/server";
import { searchOverpass } from "@/lib/osm-search";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { city, query, maxResults = 20, radius = 15 } = body;

    if (!city || !query) {
      return NextResponse.json(
        { error: "Вкажіть місто та ключове слово" },
        { status: 400 }
      );
    }

    // Normalize inputs
    const trimmedCity = String(city).trim();
    const trimmedQuery = String(query).trim();
    const parsedMax = Math.min(Math.max(parseInt(maxResults) || 20, 1), 200);
    const parsedRadius = Math.min(Math.max(parseInt(radius) || 15, 1), 100);

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
      rating: null,
      reviews: 0,
      type: r.type,
      lat: r.lat,
      lng: r.lng,
    }));

    return NextResponse.json({
      businesses,
      total: businesses.length,
      query: `${trimmedQuery} in ${trimmedCity}`,
      source: "OpenStreetMap (Overpass)",
    });
  } catch (error) {
    console.error("[Search API]", error);
    const message =
      error instanceof Error ? error.message : "Невідома помилка";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
