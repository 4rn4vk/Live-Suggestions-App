import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createGroqClient } from "@/lib/groq";
import type { Suggestion, SuggestionKind } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const SuggestionsSchema = z.object({
  model: z.string().min(1).max(100),
  prompt: z.string().min(1).max(20000),
});

export async function POST(req: NextRequest) {
  try {
    const apiKey = req.cookies.get("groq_api_key")?.value;
    if (!apiKey) return NextResponse.json({ error: "Missing API key" }, { status: 401 });

    let rawBody: unknown;
    try { rawBody = await req.json(); } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const validation = SuggestionsSchema.safeParse(rawBody);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error.issues[0].message }, { status: 400 });
    }
    const { model, prompt } = validation.data;

    const groq = createGroqClient(apiKey);

    // Groq occasionally fails JSON schema validation on the first attempt (json_validate_fail).
    // Retry up to 2 times on that specific error before surfacing to the client.
    let raw = "{}";
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
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
          response_format: { type: "json_object" },
        });
        raw = completion.choices[0]?.message?.content ?? "{}";
        break; // success
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "";
        const isJsonValidateFail = msg.includes("json_validate_fail") || msg.includes("Failed to validate JSON");
        if (isJsonValidateFail && attempt < MAX_ATTEMPTS) continue;
        throw err; // non-retryable error or exhausted retries
      }
    }


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
    }));

    return NextResponse.json({ suggestions });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Suggestions failed";
    // Forward 429 so the client can apply backoff instead of showing a hard error
    const status = message.startsWith("429") ? 429 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
