import { NextRequest, NextResponse } from "next/server";
import { createGroqClient } from "@/lib/groq";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const apiKey = req.cookies.get("groq_api_key")?.value;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing API key" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("audio");

    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "Missing audio blob" }, { status: 400 });
    }

    if (file.size > 25 * 1024 * 1024) {
      return NextResponse.json({ error: "Audio file exceeds 25 MB limit" }, { status: 413 });
    }

    const groq = createGroqClient(apiKey);

    // Groq SDK expects a File-like object; wrap the Blob with a filename.
    // Strip codec params (e.g. "audio/webm;codecs=opus" → "audio/webm") so
    // Whisper doesn't reject the content-type header.
    const baseType = (file.type || "audio/webm").split(";")[0].trim();
    const ext = baseType.includes("ogg") ? "ogg" : "webm";
    const audioFile = new File([file], `audio.${ext}`, { type: baseType });

    const transcription = await groq.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-large-v3",
      response_format: "json",
      language: "en",
    });

    return NextResponse.json({ text: transcription.text ?? "" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Transcription failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
