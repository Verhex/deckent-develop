// ═══ Tokenizer Fallback — external token estimation ═══════════════════
// Worker Output Contract & Observability — Pillar 1 (spec §1.3), Phase 2 / Task 4.
//
// Provider-agnostic LAST-RESORT token counter for providers/paths that do NOT
// report usage (a raw text CLI, a local runtime that omits eval counts). deckent
// counts the text EXTERNALLY here — it never trusts an LLM to self-report. When
// the provider DOES report usage, the adapter path (`extractUsage`) is used and
// this module is never reached; `source: 'tokenizer-fallback'` marks every count
// produced here as an estimate so cost/accounting layers stay honest.
//
// Dependency-free by design (ADR-010): rather than load a per-model tokenizer
// library (tiktoken / SentencePiece / HF — heavy, and unavailable for several
// closed models), we estimate from a calibrated chars-per-token ratio per model
// FAMILY. BPE (cl100k) and SentencePiece families all land near 3.6–4.0
// chars/token on mixed English/code text; the registry below encodes that.

import { normalizeUsage, type TokenUsage } from './token-usage.js';

/** A model-family token-estimation profile. `match` tests a lowercased "model provider" key. */
interface TokenizerProfile {
  readonly family: string;
  readonly match: RegExp;
  /**
   * Average characters per token for this family's tokenizer on mixed
   * English/code text. Deliberately conservative (slightly low → slightly high
   * token estimate) so a fallback count never UNDER-reports cost.
   */
  readonly charsPerToken: number;
}

/**
 * Family registry — ORDER MATTERS (first match wins). Data-driven: add a row to
 * support a new family; no control-flow changes (no per-provider `if`).
 */
const TOKENIZER_PROFILES: readonly TokenizerProfile[] = [
  { family: 'anthropic', match: /claude/i, charsPerToken: 3.6 },
  { family: 'openai', match: /gpt|davinci|codex|openai|\bo[13]\b/i, charsPerToken: 4.0 },
  { family: 'deepseek', match: /deepseek/i, charsPerToken: 3.8 },
  { family: 'qwen', match: /qwen/i, charsPerToken: 3.7 },
  { family: 'llama', match: /llama/i, charsPerToken: 3.6 },
  { family: 'mistral', match: /mistral|mixtral/i, charsPerToken: 3.8 },
  { family: 'gemini', match: /gemini|gemma/i, charsPerToken: 4.0 },
];

/** Last-resort profile for an unrecognized model — the spec's bytes÷4 heuristic. */
const DEFAULT_PROFILE: TokenizerProfile = { family: 'default', match: /(?:)/, charsPerToken: 4.0 };

/** Resolve the estimation profile for a model id (provider is a secondary hint). */
function resolveProfile(model: string, provider: string): TokenizerProfile {
  const key = `${model} ${provider}`.toLowerCase();
  return TOKENIZER_PROFILES.find(p => p.match.test(key)) ?? DEFAULT_PROFILE;
}

/**
 * Estimate the token count of a single text under a family profile.
 *
 * Pure heuristic: characters ÷ family ratio, rounded up. Non-empty text always
 * yields ≥1 token (a count of 0 for real text would silently zero out cost);
 * empty text yields 0 (correct).
 */
function estimateTokens(text: string, profile: TokenizerProfile): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / profile.charsPerToken));
}

/** Input to {@link countTokensExternal}. */
export interface ExternalCountInput {
  /** The full input/prompt text sent to the model. */
  prompt: string;
  /** The full output/completion text the model produced. */
  output: string;
  /** Model id (e.g. `claude-opus-4-8`, `qwen2.5`, `deepseek-chat`). */
  model: string;
  /** Provider id (e.g. `ollama`, `claude`) — used only as a family hint. */
  provider: string;
}

/**
 * Count tokens EXTERNALLY for a provider/path that did not report usage.
 *
 * Provider-agnostic (resolves a family profile from the model id, provider as a
 * secondary hint) and total: never throws, never returns a silently-zero count
 * for non-empty text. Always marks the result `source: 'tokenizer-fallback'`.
 */
export function countTokensExternal(input: ExternalCountInput): TokenUsage {
  const profile = resolveProfile(input?.model ?? '', input?.provider ?? '');
  const inputTokens = estimateTokens(input?.prompt ?? '', profile);
  const outputTokens = estimateTokens(input?.output ?? '', profile);
  return normalizeUsage({ inputTokens, outputTokens, source: 'tokenizer-fallback' });
}
