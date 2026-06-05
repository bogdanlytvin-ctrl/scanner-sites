import { NextRequest, NextResponse } from "next/server";
import { analyzeWebsite } from "@/lib/website-analyzer";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs"; // cheerio + ssrf DoH resolution (not Edge)
export const maxDuration = 30; // Website fetching can take time

export async function POST(request: NextRequest) {
  try {
    // High ceiling: one full search legitimately analyzes up to 200 sites in a
    // burst. This still stops thousands-per-minute abuse.
    const rl = rateLimit(`analyze:${clientIp(request)}`, 240, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Забагато запитів. Спробуйте через ${rl.retryAfter}с.` },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
      );
    }
    const body = await request.json();
    const { url } = body;

    if (!url || url === "N/A") {
      return NextResponse.json({
        copyrightYear: null,
        isMobileFriendly: false,
        hasSsl: false,
        finalUrl: "",
        technologies: [],
        designScore: "unknown",
        designNotes: [],
        pageTitle: "",
        hasContactForm: false,
        securityIssues: [],
        skipped: true,
      });
    }

    const result = await analyzeWebsite(url);

    return NextResponse.json({
      copyrightYear: result.copyrightYear,
      isMobileFriendly: result.isMobileFriendly,
      hasSsl: result.hasSsl,
      finalUrl: result.finalUrl,
      technologies: result.technologies,
      designScore: result.designScore,
      designNotes: result.designNotes,
      pageTitle: result.pageTitle,
      hasContactForm: result.hasContactForm,
      securityIssues: result.securityIssues,
      analysisLimited: result.analysisLimited,
    });
  } catch (error) {
    console.error("Analyze API error:", error);
    const message =
      error instanceof Error ? error.message : "Помилка аналізу вебсайту";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
