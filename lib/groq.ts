import Groq from "groq-sdk";

/** Create a Groq client using the caller-supplied API key */
export function createGroqClient(apiKey: string): Groq {
  if (!apiKey) throw new Error("Groq API key is required");
  return new Groq({ apiKey });
}
