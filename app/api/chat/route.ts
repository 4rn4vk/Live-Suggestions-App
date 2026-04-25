import { NextRequest } from "next/server";
import { z } from "zod";
import { createGroqClient } from "@/lib/groq";

export const runtime = "nodejs";
export const maxDuration = 60;

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(20000),
});

const ChatSchema = z.object({
  model: z.string().min(1).max(100),
  systemPrompt: z.string().max(5000),
  messages: z.array(MessageSchema).max(100),
});

export async function POST(req: NextRequest) {
  try {
    const apiKey = req.cookies.get("groq_api_key")?.value;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing API key" }), { status: 401 });
    }

    let rawBody: unknown;
    try { rawBody = await req.json(); } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
    }
    const parsed = ChatSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.issues[0].message }), { status: 400 });
    }
    const { model, systemPrompt, messages } = parsed.data;

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
