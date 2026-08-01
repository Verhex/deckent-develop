# SP-1 M2 Part 2 Phase B — Agent Loop Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the headless agentic core of deckent's native-terminal-agent — the multi-turn tool-use loop that consumes Phase A's provider adapters, drives the M1 permission engine + 3 safety guards, maintains a provider-agnostic transcript, and exposes a transport-neutral `AgentSession` (command interface + `AgentEvent` stream) — so that one core can later feed any view (Ink/web/IDE/headless).

**Architecture:** Greenfield `src/agent/{transcript,loop,session}.ts` + `src/agent/guards/{recursion,self-modifying,cost}.ts`, building on Phase A adapters + M1 (`ToolRegistry`, `permission.ts` `decide`/`resolveTier`, `permission-policy.ts`, `permission-store.ts`, `identity.ts` `composeSystemPrompt`) + M2 Part 1 (`events.ts` `AgentEvent`, `provider-tooluse/types.ts`). The loop maps each `ProviderEvent` to `AgentEvent`(s): `text-delta`→`text-delta` 1:1; raw `tool-call`→the loop-synthesized lifecycle quartet (`tool-proposed`→`permission-request`?→`tool-executing`→`tool-result`); `usage`→`usage` (last-wins); `done`→end-of-stream. Tool results round-trip natively: the transcript is a **message sequence** (string-content `ProviderMessage`s) where an assistant turn carries its `toolCalls` and each result is a `role:'tool'` message keyed by `toolCallId` (spec §13). `ProviderMessage` gains an optional `toolCalls?` sibling (assistant-only — content stays a string, no block-array) so the OpenAI/Anthropic adapters can reconstruct each provider's native tool-call round-trip. The `AgentSession` owns the transcript, a pending-permission Promise registry (bridging the loop's `await` to the view's `respondPermission`), the approval mode, and a cancellation flag.

**Tech Stack:** TypeScript (ESM, Node16 — `.js` import suffix mandatory), vitest, Node built-ins only (no new deps — ADR-010), hermetic tests (fake `ProviderAdapter` + in-memory `ToolRegistry`, tmpdir for cwd-dependent identity/policy, injected permission resolver — zero network, no `spawnSync`).

**Spec:** `docs/superpowers/specs/2026-06-13-sp1-native-terminal-agent-core-design.md` — §8 (4 guards over all sources), §9 (core↔view contract: 4 commands + 8 events, transport-neutral), §13 + M2 Part 2 notes (transcript-as-sequence, ProviderEvent→AgentEvent mapping).

**Depends on (already merged to main `ae713177`):** `src/agent/provider-tooluse/{types,sse,openai,anthropic,ollama}.ts` (Phase A), `src/agent/{events,identity,permission,permission-types,permission-policy,permission-store}.ts` + `src/agent/tools/{types,registry}.ts` (M1 + M2 Part 1).

**Reuse surfaces (verified current signatures):**
- `src/orchestra/self-modifying-detector.ts` → `detectDeckentRepo(projectRoot: string): boolean` and `DECKENT_SOURCE_PATTERNS: readonly string[]` (`['src/core/','src/orchestra/','src/monitor/','src/agents/','src/cli/','src/mcp/','src/providers/','src/api/','src/dashboard/','.deckent/agents/','.deckent/skills/']`). The private `matchesDeckentSource` is a 3-line `startsWith` test we re-express against the exported constant (the SSOT). `isSelfModifying` requires a task-scope shape (wrong granularity for one tool-call), so the guard composes `detectDeckentRepo` + the pattern constant directly.
- `src/core/cost-gate.ts` → `evaluateCostGate` is **sprint-estimate-shaped** (`CostGateInput`/`SprintCostEstimate`) — wrong granularity for a per-turn chat loop, so it is intentionally NOT reused. We reuse only its vocabulary: the reason string `'COST_GATE_EXCEEDED'` and `DEFAULT_AUTO_CONFIRM_THRESHOLD_USD` (= 2). The loop's cost guard is a per-session cumulative token→usd accumulator.

**Conventions:** every commit ends with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (omitted below for brevity). User-facing strings are NOT yet i18n-wired (the loop emits structured `AgentEvent`s + plain reason strings; i18n applies at M3 view-wire per spec §10) — keep them plain.

---

## Scope decision (read before starting)

**This plan delivers the headless core ONLY — pure `src/agent/`, zero `src/cli/` changes, fully unit-testable.** Two items the Phase A preview listed under "Phase B" are deliberately moved to **M3 (view-wire)** and are NOT in this plan:

1. **§13 legacy-store retirement** (`src/cli/commands/chat-permissions.ts` `createPermissionStore` → callers `src/cli/entry.ts:602`, `src/cli/repl/run.tsx:38`). The new `createRuleStore` is wired into the live REPL at M3 cutover; retiring the legacy `permissions.allow` writer is the *act of that wiring*. The dual-writer hazard is **dormant** today (the new store has zero callers, so nothing deletes `permissions.allow` yet) — retiring it now would replace a store nothing else uses. It belongs with the M3 view cutover as one coherent change.
2. **Ink view-adapter** (`AgentEvent` render + approval-queue + command dispatch) — M3.

The loop is testable without the view because it takes an injected `requestPermission` callback (the session provides the real Promise-suspension; tests inject an auto-resolver). The cross-process recursion depth (terminal→sprint→worker, spec §8) is scoped to the loop-iteration cap here; the env-propagated cross-process counter is a noted future extension.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/agent/provider-tooluse/types.ts` (modify) | add `ToolCallRef` + optional `ProviderMessage.toolCalls?` (assistant-only) |
| `src/agent/provider-tooluse/openai.ts` (modify) | `toOpenAIMessage`: emit `assistant.tool_calls` when present |
| `src/agent/provider-tooluse/anthropic.ts` (modify) | `toAnthropicMessage`: emit assistant `tool_use` content blocks when present |
| `src/agent/transcript.ts` | `Transcript` — append user/assistant(+toolCalls)/tool-result; `toProviderMessages()` (message sequence) |
| `src/agent/guards/recursion.ts` | loop-iteration cap (`recursionExceeded`) |
| `src/agent/guards/self-modifying.ts` | `checkSelfModifying(cwd, paths)` → elevate tier on a deckent-source write |
| `src/agent/guards/cost.ts` | per-session cumulative token→usd accumulator + optional hard ceiling |
| `src/agent/loop.ts` | `runAgentTurn(deps, transcript, userInput)` — the agentic loop generator |
| `src/agent/session.ts` | `createAgentSession(deps)` — command interface + event stream + permission suspension |
| `tests/agent/*.test.ts` | one hermetic test file per module |

Task order: roundtrip-enrich → transcript → recursion → self-modifying → cost → loop → session → gate.

---

## Task 1: Native tool round-trip — `ProviderMessage.toolCalls` + adapter mapping

**Why:** A multi-turn loop must send the assistant's tool calls back so the model sees its own call + the result. OpenAI rejects a `role:'tool'` message unless the preceding assistant message carries a matching `tool_calls` entry; Anthropic needs the assistant `tool_use` block before the `tool_result`. `ProviderMessage.content` stays string-only (spec §13 "blok-array DEĞİL"); we add an optional `toolCalls?` *sibling* used only on assistant messages.

**Files:**
- Modify: `src/agent/provider-tooluse/types.ts`
- Modify: `src/agent/provider-tooluse/openai.ts`
- Modify: `src/agent/provider-tooluse/anthropic.ts`
- Test: `tests/agent/message-roundtrip.test.ts`

- [ ] **Step 1: Write the failing test** at `tests/agent/message-roundtrip.test.ts`:

```typescript
// tests/agent/message-roundtrip.test.ts
// The adapters must serialize an assistant turn's tool_calls so the provider
// can correlate the following tool-result message (native round-trip, §13).
import { describe, it, expect } from 'vitest';
import { createOpenAIAdapter } from '../../src/agent/provider-tooluse/openai.js';
import { createAnthropicAdapter } from '../../src/agent/provider-tooluse/anthropic.js';
import type { ProviderRequest } from '../../src/agent/provider-tooluse/types.js';

// Capture the request body the adapter POSTs, then return a trivial done-stream.
function captureFetch(sink: { body?: any }): typeof fetch {
  return (async (_url: string, init: { body: string }) => {
    sink.body = JSON.parse(init.body);
    return { ok: true, status: 200, body: (async function* () { yield new TextEncoder().encode('data: [DONE]\n\n'); })() };
  }) as unknown as typeof fetch;
}

const roundTrip: ProviderRequest = {
  system: 'sys', model: 'm',
  messages: [
    { role: 'user', content: 'read x' },
    { role: 'assistant', content: 'sure', toolCalls: [{ id: 'tc1', name: 'read_file', args: { path: 'x' } }] },
    { role: 'tool', content: 'FILE BODY', toolCallId: 'tc1' },
  ],
  tools: [],
};

describe('assistant tool_calls round-trip', () => {
  it('OpenAI: assistant message carries tool_calls; tool message carries tool_call_id', async () => {
    const sink: { body?: any } = {};
    const a = createOpenAIAdapter({ baseUrl: 'http://x/v1', fetchImpl: captureFetch(sink) });
    for await (const _ of a.send(roundTrip)) { /* drain */ }
    const msgs = sink.body.messages;
    const assistant = msgs.find((m: any) => m.role === 'assistant');
    expect(assistant.tool_calls).toEqual([
      { id: 'tc1', type: 'function', function: { name: 'read_file', arguments: '{"path":"x"}' } },
    ]);
    const tool = msgs.find((m: any) => m.role === 'tool');
    expect(tool).toEqual({ role: 'tool', tool_call_id: 'tc1', content: 'FILE BODY' });
  });

  it('Anthropic: assistant message is text+tool_use blocks; tool result is a user tool_result block', async () => {
    const sink: { body?: any } = {};
    const a = createAnthropicAdapter({ apiKey: 'k', fetchImpl: captureFetch(sink) });
    for await (const _ of a.send(roundTrip)) { /* drain */ }
    const msgs = sink.body.messages;
    const assistant = msgs.find((m: any) => m.role === 'assistant');
    expect(assistant.content).toEqual([
      { type: 'text', text: 'sure' },
      { type: 'tool_use', id: 'tc1', name: 'read_file', input: { path: 'x' } },
    ]);
    const toolMsg = msgs[msgs.length - 1];
    expect(toolMsg).toEqual({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tc1', content: 'FILE BODY' }] });
  });

  it('Anthropic: an assistant turn with tool_use but no text omits the text block', async () => {
    const sink: { body?: any } = {};
    const a = createAnthropicAdapter({ apiKey: 'k', fetchImpl: captureFetch(sink) });
    const req: ProviderRequest = { system: 's', model: 'm', tools: [], messages: [
      { role: 'assistant', content: '', toolCalls: [{ id: 't0', name: 'ls', args: {} }] },
    ] };
    for await (const _ of a.send(req)) { /* drain */ }
    const assistant = sink.body.messages.find((m: any) => m.role === 'assistant');
    expect(assistant.content).toEqual([{ type: 'tool_use', id: 't0', name: 'ls', input: {} }]);
  });
});
```

- [ ] **Step 2: Run to verify it FAILS:** `npx vitest run tests/agent/message-roundtrip.test.ts` → FAIL (`toolCalls` not on `ProviderMessage`; adapters emit `content`-only assistant messages).

- [ ] **Step 3: Implement.**

In `src/agent/provider-tooluse/types.ts`, add `ToolCallRef` and the optional field. Replace the `ProviderMessage` interface block:

```typescript
export interface ToolCallRef {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ProviderMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  /** present on role:'tool' — correlates the result to a prior tool-call id. */
  toolCallId?: string;
  /** present on role:'assistant' — the tool calls this turn made (native
   *  round-trip). content stays a string; this is a sibling, not a block-array. */
  toolCalls?: ToolCallRef[];
}
```

In `src/agent/provider-tooluse/openai.ts`, replace `toOpenAIMessage`:

```typescript
function toOpenAIMessage(m: ProviderMessage): Record<string, unknown> {
  if (m.role === 'tool') return { role: 'tool', tool_call_id: m.toolCallId ?? '', content: m.content };
  if (m.role === 'assistant' && m.toolCalls?.length) {
    return {
      role: 'assistant',
      content: m.content,
      tool_calls: m.toolCalls.map((tc) => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.args) } })),
    };
  }
  return { role: m.role, content: m.content };
}
```

In `src/agent/provider-tooluse/anthropic.ts`, replace `toAnthropicMessage`:

```typescript
function toAnthropicMessage(m: ProviderMessage): Record<string, unknown> {
  if (m.role === 'tool') {
    return { role: 'user', content: [{ type: 'tool_result', tool_use_id: m.toolCallId ?? '', content: m.content }] };
  }
  if (m.role === 'assistant' && m.toolCalls?.length) {
    const blocks: Array<Record<string, unknown>> = [];
    if (m.content) blocks.push({ type: 'text', text: m.content });
    for (const tc of m.toolCalls) blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.args });
    return { role: 'assistant', content: blocks };
  }
  return { role: m.role, content: m.content };
}
```

- [ ] **Step 4: Run to verify it PASSES:** `npx vitest run tests/agent/message-roundtrip.test.ts` → PASS (3). Then `npx vitest run tests/agent/openai-adapter.test.ts tests/agent/anthropic-adapter.test.ts` → still green (the plain-text assistant path is unchanged when `toolCalls` is absent).

- [ ] **Step 5: Commit**

```bash
git add src/agent/provider-tooluse/types.ts src/agent/provider-tooluse/openai.ts src/agent/provider-tooluse/anthropic.ts tests/agent/message-roundtrip.test.ts
git commit -m "feat(agent): native assistant tool_calls round-trip in provider messages (SP-1 M2p2b T1)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: Transcript — provider-agnostic message sequence

**Files:**
- Create: `src/agent/transcript.ts`
- Test: `tests/agent/transcript.test.ts`

- [ ] **Step 1: Write the failing test** at `tests/agent/transcript.test.ts`:

```typescript
// tests/agent/transcript.test.ts
import { describe, it, expect } from 'vitest';
import { Transcript } from '../../src/agent/transcript.js';

describe('Transcript', () => {
  it('builds a user → assistant(+toolCalls) → tool-result sequence (§13)', () => {
    const t = new Transcript();
    t.appendUser('read x');
    t.appendAssistant('sure', [{ id: 'tc1', name: 'read_file', args: { path: 'x' } }]);
    t.appendToolResult('tc1', 'FILE BODY');
    expect(t.toProviderMessages()).toEqual([
      { role: 'user', content: 'read x' },
      { role: 'assistant', content: 'sure', toolCalls: [{ id: 'tc1', name: 'read_file', args: { path: 'x' } }] },
      { role: 'tool', content: 'FILE BODY', toolCallId: 'tc1' },
    ]);
  });

  it('omits toolCalls on a plain assistant turn', () => {
    const t = new Transcript();
    t.appendUser('hi');
    t.appendAssistant('hello');
    const msgs = t.toProviderMessages();
    expect(msgs[1]).toEqual({ role: 'assistant', content: 'hello' });
    expect('toolCalls' in msgs[1]!).toBe(false);
  });

  it('toProviderMessages returns copies (callers cannot mutate internal state)', () => {
    const t = new Transcript();
    t.appendUser('hi');
    const a = t.toProviderMessages();
    a[0]!.content = 'MUTATED';
    expect(t.toProviderMessages()[0]!.content).toBe('hi');
  });
});
```

- [ ] **Step 2: Run to verify it FAILS:** `npx vitest run tests/agent/transcript.test.ts` → FAIL (cannot resolve `transcript.js`).

- [ ] **Step 3: Implement** `src/agent/transcript.ts`:

```typescript
// src/agent/transcript.ts
// ═══ Transcript — provider-agnostic message sequence (SP-1 §13) ══════════════
// A turn is modeled as ordered string-content messages: user → assistant
// (carrying its toolCalls) → one role:'tool' result per call keyed by
// toolCallId. NOT a structured content-block array — the adapters reconstruct
// each provider's native round-trip from this normalized sequence.

import type { ProviderMessage, ToolCallRef } from './provider-tooluse/types.js';

export class Transcript {
  private readonly messages: ProviderMessage[] = [];

  appendUser(content: string): void {
    this.messages.push({ role: 'user', content });
  }

  appendAssistant(content: string, toolCalls: ToolCallRef[] = []): void {
    const m: ProviderMessage = { role: 'assistant', content };
    if (toolCalls.length > 0) m.toolCalls = toolCalls.map((tc) => ({ id: tc.id, name: tc.name, args: tc.args }));
    this.messages.push(m);
  }

  appendToolResult(toolCallId: string, output: string): void {
    this.messages.push({ role: 'tool', content: output, toolCallId });
  }

  /** A defensive copy — callers iterate, the loop owns the source of truth. */
  toProviderMessages(): ProviderMessage[] {
    return this.messages.map((m) => ({ ...m }));
  }
}
```

- [ ] **Step 4: Run to verify it PASSES:** `npx vitest run tests/agent/transcript.test.ts` → PASS (3).

- [ ] **Step 5: Commit**

```bash
git add src/agent/transcript.ts tests/agent/transcript.test.ts
git commit -m "feat(agent): Transcript — provider-agnostic message sequence (SP-1 M2p2b T2)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: Recursion guard — loop-iteration cap

**Files:**
- Create: `src/agent/guards/recursion.ts`
- Test: `tests/agent/guard-recursion.test.ts`

- [ ] **Step 1: Write the failing test** at `tests/agent/guard-recursion.test.ts`:

```typescript
// tests/agent/guard-recursion.test.ts
import { describe, it, expect } from 'vitest';
import { recursionExceeded, DEFAULT_MAX_ITERATIONS } from '../../src/agent/guards/recursion.js';

describe('recursionExceeded', () => {
  it('is false at and below the cap, true above it', () => {
    expect(recursionExceeded(1, 3)).toBe(false);
    expect(recursionExceeded(3, 3)).toBe(false);
    expect(recursionExceeded(4, 3)).toBe(true);
  });
  it('defaults to DEFAULT_MAX_ITERATIONS when no max is given', () => {
    expect(recursionExceeded(DEFAULT_MAX_ITERATIONS)).toBe(false);
    expect(recursionExceeded(DEFAULT_MAX_ITERATIONS + 1)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it FAILS:** `npx vitest run tests/agent/guard-recursion.test.ts` → FAIL.

- [ ] **Step 3: Implement** `src/agent/guards/recursion.ts`:

```typescript
// src/agent/guards/recursion.ts
// ═══ Recursion guard (SP-1 §8) ══════════════════════════════════════════════
// Caps the model→tool→model loop so a runaway tool cycle cannot spin forever.
// (The cross-process terminal→sprint→worker depth is a future extension via an
// env-propagated counter; this cut bounds the in-loop iteration count.)

export const DEFAULT_MAX_ITERATIONS = 25;

/** True once the loop has run more than `max` model round-trips this turn. */
export function recursionExceeded(iterations: number, max: number = DEFAULT_MAX_ITERATIONS): boolean {
  return iterations > max;
}
```

- [ ] **Step 4: Run to verify it PASSES:** `npx vitest run tests/agent/guard-recursion.test.ts` → PASS (2).

- [ ] **Step 5: Commit**

```bash
git add src/agent/guards/recursion.ts tests/agent/guard-recursion.test.ts
git commit -m "feat(agent): recursion guard — loop-iteration cap (SP-1 M2p2b T3)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4: Self-modifying guard — elevate on deckent-source writes

**Files:**
- Create: `src/agent/guards/self-modifying.ts`
- Test: `tests/agent/guard-self-modifying.test.ts`

**Note on hermeticity:** `detectDeckentRepo` reads `package.json` + checks `.deckent/` at the given root and **caches per root**. The test must use tmpdir roots (one that looks like deckent, one that does not) and call `clearDetectionCache()` between them to avoid cross-test cache bleed.

- [ ] **Step 1: Write the failing test** at `tests/agent/guard-self-modifying.test.ts`:

```typescript
// tests/agent/guard-self-modifying.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkSelfModifying } from '../../src/agent/guards/self-modifying.js';
import { clearDetectionCache } from '../../src/orchestra/self-modifying-detector.js';

const made: string[] = [];
function deckentRoot(): string {
  const d = mkdtempSync(join(tmpdir(), 'sm-deckent-'));
  made.push(d);
  mkdirSync(join(d, '.deckent'), { recursive: true });
  writeFileSync(join(d, 'package.json'), JSON.stringify({ name: 'deckent' }));
  return d;
}
function plainRoot(): string {
  const d = mkdtempSync(join(tmpdir(), 'sm-plain-'));
  made.push(d);
  writeFileSync(join(d, 'package.json'), JSON.stringify({ name: 'someone-app' }));
  return d;
}
afterEach(() => {
  clearDetectionCache();
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('checkSelfModifying', () => {
  it('elevates when a write targets deckent source inside the deckent repo', () => {
    const v = checkSelfModifying(deckentRoot(), ['src/core/config.ts']);
    expect(v.elevated).toBe(true);
    expect(v.reason).toContain('src/core/');
  });
  it('does not elevate for non-source writes inside the deckent repo', () => {
    const v = checkSelfModifying(deckentRoot(), ['notes/todo.md']);
    expect(v.elevated).toBe(false);
  });
  it('does not elevate in a non-deckent project (user editing their own src is normal)', () => {
    const v = checkSelfModifying(plainRoot(), ['src/core/config.ts']);
    expect(v.elevated).toBe(false);
  });
  it('does not elevate when there are no write targets', () => {
    expect(checkSelfModifying(deckentRoot(), []).elevated).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it FAILS:** `npx vitest run tests/agent/guard-self-modifying.test.ts` → FAIL.

- [ ] **Step 3: Implement** `src/agent/guards/self-modifying.ts`:

```typescript
// src/agent/guards/self-modifying.ts
// ═══ Self-modifying guard (SP-1 §8, ADR-039) ════════════════════════════════
// When the native agent runs INSIDE the deckent repo and a tool would write to
// deckent's own source, elevate the permission tier to the always-floor so the
// write is never silently auto-approved (a bug could corrupt the running agent).
// It does NOT block — it forces a confirm. In a user's own project, editing
// their src is normal, so this never fires (detectDeckentRepo gates it).

import { detectDeckentRepo, DECKENT_SOURCE_PATTERNS } from '../../orchestra/self-modifying-detector.js';

export interface SelfModVerdict {
  /** true → loop forces tier='always' (floor → ask) for this tool call. */
  elevated: boolean;
  reason: string;
}

export function checkSelfModifying(cwd: string, writeTargets: string[]): SelfModVerdict {
  if (writeTargets.length === 0 || !detectDeckentRepo(cwd)) return { elevated: false, reason: '' };
  const hit = writeTargets.find((p) => {
    const n = p.trim();
    return n.length > 0 && DECKENT_SOURCE_PATTERNS.some((pat) => n.startsWith(pat));
  });
  return hit ? { elevated: true, reason: `write targets deckent source: ${hit}` } : { elevated: false, reason: '' };
}
```

- [ ] **Step 4: Run to verify it PASSES:** `npx vitest run tests/agent/guard-self-modifying.test.ts` → PASS (4).

- [ ] **Step 5: Commit**

```bash
git add src/agent/guards/self-modifying.ts tests/agent/guard-self-modifying.test.ts
git commit -m "feat(agent): self-modifying guard — elevate on deckent-source writes (SP-1 M2p2b T4)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 5: Cost guard — per-session cumulative token→usd

**Files:**
- Create: `src/agent/guards/cost.ts`
- Test: `tests/agent/guard-cost.test.ts`

- [ ] **Step 1: Write the failing test** at `tests/agent/guard-cost.test.ts`:

```typescript
// tests/agent/guard-cost.test.ts
import { describe, it, expect } from 'vitest';
import { createCostGuard, accrue, costExceeded, COST_GATE_EXCEEDED } from '../../src/agent/guards/cost.js';

describe('cost guard', () => {
  it('accrues tokens across turns and reports spentUsd', () => {
    const g = createCostGuard({ usdPerMillionTokens: 10 }); // $10 / 1M tokens
    accrue(g, { inputTokens: 400_000, outputTokens: 100_000 });
    accrue(g, { inputTokens: 0, outputTokens: 500_000 });
    expect(g.spentTokens).toBe(1_000_000);
    expect(costExceeded(g).spentUsd).toBeCloseTo(10, 5);
  });
  it('does not trip when no ceiling is set (advisory-only default)', () => {
    const g = createCostGuard({ usdPerMillionTokens: 10 });
    accrue(g, { inputTokens: 10_000_000, outputTokens: 0 });
    expect(costExceeded(g).exceeded).toBe(false);
  });
  it('trips with the COST_GATE_EXCEEDED reason once a hard ceiling is crossed', () => {
    const g = createCostGuard({ usdPerMillionTokens: 10, ceilingUsd: 5 });
    accrue(g, { inputTokens: 600_000, outputTokens: 0 }); // $6 > $5
    const r = costExceeded(g);
    expect(r.exceeded).toBe(true);
    expect(r.reason).toBe(COST_GATE_EXCEEDED);
  });
});
```

- [ ] **Step 2: Run to verify it FAILS:** `npx vitest run tests/agent/guard-cost.test.ts` → FAIL.

- [ ] **Step 3: Implement** `src/agent/guards/cost.ts`:

```typescript
// src/agent/guards/cost.ts
// ═══ Cost guard (SP-1 §8) ═══════════════════════════════════════════════════
// Per-session cumulative token→usd accumulator. The orchestrator's evaluateCostGate
// is sprint-estimate-shaped (wrong granularity for a chat turn), so this is a
// purpose-built session tracker that reuses only the shared vocabulary
// (COST_GATE_EXCEEDED). Advisory by default; a hard stop fires only when an
// explicit ceilingUsd is configured.

/** Shared with src/core/cost-gate.ts — same reason vocabulary across surfaces. */
export const COST_GATE_EXCEEDED = 'COST_GATE_EXCEEDED';

export interface CostGuardState {
  spentTokens: number;
  readonly usdPerMillionTokens: number;
  /** undefined → advisory only (never trips). */
  readonly ceilingUsd?: number;
}

export interface CostGuardOptions {
  usdPerMillionTokens: number;
  ceilingUsd?: number;
}

export function createCostGuard(opts: CostGuardOptions): CostGuardState {
  return { spentTokens: 0, usdPerMillionTokens: opts.usdPerMillionTokens, ceilingUsd: opts.ceilingUsd };
}

export function accrue(state: CostGuardState, usage: { inputTokens: number; outputTokens: number }): void {
  state.spentTokens += (usage.inputTokens || 0) + (usage.outputTokens || 0);
}

export interface CostCheck {
  exceeded: boolean;
  spentUsd: number;
  reason?: string;
}

export function costExceeded(state: CostGuardState): CostCheck {
  const spentUsd = (state.spentTokens / 1_000_000) * state.usdPerMillionTokens;
  if (state.ceilingUsd !== undefined && spentUsd > state.ceilingUsd) {
    return { exceeded: true, spentUsd, reason: COST_GATE_EXCEEDED };
  }
  return { exceeded: false, spentUsd };
}
```

- [ ] **Step 4: Run to verify it PASSES:** `npx vitest run tests/agent/guard-cost.test.ts` → PASS (3).

- [ ] **Step 5: Commit**

```bash
git add src/agent/guards/cost.ts tests/agent/guard-cost.test.ts
git commit -m "feat(agent): cost guard — per-session cumulative token→usd (SP-1 M2p2b T5)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 6: Agent loop — `runAgentTurn`

**Files:**
- Create: `src/agent/loop.ts`
- Test: `tests/agent/loop.test.ts`

This is the integrator: it consumes a `ProviderAdapter`, a `ToolRegistry`, the permission engine (`decide`/`resolveTier`), the 3 guards, the `Transcript`, and an injected `requestPermission` resolver; it yields the `AgentEvent` stream. The mapping (spec §13): `text-delta`→`text-delta`; raw `tool-call`→`tool-proposed`, then (if `decide`='ask') `permission-request`+await, then `tool-executing`, then `tool-result`; `usage`→`usage` (last-wins); provider `done`→end of the inner stream.

- [ ] **Step 1: Write the failing test** at `tests/agent/loop.test.ts`:

```typescript
// tests/agent/loop.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runAgentTurn, type LoopDeps } from '../../src/agent/loop.js';
import { Transcript } from '../../src/agent/transcript.js';
import { ToolRegistry } from '../../src/agent/tools/registry.js';
import { SAFE_DEFAULT_POLICY } from '../../src/agent/permission-policy.js';
import type { AgentEvent } from '../../src/agent/events.js';
import type { ProviderAdapter, ProviderEvent, ProviderRequest } from '../../src/agent/provider-tooluse/types.js';
import type { RuleStore } from '../../src/agent/permission-store.js';

// A scripted adapter: yields a canned ProviderEvent[] per call, in order.
function scriptedAdapter(scripts: ProviderEvent[][]): { adapter: ProviderAdapter; requests: ProviderRequest[] } {
  const requests: ProviderRequest[] = [];
  let turn = 0;
  const adapter: ProviderAdapter = {
    name: 'scripted',
    async *send(req: ProviderRequest): AsyncIterable<ProviderEvent> {
      requests.push(req);
      const script = scripts[turn++] ?? [{ type: 'done' }];
      for (const e of script) yield e;
    },
  };
  return { adapter, requests };
}
function memRuleStore(): RuleStore {
  const rules: { tool: string; pattern: string }[] = [];
  return { grant: (r) => rules.push(r), revoke: () => {}, activeRules: () => [...rules] };
}
async function drain(stream: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = []; for await (const e of stream) out.push(e); return out;
}
function baseDeps(over: Partial<LoopDeps>): LoopDeps {
  const reg = new ToolRegistry();
  reg.register({
    name: 'echo', description: 'echo', inputSchema: { type: 'object' }, category: 'coding',
    tier: 'silent', source: 'builtin', handler: async (a) => ({ ok: true, output: `echoed:${a['v'] ?? ''}` }),
  });
  return {
    adapter: scriptedAdapter([[{ type: 'done' }]]).adapter,
    registry: reg, policy: SAFE_DEFAULT_POLICY, ruleStore: memRuleStore(),
    cwd: tmpdir(), model: 'm', getMode: () => 'suggest',
    requestPermission: async () => ({ decision: 'once' }),
    ...over,
  };
}

describe('runAgentTurn', () => {
  it('streams text then ends the turn when the model returns no tool calls', async () => {
    const { adapter } = scriptedAdapter([[{ type: 'text-delta', text: 'hi' }, { type: 'usage', inputTokens: 1, outputTokens: 2 }, { type: 'done' }]]);
    const evs = await drain(runAgentTurn(baseDeps({ adapter }), new Transcript(), 'hello'));
    expect(evs).toEqual([
      { type: 'text-delta', text: 'hi' },
      { type: 'usage', inputTokens: 1, outputTokens: 2 },
      { type: 'turn-end' },
    ]);
  });

  it('runs a silent tool call (tool-proposed→executing→result), feeds it back, then ends', async () => {
    const { adapter, requests } = scriptedAdapter([
      [{ type: 'text-delta', text: 'ok' }, { type: 'tool-call', id: 'c1', name: 'echo', args: { v: 'X' } }, { type: 'done' }],
      [{ type: 'text-delta', text: 'done' }, { type: 'done' }],
    ]);
    const t = new Transcript();
    const evs = await drain(runAgentTurn(baseDeps({ adapter }), t, 'go'));
    expect(evs.map((e) => e.type)).toEqual(['text-delta', 'tool-proposed', 'tool-executing', 'tool-result', 'text-delta', 'turn-end']);
    expect(evs).toContainEqual({ type: 'tool-result', id: 'c1', tool: 'echo', ok: true, output: 'echoed:X' });
    // round-trip: the 2nd request carries the assistant toolCalls + the tool result.
    const second = requests[1]!;
    expect(second.messages.find((m) => m.role === 'assistant')?.toolCalls).toEqual([{ id: 'c1', name: 'echo', args: { v: 'X' } }]);
    expect(second.messages.find((m) => m.role === 'tool')).toEqual({ role: 'tool', content: 'echoed:X', toolCallId: 'c1' });
  });

  it('asks for permission on a confirm-tier tool and aborts the call on deny', async () => {
    const reg = new ToolRegistry();
    reg.register({ name: 'writer', description: 'w', inputSchema: { type: 'object' }, category: 'coding', tier: 'confirm', source: 'builtin', handler: async () => ({ ok: true, output: 'wrote' }) });
    const { adapter } = scriptedAdapter([[{ type: 'tool-call', id: 'w1', name: 'writer', args: { path: 'a.txt' } }, { type: 'done' }], [{ type: 'done' }]]);
    const evs = await drain(runAgentTurn(baseDeps({ adapter, registry: reg, requestPermission: async () => ({ decision: 'deny' }) }), new Transcript(), 'go'));
    expect(evs).toContainEqual({ type: 'permission-request', id: 'w1', tool: 'writer', resource: 'a.txt', tier: 'confirm' });
    expect(evs).toContainEqual({ type: 'tool-result', id: 'w1', tool: 'writer', ok: false, output: '[rejected by user]' });
    expect(evs.some((e) => e.type === 'tool-executing')).toBe(false);
  });

  it('emits an error + turn-end when the adapter throws', async () => {
    const adapter: ProviderAdapter = { name: 'boom', async *send() { throw new Error('http 500'); } };
    const evs = await drain(runAgentTurn(baseDeps({ adapter }), new Transcript(), 'go'));
    expect(evs).toEqual([{ type: 'error', message: 'http 500' }, { type: 'turn-end' }]);
  });

  it('stops with an error when the recursion cap is exceeded (tool never satisfies the model)', async () => {
    // every turn returns the same tool call → would loop forever without the cap.
    const loopForever: ProviderEvent[] = [{ type: 'tool-call', id: 'c', name: 'echo', args: {} }, { type: 'done' }];
    const adapter: ProviderAdapter = { name: 'spin', async *send() { for (const e of loopForever) yield e; } };
    const evs = await drain(runAgentTurn(baseDeps({ adapter, maxIterations: 3 }), new Transcript(), 'go'));
    expect(evs.filter((e) => e.type === 'tool-result').length).toBe(3);
    expect(evs[evs.length - 2]).toEqual({ type: 'error', message: 'recursion limit exceeded' });
    expect(evs[evs.length - 1]).toEqual({ type: 'turn-end' });
  });
});
```

- [ ] **Step 2: Run to verify it FAILS:** `npx vitest run tests/agent/loop.test.ts` → FAIL (cannot resolve `loop.js`).

- [ ] **Step 3: Implement** `src/agent/loop.ts`:

```typescript
// src/agent/loop.ts
// ═══ Agent loop — runAgentTurn (SP-1 §9, §13) ═══════════════════════════════
// The headless engine: append the user input, then repeatedly ask the model
// (via a ProviderAdapter), surface text + tool calls as AgentEvents, gate each
// tool call through the permission engine + guards, execute it, feed the result
// back, and continue until the model answers with no tool call (turn-end) or a
// limit/abort fires. View-neutral: permission suspension is an injected callback.

import type { AgentEvent, PermissionRequestEvent } from './events.js';
import { composeSystemPrompt } from './identity.js';
import { decide, resolveTier } from './permission.js';
import type { PermissionPolicy } from './permission-policy.js';
import type { GrantLifetime, RuleStore } from './permission-store.js';
import type { ApprovalMode } from './permission-types.js';
import { ToolRegistry } from './tools/registry.js';
import type { ToolResult } from './tools/types.js';
import { Transcript } from './transcript.js';
import type { ProviderAdapter, ProviderRequest, ProviderToolCall } from './provider-tooluse/types.js';
import { recursionExceeded } from './guards/recursion.js';
import { checkSelfModifying } from './guards/self-modifying.js';

export type PermissionResponse = { decision: 'once' | 'session' | 'always' | 'deny' };

export interface LoopDeps {
  adapter: ProviderAdapter;
  registry: ToolRegistry;
  policy: PermissionPolicy;
  ruleStore: RuleStore;
  cwd: string;
  model: string;
  lang?: 'en' | 'tr';
  maxIterations?: number;
  /** current approval mode (read per-decision so setApprovalMode takes effect). */
  getMode: () => ApprovalMode;
  /** view→core suspension: resolve with the user's choice on an 'ask' decision. */
  requestPermission: (req: PermissionRequestEvent) => Promise<PermissionResponse>;
  /** cooperative cancellation between iterations. */
  isCancelled?: () => boolean;
}

/** Best-effort primary resource for permission glob matching. */
function primaryResource(args: Record<string, unknown>): string {
  const v = args['path'] ?? args['file_path'] ?? args['command'] ?? args['url'] ?? args['pattern'] ?? '';
  return typeof v === 'string' ? v : '';
}

/** Candidate write-target paths for the self-modifying guard. */
function writeTargets(args: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const k of ['path', 'file_path']) if (typeof args[k] === 'string') out.push(args[k] as string);
  if (Array.isArray(args['files'])) for (const f of args['files']) if (typeof f === 'string') out.push(f);
  return out;
}

export async function* runAgentTurn(deps: LoopDeps, transcript: Transcript, userInput: string): AsyncIterable<AgentEvent> {
  transcript.appendUser(userInput);
  const system = composeSystemPrompt({ cwd: deps.cwd, lang: deps.lang });
  let iterations = 0;

  while (true) {
    if (deps.isCancelled?.()) { yield { type: 'turn-end' }; return; }
    iterations++;
    if (recursionExceeded(iterations, deps.maxIterations)) {
      yield { type: 'error', message: 'recursion limit exceeded' };
      yield { type: 'turn-end' };
      return;
    }

    const req: ProviderRequest = { system, messages: transcript.toProviderMessages(), tools: deps.registry.toNativeSchemas(), model: deps.model };
    let assistantText = '';
    const calls: ProviderToolCall[] = [];
    try {
      for await (const ev of deps.adapter.send(req)) {
        if (ev.type === 'text-delta') { assistantText += ev.text; yield { type: 'text-delta', text: ev.text }; }
        else if (ev.type === 'tool-call') { calls.push(ev); yield { type: 'tool-proposed', id: ev.id, tool: ev.name, args: ev.args }; }
        else if (ev.type === 'usage') { yield { type: 'usage', inputTokens: ev.inputTokens, outputTokens: ev.outputTokens }; }
        // 'done' ends the inner provider stream.
      }
    } catch (e) {
      yield { type: 'error', message: e instanceof Error ? e.message : String(e) };
      yield { type: 'turn-end' };
      return;
    }

    transcript.appendAssistant(assistantText, calls.map((c) => ({ id: c.id, name: c.name, args: c.args })));
    if (calls.length === 0) { yield { type: 'turn-end' }; return; }

    for (const call of calls) {
      const def = deps.registry.get(call.name);
      if (!def) {
        const output = `[unknown tool: ${call.name}]`;
        yield { type: 'tool-result', id: call.id, tool: call.name, ok: false, output };
        transcript.appendToolResult(call.id, output);
        continue;
      }
      const resource = primaryResource(call.args);
      let tier = resolveTier(def, deps.policy);
      if (checkSelfModifying(deps.cwd, writeTargets(call.args)).elevated) tier = 'always';

      const decision = decide(call.name, resource, tier, { rules: deps.ruleStore.activeRules(), denies: [], policy: deps.policy, mode: deps.getMode() });
      if (decision === 'deny') {
        const output = '[denied by policy]';
        yield { type: 'tool-result', id: call.id, tool: call.name, ok: false, output };
        transcript.appendToolResult(call.id, output);
        continue;
      }
      if (decision === 'ask') {
        const prompt: PermissionRequestEvent = { type: 'permission-request', id: call.id, tool: call.name, resource, tier };
        yield prompt;
        const resp = await deps.requestPermission(prompt);
        if (resp.decision === 'deny') {
          const output = '[rejected by user]';
          yield { type: 'tool-result', id: call.id, tool: call.name, ok: false, output };
          transcript.appendToolResult(call.id, output);
          continue;
        }
        if (resp.decision !== 'once') deps.ruleStore.grant({ tool: call.name, pattern: resource || '**' }, resp.decision as GrantLifetime);
      }

      yield { type: 'tool-executing', id: call.id, tool: call.name };
      let result: ToolResult;
      try { result = await def.handler(call.args); }
      catch (e) { result = { ok: false, output: e instanceof Error ? e.message : String(e) }; }
      yield { type: 'tool-result', id: call.id, tool: call.name, ok: result.ok, output: result.output };
      transcript.appendToolResult(call.id, result.output);
    }
    // loop continues — the model sees the tool results on the next iteration.
  }
}
```

- [ ] **Step 4: Run to verify it PASSES:** `npx vitest run tests/agent/loop.test.ts` → PASS (5).

- [ ] **Step 5: Commit**

```bash
git add src/agent/loop.ts tests/agent/loop.test.ts
git commit -m "feat(agent): runAgentTurn — the headless agentic loop (SP-1 M2p2b T6)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 7: AgentSession — command interface + event stream

**Files:**
- Create: `src/agent/session.ts`
- Test: `tests/agent/session.test.ts`

The session is the public core API (spec §9). It owns the `Transcript` (persists across `send()` turns), a pending-permission Promise registry (so the view's `respondPermission(id, …)` resolves the loop's `await`), the mutable approval mode, and a cancellation flag. `send()` returns the loop's `AgentEvent` stream for this turn.

- [ ] **Step 1: Write the failing test** at `tests/agent/session.test.ts`:

```typescript
// tests/agent/session.test.ts
import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { createAgentSession, type AgentSessionDeps } from '../../src/agent/session.js';
import { ToolRegistry } from '../../src/agent/tools/registry.js';
import { SAFE_DEFAULT_POLICY } from '../../src/agent/permission-policy.js';
import type { AgentEvent } from '../../src/agent/events.js';
import type { ProviderAdapter, ProviderEvent, ProviderRequest } from '../../src/agent/provider-tooluse/types.js';
import type { RuleStore } from '../../src/agent/permission-store.js';

function scripted(scripts: ProviderEvent[][]): { adapter: ProviderAdapter; requests: ProviderRequest[] } {
  const requests: ProviderRequest[] = []; let turn = 0;
  return { requests, adapter: { name: 's', async *send(req) { requests.push(req); for (const e of (scripts[turn++] ?? [{ type: 'done' }])) yield e; } } };
}
function memRuleStore(): RuleStore { const r: { tool: string; pattern: string }[] = []; return { grant: (x) => r.push(x), revoke: () => {}, activeRules: () => [...r] }; }
function deps(over: Partial<AgentSessionDeps>): AgentSessionDeps {
  const reg = new ToolRegistry();
  reg.register({ name: 'writer', description: 'w', inputSchema: { type: 'object' }, category: 'coding', tier: 'confirm', source: 'builtin', handler: async () => ({ ok: true, output: 'wrote' }) });
  return { adapter: scripted([[{ type: 'done' }]]).adapter, registry: reg, policy: SAFE_DEFAULT_POLICY, ruleStore: memRuleStore(), cwd: tmpdir(), model: 'm', ...over };
}

describe('createAgentSession', () => {
  it('persists the transcript across turns (turn 2 request includes turn 1)', async () => {
    const { adapter, requests } = scripted([[{ type: 'text-delta', text: 'a' }, { type: 'done' }], [{ type: 'text-delta', text: 'b' }, { type: 'done' }]]);
    const s = createAgentSession(deps({ adapter }));
    for await (const _ of s.send('first')) { /* drain */ }
    for await (const _ of s.send('second')) { /* drain */ }
    expect(requests[1]!.messages.map((m) => m.content)).toContain('first');
    expect(requests[1]!.messages.map((m) => m.content)).toContain('second');
  });

  it('bridges respondPermission to the loop suspension', async () => {
    const { adapter } = scripted([[{ type: 'tool-call', id: 'w1', name: 'writer', args: { path: 'a' } }, { type: 'done' }], [{ type: 'done' }]]);
    const s = createAgentSession(deps({ adapter }));
    const events: AgentEvent[] = [];
    const iter = (async () => { for await (const e of s.send('go')) { events.push(e); if (e.type === 'permission-request') s.respondPermission(e.id, { decision: 'session' }); } })();
    await iter;
    expect(events).toContainEqual({ type: 'tool-result', id: 'w1', tool: 'writer', ok: true, output: 'wrote' });
  });

  it('setApprovalMode(full-auto) auto-allows a confirm-tier tool without a prompt', async () => {
    const { adapter } = scripted([[{ type: 'tool-call', id: 'w1', name: 'writer', args: { path: 'a' } }, { type: 'done' }], [{ type: 'done' }]]);
    const s = createAgentSession(deps({ adapter }));
    s.setApprovalMode('full-auto');
    const events: AgentEvent[] = [];
    for await (const e of s.send('go')) events.push(e);
    expect(events.some((e) => e.type === 'permission-request')).toBe(false);
    expect(events).toContainEqual({ type: 'tool-result', id: 'w1', tool: 'writer', ok: true, output: 'wrote' });
  });

  it('cancel() resolves a pending permission as deny and ends the turn', async () => {
    const { adapter } = scripted([[{ type: 'tool-call', id: 'w1', name: 'writer', args: { path: 'a' } }, { type: 'done' }]]);
    const s = createAgentSession(deps({ adapter }));
    const events: AgentEvent[] = [];
    for await (const e of s.send('go')) { events.push(e); if (e.type === 'permission-request') s.cancel(); }
    expect(events).toContainEqual({ type: 'tool-result', id: 'w1', tool: 'writer', ok: false, output: '[rejected by user]' });
    expect(events[events.length - 1]).toEqual({ type: 'turn-end' });
  });
});
```

- [ ] **Step 2: Run to verify it FAILS:** `npx vitest run tests/agent/session.test.ts` → FAIL (cannot resolve `session.js`).

- [ ] **Step 3: Implement** `src/agent/session.ts`:

```typescript
// src/agent/session.ts
// ═══ AgentSession — the core's public API (SP-1 §9) ═════════════════════════
// Commands (view→core): send · respondPermission · cancel · setApprovalMode.
// Events (core→view): the AgentEvent stream returned by send(). The session
// owns the cross-turn Transcript, the pending-permission Promise registry that
// bridges the loop's await to the view's respondPermission, the mutable approval
// mode, and a per-turn cancellation flag. Transport-neutral: the same stream
// drives Ink / web-SSE / NDJSON.

import type { AgentEvent } from './events.js';
import { runAgentTurn, type LoopDeps, type PermissionResponse } from './loop.js';
import type { PermissionPolicy } from './permission-policy.js';
import type { RuleStore } from './permission-store.js';
import type { ApprovalMode } from './permission-types.js';
import { ToolRegistry } from './tools/registry.js';
import { Transcript } from './transcript.js';
import type { ProviderAdapter } from './provider-tooluse/types.js';

export interface AgentSessionDeps {
  adapter: ProviderAdapter;
  registry: ToolRegistry;
  policy: PermissionPolicy;
  ruleStore: RuleStore;
  cwd: string;
  model: string;
  lang?: 'en' | 'tr';
  maxIterations?: number;
}

export interface AgentSession {
  send(userInput: string): AsyncIterable<AgentEvent>;
  respondPermission(id: string, response: PermissionResponse): void;
  cancel(): void;
  setApprovalMode(mode: ApprovalMode): void;
}

export function createAgentSession(deps: AgentSessionDeps): AgentSession {
  const transcript = new Transcript();
  const pending = new Map<string, (r: PermissionResponse) => void>();
  let mode: ApprovalMode = deps.policy.defaultMode;
  let cancelled = false;

  const loopDeps: LoopDeps = {
    adapter: deps.adapter,
    registry: deps.registry,
    policy: deps.policy,
    ruleStore: deps.ruleStore,
    cwd: deps.cwd,
    model: deps.model,
    lang: deps.lang,
    maxIterations: deps.maxIterations,
    getMode: () => mode,
    isCancelled: () => cancelled,
    requestPermission: (req) =>
      new Promise<PermissionResponse>((resolve) => {
        if (cancelled) { resolve({ decision: 'deny' }); return; }
        pending.set(req.id, resolve);
      }),
  };

  return {
    send(userInput: string): AsyncIterable<AgentEvent> {
      cancelled = false;
      pending.clear();
      return runAgentTurn(loopDeps, transcript, userInput);
    },
    respondPermission(id: string, response: PermissionResponse): void {
      const resolve = pending.get(id);
      if (resolve) { pending.delete(id); resolve(response); }
    },
    cancel(): void {
      cancelled = true;
      for (const [id, resolve] of pending) { pending.delete(id); resolve({ decision: 'deny' }); }
    },
    setApprovalMode(next: ApprovalMode): void {
      mode = next;
    },
  };
}
```

- [ ] **Step 4: Run to verify it PASSES:** `npx vitest run tests/agent/session.test.ts` → PASS (4).

- [ ] **Step 5: Commit**

```bash
git add src/agent/session.ts tests/agent/session.test.ts
git commit -m "feat(agent): AgentSession — command interface + event stream (SP-1 M2p2b T7)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 8: Wire-up gate + headless end-to-end (the SP-285 scenario, native)

**Files:**
- Create: `tests/agent/e2e-multi-tool-turn.test.ts`

The point of SP-1 is that a multi-tool turn works natively (the SP-285 symptom — "only the last of several tool tags ran" — is structurally impossible here because each `tool-call` is a discrete event the loop executes in order). This end-to-end proves it through the real `AgentSession` with two distinct tools in one model turn.

- [ ] **Step 1: Write the end-to-end test** at `tests/agent/e2e-multi-tool-turn.test.ts`:

```typescript
// tests/agent/e2e-multi-tool-turn.test.ts
// SP-285 scenario, native: a single model turn proposes TWO tool calls; the
// loop runs both in order, feeds both results back, and the model concludes.
import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { createAgentSession } from '../../src/agent/session.js';
import { ToolRegistry } from '../../src/agent/tools/registry.js';
import { SAFE_DEFAULT_POLICY } from '../../src/agent/permission-policy.js';
import type { AgentEvent } from '../../src/agent/events.js';
import type { ProviderAdapter, ProviderEvent, ProviderRequest } from '../../src/agent/provider-tooluse/types.js';
import type { RuleStore } from '../../src/agent/permission-store.js';

function memRuleStore(): RuleStore { const r: { tool: string; pattern: string }[] = []; return { grant: (x) => r.push(x), revoke: () => {}, activeRules: () => [...r] }; }

describe('e2e: native multi-tool turn', () => {
  it('runs two tool calls from one turn in order, then concludes', async () => {
    const requests: ProviderRequest[] = [];
    let turn = 0;
    const scripts: ProviderEvent[][] = [
      [
        { type: 'text-delta', text: 'Reading both files.' },
        { type: 'tool-call', id: 'a', name: 'read_file', args: { path: 'x.txt' } },
        { type: 'tool-call', id: 'b', name: 'read_file', args: { path: 'y.txt' } },
        { type: 'done' },
      ],
      [{ type: 'text-delta', text: 'Both read.' }, { type: 'usage', inputTokens: 10, outputTokens: 4 }, { type: 'done' }],
    ];
    const adapter: ProviderAdapter = { name: 'e2e', async *send(req) { requests.push(req); for (const e of scripts[turn++]!) yield e; } };

    const reg = new ToolRegistry();
    reg.register({ name: 'read_file', description: 'read', inputSchema: { type: 'object' }, category: 'coding', tier: 'silent', source: 'builtin', handler: async (a) => ({ ok: true, output: `BODY:${a['path']}` }) });

    const s = createAgentSession({ adapter, registry: reg, policy: SAFE_DEFAULT_POLICY, ruleStore: memRuleStore(), cwd: tmpdir(), model: 'm' });
    const events: AgentEvent[] = [];
    for await (const e of s.send('read x and y')) events.push(e);

    // both tool calls surfaced + executed, in order
    expect(events.filter((e) => e.type === 'tool-proposed').map((e) => (e as any).id)).toEqual(['a', 'b']);
    expect(events.filter((e) => e.type === 'tool-result').map((e) => (e as any).output)).toEqual(['BODY:x.txt', 'BODY:y.txt']);
    // the 2nd request carries BOTH tool results, keyed
    const toolMsgs = requests[1]!.messages.filter((m) => m.role === 'tool');
    expect(toolMsgs).toEqual([
      { role: 'tool', content: 'BODY:x.txt', toolCallId: 'a' },
      { role: 'tool', content: 'BODY:y.txt', toolCallId: 'b' },
    ]);
    expect(events[events.length - 1]).toEqual({ type: 'turn-end' });
  });
});
```

- [ ] **Step 2: Run the e2e:** `npx vitest run tests/agent/e2e-multi-tool-turn.test.ts` → PASS (1).

- [ ] **Step 3: Typecheck:** `npm run lint` → PASS (tsc --noEmit clean, incl. dashboard project).

- [ ] **Step 4: Full agent suite (no regressions):** `npx vitest run tests/agent/` → PASS. Report the exact count. Expected new files: message-roundtrip (3) + transcript (3) + guard-recursion (2) + guard-self-modifying (4) + guard-cost (3) + loop (5) + session (4) + e2e (1) = 25 new on top of Phase A's 74 → ~99 total.

- [ ] **Step 5: Cross-suite spot-check (the touched Phase A adapters didn't regress anything else):** `npx vitest run tests/agent/ tests/core/provider-command-spec.test.ts` → green.

- [ ] **Step 6: Commit the milestone marker**

```bash
git commit --allow-empty -m "chore(agent): SP-1 M2 Part 2 Phase B — headless agent loop core complete" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- §8 guards — recursion (T3), self-modifying (T4, ADR-039 elevate-not-block), cost (T5, session-cumulative); always-floor is already enforced by `decide()` step 2 + `policy.alwaysFloor` (M1), and the loop honors it (a floor tool → tier stays `always` → `decide`='ask'). The 4th guard needs no new module — verified by the loop test's permission path. ✓
- §9 core↔view — `AgentSession` exposes exactly `send` / `respondPermission(id, {decision})` / `cancel` / `setApprovalMode` (T7); the loop emits exactly the 8 `AgentEvent` types (T6); transport-neutral (returns an `AsyncIterable`, no view dependency). ✓
- §13 transcript-as-sequence + native round-trip — `Transcript` (T2) + `ProviderMessage.toolCalls` round-trip (T1) + the loop's `ProviderEvent`→`AgentEvent` quartet (T6). ✓
- Phase A final-review notes folded in: #1 usage last-wins (the loop forwards each `usage` as it arrives; the session does not accumulate additively — a per-turn snapshot); #3/#4 adapter throws → the loop's try/catch translates to `error`+`turn-end` (loop test 4), and no `done` is relied upon on the error path. ✓

**Placeholder scan:** No TBD/TODO; every step has complete code + exact command + expected output. The recursion guard's cross-process depth and the cost guard's policy-driven ceiling are explicitly scoped as future extensions (noted, not placeholders).

**Type consistency:** `PermissionResponse` is defined once (loop.ts) and re-exported through use in session.ts · `LoopDeps.getMode`/`isCancelled`/`requestPermission` are the exact seam the session fills · `ToolCallRef` defined in types.ts (T1), consumed by Transcript (T2) and the loop's `appendAssistant` call · `GrantLifetime` (`once`|`session`|`always`) from permission-store.ts matches the non-deny `PermissionResponse.decision` values · the loop maps to the 8 `AgentEvent` shapes verbatim from events.ts.

**Scope:** Pure `src/agent/` (+ the three Phase A adapter files for the round-trip). Zero `src/cli/` changes. §13 legacy-store retirement + the Ink view-adapter are M3. Fully hermetic (fake adapter, in-memory registry/rule-store, tmpdir cwd, injected permission resolver — no network, no spawnSync). A real-binary `deckent --native` PTY smoke is M3 (when the view + flag wire the core to a real provider).

---

## Deferred to M3 (recorded so the sequence is clear — NOT in this plan)

- **§13 legacy-store retirement:** wire `createRuleStore` + `decide`/`loadPolicy` into `src/cli/entry.ts:602` and `src/cli/repl/run.tsx:38`, replacing `createPermissionStore` (`chat-permissions.ts`) so `permissions.allow` is no longer dual-written. This is the permission half of the view cutover.
- **Ink view-adapter:** map `AgentEvent`→Ink render + the SP-285 approval-queue + dispatch the 4 commands; flag-gated `DECKENT_NATIVE_AGENT=1` (spec §10 Faz 1-4), default OFF → PTY smoke → default ON → delete legacy claude-CLI spawn + `parseDeckentToolCalls` + `DECKENT_TOOL_TAG_RE`.
- **MCP/user/package tool sources** registered into the `ToolRegistry` at session bootstrap (spec §8 multi-source discovery) + the `chat-tool-bridge`/`chat-mcp-bridge` reuse.
- **i18n** of `AgentEvent` reason strings + identity `lang` seam at the view boundary (getMessage).

### Phase B final-review carry-overs (opus, MUST be folded into the M3 plan — do not let them rot)

- **Wire the cost guard** (`guards/cost.ts` is module-complete + tested but has ZERO callers — unwired today). M3: `createAgentSession` holds a `CostGuardState`, calls `accrue(state, usage)` on each `usage` event (the `else if (ev.type === 'usage')` seam in `loop.ts`), and surfaces an advisory when `costExceeded` trips a configured ceiling. Needs a per-model price table (arrives with the M3 provider wiring). A guard merged with no callers is latent rot if M3 forgets it.
- **Empty-assistant-message guard:** `loop.ts` always appends an assistant message even when a stream yields only `done` (no text, no tool calls) → `{role:'assistant', content:''}`. On the next `send()` an empty-content assistant turn replays to the provider (OpenAI may 400 on `content:""` with no `tool_calls`). Not reachable in the tested scripts, but a flaky-provider empty turn could wedge the next request. Fix (cheap): skip the append when `content===''` && `calls.length===0`, or coalesce.
