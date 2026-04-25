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

**Goal:** Surface the 3 most immediately useful things in context.

**Context window:** Last 3,000 characters of transcript (configurable). This is enough for ~90 s of speech — recent enough to be relevant, small enough to stay fast.

**Type system:** Each suggestion is tagged with one of five kinds:
- `question` — a sharp follow-up question the user could ask right now  
- `talking_point` — an argument or data point the speaker hasn't raised  
- `answer` — a direct answer to a question just posed in the transcript  
- `fact_check` — verification or correction of a specific claim  
- `clarification` — plain-language explanation of a term or concept  

**Priority-routing logic:** The prompt instructs the model to apply rules in order rather than forcing one-of-each. If a direct question appears in the last 2–3 sentences → include an `answer`. If a factual claim was just made → consider `fact_check`. If jargon was introduced without context → use `clarification`. Fill remaining slots with whatever fits — two `answer` cards are valid when the conversation demands it. This makes the mix context-sensitive rather than formulaic.

**Preview quality constraint:** The prompt requires each `preview` (≤25 words) to deliver standalone value without clicking. Five few-shot examples are provided inline so the model has a concrete style reference for specificity.

**Temperature:** 0.7 — enough creativity to avoid repetitive suggestions, controlled enough to stay grounded.

### Expanded Answer (`/api/expand`)

**Context window:** Last 8,000 characters of transcript. Clicking deserves richer context.

**Temperature:** 0.5 — more deterministic; the user expects a reliable, grounded answer.

**Type-specific response styles:** The prompt branches by `kind` rather than giving the same generic instruction to all five types:
- `answer` — lead with the direct answer in 1–2 sentences, then elaborate with supporting evidence
- `question` — explain *why* this is the right question to ask now and how to phrase it naturally
- `talking_point` — state the point upfront, back with data or reasoning, add a concrete example
- `fact_check` — verdict first (accurate / partially / inaccurate), cite the transcript claim, provide the correction
- `clarification` — plain-language definition in one sentence, then analogy tied to the conversation context

### Chat (`/api/chat`)

**System prompt:** Instructs the model to cite transcript content, prefer structured responses for complex questions, and give direct opinions when asked.

**User message:** Each turn prepends the recent transcript as `[Transcript context]` before `[User question]`. This means every question has full context without stuffing the system prompt every time.

**Streaming:** All LLM responses stream via `ReadableStream` — first token appears in <400 ms on Groq.

## Tradeoffs & Decisions

| Decision | Rationale |
|---|---|
| API key in HTTP-only session cookie | Stored in `sessionStorage` client-side, synced to an HTTP-only cookie via `/api/set-key`; request bodies never carry the key. |
| Audio chunked with `requestData()` every 30 s | Avoids holding a full session blob in memory; matches the transcript cadence |
| Suggestions auto-fire on the same interval as audio chunks | Everything stays in lockstep — refresh = new transcript + new suggestions |
| No vector DB / embedding search | Transcript fits comfortably in a single LLM context window for session lengths realistic for interviews |
| Batches stack newest-first | Most actionable suggestions are always visible above the fold |
| Streaming for expand + chat | Latency perception is critical; streaming gives sub-second first-token feel |

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
│   └── useAudioRecorder.ts     MediaRecorder + chunk scheduling
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
