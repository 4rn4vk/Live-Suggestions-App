# Live Suggestions — AI Meeting Copilot

A real-time AI meeting copilot that listens to your microphone and continuously surfaces three contextually relevant suggestions while you talk.

## Live Demo

https://live-suggestions-app.vercel.app

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16 (App Router) | Co-locates client and server; API routes eliminate an extra backend service |
| Language | TypeScript | End-to-end type safety |
| Styling | Tailwind CSS v4 | Fast, co-located design tokens |
| Transcription | Groq Whisper Large V3 | Best-in-class open-source ASR, extremely low latency on Groq |
| LLM | Groq (model configurable, default: `openai/gpt-oss-120b`) | GPT-OSS 120B — matches spec requirement; configurable via Settings |
| Deployment | Vercel | Zero-config Next.js hosting |

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Start dev server
npm run dev
# → http://localhost:3000
```

No `.env` needed — the Groq API key is entered through the in-app Settings modal, stored in `sessionStorage` (cleared when the tab closes), and synced to an HTTP-only session cookie via `/api/set-key` so API routes read the key from the cookie and it never travels in a request body.

## How it works

```
Mic → 30-second WebM chunks → /api/transcribe (Whisper Large V3)
                                      ↓
                              Transcript state (client)
                                      ↓
Every 30 s (or manual refresh) → /api/suggestions → 3 suggestion cards
                                      ↓
User clicks card → /api/expand → streaming detailed answer → Chat panel
User types message → /api/chat  → streaming LLM reply      → Chat panel
```

## Prompt Strategy

### Live Suggestions (`/api/suggestions`)

**Goal:** Surface the 3 most immediately useful things in context — not the 3 most interesting things, not a balanced spread of all types, but what a sharp human collaborator would say *right now*.

**Context window:** Last 3,000 characters of transcript (configurable). This covers ~90 s of speech — recent enough to be actionable, narrow enough to keep the model focused on the current moment rather than the whole meeting.

**Type system:** Each suggestion is tagged with one of five kinds:
- `question` — a sharp follow-up question the user could ask right now
- `talking_point` — an argument or data point the speaker hasn't raised
- `answer` — a direct answer to a question just posed in the transcript
- `fact_check` — verification or correction of a specific claim
- `clarification` — plain-language explanation of a term or concept

**Priority-routing logic:** The prompt instructs the model to apply rules in order rather than mechanically serving one-of-each. If a direct question appears in the last 2–3 sentences → include an `answer` (this is the most urgent moment). If a factual claim was just made → consider `fact_check`. If jargon was introduced without context → use `clarification`. Fill remaining slots with whatever fits — two `answer` cards are valid when the conversation demands it. This makes the mix context-sensitive rather than formulaic.

**Meeting-type adaptation:** The prompt also asks the model to infer meeting type (sales call, technical discussion, investor pitch, 1:1, brainstorm, general) and use it to bias what fills the remaining slots. A sales call should lean toward objection answers and competitive talking points; a technical discussion should lean toward clarifications and edge-case probes; an investor pitch should lean toward fact-checks of cited metrics and anticipated due-diligence questions. This runs on top of the priority rules — inference happens first, bias shapes the fill slots only.

**Preview quality constraint:** Each `preview` must be ≤25 words and deliver standalone value without clicking. If a user reads the preview and already knows what to say, the product has already done its job. Five few-shot examples are embedded in the prompt as style anchors for specificity — not to be copied, but to calibrate what "specific" means.

**JSON mode:** The endpoint uses `response_format: { type: "json_object" }` on the Groq API, enforcing valid JSON at the inference layer rather than relying solely on natural-language instruction.

**Temperature:** 0.7 — enough variation to avoid repetitive batches across refreshes, controlled enough to stay grounded.

### Expanded Answer (`/api/expand`)

**Context window:** Last 8,000 characters. Clicking a card is a deliberate act — the user wants a thorough, well-reasoned answer with full meeting context.

**Temperature:** 0.5 — more deterministic. The user expects reliable, grounded output, not creative variation.

**Type-specific response styles:** The prompt branches by `kind`. Each type gets its own opening structure rather than a generic "write more about this":
- `answer` — lead with the direct answer in 1–2 sentences, then elaborate with evidence. Be definitive.
- `question` — explain *why* this is the right question to ask right now, what it would reveal, and how to phrase it naturally
- `talking_point` — state the point upfront, back with data or reasoning, include a concrete example
- `fact_check` — verdict first (accurate / partially / inaccurate), cite the exact transcript claim, provide the correction with sourcing logic
- `clarification` — plain-language definition in one sentence, then a 2–3 sentence analogy tied to the conversation context

**System role:** The endpoint sends a `system` message establishing the assistant persona before the per-type instruction in the `user` turn, giving the model a stable frame before it reads the detailed style instructions.

### Chat (`/api/chat`)

**System prompt:** Brevity-first, transcript-grounded. Instructs the model to give a direct answer first, never use section headers or lengthy preambles, and cite transcript content rather than fabricating details.

**User message structure:** Each turn prepends `[Transcript context]\n{transcript}\n\n[User question]\n{question}`. This keeps the system prompt stable and gives the model the relevant window of transcript at every turn without repeating it in the system prompt.

**Streaming:** All LLM responses stream via `ReadableStream` — first token appears within ~300 ms on Groq. The input is disabled while streaming; an `AbortController` is wired to every fetch so in-flight streams can be cancelled on remount or overlapping requests.

## What Sets This Apart

**Meeting-type adaptive suggestions.** Most implementations treat all meetings identically. This one infers whether the conversation is a sales call, technical discussion, investor pitch, 1:1, or brainstorm, and adjusts which suggestion types fill the remaining slots. A sales call suggests objection answers and competitive talking points; an investor pitch leans toward fact-checking cited metrics and anticipating due-diligence questions.

**Priority-routing instead of one-of-each.** A common failure mode is mechanically emitting one `question`, one `talking_point`, and one `answer` every time. The prompt's priority rules ensure the most urgent type wins — if someone just asked a question, two or three `answer` cards are valid and more useful than forced diversity.

**Previews as first-class deliverables.** The ≤25-word preview constraint is enforced by the prompt with few-shot examples. The goal: if the user reads the preview and already knows what to say, the product succeeded without a click. Most implementations treat the preview as a title for the detailed answer; this one treats it as the primary value.

**`transcriptSnapshot` on every batch.** Each `SuggestionBatch` stores the exact transcript window that generated it (`transcriptSnapshot`). This enables precise retrospective analysis: given an export, you can see exactly what context drove each suggestion. Useful for both debugging prompt quality and evaluating the product after a meeting.

**Structured audio cycling.** Instead of stopping and restarting the `MediaRecorder` (which produces invalid WebM headers for Whisper), the recorder is *cycled* — a new recorder starts on the existing stream before the old one stops. Each chunk is a self-contained WebM with valid headers, which Whisper requires.

## Tradeoffs & Decisions

| Decision | Rationale |
|---|---|
| API key in HTTP-only session cookie | Stored in `sessionStorage` client-side, synced to an HTTP-only cookie via `/api/set-key`; request bodies never carry the key. |
| Audio chunked by cycling the MediaRecorder every 30 s | Produces self-contained WebM blobs with valid headers — required for Whisper to accept the audio |
| Suggestions auto-fire on first chunk, then every 30 s | First batch appears the moment there's enough transcript; subsequent batches stay in lockstep with the audio interval |
| 3,000-char suggestion context vs 8,000-char expand context | Suggestions need recency (last ~90 s); expanded answers need full reasoning context from the whole conversation |
| No vector DB / embedding search | Transcript fits comfortably in a single LLM context window for realistic session lengths |
| Batches stack newest-first | Most actionable suggestions are above the fold; older batches remain visible for reference |
| Streaming for expand + chat | Latency perception is critical — streaming gives sub-second first-token feel even if full completion takes 3–4 s |
| Meeting-type inference in-prompt (not a separate API call) | Zero latency overhead — the LLM infers type from the same transcript it was already reading |

## Project Structure

```
├── app/
│   ├── layout.tsx              Root layout + providers
│   ├── page.tsx                Main page — all state, all wiring
│   ├── globals.css             Tailwind import
│   └── api/
│       ├── transcribe/route.ts  Whisper Large V3
│       ├── suggestions/route.ts 3 suggestions (JSON)
│       ├── expand/route.ts      Expanded answer (stream)
│       ├── chat/route.ts        Chat (stream)
│       └── set-key/route.ts     API key → HTTP-only session cookie
├── components/
│   ├── TranscriptPanel.tsx     Left column
│   ├── SuggestionsPanel.tsx    Middle column
│   ├── ChatPanel.tsx           Right column
│   ├── SettingsModal.tsx       API key + all editable prompts
│   └── ExportButton.tsx        JSON session export
├── context/
│   └── SettingsContext.tsx     Global settings state (sessionStorage-backed + HTTP-only cookie)
├── hooks/
│   ├── useAudioRecorder.ts     MediaRecorder + chunk cycling (self-contained WebM blobs)
│   ├── useTranscript.ts        Transcription state + /api/transcribe integration
│   ├── useSuggestions.ts       Suggestion batches, auto-refresh, rate-limit backoff, AbortController
│   └── useChat.ts              Chat + expand streaming, AbortController lifecycle
├── lib/
│   ├── defaults.ts             Default prompts + settings + getRecentTranscript()
│   └── groq.ts                 Groq client factory
└── types/
    └── index.ts                Shared TypeScript types
```

## Deploying to Vercel

```bash
npm i -g vercel
vercel --prod
```

No environment variables needed — the Groq key is user-supplied at runtime.
