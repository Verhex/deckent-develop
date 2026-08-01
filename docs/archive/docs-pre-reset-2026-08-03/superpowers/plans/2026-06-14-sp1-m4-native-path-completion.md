# SP-1 M4 — Native-Path Completion (flag-gated) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the native-agent path's robustness + reach WITHOUT flipping the default or deleting legacy — wire the five deferred carry-overs (empty-assistant guard, cost-guard, MCP tool-source, i18n bridge strings, real turn-elapsed) so `deckent --native` is production-grade behind the flag. The legacy default path stays byte-identical and default.

**Architecture:** Five surgical, mostly-independent changes. (T1) the agent loop stops appending an empty assistant turn (a flaky-provider no-content turn must not wedge the next request). (T2) the native bridge accrues token usage into a `CostGuardState` and surfaces an advisory when a configured ceiling trips. (T3) `buildNativeToolRegistry` gains an optional MCP bridge whose discovered tools register as `confirm`-tier `ToolDefinition`s (single-gate: dispatched with a no-op confirm — the AgentSession permission engine is the only gate); `run.tsx` connects MCP best-effort at startup. (T4) the bridge's user-facing strings (permission summary, tool verb) flow through an injected localizer so they are i18n-clean. (T5) the native branch measures real elapsed time for the footer. No default flip, no legacy delete — those are blocked by bot-connector + `deckent chat` dependencies on the legacy loop (a later milestone migrates them first).

**Tech Stack:** TypeScript (ESM, Node16 — `.js` import suffix mandatory), React+Ink, vitest, Node built-ins only (ADR-010). Hermetic tests (scripted adapters, fake MCP bridge, mock callbacks, tmpdir — no network/spawnSync). The existing `verify:native-repl` PTY smoke must still PASS after a build (regression guard).

**Spec:** `docs/superpowers/specs/2026-06-13-sp1-native-terminal-agent-core-design.md` (§8 guards + MCP source). Plan it completes: the M2 Phase B + M3 final-review carry-overs (recorded in their plan files).

**Depends on (merged to main `ce7bfe83`):** `src/agent/loop.ts`, `src/agent/guards/cost.ts` (`createCostGuard`/`accrue`/`costExceeded`/`COST_GATE_EXCEEDED`), `src/cli/repl/native-agent-bridge.ts` (`createNativeEngine`/`NativeEngineDeps`), `src/cli/repl/native-tool-registry.ts` (`buildNativeToolRegistry`), `src/cli/repl/run.tsx`, `src/cli/repl/app.tsx`, `src/cli/helpers/messages.ts` (`getMessage`).

**Reuse surfaces (verified):**
- `src/agent/guards/cost.ts` → `createCostGuard({ usdPerMillionTokens, ceilingUsd? }): CostGuardState`; `accrue(state, { inputTokens, outputTokens })`; `costExceeded(state): { exceeded, spentUsd, reason? }`; `COST_GATE_EXCEEDED`.
- `src/cli/commands/chat-mcp-bridge.ts` → `buildMcpBridge(opts): { listTools(): NamespacedTool[]; dispatch(namespacedName, args, confirmFn): Promise<McpDispatchResult>; loadAndConnectAll(): Promise<string[]>; … }`. `NamespacedTool = { namespacedName: string; descriptor: { name: string; description?: string; inputSchema?: Record<string,unknown> }; server: string; tool: string }`. `McpDispatchResult = { ok: boolean; output: string; cancelled?: boolean; tier? }`. MCP dispatch ALWAYS promotes tier to ≥ `confirm`.
- `src/cli/helpers/messages.ts` → `getMessage(key: string, lang: string): string`. `run.tsx` already injects localized `labels` into `ReplApp` via `t = (k) => getMessage(k, lang)`.

**Conventions:** every commit ends with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (omitted below). i18n-first (T4 exists to enforce it). The legacy path stays byte-identical (T5 touches only the native branch).

---

## Scope guardrails

- **No default flip, no legacy delete.** `DECKENT_NATIVE_AGENT` stays default OFF. `runChatNativeLoop`/`createPersistentClaudeSession`/`chat-session.ts` are NOT touched (bot connectors + `deckent chat` depend on them — migration is a later milestone).
- **Single permission gate preserved.** MCP tools (T3) register with a no-op confirm — the AgentSession engine is the only gate (MCP's own confirm is bypassed, matching the exec-tool pattern).
- **Legacy view byte-identical.** T5 changes only the `if (nativeEngine)` branch in `app.tsx`.
- **PTY regression.** After T1-T5, `npm run build:all && npm run verify:native-repl` must still PASS (T6).

---

## File Structure

| File | Task | Change |
|------|------|--------|
| `src/agent/loop.ts` | T1 | skip appending an empty assistant turn |
| `src/cli/repl/native-agent-bridge.ts` | T2, T4 | cost accrue + ceiling advisory; localized strings |
| `src/cli/repl/native-tool-registry.ts` | T3 | optional MCP bridge → confirm-tier ToolDefinitions |
| `src/cli/repl/run.tsx` | T3, T4 | best-effort MCP connect; inject localizer |
| `src/cli/helpers/messages.ts` | T4 | new native.* keys (en + tr) |
| `src/cli/repl/app.tsx` | T5 | real elapsed in the native branch |
| `tests/agent/`, `tests/cli/` | all | one hermetic test per change |

Task order: empty-assistant → cost → mcp → i18n → elapsed → gate.

---

## Task 1: Empty-assistant guard (loop)

**Files:**
- Modify: `src/agent/loop.ts`
- Test: `tests/agent/loop.test.ts` (extend)

**Why:** `runAgentTurn` always appends an assistant message after the provider stream, even when the stream yielded only `done` (no text, no tool calls) → `{role:'assistant', content:''}`. On the next `send()` that empty turn replays to the provider (OpenAI may 400 on `content:""` with no `tool_calls`). Skip the append when there is nothing to record.

- [ ] **Step 1: Add a failing test** to `tests/agent/loop.test.ts` (new case, before the final `});`):

```typescript
  it('does not append an empty assistant turn when the stream yields no text and no tool calls', async () => {
    const { adapter, requests } = scriptedAdapter([
      [{ type: 'done' }],                                   // turn 1: empty (no text, no calls)
      [{ type: 'text-delta', text: 'next' }, { type: 'done' }],
    ]);
    const t = new Transcript();
    // Two sends on the same transcript: the 2nd request must NOT carry an empty assistant msg.
    await drain(runAgentTurn(baseDeps({ adapter }), t, 'first'));
    await drain(runAgentTurn(baseDeps({ adapter }), t, 'second'));
    const assistantMsgs = requests[1]!.messages.filter((m) => m.role === 'assistant');
    expect(assistantMsgs.every((m) => m.content !== '' || (m.toolCalls?.length ?? 0) > 0)).toBe(true);
  });
```

- [ ] **Step 2: Run to verify it FAILS:** `npx vitest run tests/agent/loop.test.ts` → the new case FAILS (an empty assistant message is present).

- [ ] **Step 3: Implement** — in `src/agent/loop.ts`, the current code is:

```typescript
    transcript.appendAssistant(assistantText, calls.map((c) => ({ id: c.id, name: c.name, args: c.args })));
    if (calls.length === 0) { yield { type: 'turn-end' }; return; }
```

Replace with (only append when there is text or at least one tool call):

```typescript
    if (assistantText !== '' || calls.length > 0) {
      transcript.appendAssistant(assistantText, calls.map((c) => ({ id: c.id, name: c.name, args: c.args })));
    }
    if (calls.length === 0) { yield { type: 'turn-end' }; return; }
```

- [ ] **Step 4: Run to verify it PASSES:** `npx vitest run tests/agent/loop.test.ts` → all pass (the existing text-turn / tool-turn / recursion cases still append — they have text or calls; only the truly-empty turn is skipped). Then `npx vitest run tests/agent/` → no regression.

- [ ] **Step 5: Commit**

```bash
git add src/agent/loop.ts tests/agent/loop.test.ts
git commit -m "fix(agent): skip appending an empty assistant turn (SP-1 M4 T1)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: Cost-guard wiring (native bridge)

**Files:**
- Modify: `src/cli/repl/native-agent-bridge.ts`
- Test: `tests/cli/native-agent-bridge.test.ts` (extend)

**Why:** M2 final-review #1 — `guards/cost.ts` exists but is unwired. The bridge already handles the `usage` event; accrue there and surface an advisory when a configured ceiling trips. Advisory-only by default (no ceiling → tracking, never trips).

- [ ] **Step 1: Add a failing test** to `tests/cli/native-agent-bridge.test.ts` (new case):

```typescript
  it('accrues usage and emits a cost advisory once a configured ceiling trips', async () => {
    const adapter = scripted([[
      { type: 'text-delta', text: 'x' },
      { type: 'usage', inputTokens: 600_000, outputTokens: 0 }, // $6 at $10/M
      { type: 'done' },
    ]]);
    const out: string[] = [];
    const engine = createNativeEngine({
      adapter, registry: buildNativeToolRegistry({ cwd: () => tmpdir() }), cwd: tmpdir(), model: 'm', lang: 'en',
      confirm: async () => 'y', toolSink: () => {},
      costCeilingUsd: 5, usdPerMillionTokens: 10,
    });
    await engine('go', { output: (t) => out.push(t), onTurnEnd: () => {} });
    expect(out.join('')).toMatch(/COST_GATE_EXCEEDED|maliyet|cost/i);
  });

  it('does not emit a cost advisory when no ceiling is set', async () => {
    const adapter = scripted([[{ type: 'usage', inputTokens: 10_000_000, outputTokens: 0 }, { type: 'done' }]]);
    const out: string[] = [];
    const engine = createNativeEngine({
      adapter, registry: buildNativeToolRegistry({ cwd: () => tmpdir() }), cwd: tmpdir(), model: 'm', lang: 'en',
      confirm: async () => 'y', toolSink: () => {},
    });
    await engine('go', { output: (t) => out.push(t), onTurnEnd: () => {} });
    expect(out.join('')).not.toMatch(/COST_GATE_EXCEEDED/);
  });
```

- [ ] **Step 2: Run to verify it FAILS:** `npx vitest run tests/cli/native-agent-bridge.test.ts` → the ceiling case FAILS (no advisory).

- [ ] **Step 3: Implement** — in `src/cli/repl/native-agent-bridge.ts`:

(a) Add the imports + extend `NativeEngineDeps`:

```typescript
import { createCostGuard, accrue, costExceeded } from '../../agent/guards/cost.js';
```

In `NativeEngineDeps`, add:

```typescript
  /** Optional hard cost ceiling (USD) for the session; undefined → advisory only. */
  costCeilingUsd?: number;
  /** Blended price per 1M tokens (default 3). */
  usdPerMillionTokens?: number;
```

(b) In `createNativeEngine`, build the guard once (alongside the `session`):

```typescript
  const cost = createCostGuard({
    usdPerMillionTokens: deps.usdPerMillionTokens ?? 3,
    ...(deps.costCeilingUsd !== undefined ? { ceilingUsd: deps.costCeilingUsd } : {}),
  });
  let costWarned = false;
```

(c) In the `usage` case of the event loop, accrue + check the ceiling:

```typescript
        case 'usage':
          inputTokens = ev.inputTokens;
          outputTokens = ev.outputTokens;
          accrue(cost, { inputTokens: ev.inputTokens, outputTokens: ev.outputTokens });
          if (!costWarned) {
            const c = costExceeded(cost);
            if (c.exceeded) {
              costWarned = true;
              cbs.output(`\n[${c.reason}] ~$${c.spentUsd.toFixed(2)}`);
            }
          }
          break;
```

- [ ] **Step 4: Run to verify it PASSES:** `npx vitest run tests/cli/native-agent-bridge.test.ts` → all pass (the original 3 + 2 new). Then `npx vitest run tests/cli/native-tool-registry.test.ts` → still green.

- [ ] **Step 5: Commit**

```bash
git add src/cli/repl/native-agent-bridge.ts tests/cli/native-agent-bridge.test.ts
git commit -m "feat(repl): wire the cost guard into the native bridge (accrue on usage + ceiling advisory) (SP-1 M4 T2)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: MCP tool-source (native registry)

**Files:**
- Modify: `src/cli/repl/native-tool-registry.ts`
- Modify: `src/cli/repl/run.tsx` (best-effort MCP connect at startup)
- Test: `tests/cli/native-tool-registry.test.ts` (extend)

**Why:** Spec §8 — MCP is the primary extension mechanism. Register an (optionally-provided) connected MCP bridge's tools as `confirm`-tier `ToolDefinition`s (external side-effects are never silent). Single gate: dispatch with a no-op confirm; the AgentSession engine asks.

- [ ] **Step 1: Add a failing test** to `tests/cli/native-tool-registry.test.ts` (new case):

```typescript
  it('registers MCP bridge tools as confirm-tier ToolDefinitions (single-gate dispatch)', async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const mcpBridge = {
      listTools: () => [
        { namespacedName: 'srv__echo', descriptor: { name: 'echo', description: 'echo it', inputSchema: { type: 'object', properties: { v: { type: 'string' } } } }, server: 'srv', tool: 'echo' },
      ],
      dispatch: async (name: string, args: Record<string, unknown>) => { calls.push({ name, args }); return { ok: true, output: `mcp:${args['v']}` }; },
    };
    const reg = buildNativeToolRegistry({ cwd: () => tmpdir(), mcpBridge });
    const def = reg.get('srv__echo');
    expect(def).toBeDefined();
    expect(def!.tier).toBe('confirm');       // external MCP is never silent
    expect(def!.source).toBe('mcp');
    const r = await def!.handler({ v: 'hi' });
    expect(r).toEqual({ ok: true, output: 'mcp:hi' });
    expect(calls).toHaveLength(1);           // dispatched through the bridge (no-op confirm)
  });
```

- [ ] **Step 2: Run to verify it FAILS:** `npx vitest run tests/cli/native-tool-registry.test.ts` → FAIL.

- [ ] **Step 3: Implement** — in `src/cli/repl/native-tool-registry.ts`:

(a) Add the MCP bridge shape + option (a minimal structural type so we don't import the heavy bridge module's types):

```typescript
/** Minimal structural shape of the buildMcpBridge return (chat-mcp-bridge.ts). */
export interface NativeMcpBridge {
  listTools(): Array<{ namespacedName: string; descriptor: { description?: string; inputSchema?: Record<string, unknown> } }>;
  dispatch(namespacedName: string, args: Record<string, unknown>, confirmFn: (a: unknown) => Promise<boolean>): Promise<{ ok: boolean; output: string }>;
}
```

Extend `NativeToolRegistryOptions`:

```typescript
  /** Optional connected MCP bridge — its tools register as confirm-tier defs. */
  mcpBridge?: NativeMcpBridge;
```

(b) At the end of `buildNativeToolRegistry` (before `return registry;`), register MCP tools:

```typescript
  // MCP tools (external) — always 'confirm' (never silent); single gate via no-op confirm.
  if (opts.mcpBridge) {
    const alwaysApprove = async (): Promise<boolean> => true;
    for (const t of opts.mcpBridge.listTools()) {
      const bridge = opts.mcpBridge;
      registry.register({
        name: t.namespacedName,
        description: t.descriptor.description ?? `MCP tool ${t.namespacedName}`,
        inputSchema: t.descriptor.inputSchema ?? { type: 'object', additionalProperties: true },
        category: 'mcp',
        tier: 'confirm',
        source: 'mcp',
        handler: async (args) => {
          const r = await bridge.dispatch(t.namespacedName, args, alwaysApprove);
          return { ok: r.ok, output: r.output };
        },
      });
    }
  }
```

(c) In `src/cli/repl/run.tsx`, connect MCP best-effort BEFORE building the native registry (only inside the `isNativeAgentEnabled` block, so the legacy path is unaffected). Read the existing `chat-mcp-bridge.ts` (`buildMcpBridge`, `loadAndConnectAll`) and `src/mcp-client/{broker,registry}.ts` to construct a broker; wire it best-effort (a failure must NOT block the REPL):

```typescript
      // Best-effort MCP: connect configured servers, register their tools natively.
      let mcpBridge: NativeMcpBridge | undefined;
      try {
        const { McpClientBroker } = await import('../../mcp-client/broker.js');
        const { McpToolRegistry } = await import('../../mcp-client/registry.js');
        const { buildMcpBridge } = await import('../commands/chat-mcp-bridge.js');
        const broker = new McpClientBroker({});
        const bridge = buildMcpBridge({ broker, registry: new McpToolRegistry(), projectRoot: process.cwd() });
        const connected = await bridge.loadAndConnectAll();
        if (connected.length > 0) mcpBridge = bridge as unknown as NativeMcpBridge;
      } catch { /* MCP optional — REPL stays usable */ }
```

Then pass `mcpBridge` into `buildNativeToolRegistry({ cwd: () => process.cwd(), ...(mcpBridge ? { mcpBridge } : {}) })`. (Import the `NativeMcpBridge` type from `./native-tool-registry.js`. If `McpClientBroker`'s constructor signature differs, adapt minimally — verify by reading `src/mcp-client/broker.ts`; if construction is non-trivial, wire the smallest correct form and note any gap.)

- [ ] **Step 4: Run to verify it PASSES:** `npx vitest run tests/cli/native-tool-registry.test.ts` → all pass. `npm run lint` → tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/cli/repl/native-tool-registry.ts src/cli/repl/run.tsx tests/cli/native-tool-registry.test.ts
git commit -m "feat(repl): MCP tool-source — register connected MCP tools as confirm-tier native defs (SP-1 M4 T3)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4: i18n bridge strings

**Files:**
- Modify: `src/cli/helpers/messages.ts` (new `native.*` keys, en + tr)
- Modify: `src/cli/repl/native-agent-bridge.ts` (inject + use a localizer)
- Modify: `src/cli/repl/run.tsx` (build + pass the localizer)
- Test: `tests/cli/native-agent-bridge.test.ts` (extend)

**Why:** i18n-FIRST is binding. The bridge currently builds the permission summary + tool verb from raw tool names. Inject a localizer so they are language-correct.

- [ ] **Step 1: Add a failing test** to `tests/cli/native-agent-bridge.test.ts` (new case):

```typescript
  it('uses the injected localizer for the permission summary and tool verb', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nb-i18n-'));
    try {
      const adapter = scripted([
        [{ type: 'tool-call', id: 'w', name: 'deckent_write_file', args: { path: 'a.txt', content: 'X' } }, { type: 'done' }],
        [{ type: 'done' }],
      ]);
      const summaries: string[] = [];
      const sink: { verb: string }[] = [];
      const engine = createNativeEngine({
        adapter, registry: buildNativeToolRegistry({ cwd: () => dir }), cwd: dir, model: 'm', lang: 'en',
        confirm: async (summary) => { summaries.push(summary); return 'y'; },
        toolSink: (i) => sink.push(i),
        t: (key) => (key === 'native.run_tool' ? 'RUN' : `LBL:${key}`),
      });
      await engine('go', { output: () => {}, onTurnEnd: () => {} });
      expect(summaries[0]).toContain('RUN');      // localized prefix, not a raw English literal
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
```

- [ ] **Step 2: Run to verify it FAILS:** `npx vitest run tests/cli/native-agent-bridge.test.ts` → FAIL (`t` not a dep; summary has no 'RUN').

- [ ] **Step 3: Implement.**

(a) In `src/cli/helpers/messages.ts`, add to BOTH the `en` and `tr` message maps (find the existing maps and add these keys):

```typescript
// en:
  'native.run_tool': 'Run tool',
  'native.tool_ran': 'tool ran',
// tr:
  'native.run_tool': 'Aracı çalıştır',
  'native.tool_ran': 'araç çalıştı',
```

(b) In `src/cli/repl/native-agent-bridge.ts`, add to `NativeEngineDeps`:

```typescript
  /** Localizer (run.tsx: (key) => getMessage(key, lang)). Defaults to identity. */
  t?: (key: string) => string;
```

In `createNativeEngine`, resolve it: `const t = deps.t ?? ((k: string) => k);`. Then use it in the `permission-request` summary and the `tool-result` verb:

```typescript
        case 'permission-request': {
          const answer = await deps.confirm(`${t('native.run_tool')}: ${ev.tool}${ev.resource ? ` (${ev.resource})` : ''}`, ev.tool);
          session.respondPermission(ev.id, toDecision(answer));
          break;
        }
        case 'tool-result':
          deps.toolSink({ verb: `${ev.tool} — ${t('native.tool_ran')}`, target: '', ...(ev.ok ? {} : { failed: true }) });
          break;
```

(c) In `src/cli/repl/run.tsx`, pass `t` into `createNativeEngine` (the `t` const already exists in `runInkRepl`):

```typescript
        // …existing createNativeEngine deps…
        t: (key) => getMessage(key, lang),
```

- [ ] **Step 4: Run to verify it PASSES:** `npx vitest run tests/cli/native-agent-bridge.test.ts` → all pass. Confirm both message maps have the keys (en + tr) — grep: `grep -c "native.run_tool" src/cli/helpers/messages.ts` ≥ 2.

- [ ] **Step 5: Commit**

```bash
git add src/cli/helpers/messages.ts src/cli/repl/native-agent-bridge.ts src/cli/repl/run.tsx tests/cli/native-agent-bridge.test.ts
git commit -m "feat(repl): i18n the native bridge's permission summary + tool verb (SP-1 M4 T4)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 5: Real turn-elapsed in the native branch

**Files:**
- Modify: `src/cli/repl/app.tsx` (native branch only)
- Test: `tests/cli/native-elapsed.test.ts`

**Why:** M3 left the native branch's `onTurnEnd` with `elapsedMs: 0` (no footer duration). Measure real elapsed around the `nativeEngine` call. ONLY the native branch changes — the legacy call stays byte-identical.

- [ ] **Step 1: Write the failing test** at `tests/cli/native-elapsed.test.ts` (a pure unit for the elapsed helper — extract the measurement so it is testable without the Ink stack):

```typescript
// tests/cli/native-elapsed.test.ts
import { describe, it, expect } from 'vitest';
import { measuredOnTurnEnd } from '../../src/cli/repl/native-elapsed.js';

describe('measuredOnTurnEnd', () => {
  it('reports a non-negative elapsedMs and forwards tokens', () => {
    const seen: Array<{ elapsedMs: number; tokens?: number }> = [];
    const start = 1000;
    const now = () => 1042;
    const handler = measuredOnTurnEnd(start, now, (s) => seen.push(s));
    handler({ outputTokens: 7 });
    expect(seen[0]!.elapsedMs).toBe(42);
    expect(seen[0]!.tokens).toBe(7);
  });
  it('omits tokens when outputTokens is undefined', () => {
    const seen: Array<{ elapsedMs: number; tokens?: number }> = [];
    const handler = measuredOnTurnEnd(0, () => 5, (s) => seen.push(s));
    handler({});
    expect(seen[0]!.elapsedMs).toBe(5);
    expect('tokens' in seen[0]!).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it FAILS:** `npx vitest run tests/cli/native-elapsed.test.ts` → FAIL.

- [ ] **Step 3: Implement.**

(a) Create `src/cli/repl/native-elapsed.ts`:

```typescript
// src/cli/repl/native-elapsed.ts
// ═══ Native turn-elapsed (SP-1 M4) ══════════════════════════════════════════
// Builds the native branch's onTurnEnd so the footer shows a real duration
// (M3 left it 0). Pure + injectable clock for hermetic tests.

export interface NativeTurnStats { outputTokens?: number; }
export interface FooterStat { elapsedMs: number; tokens?: number; }

export function measuredOnTurnEnd(
  startMs: number,
  now: () => number,
  sink: (s: FooterStat) => void,
): (s: NativeTurnStats) => void {
  return (s) => {
    const tokens = s.outputTokens;
    sink({ elapsedMs: now() - startMs, ...(tokens !== undefined ? { tokens } : {}) });
  };
}
```

(b) In `src/cli/repl/app.tsx`, the native branch currently is:

```typescript
    if (nativeEngine) {
      void (async () => {
        for await (const line of inputIter()) {
          await nativeEngine(line, {
            output,
            onTurnEnd: (s) => {
              const tokens = s.outputTokens;
              lastStats.current = { elapsedMs: 0, ...(tokens !== undefined ? { tokens } : {}) };
              if (tokens) setSessionTok((n) => n + tokens);
            },
          });
        }
      })().then(() => exit()).catch(() => exit());
    } else {
```

Replace the native branch's body to measure elapsed (import `measuredOnTurnEnd` at the top):

```typescript
    if (nativeEngine) {
      void (async () => {
        for await (const line of inputIter()) {
          const startMs = Date.now();
          await nativeEngine(line, {
            output,
            onTurnEnd: measuredOnTurnEnd(startMs, () => Date.now(), (st) => {
              lastStats.current = { elapsedMs: st.elapsedMs, ...(st.tokens !== undefined ? { tokens: st.tokens } : {}) };
              if (st.tokens) setSessionTok((n) => n + st.tokens);
            }),
          });
        }
      })().then(() => exit()).catch(() => exit());
    } else {
```

- [ ] **Step 4: Verify.**
1. `npx vitest run tests/cli/native-elapsed.test.ts` → PASS (2).
2. `npm run lint` → tsc clean.
3. **Legacy byte-identical:** `git --no-pager diff src/cli/repl/app.tsx` shows ONLY the native-branch body + the new import — the `else { runChatNativeLoop({...}) }` block is unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/cli/repl/native-elapsed.ts src/cli/repl/app.tsx tests/cli/native-elapsed.test.ts
git commit -m "feat(repl): real turn-elapsed in the native branch footer (SP-1 M4 T5)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 6: Gate + PTY regression

**Files:** (verification only)

- [ ] **Step 1: Typecheck:** `npm run lint` → PASS (tsc + dashboard).
- [ ] **Step 2: Agent suite:** `npx vitest run tests/agent/` → PASS (102 + T1's case = 103). Report the count.
- [ ] **Step 3: Native CLI suite:** `npx vitest run tests/cli/native-tool-registry.test.ts tests/cli/native-transport.test.ts tests/cli/native-agent-bridge.test.ts tests/cli/native-flag-wire.test.ts tests/cli/native-mock-adapter.test.ts tests/cli/native-elapsed.test.ts` → PASS (16 + T2's 2 + T3's 1 + T4's 1 + T5's 2 = 22). Report the count.
- [ ] **Step 4: No cross-suite regression:** `npx vitest run tests/cli/` → no NEW failures vs. baseline (note any pre-existing parallel-teardown flakes).
- [ ] **Step 5: PTY regression (HUMAN build-gate — signal, do not run a build yourself):** after `npm run build:all`, `npm run verify:native-repl` must still print `PASS`. Signal "🔨 BUILD GEREKLİ" with this command; the native tool turn (write+confirm→disk proof) must still close.
- [ ] **Step 6: Milestone marker**

```bash
git commit --allow-empty -m "chore(repl): SP-1 M4 — native-path completion (carry-overs wired) complete" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:** §8 MCP tool-source (T3, confirm-tier single-gate) + cost guard now wired (T2); §9 view strings i18n-clean (T4); the empty-assistant correctness gap (T1) + the elapsed footer (T5) close the M2/M3 review carry-overs. No default flip / legacy delete (correctly deferred — blocked by bot/`deckent chat`).

**Placeholder scan:** Complete code for T1/T2/T4/T5 + the registry side of T3. T3's `run.tsx` MCP-connect references the real `buildMcpBridge`/`McpClientBroker` and instructs reading `src/mcp-client/broker.ts` for the exact constructor (a procedural integration against an existing module, best-effort + try/catch) — not a placeholder; the registry-side contract (the testable unit) is fully specified.

**Type consistency:** `NativeMcpBridge` defined once (native-tool-registry) + consumed by run.tsx · `CostGuardState` from guards/cost · `t`/localizer is `(key:string)=>string` shared by bridge + run.tsx · `measuredOnTurnEnd` (native-elapsed) consumed by app.tsx · `NativeEngineDeps` gains `costCeilingUsd`/`usdPerMillionTokens`/`t` (all optional — `exactOptionalPropertyTypes`-safe via conditional spreads).

**Scope:** Native-path only. Legacy byte-identical (T5 proof). PTY regression is the closing gate (human build). MCP broker construction is the one integration with a read-and-adapt step; everything else is fully inlined.

---

## Deferred to a later milestone (recorded — NOT in this plan)

- **Default-ON (§10 Faz 3) + legacy DELETE (§10 Faz 4)** — BLOCKED: `runChatNativeLoop` + `createPersistentClaudeSession` are used by `src/connectors/chat-bridge.ts` (bot) and `src/cli/commands/chat.ts` (`deckent chat --native`); `ChatProviderAdapter`/`McpToolDispatcher` are used by `src/api/` (chat endpoints) + `src/agents/` (worker). A pre-delete milestone must migrate the bot connectors + `deckent chat` to the native path and relocate the shared `ChatProviderAdapter`/`McpToolDispatcher`/`createMcpToolDispatcher` to a shared module; only then is `chat-session.ts` (isolated persistent-spawn + tag-parse) safe to delete + the §13 `createPermissionStore` retirement safe to do.
- **Per-model cost rate** — T2 uses a flat `usdPerMillionTokens` default; a model-registry-derived rate is a follow-up.
