# SP-2 — Training-Data Pipeline (deckent-core fine-tune) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Produce OpenAI-messages JSONL training data for fine-tuning deckent-core (a qwen-based tool-using agent) from deckent's OWN tool-use traces — both forward (a live recorder that captures native-agent sessions as the user dogfoods qwen/Ollama) and backward (an extractor that mines existing `.tasks` / `.claude/projects` / `.brain/archive` traces). Recorder first, extractor second.

**Architecture:** Two components writing the SAME JSONL schema into `.deckent/traces/` (gitignored, local-only — privacy-first; nothing is sent anywhere). **(Phase 1 — recorder)** the native `AgentSession` exposes its `Transcript`; the bridge appends one JSONL line per completed turn (the conversation prefix through that turn's assistant response) via a small `trace-recorder` that maps `ProviderMessage[]` → OpenAI-messages. Local-only, opt-out via `DECKENT_TRACE=0`. **(Phase 2 — extractor)** a `scripts/extract-traces.mjs` mines existing trace sources → the same JSONL schema (designed AFTER reading the real source formats). Both feed one unified corpus a fine-tune framework (unsloth / LLaMA-Factory) consumes directly.

**Tech Stack:** TypeScript (ESM, Node16 — `.js` suffix), vitest, Node built-ins only (ADR-010). Hermetic tests (tmpdir trace files, no network). The recorder reuses the existing `ProviderMessage` shape (assistant `toolCalls` + tool `toolCallId`) — it IS already the OpenAI round-trip shape (M2).

**Depends on (merged to main `50688372`):** `src/agent/session.ts` (`AgentSession`/`createAgentSession`), `src/agent/transcript.ts` (`Transcript`), `src/agent/provider-tooluse/types.ts` (`ProviderMessage`/`ToolCallRef`), `src/cli/repl/native-agent-bridge.ts` (`createNativeEngine`), `src/cli/repl/run.tsx`.

**Conventions:** commit trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. Privacy-first: traces are local + gitignored + opt-out; never auto-uploaded. i18n is N/A (no user-facing strings beyond a one-line opt-out hint).

---

## JSONL Schema (the contract both components produce)

One training example per line:

```json
{"messages":[{"role":"system","content":"<composed system prompt>"},{"role":"user","content":"read x.txt"},{"role":"assistant","content":"Reading it.","tool_calls":[{"id":"c1","type":"function","function":{"name":"deckent_read_file","arguments":"{\"path\":\"x.txt\"}"}}]},{"role":"tool","tool_call_id":"c1","content":"<file body>"},{"role":"assistant","content":"Done."}],"meta":{"source":"native-repl","model":"qwen3.6:27b","ts":"<ISO>"}}
```

- `messages` is OpenAI-tool-calling shape (the unsloth/LLaMA-Factory standard). `assistant` carries `tool_calls` (arguments as a JSON STRING); `tool` carries `tool_call_id`.
- `meta` (source / model / ts) is for provenance + filtering — fine-tune frameworks ignore unknown keys.

---

## Phase 1 — Live recorder

### Task 1: `ProviderMessage[]` → OpenAI-messages mapper + JSONL append

**Files:**
- Create: `src/agent/trace-recorder.ts`
- Test: `tests/agent/trace-recorder.test.ts`

- [ ] **Step 1: Write the failing test** at `tests/agent/trace-recorder.test.ts`:

```typescript
// tests/agent/trace-recorder.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { toTrainingExample, appendTrace } from '../../src/agent/trace-recorder.js';
import type { ProviderMessage } from '../../src/agent/provider-tooluse/types.js';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

const convo: ProviderMessage[] = [
  { role: 'user', content: 'read x' },
  { role: 'assistant', content: 'ok', toolCalls: [{ id: 'c1', name: 'deckent_read_file', args: { path: 'x' } }] },
  { role: 'tool', content: 'BODY', toolCallId: 'c1' },
  { role: 'assistant', content: 'done' },
];

describe('toTrainingExample', () => {
  it('maps a ProviderMessage[] + system into OpenAI-messages shape (tool_calls arguments are a JSON string)', () => {
    const ex = toTrainingExample('SYS', convo, { source: 'native-repl', model: 'm', ts: 'T' });
    expect(ex.messages[0]).toEqual({ role: 'system', content: 'SYS' });
    expect(ex.messages[2]).toEqual({
      role: 'assistant', content: 'ok',
      tool_calls: [{ id: 'c1', type: 'function', function: { name: 'deckent_read_file', arguments: '{"path":"x"}' } }],
    });
    expect(ex.messages[3]).toEqual({ role: 'tool', tool_call_id: 'c1', content: 'BODY' });
    expect(ex.messages[4]).toEqual({ role: 'assistant', content: 'done' });
    expect(ex.meta).toEqual({ source: 'native-repl', model: 'm', ts: 'T' });
  });
  it('omits tool_calls on a plain assistant message', () => {
    const ex = toTrainingExample('S', [{ role: 'assistant', content: 'hi' }], { source: 'x', model: 'm', ts: 'T' });
    expect('tool_calls' in (ex.messages[1] as object)).toBe(false);
  });
});

describe('appendTrace', () => {
  it('appends one JSON line per call (valid JSONL)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'trace-')); dirs.push(dir);
    const f = join(dir, 's.jsonl');
    appendTrace(f, toTrainingExample('S', convo, { source: 'native-repl', model: 'm', ts: 'T1' }));
    appendTrace(f, toTrainingExample('S', convo, { source: 'native-repl', model: 'm', ts: 'T2' }));
    const lines = readFileSync(f, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!).meta.ts).toBe('T1');
    expect(JSON.parse(lines[1]!).meta.ts).toBe('T2');
  });
});
```

- [ ] **Step 2: Run to verify it FAILS:** `npx vitest run tests/agent/trace-recorder.test.ts` → FAIL.

- [ ] **Step 3: Implement** `src/agent/trace-recorder.ts`:

```typescript
// src/agent/trace-recorder.ts
// ═══ Trace recorder (SP-2) ══════════════════════════════════════════════════
// Maps a native-agent ProviderMessage[] transcript into an OpenAI-messages
// training example (the unsloth/LLaMA-Factory tool-calling SFT shape) and
// appends it as one JSONL line. Local-only (.deckent/traces/, gitignored);
// nothing is uploaded. The ProviderMessage shape is ALREADY the OpenAI
// round-trip shape (M2) — this is a thin, pure mapping + an fs append.

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ProviderMessage } from './provider-tooluse/types.js';

export interface TraceMeta { source: string; model: string; ts: string; }
export interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}
export interface TrainingExample { messages: OpenAiMessage[]; meta: TraceMeta; }

function toOpenAiMessage(m: ProviderMessage): OpenAiMessage {
  if (m.role === 'tool') return { role: 'tool', content: m.content, tool_call_id: m.toolCallId ?? '' };
  if (m.role === 'assistant' && m.toolCalls?.length) {
    return {
      role: 'assistant',
      content: m.content,
      tool_calls: m.toolCalls.map((tc) => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.args) } })),
    };
  }
  return { role: m.role, content: m.content };
}

/** Build a training example: a system message + the mapped transcript. */
export function toTrainingExample(system: string, transcript: ProviderMessage[], meta: TraceMeta): TrainingExample {
  return { messages: [{ role: 'system', content: system }, ...transcript.map(toOpenAiMessage)], meta };
}

/** Append one example as a JSONL line (creates the dir + file as needed). */
export function appendTrace(filePath: string, example: TrainingExample): void {
  mkdirSync(dirname(filePath), { recursive: true });
  appendFileSync(filePath, JSON.stringify(example) + '\n', 'utf-8');
}
```

- [ ] **Step 4: Run to verify it PASSES:** `npx vitest run tests/agent/trace-recorder.test.ts` → PASS (3).

- [ ] **Step 5: Commit**

```bash
git add src/agent/trace-recorder.ts tests/agent/trace-recorder.test.ts
git commit -m "feat(agent): trace-recorder — ProviderMessage[] → OpenAI-messages JSONL (SP-2 P1 T1)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `AgentSession.transcript()` accessor

**Files:**
- Modify: `src/agent/session.ts`
- Test: `tests/agent/session.test.ts` (extend)

- [ ] **Step 1: Add a failing test** to `tests/agent/session.test.ts` (new case in the existing describe):

```typescript
  it('exposes the cross-turn transcript as a copy for trace recording', async () => {
    const { adapter } = scripted([[{ type: 'text-delta', text: 'a' }, { type: 'done' }]]);
    const s = createAgentSession(deps({ adapter }));
    for await (const _ of s.send('hi')) { /* drain */ }
    const t = s.transcript();
    expect(t.map((m) => ({ role: m.role, content: m.content }))).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'a' },
    ]);
    t[0]!.content = 'MUT'; // mutating the copy must not affect the session
    expect(s.transcript()[0]!.content).toBe('hi');
  });
```

- [ ] **Step 2: Run to verify it FAILS:** `npx vitest run tests/agent/session.test.ts` → FAIL (`transcript` not on the session).

- [ ] **Step 3: Implement** — in `src/agent/session.ts`, add `transcript()` to the `AgentSession` interface and the returned object. The session already holds `const transcript = new Transcript();` and `Transcript` has `toProviderMessages()` (a defensive copy). Add to the interface:

```typescript
  /** The cross-turn transcript (a copy) — for trace recording. */
  transcript(): ProviderMessage[];
```

Add `import type { ProviderMessage } from './provider-tooluse/types.js';` if not present, and in the returned object:

```typescript
    transcript(): ProviderMessage[] {
      return transcript.toProviderMessages();
    },
```

- [ ] **Step 4: Run to verify it PASSES:** `npx vitest run tests/agent/session.test.ts` → all pass. `npx vitest run tests/agent/` → no regression.

- [ ] **Step 5: Commit**

```bash
git add src/agent/session.ts tests/agent/session.test.ts
git commit -m "feat(agent): AgentSession.transcript() accessor for trace recording (SP-2 P1 T2)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Bridge records each completed turn

**Files:**
- Modify: `src/cli/repl/native-agent-bridge.ts`
- Test: `tests/cli/native-agent-bridge.test.ts` (extend)

- [ ] **Step 1: Add a failing test** to `tests/cli/native-agent-bridge.test.ts`:

```typescript
  it('records the transcript after a completed turn when a recorder is provided', async () => {
    const adapter = scripted([[{ type: 'text-delta', text: 'hi' }, { type: 'done' }]]);
    const recorded: Array<{ role: string; content: string }[]> = [];
    const engine = createNativeEngine({
      adapter, registry: buildNativeToolRegistry({ cwd: () => tmpdir() }), cwd: tmpdir(), model: 'm', lang: 'en',
      confirm: async () => 'y', toolSink: () => {},
      recordTurn: (messages) => recorded.push(messages.map((m) => ({ role: m.role, content: m.content }))),
    });
    await engine('hello', { output: () => {}, onTurnEnd: () => {} });
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ]);
  });
```

- [ ] **Step 2: Run to verify it FAILS:** `npx vitest run tests/cli/native-agent-bridge.test.ts` → FAIL.

- [ ] **Step 3: Implement** — in `src/cli/repl/native-agent-bridge.ts`:

Add to `NativeEngineDeps`:
```typescript
  /** Optional: called with the full transcript after each completed turn (trace recording). */
  recordTurn?: (messages: import('../../agent/provider-tooluse/types.js').ProviderMessage[]) => void;
```

At the END of the returned engine function (AFTER `cbs.onTurnEnd({ inputTokens, outputTokens });`), add:
```typescript
    if (deps.recordTurn) deps.recordTurn(session.transcript());
```

- [ ] **Step 4: Run to verify it PASSES:** `npx vitest run tests/cli/native-agent-bridge.test.ts` → all pass.

- [ ] **Step 5: Commit**

```bash
git add src/cli/repl/native-agent-bridge.ts tests/cli/native-agent-bridge.test.ts
git commit -m "feat(repl): native bridge records the transcript per turn (SP-2 P1 T3)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Wire the recorder in run.tsx (local-only, opt-out) + gitignore

**Files:**
- Modify: `src/cli/repl/run.tsx`
- Modify: `.gitignore` (ensure `.deckent/traces/` ignored)
- Test: `tests/cli/trace-wire.test.ts`

- [ ] **Step 1: Write the failing test** at `tests/cli/trace-wire.test.ts` (a pure unit for the recorder-builder helper, so it is testable without the Ink stack):

```typescript
// tests/cli/trace-wire.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildTurnRecorder } from '../../src/cli/repl/trace-wire.js';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('buildTurnRecorder', () => {
  it('returns undefined when disabled', () => {
    expect(buildTurnRecorder({ enabled: false, dir: tmpdir(), sessionId: 's', system: 'S', model: 'm', now: () => 'T' })).toBeUndefined();
  });
  it('returns a recorder that appends a JSONL example when enabled', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tw-')); dirs.push(dir);
    const rec = buildTurnRecorder({ enabled: true, dir, sessionId: 'sess1', system: 'SYS', model: 'qwen', now: () => 'TS' });
    expect(rec).toBeDefined();
    rec!([{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'yo' }]);
    const f = join(dir, 'sess1.jsonl');
    expect(existsSync(f)).toBe(true);
    const ex = JSON.parse(readFileSync(f, 'utf-8').trim());
    expect(ex.messages[0]).toEqual({ role: 'system', content: 'SYS' });
    expect(ex.meta).toEqual({ source: 'native-repl', model: 'qwen', ts: 'TS' });
  });
});
```

- [ ] **Step 2: Run to verify it FAILS:** `npx vitest run tests/cli/trace-wire.test.ts` → FAIL.

- [ ] **Step 3: Implement.**

(a) Create `src/cli/repl/trace-wire.ts`:

```typescript
// src/cli/repl/trace-wire.ts
// ═══ Trace-recorder wiring (SP-2) ═══════════════════════════════════════════
// Builds the per-turn recorder the native bridge calls. Local-only: writes one
// JSONL example per turn to .deckent/traces/<session>.jsonl (gitignored). Opt-out
// via DECKENT_TRACE=0. Pure/injectable (clock + dir) for hermetic tests.

import { join } from 'node:path';
import { appendTrace, toTrainingExample } from '../../agent/trace-recorder.js';
import type { ProviderMessage } from '../../agent/provider-tooluse/types.js';

export interface TurnRecorderOptions {
  enabled: boolean;
  dir: string;
  sessionId: string;
  system: string;
  model: string;
  now: () => string;
}

export function buildTurnRecorder(opts: TurnRecorderOptions): ((messages: ProviderMessage[]) => void) | undefined {
  if (!opts.enabled) return undefined;
  const file = join(opts.dir, `${opts.sessionId}.jsonl`);
  return (messages) => {
    appendTrace(file, toTrainingExample(opts.system, messages, { source: 'native-repl', model: opts.model, ts: opts.now() }));
  };
}
```

(b) In `src/cli/repl/run.tsx`, inside the native-engine `else` block (where `createNativeEngine({...})` is built), construct the recorder and pass it. The recorder needs the composed system prompt + the model — build it with `composeSystemPrompt` (import from `../../agent/identity.js`) and `resolved.model`. The trace dir is `.deckent/traces/` under cwd; the sessionId can reuse the existing `sessionId` (already in scope from the memory block) or a timestamp fallback:

```typescript
import { buildTurnRecorder } from './trace-wire.js';
import { composeSystemPrompt } from '../../agent/identity.js';
// …inside the native else block, before createNativeEngine({...}):
const recordTurn = buildTurnRecorder({
  enabled: process.env['DECKENT_TRACE'] !== '0',
  dir: join(process.cwd(), '.deckent', 'traces'),
  sessionId: sessionId ?? `native-${Date.now()}`,
  system: composeSystemPrompt({ cwd: process.cwd(), lang: lang as 'en' | 'tr' }),
  model: resolved.model,
  now: () => new Date().toISOString(),
});
```
Then add `...(recordTurn ? { recordTurn } : {}),` to the `createNativeEngine({...})` deps. (Ensure `join` is imported — it already is in run.tsx.)

(c) Ensure `.gitignore` ignores the traces dir — add `\n.deckent/traces/` if `.deckent/traces` is not already covered by an existing `.deckent/` ignore. (Check `.gitignore` first; `.deckent/` may already be partially ignored — add the specific `traces/` line only if needed.)

- [ ] **Step 4: Verify.**
1. `npx vitest run tests/cli/trace-wire.test.ts` → PASS (2).
2. `npm run lint` → tsc clean.
3. `git check-ignore .deckent/traces/x.jsonl` → prints the path (confirms ignored).

- [ ] **Step 5: Commit**

```bash
git add src/cli/repl/trace-wire.ts src/cli/repl/run.tsx .gitignore tests/cli/trace-wire.test.ts
git commit -m "feat(repl): wire per-turn trace recorder (local-only, DECKENT_TRACE opt-out) (SP-2 P1 T4)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Phase-1 gate

- [ ] `npm run lint` → clean.
- [ ] `npx vitest run tests/agent/ tests/cli/native-agent-bridge.test.ts tests/cli/trace-wire.test.ts tests/cli/native-tool-registry.test.ts` → all green (report counts).
- [ ] **Manual proof (after a build — human gate):** `DECKENT_NATIVE_MODEL=qwen3.6:27b node dist/cli/entry.js --native`, do one tool turn, then confirm `.deckent/traces/*.jsonl` exists with a valid OpenAI-messages line. (This is the real-data proof; the unit tests prove the mechanics.)
- [ ] Commit the marker: `git commit --allow-empty -m "chore(agent): SP-2 Phase 1 — live trace recorder complete"`.

---

## Phase 2 — Existing-trace extractor (NEXT — design after reading the real formats)

NOT in this plan's task list; recorded so the sequence is clear. Before writing Phase 2, EXPLORE the real source formats (they drive the parser):
- `~/.claude/projects/-home-alperen-deckent-dev/*.jsonl` — Claude Code session transcripts (rich tool_use/tool_result turns). Likely the highest-quality existing tool-use corpus.
- `.tasks/*.result` + `*.plan` (+ archived under `.deckent/archive/`) — deckent worker outputs (structured, less conversational).
- `.brain/archive/` — pre-v2 memory snapshots.

`scripts/extract-traces.mjs` normalizes each → the SAME JSONL schema (above) into `.deckent/traces/extracted-<source>.jsonl`. Map each source's tool-call/result structure into OpenAI-messages; skip malformed records with a counted warning (no silent drop). A dedup/filter pass (drop empty-assistant, dedup identical prefixes) produces the final unified corpus. Phase 2 gets its own plan once the formats are mapped.

---

## Self-Review

**Schema:** OpenAI-tool-calling JSONL (unsloth/LLaMA-Factory standard) — `tool_calls.arguments` is a JSON string (correct for the format); `tool` messages carry `tool_call_id`; `meta` is provenance.

**Privacy:** traces are `.deckent/traces/` (gitignored), local-only, opt-out via `DECKENT_TRACE=0`. Nothing is uploaded. Matches the privacy-critical stance (the user's own data for their own fine-tune).

**Type consistency:** `toTrainingExample`/`appendTrace` (trace-recorder) consumed by `buildTurnRecorder` (trace-wire) consumed by run.tsx · `session.transcript(): ProviderMessage[]` consumed by the bridge's `recordTurn` · `ProviderMessage` is the single shared message type · the recorder's `toOpenAiMessage` mirrors the adapter's `toOpenAIMessage` (same OpenAI shape) but is local to avoid importing adapter internals.

**Scope:** Phase 1 is the recorder only (5 tasks) — additive, opt-out, local. Legacy + the native default-OFF flag are untouched (the recorder only runs on the native path, behind the same flag). Phase 2 (extractor) is deferred until its source formats are read.
