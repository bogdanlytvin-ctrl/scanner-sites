import { NextRequest, NextResponse } from "next/server";
import { analyzeWebsite } from "@/lib/website-analyzer";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url || url === "N/A") {
      return NextResponse.json({
        copyrightYear: null,
        isMobileFriendly: false,
        skipped: true,
      });
    }

    const result = await analyzeWebsite(url);

    return NextResponse.json({
      copyrightYear: result.copyrightYear,
      isMobileFriendly: result.isMobileFriendly,
    });
  } catch (error) {
    console.error("Analyze API error:", error);
    return NextResponse.json(
      { error: "Analysis failed" },
      { status: 500 }
    );
  }
}
