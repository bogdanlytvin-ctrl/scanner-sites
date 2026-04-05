import { NextRequest, NextResponse } from "next/server";

const GOOGLE_API_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json";
const GOOGLE_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { apiKey, city, query, maxResults = 20 } = body;

    if (!apiKey) {
      return NextResponse.json(
        { error: "GOOGLE_API_KEY is required" },
        { status: 400 }
      );
    }

    if (!city || !query) {
      return NextResponse.json(
        { error: "City and query are required" },
        { status: 400 }
      );
    }

    const searchQuery = `${query} in ${city}`;

    // Step 1: Text search
    const searchResp = await fetch(
      `${GOOGLE_API_URL}?query=${encodeURIComponent(searchQuery)}&key=${apiKey}`
    );

    if (!searchResp.ok) {
      return NextResponse.json(
        { error: "Google Maps API request failed" },
        { status: 502 }
      );
    }

    const searchData = await searchResp.json();

    if (searchData.status !== "OK" && searchData.status !== "ZERO_RESULTS") {
      return NextResponse.json(
        { error: `Google API error: ${searchData.status} - ${searchData.error_message || "Unknown error"}` },
        { status: 502 }
      );
    }

    const results = (searchData.results || []).slice(0, maxResults);

    if (!results.length) {
      return NextResponse.json({ businesses: [], total: 0 });
    }

    // Step 2: Get details for each place (phone + website)
    const businesses = [];
    const seenIds = new Set<string>();

    for (const place of results) {
      const placeId = place.place_id;
      if (!placeId || seenIds.has(placeId)) continue;
      seenIds.add(placeId);

      let phone = "N/A";
      let website = "N/A";

      try {
        const detailResp = await fetch(
          `${GOOGLE_DETAILS_URL}?place_id=${placeId}&fields=formatted_phone_number,website&key=${apiKey}`
        );
        if (detailResp.ok) {
          const detailData = await detailResp.json();
          if (detailData.status === "OK" && detailData.result) {
            phone = detailData.result.formatted_phone_number || "N/A";
            website = detailData.result.website || "N/A";
          }
        }
      } catch {
        // Skip detail fetch error, use defaults
      }

      businesses.push({
        name: place.name || "N/A",
        phone,
        website,
        address: place.formatted_address || "N/A",
        rating: place.rating || null,
        reviews: place.user_ratings_total || 0,
        placeId,
      });

      // Small delay to avoid rate limiting
      await new Promise((r) => setTimeout(r, 100));
    }

    return NextResponse.json({
      businesses,
      total: businesses.length,
      query: searchQuery,
    });
  } catch (error) {
    console.error("Search API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
