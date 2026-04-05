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

    const data = await resp.json();

    if (!resp.ok || !data.ok) {
      return NextResponse.json(
        { error: data.description || "Помилка відправки повідомлення в Telegram" },
        { status: resp.status }
      );
    }

    return NextResponse.json({ success: true, messageId: data.result?.message_id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Помилка сервера" },
      { status: 500 }
    );
  }
}
