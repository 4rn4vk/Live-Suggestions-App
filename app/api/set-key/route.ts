import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const COOKIE_NAME = "groq_api_key";

const SetKeySchema = z.object({
  apiKey: z.string().min(1, "API key cannot be empty").max(200, "API key too long"),
});

/** Store the Groq API key in an HTTP-only session cookie. */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = SetKeySchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: result.error.issues[0].message }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, result.data.apiKey, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    // No Max-Age / Expires → session cookie (cleared when browser session ends)
  });
  return res;
}

/** Clear the stored API key cookie. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(COOKIE_NAME);
  return res;
}
