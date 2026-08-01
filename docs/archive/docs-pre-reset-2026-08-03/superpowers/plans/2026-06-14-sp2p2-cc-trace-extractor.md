# SP-2 Phase 2 — CC-Trace Extractor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Mine the existing Claude-Code session transcripts (`~/.claude/projects/-home-alperen-deckent-dev/*.jsonl`) into TWO OpenAI-messages JSONL corpora for the deckent-core fine-tune — `extracted-aligned.jsonl` (only core-4 tool turns, remapped to deckent's native tool names) and `extracted-general.jsonl` (all turns, core-4 remapped + non-mappable tools kept as-is, for general agentic distillation).

**Architecture:** A pure TS module `src/training/cc-trace-extractor.ts` (parse a CC JSONL line → a normalized turn; remap tool names; segment a session into per-user-request examples; build the two corpora) — unit-tested with synthetic CC lines. A thin `scripts/extract-traces.mjs` (build-gated) reads the 225 session files, calls the compiled module, and writes the two JSONL files to `.deckent/traces/` (gitignored), reporting example + skip counts. Reuses the `TrainingExample`/`OpenAiMessage` types + `appendTrace` from `src/agent/trace-recorder.ts` (SP-2 Phase 1).

**Tech Stack:** TypeScript (ESM, Node16 — `.js` suffix), vitest, Node built-ins only (ADR-010). Hermetic tests (synthetic CC JSONL strings — NOT the real files; no network).

**Depends on (merged to main `282498c6`):** `src/agent/trace-recorder.ts` (`TrainingExample`, `OpenAiMessage`, `appendTrace`), `src/agent/identity.ts` (`composeSystemPrompt`).

**Format (from the 2026-06-14 discovery):** a CC line is `{type, message:{role:'user'|'assistant', content:[blocks]}, ...}`. Relevant `type`: `user`, `assistant` (others — mode/attachment/system/ai-title/… — are skipped). Content blocks: `text` `{type,text}` · `tool_use` `{id, name, input:object}` · `tool_result` `{tool_use_id, content:string, is_error?}` · `thinking` (DROPPED). A `tool_result` arrives inside a `role:'user'` message (NOT a real user turn). Tool-name frequency: Bash/Edit/Read/Write (core-4) + CC-specific (Agent/TaskUpdate/ScheduleWakeup/ToolSearch/AskUserQuestion/mcp__*).

**Conventions:** commit trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. Privacy: outputs are `.deckent/traces/` (gitignored, local). The extractor reads the user's OWN transcripts for their OWN fine-tune.

---

## Design rules (the contract the module implements)

**Tool remap (core-4 → deckent native):**
```
Read → deckent_read_file · Write → deckent_write_file · Edit → deckent_edit_file · Bash → deckent_bash
```
Everything else (Agent, TaskUpdate, ScheduleWakeup, ToolSearch, AskUserQuestion, mcp__*, Grep, Glob, LS, …) is **non-mappable**.

**Segmentation:** a new training example starts at each REAL user turn (a `role:'user'` message whose content has a `text` block — NOT a tool-result-only message). The example accumulates that user text + all following assistant turns + tool-result turns until the next real-user-text turn. Each example's messages = `[{role:'system', content:<deckent system>}, <user>, <assistant+tool_calls>, <tool results>, <assistant>, …]`.

**Two corpora:**
- **aligned:** include an example ONLY if EVERY tool_use in it is core-4 (mappable). Remap names → deckent_*. (Pure deckent-vocabulary.)
- **general:** include ALL examples. Remap core-4 → deckent_*; keep non-mappable tool names as-is. (Broader agentic distillation.)

**Both** prepend deckent's `composeSystemPrompt`. **thinking** blocks are dropped. An example with zero assistant tool_calls AND only one user+one assistant text is still valid (a plain Q&A) — keep it (teaches conversational behavior), but DROP an example that is empty or has no assistant response.

**tool_calls arguments** are `JSON.stringify(input)` (string — the OpenAI format, matching trace-recorder).

---

## Task 1: The extractor module

**Files:**
- Create: `src/training/cc-trace-extractor.ts`
- Test: `tests/training/cc-trace-extractor.test.ts`

- [ ] **Step 1: Write the failing test** at `tests/training/cc-trace-extractor.test.ts`:

```typescript
// tests/training/cc-trace-extractor.test.ts
import { describe, it, expect } from 'vitest';
import { mapToolName, extractFromSession } from '../../src/training/cc-trace-extractor.js';

// Synthetic CC lines (one JSON object per array element — the extractor takes parsed objects).
const SYS = 'DECKENT-SYS';
function line(o: unknown): string { return JSON.stringify(o); }

describe('mapToolName', () => {
  it('remaps core-4 to deckent native names; returns null for non-mappable', () => {
    expect(mapToolName('Read')).toBe('deckent_read_file');
    expect(mapToolName('Bash')).toBe('deckent_bash');
    expect(mapToolName('Edit')).toBe('deckent_edit_file');
    expect(mapToolName('Write')).toBe('deckent_write_file');
    expect(mapToolName('Agent')).toBeNull();
    expect(mapToolName('mcp__x__y')).toBeNull();
  });
});

describe('extractFromSession', () => {
  // A session: real user text → assistant text+Read tool_use → user tool_result → assistant final text.
  const coreSession = [
    line({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'read x' }] } }),
    line({ type: 'assistant', message: { role: 'assistant', content: [
      { type: 'thinking', text: 'hmm' },
      { type: 'text', text: 'Reading.' },
      { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'x' } },
    ] } }),
    line({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'BODY' }] } }),
    line({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Done.' }] } }),
  ];

  it('aligned: remaps core-4, drops thinking, builds one example with the deckent system', () => {
    const { aligned } = extractFromSession(coreSession, SYS);
    expect(aligned).toHaveLength(1);
    const m = aligned[0]!.messages;
    expect(m[0]).toEqual({ role: 'system', content: SYS });
    expect(m[1]).toEqual({ role: 'user', content: 'read x' });
    expect(m[2]).toEqual({
      role: 'assistant', content: 'Reading.',
      tool_calls: [{ id: 't1', type: 'function', function: { name: 'deckent_read_file', arguments: '{"file_path":"x"}' } }],
    });
    expect(m[3]).toEqual({ role: 'tool', tool_call_id: 't1', content: 'BODY' });
    expect(m[4]).toEqual({ role: 'assistant', content: 'Done.' });
  });

  it('aligned EXCLUDES an example that uses a non-mappable tool; general KEEPS it (name as-is)', () => {
    const mixed = [
      line({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'dispatch' }] } }),
      line({ type: 'assistant', message: { role: 'assistant', content: [
        { type: 'tool_use', id: 'a1', name: 'Agent', input: { task: 'go' } },
      ] } }),
      line({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'a1', content: 'RESULT' }] } }),
      line({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }] } }),
    ];
    const { aligned, general } = extractFromSession(mixed, SYS);
    expect(aligned).toHaveLength(0);                      // non-mappable → excluded from aligned
    expect(general).toHaveLength(1);                      // kept in general
    const g = general[0]!.messages.find((x) => x.role === 'assistant' && x.tool_calls);
    expect(g!.tool_calls![0]!.function.name).toBe('Agent'); // CC name kept as-is in general
  });

  it('segments multiple real-user turns into separate examples', () => {
    const two = [
      line({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'first' }] } }),
      line({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'a1' }] } }),
      line({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'second' }] } }),
      line({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'a2' }] } }),
    ];
    const { general } = extractFromSession(two, SYS);
    expect(general).toHaveLength(2);
    expect(general[0]!.messages.map((m) => m.content)).toEqual([SYS, 'first', 'a1']);
    expect(general[1]!.messages.map((m) => m.content)).toEqual([SYS, 'second', 'a2']);
  });

  it('skips meta lines and malformed JSON without throwing', () => {
    const noisy = [
      line({ type: 'file-history-snapshot', foo: 1 }),
      '{ broken json',
      line({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'hi' }] } }),
      line({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'yo' }] } }),
    ];
    const { general } = extractFromSession(noisy, SYS);
    expect(general).toHaveLength(1);
    expect(general[0]!.messages.map((m) => m.content)).toEqual([SYS, 'hi', 'yo']);
  });
});
```

- [ ] **Step 2: Run to verify it FAILS:** `npx vitest run tests/training/cc-trace-extractor.test.ts` → FAIL.

- [ ] **Step 3: Implement** `src/training/cc-trace-extractor.ts`. The contract (implement to pass the tests + the Design rules above):

```typescript
// src/training/cc-trace-extractor.ts
// ═══ CC-trace extractor (SP-2 Phase 2) ══════════════════════════════════════
// Mines Claude-Code session transcripts into two OpenAI-messages corpora for the
// deckent-core fine-tune: `aligned` (only core-4 tool turns, remapped to deckent
// native names) and `general` (all turns, core-4 remapped + non-mappable as-is).
// Pure (takes parsed/string lines, returns examples); the I/O wrapper is the
// scripts/extract-traces.mjs driver. thinking blocks dropped; segmentation by
// real-user-text turn; deckent system prepended.

import type { OpenAiMessage, TrainingExample } from '../agent/trace-recorder.js';

/** Core-4 CC tool name → deckent native name; null = non-mappable (kept as-is in `general` only). */
const CORE_TOOL_MAP: Readonly<Record<string, string>> = {
  Read: 'deckent_read_file',
  Write: 'deckent_write_file',
  Edit: 'deckent_edit_file',
  Bash: 'deckent_bash',
};

export function mapToolName(ccName: string): string | null {
  return CORE_TOOL_MAP[ccName] ?? null;
}

export interface ExtractResult { aligned: TrainingExample[]; general: TrainingExample[]; }

// Implementation requirements (the tests pin these):
//  - Accept an array of JSONL strings (one CC line each). JSON.parse each; skip
//    on parse error or when type ∉ {user, assistant} (meta lines).
//  - A real-user-text turn = type:user whose message.content has a `text` block.
//    It STARTS a new segment. A user message with only tool_result blocks is NOT
//    a new segment — its tool_result blocks become role:'tool' messages.
//  - assistant turn: collect text blocks (join) as content; collect tool_use
//    blocks as tool_calls [{id, type:'function', function:{name, arguments:JSON.stringify(input)}}].
//    Drop `thinking`/other blocks.
//  - For each segment build messages [{role:'system',content:system}, ...turns].
//    `general`: remap core-4 names, keep non-mappable names. `aligned`: ONLY if
//    every tool_use in the segment is core-4 (mapToolName != null) — else exclude
//    the segment from aligned; always remap to deckent names in aligned.
//  - Drop a segment with no assistant response (empty/dangling).
export function extractFromSession(lines: string[], system: string): ExtractResult {
  // … implement per the requirements above + the Design rules in the plan …
}
```

(The implementer writes the body to satisfy the tests + the rules. Reuse `OpenAiMessage`/`TrainingExample` from `trace-recorder.ts`; do NOT redefine them.)

- [ ] **Step 4: Run to verify it PASSES:** `npx vitest run tests/training/cc-trace-extractor.test.ts` → PASS (6).

- [ ] **Step 5: Commit**

```bash
git add src/training/cc-trace-extractor.ts tests/training/cc-trace-extractor.test.ts
git commit -m "feat(training): CC-trace extractor — aligned + general OpenAI-messages corpora (SP-2 P2 T1)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: The extractor script (build-gated I/O driver)

**Files:**
- Create: `scripts/extract-traces.mjs`
- Modify: `package.json` (`extract:traces` script)

- [ ] **Step 1: Write** `scripts/extract-traces.mjs` (follow the `ink-pty-native-verify.mjs` skip-safe pattern). It must:
- Resolve the CC transcripts dir: `process.env.DECKENT_CC_DIR ?? join(homedir(), '.claude', 'projects', '-home-alperen-deckent-dev')`. If it does not exist → `console.log('SKIP: CC transcripts dir not found'); process.exit(0)`.
- If `dist/training/cc-trace-extractor.js` is missing → `console.log('SKIP: dist not built — run npm run build first'); process.exit(0)`.
- Import `extractFromSession` from `../dist/training/cc-trace-extractor.js` and `composeSystemPrompt` from `../dist/agent/identity.js`; build `const system = composeSystemPrompt({ cwd: process.cwd(), lang: 'tr' })`.
- For each `*.jsonl` in the dir: read it, split into lines, call `extractFromSession(lines, system)`, accumulate `aligned` + `general`.
- Write `.deckent/traces/extracted-aligned.jsonl` and `.deckent/traces/extracted-general.jsonl` (one example per line; `mkdir -p .deckent/traces`).
- Print a summary: files scanned, aligned example count, general example count, and the two output paths. `process.exit(0)`.

- [ ] **Step 2: Add the npm script** to `package.json` (near other top-level scripts):

```json
    "extract:traces": "node scripts/extract-traces.mjs",
```

- [ ] **Step 3: Syntax check** (no build needed for the script itself): `node --check scripts/extract-traces.mjs` → OK. (The dist-missing guard means running it pre-build SKIPs cleanly.)

- [ ] **Step 4: Commit**

```bash
git add scripts/extract-traces.mjs package.json
git commit -m "feat(training): extract-traces.mjs — mine CC transcripts → JSONL corpora (SP-2 P2 T2)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: Gate + real-data run (human build-gate)

- [ ] `npm run lint` → tsc clean.
- [ ] `npx vitest run tests/training/cc-trace-extractor.test.ts tests/agent/trace-recorder.test.ts` → green. Report counts.
- [ ] **Real-data run (after a build — human gate):** `npm run build && npm run extract:traces` → writes `.deckent/traces/extracted-{aligned,general}.jsonl`; eyeball one line with `head -1 .deckent/traces/extracted-aligned.jsonl | python3 -m json.tool` to confirm valid OpenAI-messages shape with deckent tool names. (Signal "🔨 BUILD GEREKLİ" with this command; the unit tests prove the parser, the build-run produces the corpus.)
- [ ] Marker: `git commit --allow-empty -m "chore(training): SP-2 Phase 2 — CC-trace extractor complete"`.

---

## Self-Review

**Schema:** both corpora are the SAME OpenAI-tool-calling JSONL as Phase 1 (one unified format → one fine-tune corpus). `tool_calls.arguments` is a JSON string.

**Discovery-grounded:** only CC transcripts are mined (`.tasks`/`.deckent/archive` empty, `.brain/archive` is prose). The remap table + non-mappable handling + thinking-drop + segmentation match the 2026-06-14 format discovery.

**Robustness:** meta lines + malformed JSON are skipped (counted, never throw) — pinned by the "skips meta lines and malformed JSON" test. No silent total-failure: the script reports scanned/extracted/skipped counts.

**Type consistency:** `OpenAiMessage`/`TrainingExample` reused from `trace-recorder.ts` (one shared schema across Phase 1 + 2) · `extractFromSession`/`mapToolName` are the module's surface, consumed by the `.mjs` driver from dist.

**Scope:** pure parser + a thin I/O script. No runtime/agent changes. Outputs gitignored. The fine-tune itself (unsloth/LLaMA-Factory recipe, the train/val split, the aligned:general mix ratio) is downstream — out of scope here; this plan produces the corpus.
