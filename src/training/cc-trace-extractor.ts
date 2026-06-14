// src/training/cc-trace-extractor.ts
// ═══ SP-2 Phase 2 — CC-transcript → OpenAI-messages corpora ═════════════════
// Pure parser: converts Claude-Code JSONL session lines into two corpora:
//   aligned  — only segments whose tool_use names ALL map to deckent natives
//   general  — all segments, core-4 remapped, non-mappable kept as-is
// No fs/network. Re-uses OpenAiMessage/TrainingExample shapes from trace-recorder.

import type { OpenAiMessage, TrainingExample } from '../agent/trace-recorder.js';

// ─── Core-4 tool name map ────────────────────────────────────────────────────

const CORE4: Readonly<Record<string, string>> = {
  Read: 'deckent_read_file',
  Write: 'deckent_write_file',
  Edit: 'deckent_edit_file',
  Bash: 'deckent_bash',
};

/** Returns the deckent native name for a CC core-4 tool, or null for any other. */
export function mapToolName(ccName: string): string | null {
  return CORE4[ccName] ?? null;
}

// ─── Result type ─────────────────────────────────────────────────────────────

/** Training example without meta — messages only (SP-2 Phase 2 shape). */
type MsgExample = Omit<TrainingExample, 'meta'>;

export interface ExtractResult {
  aligned: MsgExample[];
  general: MsgExample[];
}

// ─── Internal segment state ───────────────────────────────────────────────────

interface Segment {
  messages: OpenAiMessage[];  // excludes system (prepended on flush)
  hasNonMappable: boolean;    // true if any tool_use in this segment is non-core-4
}

function emptySegment(): Segment {
  return { messages: [], hasNonMappable: false };
}

// ─── Main extractor ───────────────────────────────────────────────────────────

/**
 * Parse CC JSONL session lines into aligned + general training examples.
 * Lines that are malformed JSON or whose `type` is not 'user'/'assistant' are skipped.
 */
export function extractFromSession(lines: string[], system: string): ExtractResult {
  const aligned: MsgExample[] = [];
  const general: MsgExample[] = [];

  let current: Segment | null = null;

  function flush(): void {
    if (current === null || current.messages.length < 2) return; // need user + at least one assistant msg
    const example: MsgExample = { messages: [{ role: 'system', content: system }, ...current.messages] };
    general.push(example);
    if (!current.hasNonMappable) aligned.push(example);
    current = null;
  }

  for (const raw of lines) {
    // Parse — skip malformed
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { continue; }

    if (typeof parsed !== 'object' || parsed === null) continue;
    const entry = parsed as Record<string, unknown>;

    const type = entry['type'];
    if (type !== 'user' && type !== 'assistant') continue;

    const msg = entry['message'] as Record<string, unknown> | undefined;
    if (!msg) continue;

    const role = msg['role'] as string | undefined;
    const content = msg['content'];
    if (!Array.isArray(content)) continue;

    // ── user line ────────────────────────────────────────────────────────────
    if (type === 'user' && role === 'user') {
      // Classify: real user turn (has text block) vs tool-result-only turn
      const hasText = (content as unknown[]).some(
        (b) => typeof b === 'object' && b !== null && (b as Record<string, unknown>)['type'] === 'text',
      );

      if (hasText) {
        // New segment: flush previous
        flush();
        current = emptySegment();
        // Collect text
        const text = (content as unknown[])
          .filter((b) => typeof b === 'object' && b !== null && (b as Record<string, unknown>)['type'] === 'text')
          .map((b) => (b as Record<string, unknown>)['text'] as string)
          .join('');
        current.messages.push({ role: 'user', content: text });
      } else {
        // Tool-result turn — append tool messages to current segment
        if (current === null) continue;
        for (const block of content as unknown[]) {
          if (typeof block !== 'object' || block === null) continue;
          const b = block as Record<string, unknown>;
          if (b['type'] !== 'tool_result') continue;
          current.messages.push({
            role: 'tool',
            tool_call_id: (b['tool_use_id'] as string) ?? '',
            content: (b['content'] as string) ?? '',
          });
        }
      }
      continue;
    }

    // ── assistant line ───────────────────────────────────────────────────────
    if (type === 'assistant' && role === 'assistant') {
      if (current === null) continue; // no active segment

      const textParts: string[] = [];
      const toolCalls: OpenAiMessage['tool_calls'] = [];

      for (const block of content as unknown[]) {
        if (typeof block !== 'object' || block === null) continue;
        const b = block as Record<string, unknown>;
        const btype = b['type'];

        if (btype === 'text') {
          textParts.push((b['text'] as string) ?? '');
        } else if (btype === 'tool_use') {
          const ccName = (b['name'] as string) ?? '';
          const mapped = mapToolName(ccName);

          // For general: use remapped name if available, else keep original
          // Track non-mappable for aligned exclusion
          const generalName = mapped ?? ccName;
          if (mapped === null) current.hasNonMappable = true;

          toolCalls.push({
            id: (b['id'] as string) ?? '',
            type: 'function',
            function: {
              name: generalName,
              arguments: JSON.stringify(b['input'] ?? {}),
            },
          });
        }
        // thinking and other block types: dropped
      }

      const assistantMsg: OpenAiMessage = {
        role: 'assistant',
        content: textParts.join(''),
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      };
      current.messages.push(assistantMsg);
    }
  }

  // Flush last segment
  flush();

  return { aligned, general };
}
