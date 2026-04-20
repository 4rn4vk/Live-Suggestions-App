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

No `.env` needed — the Groq API key is entered through the in-app Settings modal and stored in `localStorage`. Nothing is ever persisted server-side.

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

**Why five kinds instead of one?** Real conversations need different help at different moments. If someone just asked a hard question, the most useful thing is an `answer`. If they've been talking without evidence, a `fact_check` is more valuable. The model is instructed to pick the mix that fits the current moment — not always one of each.

**Preview quality constraint:** The prompt explicitly requires the `preview` (25-word max) to deliver standalone value without clicking. This ensures cards aren't clickbait.

**Temperature:** 0.7 — enough creativity to avoid repetitive suggestions, controlled enough to stay grounded.

### Expanded Answer (`/api/expand`)

**Context window:** Last 8,000 characters of transcript. Clicking deserves richer context.

**Temperature:** 0.5 — more deterministic; the user expects a reliable, grounded answer.

**Prompt:** Passes `kind` + `preview` so the model knows what the user selected and can tailor the depth and format (structured list vs prose).

### Chat (`/api/chat`)

**System prompt:** Instructs the model to cite transcript content, prefer structured responses for complex questions, and give direct opinions when asked.

**User message:** Each turn prepends the recent transcript as `[Transcript context]` before `[User question]`. This means every question has full context without stuffing the system prompt every time.

**Streaming:** All LLM responses stream via `ReadableStream` — first token appears in <400 ms on Groq.

## Tradeoffs & Decisions

| Decision | Rationale |
|---|---|
| Client-side API key via `localStorage` | Zero backend infra, zero key leakage risk server-side. Assignment-appropriate. |
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
│       └── chat/route.ts        Chat (stream)
├── components/
│   ├── TranscriptPanel.tsx     Left column
│   ├── SuggestionsPanel.tsx    Middle column
│   ├── ChatPanel.tsx           Right column
│   ├── SettingsModal.tsx       API key + all editable prompts
│   └── ExportButton.tsx        JSON session export
├── context/
│   └── SettingsContext.tsx     Global settings state (localStorage-backed)
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
