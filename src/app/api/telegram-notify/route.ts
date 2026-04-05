import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { botToken, chatId, message } = body;

    if (!botToken || !chatId || !message) {
      return NextResponse.json(
        { error: "Вкажіть botToken, chatId та message" },
        { status: 400 }
      );
    }

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    if (!resp.ok) {
      // Try to extract error details from response body
      let errorDetail = `HTTP ${resp.status}`;
      try {
        const contentType = resp.headers.get("content-type") || "";
        if (contentType.includes("json")) {
          const data = await resp.json();
          errorDetail = data.description || errorDetail;
        } else {
          const text = await resp.text();
          errorDetail = text.slice(0, 200) || errorDetail;
        }
      } catch {
        // Could not read response body
      }
      return NextResponse.json(
        { error: `Помилка Telegram API: ${errorDetail}` },
        { status: resp.status }
      );
    }

    // Validate content-type before parsing JSON
    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.includes("json")) {
      return NextResponse.json(
        { error: `Telegram API повернув неочікуваний формат відповіді (content-type: ${contentType})` },
        { status: 502 }
      );
    }

    let data: any;
    try {
      data = await resp.json();
    } catch (parseErr) {
      return NextResponse.json(
        { error: `Помилка парсингу відповіді Telegram: ${parseErr instanceof Error ? parseErr.message : "невідомо"}` },
        { status: 502 }
      );
    }

    if (!data.ok) {
      return NextResponse.json(
        { error: data.description || "Помилка відправки повідомлення в Telegram" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, messageId: data.result?.message_id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Помилка сервера при відправці в Telegram" },
      { status: 500 }
    );
  }
}
