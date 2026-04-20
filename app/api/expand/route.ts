import { NextRequest } from "next/server";
import { createGroqClient } from "@/lib/groq";

export const runtime = "nodejs";
export const maxDuration = 30;

interface ExpandRequestBody {
  apiKey: string;
  model: string;
  prompt: string; // already substituted
}

export async function POST(req: NextRequest) {
  try {
    const body: ExpandRequestBody = await req.json();
    const { apiKey, model, prompt } = body;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing API key" }), { status: 400 });
    }

    const groq = createGroqClient(apiKey);

    const stream = await groq.chat.completions.create({
      model,
      stream: true,
      temperature: 0.5,
      max_tokens: 768,
      messages: [{ role: "user", content: prompt }],
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
    const message =
      (err as { error?: { message?: string } })?.error?.message ??
      (err instanceof Error ? err.message : "Expand failed");
    console.error("[/api/expand]", message);
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
