export interface TranscriptChunk {
  id: string;
  text: string;
  timestamp: number; // epoch ms
}

export type SuggestionKind =
  | "question"
  | "talking_point"
  | "answer"
  | "fact_check"
  | "clarification";

export interface Suggestion {
  id: string;
  kind: SuggestionKind;
  preview: string;   // short, self-contained value (1–2 sentences)
}

export interface SuggestionBatch {
  id: string;
  timestamp: number;
  suggestions: Suggestion[];
  transcriptSnapshot: string; // the window of transcript used for this batch
}

export type MessageRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
}

export interface AppSettings {
  groqApiKey: string;
  llmModel: string;
  suggestionsPrompt: string;
  expandedAnswerPrompt: string;
  chatSystemPrompt: string;
  suggestionContextChars: number;  // how many chars of recent transcript to send
  expandedAnswerContextChars: number;
  refreshIntervalSec: number;
}

export interface SessionExport {
  exportedAt: string;
  transcript: TranscriptChunk[];
  suggestionBatches: SuggestionBatch[];
  chat: ChatMessage[];
}
