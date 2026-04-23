import { NextRequest, NextResponse } from "next/server";
import { createGroqClient } from "@/lib/groq";
import type { Suggestion, SuggestionKind } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 30;

interface SuggestionsRequestBody {
  apiKey: string;
  model: string;
  prompt: string; // already has {transcript} substituted by the client
}

export async function POST(req: NextRequest) {
  try {
    const body: SuggestionsRequestBody = await req.json();
    const { apiKey, model, prompt } = body;

    if (!apiKey) return NextResponse.json({ error: "Missing API key" }, { status: 400 });
    if (!prompt) return NextResponse.json({ error: "Missing prompt" }, { status: 400 });

    const groq = createGroqClient(apiKey);

    const completion = await groq.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: "You are an AI meeting copilot. Always respond with valid JSON in the exact format requested.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 1024,
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";

    let parsed: { kind: string; preview: string }[];
    try {
      const obj = JSON.parse(raw);
      // Support both { suggestions: [...] } and bare [...]
      parsed = Array.isArray(obj) ? obj : (obj.suggestions ?? []);
    } catch {
      return NextResponse.json({ error: "Model returned invalid JSON", raw }, { status: 502 });
    }

    const VALID_KINDS = new Set<SuggestionKind>([
      "question",
      "talking_point",
      "answer",
      "fact_check",
      "clarification",
    ]);

    const suggestions: Suggestion[] = parsed.slice(0, 3).map((item, i) => ({
      id: `${Date.now()}-${i}`,
      kind: VALID_KINDS.has(item.kind as SuggestionKind)
        ? (item.kind as SuggestionKind)
        : "clarification",
      preview: item.preview ?? "",
      detail: "",
    }));

    return NextResponse.json({ suggestions });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Suggestions failed";
    // Forward 429 so the client can apply backoff instead of showing a hard error
    const status = message.startsWith("429") ? 429 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
