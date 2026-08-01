# SP-1 M3 — Native-Agent View-Wire (flag-gated) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the M2 headless agent core (`AgentSession`) into the LIVE Ink REPL behind `DECKENT_NATIVE_AGENT=1` (default OFF), reusing the existing view (streaming, the Sprint-285 confirm-queue, the tool/change-block sink) and proving it with a real-binary PTY smoke — WITHOUT touching the legacy default path or deleting any legacy code.

**Architecture:** Three new `src/cli/repl/` modules + a surgical, optional `nativeEngine` prop on `ReplApp`. (1) `native-tool-registry.ts` wraps the existing tool dispatchers (`createToolExecDispatcher` read/write/edit/bash, `createCliToolDispatcher` deckent_*) as `ToolDefinition`s — the AgentSession permission engine is the SINGLE gate (the dispatchers run with a no-op confirm). (2) `native-transport.ts` turns `detectTransport` into a concrete provider adapter (anthropic/openai/ollama) + a model id, or an honest error. (3) `native-agent-bridge.ts` builds the `AgentSession` and returns a `ReplEngine` — the same `(input, {output, onTurnEnd}) => Promise<void>` shape the view already drives — that runs `session.send()`, maps each `AgentEvent` onto the existing view callbacks (`text-delta`→output, `tool-result`→toolSink, `usage`→stats), and bridges `permission-request`→the existing `confirmTrigger` (the confirm-queue)→`respondPermission`. `app.tsx` gains an optional `nativeEngine` prop: when present it drives the turn; when absent the existing `runChatNativeLoop` call is byte-identical (zero legacy behavior change). `entry.ts`/`run.tsx` set `nativeEngine` only when the flag is on.

**Tech Stack:** TypeScript (ESM, Node16 — `.js` import suffix mandatory), React+Ink, vitest, Node built-ins only (ADR-010). Hermetic tests (scripted `ProviderAdapter`, in-memory registry/rule-store, mock view callbacks, tmpdir cwd — no network, no spawnSync). The PTY smoke is the Tier-1 proof-of-function (ADR-079) with a mock provider injected via `DECKENT_NATIVE_MOCK` (real binary + real Ink + real AgentSession + real tool exec, only the LLM mocked).

**Spec:** `docs/superpowers/specs/2026-06-13-sp1-native-terminal-agent-core-design.md` (§3 transport, §9 core↔view, §10 migration Faz 1-2: flag default OFF + PTY smoke).

**Depends on (merged to main `9a70688d`):** `src/agent/session.ts` (`createAgentSession`, `AgentSession`, `respondPermission`), `src/agent/loop.ts` (`PermissionResponse`), `src/agent/events.ts` (`AgentEvent`), `src/agent/provider-tooluse/{anthropic,openai,ollama}.ts` (adapter factories), `src/agent/provider-detect.ts` (`detectTransport`), `src/agent/tools/{types,registry}.ts` (`ToolDefinition`, `ToolRegistry`), `src/agent/permission-policy.ts` (`loadPolicy`), `src/agent/permission-store.ts` (`createRuleStore`).

**Reuse surfaces (verified current signatures):**
- `src/cli/commands/chat-tool-exec.ts` → `createToolExecDispatcher(opts: { cwd?: string | (() => string); confirm?: (summary, toolName) => Promise<boolean>; bashRun? }): McpToolDispatcher`. Tools: `deckent_read_file {path}` (no confirm), `deckent_write_file {path,content}`, `deckent_edit_file {path,old,new}`, `deckent_bash {cmd}` (confirm-gated). Returns strings; denial = `[deckent-denied] <name>`, error = `[mcp-error] …`.
- `src/cli/commands/chat-tool-bridge.ts` → `createCliToolDispatcher(opts = {}): McpToolDispatcher` + `cliArgsFor(name, args): string[] | null`. Dispatches deckent_* CLI subcommands.
- `src/cli/commands/chat-native.ts` → `interface McpToolDispatcher { dispatch(name: string, args: Record<string, unknown>): Promise<string>; }`.
- `src/cli/repl/tool-permissions.ts` → `classifyTool(tool, args): 'read' | 'confirm' | 'always'`.
- `src/cli/repl/app.tsx` → `ConfirmTrigger = (summary: string, toolName?: string) => Promise<ConfirmAnswer>` where `ConfirmAnswer = 'y' | 'a' | 'n'`; `ToolSink = (info: ToolInfo) => void`; the engine is called at `app.tsx:345` (`runChatNativeLoop({ provider, dispatcher, output, onTurnEnd, … })`).
- `src/agent/provider-tooluse/anthropic.ts` → `createAnthropicAdapter({ apiKey, baseUrl?, version?, maxTokens?, fetchImpl? })`; `openai.ts` → `createOpenAIAdapter({ baseUrl, apiKey?, name?, fetchImpl? })`; `ollama.ts` → `createOllamaAdapter({ host, fetchImpl? })`.

**Conventions:** every commit ends with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (omitted below). i18n-first: user-facing strings via `getMessage(key, lang)` (`src/cli/helpers/messages.ts`, en+tr) — the bridge is string-free and takes localized labels from `run.tsx` (the existing pattern); transport/error reasons surfaced to the user get message keys.

---

## Scope guardrails (read before starting)

- **Legacy path is UNTOUCHED and stays default.** The `runChatNativeLoop({…})` call in `app.tsx` must remain byte-identical; the native path is a sibling branch behind an optional prop. No legacy file is deleted in M3 (that is M4).
- **`DECKENT_NATIVE_AGENT=1` (or `--native`) default OFF.** With the flag unset, `deckent` behaves exactly as today.
- **Single permission gate.** The wrapped dispatchers run with a no-op confirm; the AgentSession permission engine + guards are the only gate (no double-prompt).
- **MCP tool source is deferred** to a follow-up (needs a live broker) — M3 registers the exec + CLI-bridge tools. Noted, not silently dropped.
- **Tier-1 proof-of-function is mandatory** (ADR-079): T6's PTY smoke is the closing gate, not a unit test.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/cli/repl/native-tool-registry.ts` | `buildNativeToolRegistry(opts)` — wrap exec + CLI dispatchers as `ToolDefinition`s, tier via `classifyTool` |
| `src/cli/repl/native-transport.ts` | `resolveNativeProvider(env, config)` — `detectTransport` → `{ adapter, model }` or `{ error }` |
| `src/cli/repl/native-agent-bridge.ts` | `createNativeEngine(deps): ReplEngine` — drive `AgentSession`, map `AgentEvent`→view + confirm bridge |
| `src/agent/permission-store.ts` (modify) | guard the `permissions.allow` delete during flag coexistence (§13) |
| `src/cli/repl/app.tsx` (modify) | optional `nativeEngine?` prop + one sibling branch at the engine call |
| `src/cli/repl/run.tsx` (modify) | build `nativeEngine` when the flag is set; pass it (+ confirm/toolSink bridges) |
| `src/cli/entry.ts` (modify) | detect `DECKENT_NATIVE_AGENT` / `--native`, thread it to `runInkRepl` |
| `scripts/ink-pty-native-verify.mjs` | real-binary PTY smoke for `deckent --native` (mock provider) |

Task order: tool-registry → transport → bridge → §13 guard → flag/app/run wiring → PTY proof.

---

## Task 1: Native tool registry — wrap existing dispatchers as ToolDefinitions

**Files:**
- Create: `src/cli/repl/native-tool-registry.ts`
- Test: `tests/cli/native-tool-registry.test.ts`

- [ ] **Step 1: Write the failing test** at `tests/cli/native-tool-registry.test.ts`:

```typescript
// tests/cli/native-tool-registry.test.ts
import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { buildNativeToolRegistry } from '../../src/cli/repl/native-tool-registry.js';

describe('buildNativeToolRegistry', () => {
  it('registers the exec tools with native tiers (read→silent, write→confirm, bash floor stays confirm)', () => {
    const reg = buildNativeToolRegistry({ cwd: () => tmpdir() });
    const names = reg.list().map((t) => t.name).sort();
    expect(names).toContain('deckent_read_file');
    expect(names).toContain('deckent_write_file');
    expect(names).toContain('deckent_bash');
    expect(reg.get('deckent_read_file')!.tier).toBe('silent');   // classifyTool 'read' → 'silent'
    expect(reg.get('deckent_write_file')!.tier).toBe('confirm');  // side-effecting
    expect(reg.get('deckent_bash')!.tier).toBe('confirm');
  });

  it('exec handler runs the real dispatcher with NO internal confirm (single gate), mapping string→ToolResult', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ntr-'));
    try {
      writeFileSync(join(dir, 'f.txt'), 'HELLO');
      const reg = buildNativeToolRegistry({ cwd: () => dir });
      const read = await reg.get('deckent_read_file')!.handler({ path: 'f.txt' });
      expect(read).toEqual({ ok: true, output: 'HELLO' });
      // a side-effecting write executes WITHOUT prompting (no confirm injected) — the
      // AgentSession permission engine is the gate, not the dispatcher.
      const write = await reg.get('deckent_write_file')!.handler({ path: 'g.txt', content: 'X' });
      expect(write.ok).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('marks a dispatcher error string as ok:false', async () => {
    const reg = buildNativeToolRegistry({ cwd: () => tmpdir() });
    const r = await reg.get('deckent_read_file')!.handler({ path: '../escape.txt' });
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/mcp-error|scope/);
  });

  it('registers the CLI-bridge tools too (deckent_status is silent/read)', () => {
    const reg = buildNativeToolRegistry({ cwd: () => tmpdir() });
    expect(reg.get('deckent_status')).toBeDefined();
    expect(reg.get('deckent_status')!.tier).toBe('silent');
  });
});
```

- [ ] **Step 2: Run to verify it FAILS:** `npx vitest run tests/cli/native-tool-registry.test.ts` → FAIL (cannot resolve module).

- [ ] **Step 3: Implement** `src/cli/repl/native-tool-registry.ts`:

```typescript
// src/cli/repl/native-tool-registry.ts
// ═══ Native tool registry (SP-1 M3) ═════════════════════════════════════════
// Wraps the REPL's existing tool dispatchers (chat-tool-exec: read/write/edit/
// bash; chat-tool-bridge: deckent_* CLI) as native ToolDefinitions for the
// AgentSession. The dispatchers run with NO internal confirm — the AgentSession
// permission engine + guards are the SINGLE gate (no double-prompt). Legacy tier
// names ('read'|'confirm'|'always') map to the engine's ('silent'|'confirm'|
// 'always'); read→silent. (MCP tool source is a deferred follow-up.)

import { ToolRegistry } from '../../agent/tools/registry.js';
import type { ToolDefinition, ToolPermissionTier, ToolResult } from '../../agent/tools/types.js';
import { createToolExecDispatcher } from '../commands/chat-tool-exec.js';
import { createCliToolDispatcher } from '../commands/chat-tool-bridge.js';
import { classifyTool } from './tool-permissions.js';
import type { McpToolDispatcher } from '../commands/chat-native.js';

export interface NativeToolRegistryOptions {
  /** Resolved per-call so the REPL's /cd is followed live. */
  cwd: () => string;
}

const TIER: Record<'read' | 'confirm' | 'always', ToolPermissionTier> = {
  read: 'silent',
  confirm: 'confirm',
  always: 'always',
};

/** A minimal JSON-schema for each tool's args (provider tool_use input_schema). */
const SCHEMAS: Record<string, Record<string, unknown>> = {
  deckent_read_file: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  deckent_write_file: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] },
  deckent_edit_file: { type: 'object', properties: { path: { type: 'string' }, old: { type: 'string' }, new: { type: 'string' } }, required: ['path', 'old', 'new'] },
  deckent_bash: { type: 'object', properties: { cmd: { type: 'string' } }, required: ['cmd'] },
};

const DESCRIPTIONS: Record<string, string> = {
  deckent_read_file: 'Read a file within the project (returns its content).',
  deckent_write_file: 'Write content to a file within the project.',
  deckent_edit_file: 'Replace a substring in a file within the project.',
  deckent_bash: 'Run a shell command in the project directory.',
};

function toolResultFrom(output: string): ToolResult {
  const ok = !(output.startsWith('[mcp-error]') || output.startsWith('[deckent-denied]'));
  return { ok, output };
}

function defineFromDispatcher(
  name: string,
  description: string,
  inputSchema: Record<string, unknown>,
  dispatcher: McpToolDispatcher,
): ToolDefinition {
  return {
    name,
    description,
    inputSchema,
    category: 'coding',
    tier: TIER[classifyTool(name, {})],
    source: 'builtin',
    handler: async (args) => toolResultFrom(await dispatcher.dispatch(name, args)),
  };
}

export function buildNativeToolRegistry(opts: NativeToolRegistryOptions): ToolRegistry {
  const registry = new ToolRegistry();

  // Exec tools — NO confirm injected (single gate = AgentSession permission engine).
  const exec = createToolExecDispatcher({ cwd: opts.cwd });
  for (const name of ['deckent_read_file', 'deckent_write_file', 'deckent_edit_file', 'deckent_bash']) {
    registry.register(defineFromDispatcher(name, DESCRIPTIONS[name]!, SCHEMAS[name]!, exec));
  }

  // CLI-bridge tools (deckent_status/history/plan/…) — tier from classifyTool.
  const cli = createCliToolDispatcher();
  const genericSchema: Record<string, unknown> = { type: 'object', properties: {}, additionalProperties: true };
  for (const name of ['deckent_status', 'deckent_history', 'deckent_retro', 'deckent_doctor', 'deckent_models', 'deckent_review']) {
    registry.register(defineFromDispatcher(name, `Run the ${name} deckent command.`, genericSchema, cli));
  }

  return registry;
}
```

- [ ] **Step 4: Run to verify it PASSES:** `npx vitest run tests/cli/native-tool-registry.test.ts` → PASS (4).

- [ ] **Step 5: Commit**

```bash
git add src/cli/repl/native-tool-registry.ts tests/cli/native-tool-registry.test.ts
git commit -m "feat(repl): native tool registry — wrap exec+cli dispatchers as ToolDefinitions (SP-1 M3 T1)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: Native transport — detectTransport → provider adapter + model

**Files:**
- Create: `src/cli/repl/native-transport.ts`
- Test: `tests/cli/native-transport.test.ts`

- [ ] **Step 1: Write the failing test** at `tests/cli/native-transport.test.ts`:

```typescript
// tests/cli/native-transport.test.ts
import { describe, it, expect } from 'vitest';
import { resolveNativeProvider } from '../../src/cli/repl/native-transport.js';

describe('resolveNativeProvider', () => {
  it('picks the Anthropic adapter when ANTHROPIC_API_KEY is set', () => {
    const r = resolveNativeProvider({ ANTHROPIC_API_KEY: 'sk-ant' }, {});
    expect('adapter' in r).toBe(true);
    if ('adapter' in r) {
      expect(r.adapter.name).toBe('anthropic');
      expect(typeof r.model).toBe('string');
      expect(r.model.length).toBeGreaterThan(0);
    }
  });
  it('picks an OpenAI-compatible adapter for OPENAI_API_KEY', () => {
    const r = resolveNativeProvider({ OPENAI_API_KEY: 'sk-oai' }, {});
    expect('adapter' in r && r.adapter.name).toBe('openai');
  });
  it('picks Ollama when only ollama_host is configured', () => {
    const r = resolveNativeProvider({}, { ollama_host: 'http://127.0.0.1:11434' });
    expect('adapter' in r && r.adapter.name).toBe('ollama');
  });
  it('honors DECKENT_NATIVE_MODEL override', () => {
    const r = resolveNativeProvider({ ANTHROPIC_API_KEY: 'k', DECKENT_NATIVE_MODEL: 'claude-x' }, {});
    expect('adapter' in r && r.model).toBe('claude-x');
  });
  it('returns an honest error (no adapter) when no transport is available', () => {
    const r = resolveNativeProvider({}, {});
    expect('error' in r).toBe(true);
    if ('error' in r) expect(r.error).toMatch(/API|yerel|ollama/i);
  });
});
```

- [ ] **Step 2: Run to verify it FAILS:** `npx vitest run tests/cli/native-transport.test.ts` → FAIL.

- [ ] **Step 3: Implement** `src/cli/repl/native-transport.ts`:

```typescript
// src/cli/repl/native-transport.ts
// ═══ Native transport resolution (SP-1 M3, §3) ══════════════════════════════
// Turns detectTransport's kind into a concrete provider adapter + a model id, or
// an honest error string. Model id is API-pinned (determinism, §3): an explicit
// DECKENT_NATIVE_MODEL env wins, else a per-transport default. No network here.

import { detectTransport, type TransportConfig } from '../../agent/provider-detect.js';
import { createAnthropicAdapter } from '../../agent/provider-tooluse/anthropic.js';
import { createOpenAIAdapter } from '../../agent/provider-tooluse/openai.js';
import { createOllamaAdapter } from '../../agent/provider-tooluse/ollama.js';
import type { ProviderAdapter } from '../../agent/provider-tooluse/types.js';

export interface ResolvedProvider {
  adapter: ProviderAdapter;
  model: string;
}
export interface ProviderError {
  error: string;
}

const DEFAULT_MODEL: Record<'anthropic-api' | 'openai-compatible' | 'ollama', string> = {
  'anthropic-api': 'claude-sonnet-4-6',
  'openai-compatible': 'gpt-4.1',
  ollama: 'qwen3',
};

export function resolveNativeProvider(
  env: Record<string, string | undefined>,
  config: TransportConfig & { native_model?: string },
): ResolvedProvider | ProviderError {
  const detected = detectTransport(env, config);
  if (detected.kind === 'none') return { error: detected.reason };

  const model = env['DECKENT_NATIVE_MODEL'] ?? config.native_model ?? DEFAULT_MODEL[detected.kind];

  if (detected.kind === 'anthropic-api') {
    return { adapter: createAnthropicAdapter({ apiKey: env['ANTHROPIC_API_KEY']! }), model };
  }
  if (detected.kind === 'openai-compatible') {
    const baseUrl = config.openai_base_url ?? 'https://api.openai.com/v1';
    const opts: Parameters<typeof createOpenAIAdapter>[0] = { baseUrl };
    if (env['OPENAI_API_KEY']) opts.apiKey = env['OPENAI_API_KEY'];
    return { adapter: createOpenAIAdapter(opts), model };
  }
  return { adapter: createOllamaAdapter({ host: config.ollama_host! }), model };
}
```

- [ ] **Step 4: Run to verify it PASSES:** `npx vitest run tests/cli/native-transport.test.ts` → PASS (5).

- [ ] **Step 5: Commit**

```bash
git add src/cli/repl/native-transport.ts tests/cli/native-transport.test.ts
git commit -m "feat(repl): native transport — detectTransport → provider adapter + model (SP-1 M3 T2)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: Native agent bridge — drive AgentSession, map AgentEvent → view

**Files:**
- Create: `src/cli/repl/native-agent-bridge.ts`
- Test: `tests/cli/native-agent-bridge.test.ts`

The bridge is the engine-swap target. It builds an `AgentSession` from an injected adapter + registry (transport is resolved by the caller; tests inject a scripted adapter), and returns a `ReplEngine` — the same call shape the view already drives. It maps the `AgentEvent` stream onto the view's existing callbacks and bridges `permission-request` to the existing confirm-queue.

- [ ] **Step 1: Write the failing test** at `tests/cli/native-agent-bridge.test.ts`:

```typescript
// tests/cli/native-agent-bridge.test.ts
import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createNativeEngine } from '../../src/cli/repl/native-agent-bridge.js';
import { buildNativeToolRegistry } from '../../src/cli/repl/native-tool-registry.js';
import type { ProviderAdapter, ProviderEvent } from '../../src/agent/provider-tooluse/types.js';

function scripted(scripts: ProviderEvent[][]): ProviderAdapter {
  let turn = 0;
  return { name: 'mock', async *send() { for (const e of (scripts[turn++] ?? [{ type: 'done' }])) yield e; } };
}

describe('createNativeEngine', () => {
  it('streams text via output and ends the turn', async () => {
    const adapter = scripted([[{ type: 'text-delta', text: 'hi' }, { type: 'usage', inputTokens: 3, outputTokens: 1 }, { type: 'done' }]]);
    const out: string[] = [];
    let stats: { inputTokens: number; outputTokens: number } | null = null;
    const engine = createNativeEngine({
      adapter, registry: buildNativeToolRegistry({ cwd: () => tmpdir() }), cwd: tmpdir(), model: 'm', lang: 'en',
      confirm: async () => 'y', toolSink: () => {},
    });
    await engine('hello', { output: (t) => out.push(t), onTurnEnd: (s) => { stats = s; } });
    expect(out.join('')).toBe('hi');
    expect(stats).toEqual({ inputTokens: 3, outputTokens: 1 });
  });

  it('asks the confirm-queue on a side-effecting tool, then executes it on "y" (real write)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nb-'));
    try {
      const adapter = scripted([
        [{ type: 'tool-call', id: 'w', name: 'deckent_write_file', args: { path: 'out.txt', content: 'NATIVE' } }, { type: 'done' }],
        [{ type: 'text-delta', text: 'done' }, { type: 'done' }],
      ]);
      const asks: string[] = [];
      const engine = createNativeEngine({
        adapter, registry: buildNativeToolRegistry({ cwd: () => dir }), cwd: dir, model: 'm', lang: 'en',
        confirm: async (summary, tool) => { asks.push(tool); return 'y'; }, toolSink: () => {},
      });
      await engine('write it', { output: () => {}, onTurnEnd: () => {} });
      expect(asks).toContain('deckent_write_file');           // permission-request → confirm-queue
      expect(existsSync(join(dir, 'out.txt'))).toBe(true);     // executed for real
      expect(readFileSync(join(dir, 'out.txt'), 'utf-8')).toBe('NATIVE');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a "n" answer denies the tool (no write) and feeds a rejection back', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nb-deny-'));
    try {
      const adapter = scripted([
        [{ type: 'tool-call', id: 'w', name: 'deckent_write_file', args: { path: 'no.txt', content: 'X' } }, { type: 'done' }],
        [{ type: 'done' }],
      ]);
      const sink: { failed?: boolean }[] = [];
      const engine = createNativeEngine({
        adapter, registry: buildNativeToolRegistry({ cwd: () => dir }), cwd: dir, model: 'm', lang: 'en',
        confirm: async () => 'n', toolSink: (i) => sink.push(i),
      });
      await engine('write it', { output: () => {}, onTurnEnd: () => {} });
      expect(existsSync(join(dir, 'no.txt'))).toBe(false);
      expect(sink.some((s) => s.failed)).toBe(true);           // honest ✗ change block
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run to verify it FAILS:** `npx vitest run tests/cli/native-agent-bridge.test.ts` → FAIL.

- [ ] **Step 3: Implement** `src/cli/repl/native-agent-bridge.ts`:

```typescript
// src/cli/repl/native-agent-bridge.ts
// ═══ Native agent bridge (SP-1 M3, §9) ══════════════════════════════════════
// The engine-swap target: builds an AgentSession and returns a ReplEngine — the
// same (input, {output, onTurnEnd}) shape app.tsx already drives. It maps the
// AgentEvent stream onto the existing view callbacks and bridges the permission
// lifecycle to the existing Sprint-285 confirm-queue (ConfirmTrigger) →
// respondPermission. View-neutral mapping; the legacy path is untouched.

import { createAgentSession } from '../../agent/session.js';
import { loadPolicy } from '../../agent/permission-policy.js';
import { createRuleStore } from '../../agent/permission-store.js';
import type { ProviderAdapter } from '../../agent/provider-tooluse/types.js';
import type { ToolRegistry } from '../../agent/tools/registry.js';
import type { AgentEvent } from '../../agent/events.js';
import type { PermissionResponse } from '../../agent/loop.js';
import type { ToolInfo } from './app.js';

/** The view's engine contract (same shape the legacy runChatNativeLoop satisfies). */
export type ReplEngine = (
  input: string,
  cbs: { output: (text: string) => void; onTurnEnd: (stats: { inputTokens: number; outputTokens: number }) => void },
) => Promise<void>;

export interface NativeEngineDeps {
  adapter: ProviderAdapter;
  registry: ToolRegistry;
  cwd: string;
  model: string;
  lang: 'en' | 'tr';
  /** The existing confirm-queue trigger (run.tsx confirmTrigger). 'y'|'a'|'n'. */
  confirm: (summary: string, toolName: string) => Promise<'y' | 'a' | 'n'>;
  /** The existing tool/change-block sink (run.tsx toolSink). */
  toolSink: (info: ToolInfo) => void;
  maxIterations?: number;
}

/** Map a confirm-queue answer to a session permission decision. */
function toDecision(answer: 'y' | 'a' | 'n'): PermissionResponse {
  if (answer === 'n') return { decision: 'deny' };
  if (answer === 'a') return { decision: 'always' }; // persisted, matches "hep izin ver"
  return { decision: 'once' };
}

export function createNativeEngine(deps: NativeEngineDeps): ReplEngine {
  const session = createAgentSession({
    adapter: deps.adapter,
    registry: deps.registry,
    policy: loadPolicy(deps.cwd),
    ruleStore: createRuleStore(deps.cwd),
    cwd: deps.cwd,
    model: deps.model,
    lang: deps.lang,
    ...(deps.maxIterations !== undefined ? { maxIterations: deps.maxIterations } : {}),
  });

  return async (input, cbs) => {
    let inputTokens = 0;
    let outputTokens = 0;
    for await (const ev of session.send(input) as AsyncIterable<AgentEvent>) {
      switch (ev.type) {
        case 'text-delta':
          cbs.output(ev.text);
          break;
        case 'permission-request': {
          const answer = await deps.confirm(`${ev.tool}${ev.resource ? ` (${ev.resource})` : ''}`, ev.tool);
          session.respondPermission(ev.id, toDecision(answer));
          break;
        }
        case 'tool-result':
          deps.toolSink({ verb: ev.tool, target: '', ...(ev.ok ? {} : { failed: true }) });
          break;
        case 'usage':
          inputTokens = ev.inputTokens;
          outputTokens = ev.outputTokens;
          break;
        case 'error':
          cbs.output(`\n[${ev.message}]`);
          break;
        // 'tool-proposed' / 'tool-executing' are progress-only; 'turn-end' falls through.
      }
    }
    cbs.onTurnEnd({ inputTokens, outputTokens });
  };
}
```

- [ ] **Step 4: Run to verify it PASSES:** `npx vitest run tests/cli/native-agent-bridge.test.ts` → PASS (3).

- [ ] **Step 5: Commit**

```bash
git add src/cli/repl/native-agent-bridge.ts tests/cli/native-agent-bridge.test.ts
git commit -m "feat(repl): native agent bridge — AgentSession → ReplEngine + confirm-queue wire (SP-1 M3 T3)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4: §13 coexistence — guard the `permissions.allow` delete

**Files:**
- Modify: `src/agent/permission-store.ts`
- Test: `tests/agent/permission-store.test.ts` (extend)

**Why:** The native path uses `createRuleStore` (writes `permissions.rules`), whose `persist()` currently DELETES `permissions.allow`. The legacy default path still owns `permissions.allow`. While both coexist behind the flag, a `--native` "always" grant would silently wipe the legacy allow-list. Guard the delete so the two paths coexist non-destructively; M4 (legacy delete) removes the guard. The migration READ (legacy allow → rules, in-memory) stays — only the destructive delete is gated.

- [ ] **Step 1: Add a failing test** to `tests/agent/permission-store.test.ts` (new case):

```typescript
  it('preserves a legacy permissions.allow during flag coexistence (does not delete it on persist)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ps-coexist-'));
    try {
      const settings = join(dir, '.deckent', 'settings.local.json');
      mkdirSync(join(dir, '.deckent'), { recursive: true });
      writeFileSync(settings, JSON.stringify({ permissions: { allow: ['legacy_tool'] } }));
      const store = createRuleStore(dir);
      store.grant({ tool: 'new_tool', pattern: '**' }, 'always'); // triggers persist
      const doc = JSON.parse(readFileSync(settings, 'utf-8')) as { permissions: { allow?: string[]; rules?: unknown[] } };
      expect(doc.permissions.allow).toEqual(['legacy_tool']); // NOT deleted
      expect(Array.isArray(doc.permissions.rules)).toBe(true);  // new rule persisted
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
```

(Ensure the test file imports `mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync` from `node:fs`, `tmpdir` from `node:os`, `join` from `node:path`, and `createRuleStore` — add any missing imports.)

- [ ] **Step 2: Run to verify it FAILS:** `npx vitest run tests/agent/permission-store.test.ts` → the new case FAILS (allow is currently deleted).

- [ ] **Step 3: Implement** — in `src/agent/permission-store.ts`, the `persist()` function currently has:

```typescript
  permissions['rules'] = rules;
  delete permissions['allow']; // migrated into rules
  doc['permissions'] = permissions;
```

Replace the delete with a coexistence-guarded note (do NOT delete during the flag period):

```typescript
  permissions['rules'] = rules;
  // SP-1 M3 coexistence: while the native path (rules) runs behind a flag
  // alongside the legacy default path (allow), do NOT delete permissions.allow —
  // a native "always" grant must not wipe the legacy allow-list. M4 (legacy
  // delete) removes this guard and resumes the allow→rules migration cleanup.
  doc['permissions'] = permissions;
```

- [ ] **Step 4: Run to verify it PASSES:** `npx vitest run tests/agent/permission-store.test.ts` → all pass (the migration-READ test still passes — in-memory allow→rules is unaffected; only the on-disk delete is gone).

- [ ] **Step 5: Commit**

```bash
git add src/agent/permission-store.ts tests/agent/permission-store.test.ts
git commit -m "fix(agent): preserve legacy permissions.allow during native-flag coexistence (SP-1 M3 T4)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 5: Flag + entry/app/run wiring

**Files:**
- Modify: `src/cli/repl/app.tsx` (optional `nativeEngine` prop + one sibling branch)
- Modify: `src/cli/repl/run.tsx` (build `nativeEngine` when flagged; pass it)
- Modify: `src/cli/entry.ts` (detect `DECKENT_NATIVE_AGENT` / `--native`)
- Test: `tests/cli/native-flag-wire.test.ts`

- [ ] **Step 1: Write the failing test** at `tests/cli/native-flag-wire.test.ts`:

```typescript
// tests/cli/native-flag-wire.test.ts
import { describe, it, expect } from 'vitest';
import { isNativeAgentEnabled } from '../../src/cli/repl/native-flag.js';

describe('isNativeAgentEnabled', () => {
  it('is on when DECKENT_NATIVE_AGENT=1', () => {
    expect(isNativeAgentEnabled({ DECKENT_NATIVE_AGENT: '1' }, [])).toBe(true);
  });
  it('is on when --native is passed', () => {
    expect(isNativeAgentEnabled({}, ['--native'])).toBe(true);
  });
  it('is OFF by default (legacy path)', () => {
    expect(isNativeAgentEnabled({}, [])).toBe(false);
    expect(isNativeAgentEnabled({ DECKENT_NATIVE_AGENT: '0' }, [])).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it FAILS:** `npx vitest run tests/cli/native-flag-wire.test.ts` → FAIL.

- [ ] **Step 3: Implement.**

(a) Create `src/cli/repl/native-flag.ts` (a pure, testable predicate — the entry point only consults this):

```typescript
// src/cli/repl/native-flag.ts
// ═══ Native-agent flag (SP-1 M3, §10 Faz 1) ═════════════════════════════════
// The native REPL path is OFF by default. Opt in with DECKENT_NATIVE_AGENT=1 or
// the `--native` flag. M4 flips the default; M3 keeps it strictly opt-in.

export function isNativeAgentEnabled(
  env: Record<string, string | undefined>,
  argv: readonly string[],
): boolean {
  if (env['DECKENT_NATIVE_AGENT'] === '1') return true;
  if (argv.includes('--native')) return true;
  return false;
}
```

(b) In `src/cli/repl/app.tsx`, add an optional `nativeEngine` to `ReplAppProps` (near the existing `dispatcher: McpToolDispatcher;` line):

```typescript
  /** When set (native flag on), drives the turn INSTEAD of runChatNativeLoop. */
  nativeEngine?: (input: string, cbs: { output: (text: string) => void; onTurnEnd: (stats: { inputTokens: number; outputTokens: number }) => void }) => Promise<void>;
```

Destructure it in the component (`const { provider, dispatcher, /* … */, nativeEngine } = props;`). Then at the engine call site (`app.tsx:345`, the `void runChatNativeLoop({...})`), branch so the legacy call stays byte-identical:

```typescript
    if (nativeEngine) {
      void nativeEngine(turnInput, {
        output: (text: string) => { /* SAME body as the existing output callback */ },
        onTurnEnd: (s) => { /* SAME body as the existing onTurnEnd callback */ },
      });
    } else {
      void runChatNativeLoop({
        // …existing args, UNCHANGED…
      });
    }
```

(Extract the existing `output`/`onTurnEnd` callback bodies into local consts so both branches share them verbatim — do NOT alter their behavior. Add `nativeEngine` to the `useCallback` dependency array alongside `[provider, dispatcher, exit]`.)

(c) In `src/cli/repl/run.tsx`, after building `dispatcher`/`confirmTrigger`/`toolSink`, build the native engine when the flag is on and pass it to `<ReplApp>`:

```typescript
import { isNativeAgentEnabled } from './native-flag.js';
import { resolveNativeProvider } from './native-transport.js';
import { buildNativeToolRegistry } from './native-tool-registry.js';
import { createNativeEngine } from './native-agent-bridge.js';
// … inside runInkRepl, after toolSink/confirmTrigger are declared …
let nativeEngine: ((input: string, cbs: { output: (t: string) => void; onTurnEnd: (s: { inputTokens: number; outputTokens: number }) => void }) => Promise<void>) | undefined;
if (isNativeAgentEnabled(process.env, process.argv.slice(2))) {
  const cfg = await loadConfig().catch(() => ({} as Record<string, unknown>));
  const resolved = resolveNativeProvider(process.env, {
    openai_base_url: (cfg as { openai_base_url?: string }).openai_base_url,
    ollama_host: (cfg as { ollama_host?: string }).ollama_host,
  });
  if ('error' in resolved) {
    process.stdout.write(`\n${resolved.error}\n`); // honest: no transport → tell the user, stay on legacy
  } else {
    nativeEngine = createNativeEngine({
      adapter: resolved.adapter,
      registry: buildNativeToolRegistry({ cwd: () => process.cwd() }),
      cwd: process.cwd(),
      model: resolved.model,
      lang: lang as 'en' | 'tr',
      confirm: (summary, toolName) => (confirmTrigger ? confirmTrigger(summary, toolName) : Promise.resolve('n')),
      toolSink: (info) => { if (toolSink) toolSink(info); },
    });
  }
}
```

Pass `{...(nativeEngine ? { nativeEngine } : {})}` into the `<ReplApp .../>` props.

(d) `src/cli/entry.ts`: no behavior change is required if the flag is read inside `run.tsx` from `process.env`/`process.argv` (as above). Confirm the `--native` arg does NOT get rejected by the no-arg REPL guard `shouldLaunchDefaultRepl` — if it does, add `--native` to that guard's allow-list so `deckent --native` still launches the REPL.

- [ ] **Step 4: Verify.**
1. `npx vitest run tests/cli/native-flag-wire.test.ts` → PASS (3).
2. `npm run lint` → tsc clean (incl. dashboard).
3. **Legacy untouched proof:** `git diff` on `app.tsx` shows ONLY the added prop + the `if (nativeEngine) … else { <verbatim legacy call> }` wrapper — the legacy `runChatNativeLoop({...})` argument object is unchanged.
4. Existing REPL suites green: `npx vitest run tests/cli/` (no regression in chat-native / repl tests).

- [ ] **Step 5: Commit**

```bash
git add src/cli/repl/native-flag.ts src/cli/repl/app.tsx src/cli/repl/run.tsx src/cli/entry.ts tests/cli/native-flag-wire.test.ts
git commit -m "feat(repl): DECKENT_NATIVE_AGENT flag wires the native engine into the Ink REPL (SP-1 M3 T5)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 6: PTY proof-of-function — real-binary `deckent --native` tool turn

**Files:**
- Modify: `src/cli/repl/native-transport.ts` (honor `DECKENT_NATIVE_MOCK` → a scripted in-proc adapter)
- Create: `scripts/ink-pty-native-verify.mjs`
- Modify: `package.json` (`verify:native-repl` script)
- Test: `tests/cli/native-mock-adapter.test.ts`

**Why:** ADR-079 Tier-1 — only a real-binary run closes a user-surface task. The mock injects a deterministic LLM (structured tool_use, NOT tags), so the PTY drives the REAL binary + REAL Ink + REAL AgentSession + REAL tool exec.

- [ ] **Step 1: Write the failing test** at `tests/cli/native-mock-adapter.test.ts`:

```typescript
// tests/cli/native-mock-adapter.test.ts
import { describe, it, expect } from 'vitest';
import { resolveNativeProvider } from '../../src/cli/repl/native-transport.js';
import type { ProviderEvent } from '../../src/agent/provider-tooluse/types.js';

describe('DECKENT_NATIVE_MOCK', () => {
  it('returns a scripted adapter that replays the mock script, ignoring real transport', async () => {
    const script: ProviderEvent[][] = [[{ type: 'text-delta', text: 'mocked' }, { type: 'done' }]];
    const r = resolveNativeProvider({ DECKENT_NATIVE_MOCK: JSON.stringify(script) }, {});
    expect('adapter' in r).toBe(true);
    if ('adapter' in r) {
      const out: ProviderEvent[] = [];
      for await (const e of r.adapter.send({ system: 's', model: 'm', messages: [], tools: [] })) out.push(e);
      expect(out).toEqual([{ type: 'text-delta', text: 'mocked' }, { type: 'done' }]);
    }
  });
});
```

- [ ] **Step 2: Run to verify it FAILS:** `npx vitest run tests/cli/native-mock-adapter.test.ts` → FAIL.

- [ ] **Step 3: Implement** — at the TOP of `resolveNativeProvider` (before `detectTransport`), add the mock short-circuit:

```typescript
  const mock = env['DECKENT_NATIVE_MOCK'];
  if (mock) {
    let scripts: import('../../agent/provider-tooluse/types.js').ProviderEvent[][] = [];
    try { scripts = JSON.parse(mock); } catch { scripts = []; }
    let turn = 0;
    return {
      adapter: { name: 'mock', async *send() { for (const e of (scripts[turn++] ?? [{ type: 'done' }])) yield e; } },
      model: env['DECKENT_NATIVE_MODEL'] ?? 'mock-model',
    };
  }
```

- [ ] **Step 4: Create the PTY harness** `scripts/ink-pty-native-verify.mjs` (follow the `scripts/ink-pty-tool-verify.mjs` pattern — read it first). It must: build a mock script where turn-1 emits a `tool-call` for `deckent_write_file {path:'native-proof.txt', content:'OK'}` then turn-2 concludes; spawn `node dist/cli/entry.js --native` in a PTY with `DECKENT_NATIVE_AGENT=1` + `DECKENT_NATIVE_MOCK=<script>` + `DECKENT_INK=1`; send a user line; send `y` to the confirm card; then assert (a) a confirm card appeared, (b) `native-proof.txt` exists on disk with `OK`, (c) the scrollback shows the change block. Print `PASS` + `exit 0`, or `FAIL <reason>` + `exit 1`. Clean up the proof file.

- [ ] **Step 5: Add the npm script** to `package.json`:

```json
    "verify:native-repl": "node scripts/ink-pty-native-verify.mjs",
```

- [ ] **Step 6: Run the gate (real binary).**

```bash
npx vitest run tests/cli/native-mock-adapter.test.ts   # PASS (1)
npm run build:all                                       # the PTY drives dist/
node scripts/ink-pty-native-verify.mjs                  # → "PASS", exit 0
```

Expected: `PASS` — the native binary proposed a tool, the confirm card showed, `y` executed the write (disk proof), the result fed back, the turn concluded.

- [ ] **Step 7: Commit**

```bash
git add src/cli/repl/native-transport.ts scripts/ink-pty-native-verify.mjs package.json tests/cli/native-mock-adapter.test.ts
git commit -m "test(repl): PTY proof — real-binary deckent --native tool turn (SP-1 M3 T6)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- §3 transport — `native-transport` resolves anthropic/openai/ollama + honest `none` error; model API-pinned (`DECKENT_NATIVE_MODEL` / default) (T2). ✓
- §9 core↔view — the bridge maps the 8 `AgentEvent`s onto the existing view (`output`/`toolSink`/stats) and the `permission-request`→confirm-queue→`respondPermission` bridge; the view is reused, not rewritten (T3, T5). ✓
- §10 migration Faz 1 (flag default OFF) + Faz 2 (PTY smoke) — `isNativeAgentEnabled` opt-in (T5); `ink-pty-native-verify.mjs` real-binary proof (T6). Faz 3 (default ON) + Faz 4 (legacy delete) are M4, NOT here. ✓
- §13 — the native path uses `createRuleStore`; the coexistence guard prevents it from wiping the legacy `permissions.allow` while both run (T4). Full legacy-store retirement is M4. ✓

**Placeholder scan:** Complete code for the 3 new modules + the flag predicate + the §13 guard + the mock adapter. T5(b)/T5(c) reference the EXISTING `output`/`onTurnEnd` callback bodies (which live in `app.tsx` and must be preserved verbatim) rather than re-inlining them — this is deliberate (the legacy call must stay byte-identical); the implementer extracts them to shared consts. T6's PTY harness is described against the existing `ink-pty-tool-verify.mjs` pattern (read-and-follow) rather than fully inlined, because it is a procedural smoke script, not unit logic — its assertions (confirm card, disk proof, scrollback) are spelled out.

**Type consistency:** `ReplEngine` is defined once (native-agent-bridge.ts) and the same shape is added as `app.tsx`'s optional `nativeEngine` prop · `PermissionResponse` (loop.ts) is the bridge's decision type · `ToolInfo` (app.ts) is the `toolSink` payload · `ProviderAdapter`/`ProviderEvent` (provider-tooluse/types) are the injected-adapter types shared by transport + bridge + mock · `classifyTool` legacy tiers map through the single `TIER` table.

**Scope:** Default path stays byte-identical (T5 proof step 3). No legacy file deleted. MCP tool source deferred (noted). The honest-error path (transport `none`) prints a message and stays on legacy rather than crashing.

---

## Deferred to M4 (recorded — NOT in this plan)

- Flip `DECKENT_NATIVE_AGENT` default ON (`§10 Faz 3`), then DELETE the legacy path (`§10 Faz 4`): `parseDeckentToolCalls`, `DECKENT_TOOL_TAG_RE`, `parseStreamJsonLine`, `createPersistentClaudeSession`, `runChatNativeLoop`, `DECKENT_AGENTIC_SYSTEM_PROMPT`, and their tests.
- Remove the §13 coexistence guard (T4) and resume the `allow→rules` migration cleanup; retire `createPermissionStore` (`chat-permissions.ts`) at `entry.ts` + `run.tsx`.
- MCP tool source registration (`chat-mcp-bridge`) into the native registry + user/package/config sources (spec §8).
- Carry-overs from the M2 Phase B final review: wire the cost guard (`accrue` on `usage` in the bridge) + the empty-assistant-message guard.
- i18n the bridge's `permission-request` summary + the transport error (message keys) when surfaced through the view.
