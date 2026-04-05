import { NextRequest, NextResponse } from "next/server";
import { searchOverpass } from "@/lib/osm-search";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { city, query, maxResults = 20 } = body;

    if (!city || !query) {
      return NextResponse.json(
        { error: "City and query are required" },
        { status: 400 }
      );
    }

    // Search using OpenStreetMap (completely free, no API key)
    const results = await searchOverpass(city, query, maxResults);

    // Convert to standard format
    const businesses = results.slice(0, maxResults).map((r) => ({
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
      query: `${query} in ${city}`,
      source: "OpenStreetMap",
    });
  } catch (error) {
    console.error("Search API error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
