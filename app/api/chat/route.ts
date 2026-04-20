import { NextRequest } from "next/server";
import { createGroqClient } from "@/lib/groq";

export const runtime = "nodejs";
export const maxDuration = 60;

interface ChatRequestBody {
  apiKey: string;
  model: string;
  systemPrompt: string;
  messages: { role: "user" | "assistant"; content: string }[];
}

export async function POST(req: NextRequest) {
  try {
    const body: ChatRequestBody = await req.json();
    const { apiKey, model, systemPrompt, messages } = body;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing API key" }), { status: 400 });
    }

    const groq = createGroqClient(apiKey);

    const stream = await groq.chat.completions.create({
      model,
      stream: true,
      temperature: 0.6,
      max_tokens: 1024,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
    });

    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content ?? "";
            if (delta) controller.enqueue(encoder.encode(delta));
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache",
      },
    });
  } catch (err: unknown) {
    // Extract the real Groq error message if available
    const message =
      (err as { error?: { message?: string } })?.error?.message ??
      (err instanceof Error ? err.message : "Chat failed");
    console.error("[/api/chat]", message);
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
