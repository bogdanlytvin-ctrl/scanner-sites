import { NextRequest, NextResponse } from "next/server";
import { getTemplates, fillTemplate, getIssuesText, estimatePrice } from "@/lib/outreach-templates";
import type { LeadBusiness } from "@/lib/scoring";

export const maxDuration = 15;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { templateId, lead, city } = body as {
      templateId: string;
      lead: LeadBusiness;
      city: string;
    };

    if (!templateId || !lead) {
      return NextResponse.json(
        { error: "Потрібен templateId та lead" },
        { status: 400 }
      );
    }

    const templates = getTemplates();
    const template = templates.find((t) => t.id === templateId);

    if (!template) {
      return NextResponse.json(
        { error: `Шаблон "${templateId}" не знайдено` },
        { status: 404 }
      );
    }

    const issues = getIssuesText(lead);
    const filled = fillTemplate(template, {
      bizName: lead.name,
      issues,
      city: city || "вашому місті",
    });

    const price = estimatePrice(lead);

    return NextResponse.json({
      template: {
        id: template.id,
        name: template.name,
        channel: template.channel,
        tone: template.tone,
      },
      subject: filled.subject,
      body: filled.body,
      price,
    });
  } catch (error) {
    console.error("Outreach API error:", error);
    return NextResponse.json(
      { error: "Помилка генерації шаблону" },
      { status: 500 }
    );
  }
}
