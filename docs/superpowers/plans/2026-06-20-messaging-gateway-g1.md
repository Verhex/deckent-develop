# Project-Scoped Messaging Gateway — G1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a global, project-scoped messaging gateway daemon (`deckent gateway`) that owns one poller per channel and routes each chat to an isolated, per-project spawned runtime child.

**Architecture:** A control-plane daemon (home `~/.deckent/gateway/`) owns the `ConnectorPool` (single instance per token → no 409), a `SessionRegistry` (chat→project binding), a `ProjectRegistry` (project catalog) and a `RuntimeSupervisor` that spawns one `gateway-runtime` child per bound project. Inbound message → router resolves binding → IPC to the project's runtime (which runs the existing gated agentic loop) → reply relayed back through the connector. Telegram stays on telegraf (grammY = G2); voice/humanizer and streaming are out of scope (Faz 1).

**Tech Stack:** TypeScript (ESM, Node16 resolution), Node ≥24, vitest, commander, `node:child_process` (async spawn), telegraf (reused, unchanged).

> Design spec: `docs/superpowers/specs/2026-06-20-messaging-gateway-g1-design.md` (read first).

## Global Constraints

- **ESM imports MUST use `.js` extension** (Node16 resolution): `import { x } from './y.js'`.
- **No new runtime dependency.** telegraf stays; grammY is G2. (ADR-010.)
- **i18n-first:** every chat-facing / operator string via `getMessage(key, lang)` in `src/cli/helpers/messages.ts` (en + tr). No hardcoded TR/EN.
- **Auth invariant:** every runtime child is spawned with `ANTHROPIC_API_KEY` deleted from its env (subscription-auth). Asserted in code AND test.
- **Hermetic tests:** all file I/O under `os.tmpdir()`; gateway home overridden via `DECKENT_GATEWAY_HOME` env in tests. **Async `spawn` only — never `spawnSync`.** No network. (CLAUDE.md / ADR-087.)
- **Gate:** `npm run lint` (`tsc --noEmit`) clean + `npx vitest run tests/connectors tests/cli` green before each commit.
- **CLI registration:** follow `register<Name>(program)` pattern (ADR-012), wired in `src/cli/index.ts`.
- **chatKey format:** `` `${connector}:${channelId}` `` everywhere (single canonical helper).
- Commits land on `main` (dogfood). Run `git branch -vv` before committing; stage only the files this plan creates/edits.

---

## File Structure

All new gateway modules live under `src/connectors/gateway/` (one responsibility each):

| File | Responsibility |
|---|---|
| `src/connectors/gateway/gateway-paths.ts` | Resolve `~/.deckent/gateway/` paths (home, pid, sessions.json, projects.json); `DECKENT_GATEWAY_HOME` override for tests |
| `src/connectors/gateway/session-registry.ts` | `chatKey → projectPath` binding; atomic persist; fail-safe load |
| `src/connectors/gateway/project-registry.ts` | Project catalog (`name → path`); resolve by name-or-path |
| `src/connectors/gateway/gateway-ipc.ts` | Daemon↔child line-frame encode/decode; request/response types (partial-frame forward-compat) |
| `src/connectors/gateway/gateway-runtime.ts` | Child-side IPC loop: request → bound-project chat responder → response |
| `src/connectors/gateway/runtime-supervisor.ts` | Per-project spawned children; getOrSpawn, crash-restart, idle-evict, auth-strip |
| `src/connectors/gateway/gateway-router.ts` | Inbound message/callback → resolve → slash-intercept or route-to-runtime |
| `src/connectors/gateway/gateway-daemon.ts` | Bootstrap connectors + wire router/supervisor; pidfile lifecycle |
| `src/cli/commands/gateway.ts` | `deckent gateway start/stop/status`, `gateway pair approve`, hidden `gateway-runtime` |

Modified: `src/cli/index.ts` (register), `src/cli/helpers/messages.ts` (i18n keys), `DECKENT.md` + `.deckent/workspace/IDENTITY.md` (feature note).

Tests mirror under `tests/connectors/gateway/*.test.ts` and `tests/cli/gateway.test.ts`.

---

## Task 1: gateway-paths — home + file path resolution

**Files:**
- Create: `src/connectors/gateway/gateway-paths.ts`
- Test: `tests/connectors/gateway/gateway-paths.test.ts`

**Interfaces:**
- Produces: `gatewayHome(): string`, `gatewayPidPath(): string`, `sessionsPath(): string`, `projectsPath(): string`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/connectors/gateway/gateway-paths.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { gatewayHome, sessionsPath, projectsPath, gatewayPidPath } from '../../../src/connectors/gateway/gateway-paths.js';

describe('gateway-paths', () => {
  const prev = process.env['DECKENT_GATEWAY_HOME'];
  afterEach(() => {
    if (prev === undefined) delete process.env['DECKENT_GATEWAY_HOME'];
    else process.env['DECKENT_GATEWAY_HOME'] = prev;
  });

  it('honors DECKENT_GATEWAY_HOME override', () => {
    process.env['DECKENT_GATEWAY_HOME'] = '/tmp/gw-test';
    expect(gatewayHome()).toBe('/tmp/gw-test');
    expect(sessionsPath()).toBe(join('/tmp/gw-test', 'sessions.json'));
    expect(projectsPath()).toBe(join('/tmp/gw-test', 'projects.json'));
    expect(gatewayPidPath()).toBe(join('/tmp/gw-test', 'gateway.pid'));
  });

  it('falls back to ~/.deckent/gateway when unset', () => {
    delete process.env['DECKENT_GATEWAY_HOME'];
    expect(gatewayHome().endsWith(join('.deckent', 'gateway'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/connectors/gateway/gateway-paths.test.ts`
Expected: FAIL — cannot find module `gateway-paths.js`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/connectors/gateway/gateway-paths.ts
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Global gateway home. Test/override via DECKENT_GATEWAY_HOME; else ~/.deckent/gateway. */
export function gatewayHome(): string {
  const override = process.env['DECKENT_GATEWAY_HOME'];
  return override && override.length > 0 ? override : join(homedir(), '.deckent', 'gateway');
}

export function gatewayPidPath(): string { return join(gatewayHome(), 'gateway.pid'); }
export function sessionsPath(): string { return join(gatewayHome(), 'sessions.json'); }
export function projectsPath(): string { return join(gatewayHome(), 'projects.json'); }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/connectors/gateway/gateway-paths.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/connectors/gateway/gateway-paths.ts tests/connectors/gateway/gateway-paths.test.ts
git commit -m "feat(gateway): G1 T1 — gateway home + path resolution"
```

---

## Task 2: SessionRegistry — chat→project binding (persisted)

**Files:**
- Create: `src/connectors/gateway/session-registry.ts`
- Test: `tests/connectors/gateway/session-registry.test.ts`

**Interfaces:**
- Consumes: `sessionsPath()` from `gateway-paths.js`.
- Produces:
  - `interface SessionBinding { chatKey: string; projectPath: string; boundAt: string; boundBy: string }`
  - `interface SessionRegistry { resolve(chatKey: string): SessionBinding | undefined; bind(chatKey: string, projectPath: string, boundBy: string): Promise<SessionBinding>; unbind(chatKey: string): Promise<boolean>; list(): SessionBinding[] }`
  - `loadSessionRegistry(opts?: { path?: string; now?: () => string }): Promise<SessionRegistry>`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/connectors/gateway/session-registry.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSessionRegistry } from '../../../src/connectors/gateway/session-registry.js';

async function tmpPath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'gw-sess-'));
  return join(dir, 'sessions.json');
}

describe('SessionRegistry', () => {
  it('binds, resolves, persists, and reloads', async () => {
    const path = await tmpPath();
    const reg = await loadSessionRegistry({ path, now: () => '2026-06-20T00:00:00Z' });
    await reg.bind('telegram:42', '/foo', 'telegram:42');
    expect(reg.resolve('telegram:42')?.projectPath).toBe('/foo');

    // Persisted to disk and reloaded by a fresh instance.
    const reg2 = await loadSessionRegistry({ path });
    expect(reg2.resolve('telegram:42')?.projectPath).toBe('/foo');
    expect(reg2.list()).toHaveLength(1);
  });

  it('unbinds', async () => {
    const path = await tmpPath();
    const reg = await loadSessionRegistry({ path });
    await reg.bind('telegram:7', '/bar', 'telegram:7');
    expect(await reg.unbind('telegram:7')).toBe(true);
    expect(reg.resolve('telegram:7')).toBeUndefined();
    expect(await reg.unbind('telegram:7')).toBe(false);
  });

  it('treats a corrupt file as empty (fail-safe)', async () => {
    const path = await tmpPath();
    await writeFile(path, '{ this is not json', 'utf-8');
    const reg = await loadSessionRegistry({ path });
    expect(reg.list()).toEqual([]);
  });

  it('writes atomically (no leftover temp file in the json)', async () => {
    const path = await tmpPath();
    const reg = await loadSessionRegistry({ path });
    await reg.bind('telegram:1', '/p', 'telegram:1');
    const raw = JSON.parse(await readFile(path, 'utf-8'));
    expect(raw['telegram:1'].projectPath).toBe('/p');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/connectors/gateway/session-registry.test.ts`
Expected: FAIL — cannot find module `session-registry.js`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/connectors/gateway/session-registry.ts
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { sessionsPath } from './gateway-paths.js';

export interface SessionBinding {
  chatKey: string;
  projectPath: string;
  boundAt: string;
  boundBy: string;
}

export interface SessionRegistry {
  resolve(chatKey: string): SessionBinding | undefined;
  bind(chatKey: string, projectPath: string, boundBy: string): Promise<SessionBinding>;
  unbind(chatKey: string): Promise<boolean>;
  list(): SessionBinding[];
}

export interface LoadSessionRegistryOptions {
  /** Override the sessions.json path (tests). Default: sessionsPath(). */
  path?: string;
  /** Injectable clock for boundAt (tests). Default: real ISO now. */
  now?: () => string;
}

/** Load (or initialize) the disk-backed session registry. Corrupt file → empty. */
export async function loadSessionRegistry(opts: LoadSessionRegistryOptions = {}): Promise<SessionRegistry> {
  const path = opts.path ?? sessionsPath();
  const now = opts.now ?? ((): string => new Date().toISOString());
  const map = new Map<string, SessionBinding>();

  try {
    const raw = JSON.parse(await readFile(path, 'utf-8')) as Record<string, SessionBinding>;
    for (const [k, v] of Object.entries(raw)) {
      if (v && typeof v.projectPath === 'string') map.set(k, { ...v, chatKey: k });
    }
  } catch {
    // Missing or corrupt → start empty (fail-safe; never crash the gateway).
  }

  async function persist(): Promise<void> {
    const obj: Record<string, SessionBinding> = {};
    for (const [k, v] of map) obj[k] = v;
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.tmp`;
    await writeFile(tmp, JSON.stringify(obj, null, 2), 'utf-8');
    await rename(tmp, path); // atomic replace
  }

  return {
    resolve: (chatKey) => map.get(chatKey),
    list: () => [...map.values()],
    async bind(chatKey, projectPath, boundBy) {
      const binding: SessionBinding = { chatKey, projectPath, boundAt: now(), boundBy };
      map.set(chatKey, binding);
      await persist();
      return binding;
    },
    async unbind(chatKey) {
      const existed = map.delete(chatKey);
      if (existed) await persist();
      return existed;
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/connectors/gateway/session-registry.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/connectors/gateway/session-registry.ts tests/connectors/gateway/session-registry.test.ts
git commit -m "feat(gateway): G1 T2 — SessionRegistry (chat->project, atomic persist)"
```

---

## Task 3: ProjectRegistry — project catalog (`/use` resolution)

**Files:**
- Create: `src/connectors/gateway/project-registry.ts`
- Test: `tests/connectors/gateway/project-registry.test.ts`

**Interfaces:**
- Consumes: `projectsPath()` from `gateway-paths.js`.
- Produces:
  - `interface ProjectEntry { name: string; path: string }`
  - `interface ProjectRegistry { list(): ProjectEntry[]; resolve(nameOrPath: string): ProjectEntry | undefined; add(name: string, path: string): Promise<ProjectEntry> }`
  - `loadProjectRegistry(opts?: { path?: string }): Promise<ProjectRegistry>`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/connectors/gateway/project-registry.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadProjectRegistry } from '../../../src/connectors/gateway/project-registry.js';

async function tmpPath(): Promise<string> {
  return join(await mkdtemp(join(tmpdir(), 'gw-proj-')), 'projects.json');
}

describe('ProjectRegistry', () => {
  it('adds and resolves by name OR path', async () => {
    const path = await tmpPath();
    const reg = await loadProjectRegistry({ path });
    await reg.add('foo', '/home/me/foo');
    expect(reg.resolve('foo')?.path).toBe('/home/me/foo');
    expect(reg.resolve('/home/me/foo')?.name).toBe('foo');
    expect(reg.resolve('missing')).toBeUndefined();
  });

  it('persists across reloads and dedupes by name', async () => {
    const path = await tmpPath();
    const reg = await loadProjectRegistry({ path });
    await reg.add('foo', '/a');
    await reg.add('foo', '/b'); // same name updates path
    const reg2 = await loadProjectRegistry({ path });
    expect(reg2.list()).toHaveLength(1);
    expect(reg2.resolve('foo')?.path).toBe('/b');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/connectors/gateway/project-registry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/connectors/gateway/project-registry.ts
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { projectsPath } from './gateway-paths.js';

export interface ProjectEntry { name: string; path: string }

export interface ProjectRegistry {
  list(): ProjectEntry[];
  resolve(nameOrPath: string): ProjectEntry | undefined;
  add(name: string, path: string): Promise<ProjectEntry>;
}

export async function loadProjectRegistry(opts: { path?: string } = {}): Promise<ProjectRegistry> {
  const path = opts.path ?? projectsPath();
  const byName = new Map<string, ProjectEntry>();

  try {
    const raw = JSON.parse(await readFile(path, 'utf-8')) as ProjectEntry[];
    if (Array.isArray(raw)) {
      for (const e of raw) {
        if (e && typeof e.name === 'string' && typeof e.path === 'string') byName.set(e.name, e);
      }
    }
  } catch {
    // Missing/corrupt → empty catalog.
  }

  async function persist(): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.tmp`;
    await writeFile(tmp, JSON.stringify([...byName.values()], null, 2), 'utf-8');
    await rename(tmp, path);
  }

  return {
    list: () => [...byName.values()],
    resolve: (nameOrPath) =>
      byName.get(nameOrPath) ?? [...byName.values()].find((e) => e.path === nameOrPath),
    async add(name, p) {
      const entry: ProjectEntry = { name, path: p };
      byName.set(name, entry);
      await persist();
      return entry;
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/connectors/gateway/project-registry.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/connectors/gateway/project-registry.ts tests/connectors/gateway/project-registry.test.ts
git commit -m "feat(gateway): G1 T3 — ProjectRegistry (name/path catalog)"
```

---

## Task 4: gateway-ipc — line-frame protocol

**Files:**
- Create: `src/connectors/gateway/gateway-ipc.ts`
- Test: `tests/connectors/gateway/gateway-ipc.test.ts`

**Interfaces:**
- Consumes: `InlineButton` from `../types.js`.
- Produces:
  - `interface GatewayRequest { id: string; chatKey: string; kind: 'message' | 'callback'; text: string }`
  - `type GatewayResponse = { id: string; kind: 'final'; parts: string[]; buttons?: ReadonlyArray<ReadonlyArray<InlineButton>> } | { id: string; kind: 'partial'; text: string }`
  - `encodeFrame(obj: GatewayRequest | GatewayResponse): string` (JSON + `\n`)
  - `decodeFrames(buffer: string): { frames: unknown[]; rest: string }` (split on `\n`, keep trailing partial line as `rest`)

- [ ] **Step 1: Write the failing test**

```typescript
// tests/connectors/gateway/gateway-ipc.test.ts
import { describe, it, expect } from 'vitest';
import { encodeFrame, decodeFrames, type GatewayRequest } from '../../../src/connectors/gateway/gateway-ipc.js';

describe('gateway-ipc', () => {
  it('encodes one frame per line', () => {
    const req: GatewayRequest = { id: 'a1', chatKey: 'telegram:1', kind: 'message', text: 'hi' };
    expect(encodeFrame(req)).toBe(JSON.stringify(req) + '\n');
  });

  it('decodes complete frames and keeps a trailing partial line', () => {
    const a = encodeFrame({ id: '1', chatKey: 'telegram:1', kind: 'message', text: 'one' });
    const b = encodeFrame({ id: '2', chatKey: 'telegram:1', kind: 'message', text: 'two' });
    const { frames, rest } = decodeFrames(a + b + '{"partial":');
    expect(frames).toHaveLength(2);
    expect((frames[1] as GatewayRequest).text).toBe('two');
    expect(rest).toBe('{"partial":');
  });

  it('skips malformed lines without throwing', () => {
    const good = encodeFrame({ id: '1', chatKey: 'telegram:1', kind: 'message', text: 'ok' });
    const { frames } = decodeFrames('not json\n' + good);
    expect(frames).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/connectors/gateway/gateway-ipc.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/connectors/gateway/gateway-ipc.ts
import type { InlineButton } from '../types.js';

export interface GatewayRequest {
  id: string;
  chatKey: string;
  kind: 'message' | 'callback';
  text: string;
}

export type GatewayResponse =
  | { id: string; kind: 'final'; parts: string[]; buttons?: ReadonlyArray<ReadonlyArray<InlineButton>> }
  | { id: string; kind: 'partial'; text: string }; // forward-compat (Faz 1 streaming)

/** Serialize one frame as a single newline-terminated JSON line. */
export function encodeFrame(obj: GatewayRequest | GatewayResponse): string {
  return JSON.stringify(obj) + '\n';
}

/** Split a buffered stream into complete JSON frames + a trailing partial line. */
export function decodeFrames(buffer: string): { frames: unknown[]; rest: string } {
  const lines = buffer.split('\n');
  const rest = lines.pop() ?? ''; // last element is the incomplete tail
  const frames: unknown[] = [];
  for (const line of lines) {
    if (line.trim() === '') continue;
    try {
      frames.push(JSON.parse(line));
    } catch {
      // Skip malformed line (never throw on a partial/garbled frame).
    }
  }
  return { frames, rest };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/connectors/gateway/gateway-ipc.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/connectors/gateway/gateway-ipc.ts tests/connectors/gateway/gateway-ipc.test.ts
git commit -m "feat(gateway): G1 T4 — IPC line-frame protocol (partial-frame ready)"
```

---

## Task 5: gateway-runtime — child-side IPC handler

**Files:**
- Create: `src/connectors/gateway/gateway-runtime.ts`
- Test: `tests/connectors/gateway/gateway-runtime.test.ts`

**Interfaces:**
- Consumes: `decodeFrames`, `encodeFrame`, `GatewayRequest`, `GatewayResponse` from `gateway-ipc.js`; `chunkMessage` from `../message-format.js`.
- Produces: `runRuntimeLoop(opts: { input: Readable; output: (line: string) => void; respond: (text: string) => Promise<string> }): void` — reads request frames from `input`, calls `respond(text)` per `message`-kind request, writes a `final` response frame (parts via `chunkMessage`).

> The production `respond` is a `makeChatResponder({ agentic: true, root: projectPath, lang }).chat`-bound function; the CLI wiring (Task 8) injects it. The loop itself is provider-agnostic and unit-testable with a fake `respond`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/connectors/gateway/gateway-runtime.test.ts
import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import { runRuntimeLoop } from '../../../src/connectors/gateway/gateway-runtime.js';
import { encodeFrame, decodeFrames, type GatewayResponse } from '../../../src/connectors/gateway/gateway-ipc.js';

describe('gateway-runtime loop', () => {
  it('answers a message request with a final response frame', async () => {
    const input = new Readable({ read() {} });
    const out: string[] = [];
    runRuntimeLoop({
      input,
      output: (line) => out.push(line),
      respond: async (text) => `echo: ${text}`,
    });

    input.push(encodeFrame({ id: 'r1', chatKey: 'telegram:1', kind: 'message', text: 'ping' }));
    // allow the async respond microtask to settle
    await new Promise((r) => setTimeout(r, 0));

    const { frames } = decodeFrames(out.join(''));
    const resp = frames[0] as Extract<GatewayResponse, { kind: 'final' }>;
    expect(resp.id).toBe('r1');
    expect(resp.kind).toBe('final');
    expect(resp.parts.join('')).toBe('echo: ping');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/connectors/gateway/gateway-runtime.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/connectors/gateway/gateway-runtime.ts
import type { Readable } from 'node:stream';
import { decodeFrames, encodeFrame, type GatewayRequest } from './gateway-ipc.js';
import { chunkMessage } from '../message-format.js';

export interface RuntimeLoopOptions {
  /** Source of request frames (the child's stdin in production). */
  input: Readable;
  /** Sink for response frames (writes to the child's stdout in production). */
  output: (line: string) => void;
  /** Produce the reply text for one message. Production: bound chat responder. */
  respond: (text: string) => Promise<string>;
}

/**
 * Child-side IPC loop. Buffers stdin, decodes request frames, runs `respond`
 * for each `message` request, and writes a `final` response frame (lossless
 * `chunkMessage` parts). Never throws out of the data handler — a failed
 * respond becomes a single-part error reply so the daemon always gets a frame.
 */
export function runRuntimeLoop(opts: RuntimeLoopOptions): void {
  let buffer = '';
  opts.input.setEncoding('utf-8');
  opts.input.on('data', (chunk: string) => {
    buffer += chunk;
    const { frames, rest } = decodeFrames(buffer);
    buffer = rest;
    for (const f of frames) {
      const req = f as GatewayRequest;
      if (req.kind !== 'message') continue; // callbacks handled gateway-side in G1
      void handle(req);
    }
  });

  async function handle(req: GatewayRequest): Promise<void> {
    let text: string;
    try {
      text = await opts.respond(req.text);
    } catch (err) {
      text = `[runtime-error] ${err instanceof Error ? err.message : String(err)}`;
    }
    opts.output(encodeFrame({ id: req.id, kind: 'final', parts: chunkMessage(text) }));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/connectors/gateway/gateway-runtime.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/connectors/gateway/gateway-runtime.ts tests/connectors/gateway/gateway-runtime.test.ts
git commit -m "feat(gateway): G1 T5 — runtime child IPC loop (respond->final frame)"
```

---

## Task 6: RuntimeSupervisor — spawn per-project children (auth-strip + restart)

**Files:**
- Create: `src/connectors/gateway/runtime-supervisor.ts`
- Test: `tests/connectors/gateway/runtime-supervisor.test.ts`

**Interfaces:**
- Consumes: `encodeFrame`, `decodeFrames`, `GatewayRequest`, `GatewayResponse` from `gateway-ipc.js`.
- Produces:
  - `interface ChildLike { stdin: { write(s: string): void }; stdout: { setEncoding(e: string): void; on(ev: 'data', cb: (c: string) => void): void }; on(ev: 'exit', cb: (code: number | null) => void): void; kill(): void; pid?: number }`
  - `type SpawnRuntimeFn = (projectPath: string, env: NodeJS.ProcessEnv) => ChildLike`
  - `interface RuntimeHandle { send(req: GatewayRequest): Promise<GatewayResponse>; readonly projectPath: string }`
  - `interface RuntimeSupervisor { getOrSpawn(projectPath: string): RuntimeHandle; dispose(): Promise<void> }`
  - `makeRuntimeSupervisor(opts?: { spawnFn?: SpawnRuntimeFn; sendTimeoutMs?: number }): RuntimeSupervisor`

> **Auth invariant (load-bearing):** `getOrSpawn` builds `env = { ...process.env }`, `delete env['ANTHROPIC_API_KEY']`, and passes it to `spawnFn`. The default `spawnFn` runs `node dist/cli/entry.js gateway-runtime --project <path>` (async `spawn`, piped stdio).

- [ ] **Step 1: Write the failing test**

```typescript
// tests/connectors/gateway/runtime-supervisor.test.ts
import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { makeRuntimeSupervisor, type ChildLike, type SpawnRuntimeFn } from '../../../src/connectors/gateway/runtime-supervisor.js';
import { encodeFrame, decodeFrames, type GatewayRequest } from '../../../src/connectors/gateway/gateway-ipc.js';

/** A fake child that echoes each request back as a final frame. */
function makeFakeChild(): { child: ChildLike; capturedEnv: NodeJS.ProcessEnv | null } {
  const ee = new EventEmitter();
  const stdoutListeners: Array<(c: string) => void> = [];
  const child: ChildLike = {
    stdin: {
      write(s: string) {
        const { frames } = decodeFrames(s);
        for (const f of frames) {
          const req = f as GatewayRequest;
          const reply = encodeFrame({ id: req.id, kind: 'final', parts: [`echo:${req.text}`] });
          for (const l of stdoutListeners) l(reply);
        }
      },
    },
    stdout: { setEncoding() {}, on(_ev, cb) { stdoutListeners.push(cb); } },
    on: (ev, cb) => ee.on(ev, cb as (...a: unknown[]) => void),
    kill: () => ee.emit('exit', 0),
    pid: 1234,
  };
  return { child, capturedEnv: null };
}

describe('RuntimeSupervisor', () => {
  it('spawns once per project and round-trips a request', async () => {
    let spawns = 0;
    const spawnFn: SpawnRuntimeFn = () => { spawns++; return makeFakeChild().child; };
    const sup = makeRuntimeSupervisor({ spawnFn });

    const h = sup.getOrSpawn('/foo');
    const resp = await h.send({ id: 'x1', chatKey: 'telegram:1', kind: 'message', text: 'hi' });
    expect(resp.kind === 'final' && resp.parts.join('')).toBe('echo:hi');

    sup.getOrSpawn('/foo'); // same project → no second spawn
    expect(spawns).toBe(1);
    await sup.dispose();
  });

  it('strips ANTHROPIC_API_KEY from the spawned child env', async () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-should-not-leak';
    let seen: NodeJS.ProcessEnv | undefined;
    const spawnFn: SpawnRuntimeFn = (_p, env) => { seen = env; return makeFakeChild().child; };
    const sup = makeRuntimeSupervisor({ spawnFn });
    sup.getOrSpawn('/foo');
    expect(seen && 'ANTHROPIC_API_KEY' in seen).toBe(false);
    delete process.env['ANTHROPIC_API_KEY'];
    await sup.dispose();
  });

  it('respawns after the child exits', async () => {
    let spawns = 0;
    const children: ChildLike[] = [];
    const spawnFn: SpawnRuntimeFn = () => { spawns++; const c = makeFakeChild().child; children.push(c); return c; };
    const sup = makeRuntimeSupervisor({ spawnFn });
    sup.getOrSpawn('/foo');
    children[0]!.kill(); // emit exit
    await new Promise((r) => setTimeout(r, 0));
    sup.getOrSpawn('/foo'); // dead → respawn
    expect(spawns).toBe(2);
    await sup.dispose();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/connectors/gateway/runtime-supervisor.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/connectors/gateway/runtime-supervisor.ts
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeFrames, encodeFrame, type GatewayRequest, type GatewayResponse } from './gateway-ipc.js';

export interface ChildLike {
  stdin: { write(s: string): void };
  stdout: { setEncoding(e: string): void; on(ev: 'data', cb: (c: string) => void): void };
  on(ev: 'exit', cb: (code: number | null) => void): void;
  kill(): void;
  pid?: number;
}

export type SpawnRuntimeFn = (projectPath: string, env: NodeJS.ProcessEnv) => ChildLike;

export interface RuntimeHandle {
  readonly projectPath: string;
  send(req: GatewayRequest): Promise<GatewayResponse>;
}

export interface RuntimeSupervisor {
  getOrSpawn(projectPath: string): RuntimeHandle;
  dispose(): Promise<void>;
}

export interface RuntimeSupervisorOptions {
  /** Inject the spawn (tests). Default: real `gateway-runtime` child. */
  spawnFn?: SpawnRuntimeFn;
  /** Per-request reply timeout (default 120000ms). */
  sendTimeoutMs?: number;
}

interface Runtime {
  child: ChildLike;
  alive: boolean;
  buffer: string;
  pending: Map<string, (resp: GatewayResponse) => void>;
}

export function makeRuntimeSupervisor(opts: RuntimeSupervisorOptions = {}): RuntimeSupervisor {
  const spawnFn = opts.spawnFn ?? defaultSpawn;
  const timeoutMs = opts.sendTimeoutMs ?? 120_000;
  const runtimes = new Map<string, Runtime>();

  function spawnRuntime(projectPath: string): Runtime {
    // Auth invariant: child must NOT inherit ANTHROPIC_API_KEY (subscription-auth).
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env['ANTHROPIC_API_KEY'];

    const child = spawnFn(projectPath, env);
    const rt: Runtime = { child, alive: true, buffer: '', pending: new Map() };

    child.stdout.setEncoding('utf-8');
    child.stdout.on('data', (chunk: string) => {
      rt.buffer += chunk;
      const { frames, rest } = decodeFrames(rt.buffer);
      rt.buffer = rest;
      for (const f of frames) {
        const resp = f as GatewayResponse;
        const resolve = rt.pending.get(resp.id);
        if (resolve && resp.kind === 'final') { rt.pending.delete(resp.id); resolve(resp); }
      }
    });
    child.on('exit', () => {
      rt.alive = false;
      for (const [, resolve] of rt.pending) {
        resolve({ id: '', kind: 'final', parts: ['[runtime-exited]'] });
      }
      rt.pending.clear();
    });
    return rt;
  }

  function getRuntime(projectPath: string): Runtime {
    const existing = runtimes.get(projectPath);
    if (existing && existing.alive) return existing;
    const rt = spawnRuntime(projectPath); // respawn if dead/missing
    runtimes.set(projectPath, rt);
    return rt;
  }

  return {
    getOrSpawn(projectPath: string): RuntimeHandle {
      getRuntime(projectPath); // eager spawn so callers/tests can observe it
      return {
        projectPath,
        send(req: GatewayRequest): Promise<GatewayResponse> {
          const rt = getRuntime(projectPath);
          return new Promise<GatewayResponse>((resolve) => {
            const timer = setTimeout(() => {
              rt.pending.delete(req.id);
              resolve({ id: req.id, kind: 'final', parts: ['[runtime-timeout]'] });
            }, timeoutMs);
            if (typeof timer.unref === 'function') timer.unref();
            rt.pending.set(req.id, (resp) => { clearTimeout(timer); resolve(resp); });
            rt.child.stdin.write(encodeFrame(req));
          });
        },
      };
    },
    async dispose(): Promise<void> {
      for (const rt of runtimes.values()) {
        try { if (rt.alive) rt.child.kill(); } catch { /* best-effort */ }
      }
      runtimes.clear();
    },
  };
}

/** Resolve dist/cli/entry.js relative to this compiled module (dist/connectors/gateway). */
function entryPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', '..', 'cli', 'entry.js');
}

const defaultSpawn: SpawnRuntimeFn = (projectPath, env) => {
  const child = spawn(process.execPath, [entryPath(), 'gateway-runtime', '--project', projectPath], {
    env,
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  return child as unknown as ChildLike;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/connectors/gateway/runtime-supervisor.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/connectors/gateway/runtime-supervisor.ts tests/connectors/gateway/runtime-supervisor.test.ts
git commit -m "feat(gateway): G1 T6 — RuntimeSupervisor (auth-strip spawn + restart + IPC send)"
```

---

## Task 7: gateway-router — resolve + slash-intercept + route + i18n

**Files:**
- Create: `src/connectors/gateway/gateway-router.ts`
- Modify: `src/cli/helpers/messages.ts` (add `gateway.*` keys)
- Test: `tests/connectors/gateway/gateway-router.test.ts`

**Interfaces:**
- Consumes: `IncomingMessage`, `IncomingCallback`, `InlineButton` from `../types.js`; `SessionRegistry` from `session-registry.js`; `ProjectRegistry` from `project-registry.js`; `RuntimeSupervisor` from `runtime-supervisor.js`; `parseApprovalCallback` from `../callback-router.js`; `getMessage` from `../../cli/helpers/messages.js`.
- Produces:
  - `interface GatewayRouterDeps { sessions: SessionRegistry; projects: ProjectRegistry; supervisor: RuntimeSupervisor; send: (chatKey: string, parts: string[], buttons?: ReadonlyArray<ReadonlyArray<InlineButton>>) => Promise<void>; isAuthorized: (chatKey: string, projectPath: string) => boolean; lang: string; newId: () => string }`
  - `chatKeyOf(connector: string, channelId: string): string`
  - `makeGatewayRouter(deps: GatewayRouterDeps): (msg: IncomingMessage) => void`

> **i18n keys to add** (both `en` + `tr`) in `messages.ts`: `gateway.unbound` (lists how to bind), `gateway.bound_ok` (`{project}`), `gateway.unbind_ok`, `gateway.not_bound`, `gateway.whoami` (`{project}`), `gateway.projects_header`, `gateway.projects_row` (`{name}` `{path}`), `gateway.use_usage`, `gateway.use_unknown` (`{name}`).

- [ ] **Step 1: Write the failing test**

```typescript
// tests/connectors/gateway/gateway-router.test.ts
import { describe, it, expect } from 'vitest';
import { makeGatewayRouter, chatKeyOf, type GatewayRouterDeps } from '../../../src/connectors/gateway/gateway-router.js';
import { loadSessionRegistry } from '../../../src/connectors/gateway/session-registry.js';
import { loadProjectRegistry } from '../../../src/connectors/gateway/project-registry.js';
import type { IncomingMessage } from '../../../src/connectors/types.js';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function msg(text: string): IncomingMessage {
  return { id: '1', connector: 'telegram', fromUser: 'u1', channelId: '42', text, timestamp: '2026-06-20T00:00:00Z' };
}

async function deps(over: Partial<GatewayRouterDeps> = {}): Promise<{ d: GatewayRouterDeps; sent: Array<{ chatKey: string; parts: string[] }> }> {
  const dir = await mkdtemp(join(tmpdir(), 'gw-router-'));
  const sessions = await loadSessionRegistry({ path: join(dir, 's.json') });
  const projects = await loadProjectRegistry({ path: join(dir, 'p.json') });
  await projects.add('foo', '/home/me/foo');
  const sent: Array<{ chatKey: string; parts: string[] }> = [];
  const d: GatewayRouterDeps = {
    sessions, projects,
    supervisor: { getOrSpawn: () => ({ projectPath: '/home/me/foo', send: async () => ({ id: '1', kind: 'final', parts: ['runtime-reply'] }) }), dispose: async () => {} },
    send: async (chatKey, parts) => { sent.push({ chatKey, parts }); },
    isAuthorized: () => true,
    lang: 'en',
    newId: () => 'id1',
    ...over,
  };
  return { d, sent };
}

describe('gateway-router', () => {
  it('guides an unbound chat instead of routing', async () => {
    const { d, sent } = await deps();
    makeGatewayRouter(d)(msg('hello'));
    await new Promise((r) => setTimeout(r, 0));
    expect(sent[0]!.parts.join(' ')).toContain('/use');
  });

  it('/use binds the chat to a project', async () => {
    const { d, sent } = await deps();
    makeGatewayRouter(d)(msg('/use foo'));
    await new Promise((r) => setTimeout(r, 0));
    expect(d.sessions.resolve(chatKeyOf('telegram', '42'))?.projectPath).toBe('/home/me/foo');
    expect(sent[0]!.parts.join(' ')).toContain('foo');
  });

  it('routes a natural-language message to the bound runtime', async () => {
    const { d, sent } = await deps();
    await d.sessions.bind(chatKeyOf('telegram', '42'), '/home/me/foo', 'u1');
    makeGatewayRouter(d)(msg('what is my sprint status?'));
    await new Promise((r) => setTimeout(r, 0));
    expect(sent[0]!.parts.join('')).toBe('runtime-reply');
  });

  it('drops a message from an unauthorized chat', async () => {
    const { d, sent } = await deps({ isAuthorized: () => false });
    await d.sessions.bind(chatKeyOf('telegram', '42'), '/home/me/foo', 'u1');
    makeGatewayRouter(d)(msg('hi'));
    await new Promise((r) => setTimeout(r, 0));
    expect(sent).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/connectors/gateway/gateway-router.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3a: Add i18n keys to `src/cli/helpers/messages.ts`**

Insert these entries into the `MESSAGES` object (anywhere among the existing keys):

```typescript
  'gateway.unbound': {
    tr: 'Bu sohbet bir projeye bağlı değil. `/projects` ile listeyi gör, `/use <isim>` ile bağla.',
    en: 'This chat is not bound to a project. Use `/projects` to list, `/use <name>` to bind.',
  },
  'gateway.bound_ok': {
    tr: 'Bağlandı: {project}. Artık mesajların bu projeye gider.',
    en: 'Bound to {project}. Your messages now go to this project.',
  },
  'gateway.unbind_ok': {
    tr: 'Bağlantı kaldırıldı. `/use <isim>` ile yeniden bağla.',
    en: 'Unbound. Use `/use <name>` to bind again.',
  },
  'gateway.not_bound': {
    tr: 'Zaten bağlı değilsin.',
    en: 'Not bound to anything.',
  },
  'gateway.whoami': {
    tr: 'Bağlı proje: {project}',
    en: 'Bound project: {project}',
  },
  'gateway.projects_header': {
    tr: 'Kayıtlı projeler:',
    en: 'Registered projects:',
  },
  'gateway.projects_row': {
    tr: '• {name} — {path}',
    en: '• {name} — {path}',
  },
  'gateway.use_usage': {
    tr: 'Kullanım: /use <proje-ismi veya path>',
    en: 'Usage: /use <project-name or path>',
  },
  'gateway.use_unknown': {
    tr: 'Bilinmeyen proje: {name}. `/projects` ile listele.',
    en: 'Unknown project: {name}. List with `/projects`.',
  },
```

- [ ] **Step 3b: Write the router implementation**

```typescript
// src/connectors/gateway/gateway-router.ts
import type { IncomingMessage, InlineButton } from '../types.js';
import type { SessionRegistry } from './session-registry.js';
import type { ProjectRegistry } from './project-registry.js';
import type { RuntimeSupervisor } from './runtime-supervisor.js';
import { getMessage } from '../../cli/helpers/messages.js';

export interface GatewayRouterDeps {
  sessions: SessionRegistry;
  projects: ProjectRegistry;
  supervisor: RuntimeSupervisor;
  send: (chatKey: string, parts: string[], buttons?: ReadonlyArray<ReadonlyArray<InlineButton>>) => Promise<void>;
  isAuthorized: (chatKey: string, projectPath: string) => boolean;
  lang: string;
  newId: () => string;
}

/** Canonical chat identity used as the session key. */
export function chatKeyOf(connector: string, channelId: string): string {
  return `${connector}:${channelId}`;
}

/** Build the inbound message handler for the gateway. */
export function makeGatewayRouter(deps: GatewayRouterDeps): (msg: IncomingMessage) => void {
  const { sessions, projects, supervisor, send, isAuthorized, lang } = deps;

  return (msg: IncomingMessage): void => {
    const chatKey = chatKeyOf(msg.connector, msg.channelId);
    void route(msg, chatKey).catch(() => { /* never crash the poller */ });
  };

  async function route(msg: IncomingMessage, chatKey: string): Promise<void> {
    const text = msg.text.trim();

    // Gateway-level slashes (never forwarded to a runtime).
    if (text.startsWith('/')) {
      await handleSlash(text, chatKey);
      return;
    }

    const binding = sessions.resolve(chatKey);
    if (!binding) {
      await send(chatKey, [getMessage('gateway.unbound', lang)]);
      return;
    }
    if (!isAuthorized(chatKey, binding.projectPath)) return; // silent drop

    const handle = supervisor.getOrSpawn(binding.projectPath);
    const resp = await handle.send({ id: deps.newId(), chatKey, kind: 'message', text });
    if (resp.kind === 'final') await send(chatKey, resp.parts, resp.buttons);
  }

  async function handleSlash(text: string, chatKey: string): Promise<void> {
    const [cmd, ...rest] = text.split(/\s+/);
    const arg = rest.join(' ').trim();
    switch (cmd) {
      case '/use': {
        if (!arg) { await send(chatKey, [getMessage('gateway.use_usage', lang)]); return; }
        const proj = projects.resolve(arg);
        if (!proj) { await send(chatKey, [getMessage('gateway.use_unknown', lang, { name: arg })]); return; }
        await sessions.bind(chatKey, proj.path, chatKey);
        await send(chatKey, [getMessage('gateway.bound_ok', lang, { project: proj.name })]);
        return;
      }
      case '/unbind': {
        const ok = await sessions.unbind(chatKey);
        await send(chatKey, [getMessage(ok ? 'gateway.unbind_ok' : 'gateway.not_bound', lang)]);
        return;
      }
      case '/whoami': {
        const b = sessions.resolve(chatKey);
        await send(chatKey, [b ? getMessage('gateway.whoami', lang, { project: b.projectPath }) : getMessage('gateway.unbound', lang)]);
        return;
      }
      case '/projects': {
        const rows = projects.list().map((p) => getMessage('gateway.projects_row', lang, { name: p.name, path: p.path }));
        await send(chatKey, [getMessage('gateway.projects_header', lang), ...rows].join('\n').split('\n'));
        return;
      }
      default: {
        // Unknown slash → treat as unbound-style guidance (no CLI leak).
        await send(chatKey, [getMessage('gateway.unbound', lang)]);
      }
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/connectors/gateway/gateway-router.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/connectors/gateway/gateway-router.ts src/cli/helpers/messages.ts tests/connectors/gateway/gateway-router.test.ts
git commit -m "feat(gateway): G1 T7 — router (resolve/slash/route) + i18n keys (en/tr)"
```

---

## Task 8: gateway-daemon + CLI (`deckent gateway`)

**Files:**
- Create: `src/connectors/gateway/gateway-daemon.ts`
- Create: `src/cli/commands/gateway.ts`
- Modify: `src/cli/index.ts` (import + register)
- Modify: `src/cli/helpers/messages.ts` (daemon lifecycle keys)
- Test: `tests/cli/gateway.test.ts`

**Interfaces:**
- Consumes: `ConnectorPool` from `../connector-pool.js`; `loadConnector`-style lazy import (mirror `connector-bootstrap.ts`); `makeGatewayRouter`, `chatKeyOf`; `makeRuntimeSupervisor`; `loadSessionRegistry`; `loadProjectRegistry`; `gatewayPidPath`; `getMessage`/`getLanguage`; `makeChatResponder` (runtime child only).
- Produces:
  - `interface GatewayListenDeps { makeConnector?: (id: 'telegram' | 'discord') => IMessageConnector | null; supervisor?: RuntimeSupervisor; waitForever?: () => Promise<void>; print?: (s: string) => void }`
  - `startGatewayListen(opts: { lang?: string; gatewayToken?: string; deps?: GatewayListenDeps }): Promise<{ active: string[]; dispose: () => Promise<void> }>`
  - `runGatewayRuntimeChild(opts: { projectPath: string; lang?: string }): void` (child entry; wires `runRuntimeLoop` to a `makeChatResponder` respond fn)

> **Pidfile lifecycle** mirrors `bot-daemon.ts` but uses `gatewayPidPath()`. The `gateway start` detached spawn runs `node dist/cli/entry.js gateway listen` (same shape as bot). Reuse `isPidAlive` from `../core/pid-liveness.js`.

> **i18n keys to add:** `gateway.listen_active` (`{connectors}`), `gateway.listen_none`, `gateway.listen_stopped`, `gateway.daemon_started` (`{pid}`), `gateway.daemon_already` (`{pid}`), `gateway.daemon_stopped` (`{pid}`), `gateway.daemon_not_running`, `gateway.daemon_status_running` (`{pid}`), `gateway.daemon_reboot_note`, `gateway.group_desc`, `gateway.pair_approved` (`{code}` `{project}`).

- [ ] **Step 1: Write the failing test** (daemon wiring is exercised through an injected connector + supervisor; no network)

```typescript
// tests/cli/gateway.test.ts
import { describe, it, expect } from 'vitest';
import { startGatewayListen } from '../../src/connectors/gateway/gateway-daemon.js';
import { BaseConnector } from '../../src/connectors/base-connector.js';
import type { OutgoingMessage, ConnectorConfig, IncomingMessage } from '../../src/connectors/types.js';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** A fake connector that records sends and lets the test inject an inbound message. */
class FakeConnector extends BaseConnector {
  readonly id = 'telegram' as const;
  readonly name = 'Fake';
  sent: OutgoingMessage[] = [];
  private handler?: (m: IncomingMessage) => void;
  async start(_c: ConnectorConfig): Promise<void> { this.started = true; }
  async sendMessage(m: OutgoingMessage): Promise<void> { this.sent.push(m); }
  isHealthy(): boolean { return true; }
  onMessage(h: (m: IncomingMessage) => void): void { this.handler = h; }
  inject(text: string): void {
    this.handler?.({ id: '1', connector: 'telegram', fromUser: 'u1', channelId: '42', text, timestamp: '2026-06-20T00:00:00Z' });
  }
}

describe('gateway daemon listen', () => {
  it('routes an unbound chat to /use guidance through the connector', async () => {
    process.env['DECKENT_GATEWAY_HOME'] = await mkdtemp(join(tmpdir(), 'gw-home-'));
    const fake = new FakeConnector();
    const handle = await startGatewayListen({
      lang: 'en',
      gatewayToken: 'tkn',
      deps: {
        makeConnector: () => fake,
        // supervisor unused on the unbound path; provide a stub
        supervisor: { getOrSpawn: () => ({ projectPath: '/x', send: async () => ({ id: '1', kind: 'final', parts: ['x'] }) }), dispose: async () => {} },
        waitForever: () => new Promise(() => {}), // never resolves; we dispose manually
        print: () => {},
      },
    });
    expect(handle.active).toContain('telegram');
    fake.inject('hello');
    await new Promise((r) => setTimeout(r, 0));
    expect(fake.sent.some((m) => m.text.includes('/use'))).toBe(true);
    await handle.dispose();
    delete process.env['DECKENT_GATEWAY_HOME'];
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cli/gateway.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3a: Implement `gateway-daemon.ts`**

```typescript
// src/connectors/gateway/gateway-daemon.ts
import type { IMessageConnector, IncomingCallback } from '../types.js';
import { ConnectorPool } from '../connector-pool.js';
import { makeRuntimeSupervisor, type RuntimeSupervisor } from './runtime-supervisor.js';
import { makeGatewayRouter, chatKeyOf } from './gateway-router.js';
import { loadSessionRegistry } from './session-registry.js';
import { loadProjectRegistry } from './project-registry.js';
import { runRuntimeLoop } from './gateway-runtime.js';
import { getLanguage, getMessage } from '../../cli/helpers/messages.js';
import { chunkMessage } from '../message-format.js';

export interface GatewayListenDeps {
  /** Test seam: construct a connector instead of lazy-loading the real module. */
  makeConnector?: (id: 'telegram' | 'discord') => IMessageConnector | null;
  /** Test seam: inject the supervisor. Default: real spawned children. */
  supervisor?: RuntimeSupervisor;
  /** Test seam: block until stopped. Default: resolve on SIGINT/SIGTERM. */
  waitForever?: () => Promise<void>;
  /** Output sink. */
  print?: (s: string) => void;
}

export interface GatewayListenOptions {
  lang?: string;
  /** Gateway-level bot token (one bot, many chats). */
  gatewayToken: string;
  deps?: GatewayListenDeps;
}

export interface GatewayHandle {
  active: string[];
  dispose: () => Promise<void>;
}

let idCounter = 0;
const nextId = (): string => `g${++idCounter}`;

async function loadRealConnector(id: 'telegram' | 'discord'): Promise<IMessageConnector | null> {
  try {
    if (id === 'telegram') { const m = await import('../telegram.js'); return new m.TelegramConnector(); }
    const m = await import('../discord.js'); return new m.DiscordConnector();
  } catch { return null; }
}

/** Bring up the single connector + wire the gateway router. */
export async function startGatewayListen(opts: GatewayListenOptions): Promise<GatewayHandle> {
  const lang = getLanguage(opts.lang);
  const print = opts.deps?.print ?? ((s: string): void => console.log(s));

  const sessions = await loadSessionRegistry();
  const projects = await loadProjectRegistry();
  const supervisor = opts.deps?.supervisor ?? makeRuntimeSupervisor();

  const connector = opts.deps?.makeConnector
    ? opts.deps.makeConnector('telegram')
    : await loadRealConnector('telegram');

  if (!connector) {
    print(getMessage('gateway.listen_none', lang));
    return { active: [], dispose: async () => { await supervisor.dispose(); } };
  }

  const pool = new ConnectorPool();
  pool.register(connector);

  const send = async (chatKey: string, parts: string[]): Promise<void> => {
    const channelId = chatKey.split(':').slice(1).join(':');
    for (const part of parts) {
      for (const chunk of chunkMessage(part)) {
        await connector.sendMessage({ connector: connector.id, channelId, text: chunk });
      }
    }
  };

  const router = makeGatewayRouter({
    sessions, projects, supervisor, send,
    isAuthorized: () => true, // G1: allowlist hook (per-project allowlist hardening = G3)
    lang, newId: nextId,
  });
  connector.onMessage(router);

  // Approval callbacks (inline buttons) → synthetic command fed to the router.
  const cbCapable = connector as unknown as { onCallback?: (h: (cb: IncomingCallback) => void) => void };
  cbCapable.onCallback?.((cb: IncomingCallback) => {
    router({ id: `cb-${cb.data}`, connector: connector.id, fromUser: cb.fromUser, channelId: cb.channelId, text: cb.data, timestamp: new Date().toISOString(), raw: { callback: cb.data } });
  });

  await connector.start({ enabled: true, token: opts.gatewayToken });
  print(getMessage('gateway.listen_active', lang, { connectors: connector.id }));

  const wait = opts.deps?.waitForever ?? waitForSignal;
  const handle: GatewayHandle = {
    active: [connector.id],
    dispose: async () => { await connector.stop().catch(() => {}); await supervisor.dispose(); },
  };
  // Fire the wait in the background so callers (and tests) get the handle now.
  void wait().then(() => handle.dispose()).catch(() => {});
  return handle;
}

/** Child entry: serve ONE project via the gated agentic chat responder. */
export function runGatewayRuntimeChild(opts: { projectPath: string; lang?: string }): void {
  const lang = getLanguage(opts.lang);
  // Lazy import to keep the daemon's module graph light; respond is the gated
  // agentic chat for this project (same engine the single-project bot uses).
  void import('../chat-bridge.js').then(({ makeChatResponder }) => {
    const responder = makeChatResponder({ agentic: true, root: opts.projectPath, lang });
    runRuntimeLoop({
      input: process.stdin,
      output: (line) => process.stdout.write(line),
      respond: (text) => responder.chat(`gateway:${opts.projectPath}`, text),
    });
  });
}

function waitForSignal(): Promise<void> {
  return new Promise<void>((resolve) => {
    const stop = (): void => { process.off('SIGINT', stop); process.off('SIGTERM', stop); resolve(); };
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
  });
}
```

> **Verify the `makeChatResponder(...).chat` shape** against `src/connectors/chat-bridge.ts` before running — adjust the `respond` call if `chat` takes different params or the export differs. (`bot.ts:57` confirms `makeChatResponder({ agentic, root, lang })`; confirm the returned `.chat(channelId, text)` signature there.)

- [ ] **Step 3b: Implement `src/cli/commands/gateway.ts`** (lifecycle + registration; mirrors `bot.ts`, uses `gatewayPidPath`)

```typescript
// src/cli/commands/gateway.ts
import type { Command } from 'commander';
import { writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getLanguage, getMessage } from '../helpers/messages.js';
import { isPidAlive } from '../../core/pid-liveness.js';
import { gatewayPidPath } from '../../connectors/gateway/gateway-paths.js';
import { startGatewayListen, runGatewayRuntimeChild } from '../../connectors/gateway/gateway-daemon.js';
import { loadConfig } from '../../core/config.js';
import { resolveProjectRoot } from '../helpers/process.js';

function writePid(pid = process.pid): void {
  const p = gatewayPidPath();
  try { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, String(pid), 'utf-8'); } catch { /* non-fatal */ }
}
function readPid(): number | null {
  const p = gatewayPidPath();
  if (!existsSync(p)) return null;
  try {
    const pid = parseInt(readFileSync(p, 'utf-8').trim(), 10);
    if (Number.isNaN(pid)) return null;
    if (isPidAlive(pid)) return pid;
    try { unlinkSync(p); } catch { /* non-fatal */ }
    return null;
  } catch { return null; }
}
function clearPid(): void { try { const p = gatewayPidPath(); if (existsSync(p)) unlinkSync(p); } catch { /* non-fatal */ } }

function entryPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'entry.js');
}

async function resolveGatewayToken(): Promise<string> {
  // G1: gateway bot token comes from the current project's config (.deck-interpolated)
  // as a bootstrap; a dedicated gateway .deck is an impl detail (spec §5.1).
  const cfg = await loadConfig(resolveProjectRoot());
  return cfg.notify_connectors?.telegram?.token ?? '';
}

export function registerGateway(program: Command): void {
  const cmd = program.command('gateway').description(getMessage('gateway.group_desc', getLanguage(undefined)));

  cmd.command('listen')
    .option('--lang <code>', 'Language override (en|tr)')
    .action(async (opts: { lang?: string }) => {
      const lang = getLanguage(opts.lang);
      const token = await resolveGatewayToken();
      const handle = await startGatewayListen({ lang, gatewayToken: token });
      if (handle.active.length === 0) { console.log(getMessage('gateway.listen_none', lang)); return; }
      writePid();
      process.on('exit', clearPid);
    });

  cmd.command('start')
    .option('--lang <code>', 'Language override (en|tr)')
    .action((opts: { lang?: string }) => {
      const lang = getLanguage(opts.lang);
      if (readPid() !== null) { console.log(getMessage('gateway.daemon_already', lang, { pid: String(readPid()) })); return; }
      const child = spawn(process.execPath, [entryPath(), 'gateway', 'listen'], { detached: true, stdio: 'ignore' });
      child.unref();
      console.log(getMessage('gateway.daemon_started', lang, { pid: String(child.pid ?? 0) }));
      console.log(getMessage('gateway.daemon_reboot_note', lang));
    });

  cmd.command('stop')
    .option('--lang <code>', 'Language override (en|tr)')
    .action((opts: { lang?: string }) => {
      const lang = getLanguage(opts.lang);
      const pid = readPid();
      if (pid === null) { console.log(getMessage('gateway.daemon_not_running', lang)); return; }
      try { process.kill(pid, 'SIGTERM'); } catch { /* already gone */ }
      clearPid();
      console.log(getMessage('gateway.daemon_stopped', lang, { pid: String(pid) }));
    });

  cmd.command('status')
    .option('--lang <code>', 'Language override (en|tr)')
    .action((opts: { lang?: string }) => {
      const lang = getLanguage(opts.lang);
      const pid = readPid();
      console.log(pid !== null
        ? getMessage('gateway.daemon_status_running', lang, { pid: String(pid) })
        : getMessage('gateway.daemon_not_running', lang));
    });

  // Hidden child entry — spawned by the supervisor, not for direct use.
  program.command('gateway-runtime', { hidden: true })
    .requiredOption('--project <path>', 'Bound project root')
    .option('--lang <code>', 'Language override (en|tr)')
    .action((opts: { project: string; lang?: string }) => {
      runGatewayRuntimeChild({ projectPath: opts.project, lang: opts.lang });
    });
}
```

- [ ] **Step 3c: Add daemon i18n keys** to `messages.ts` (same shape as the `gateway.*` block in Task 7 — `listen_active`, `listen_none`, `listen_stopped`, `daemon_started`, `daemon_already`, `daemon_stopped`, `daemon_not_running`, `daemon_status_running`, `daemon_reboot_note`, `group_desc`). Provide both `en` and `tr` for each.

- [ ] **Step 3d: Register in `src/cli/index.ts`** (mirror the `registerBot` wiring at lines 59 + 148)

```typescript
// near the other command imports
import { registerGateway } from './commands/gateway.js';
// near registerBot(program);
registerGateway(program);
```

- [ ] **Step 4: Run tests + lint**

Run: `npx vitest run tests/cli/gateway.test.ts && npm run lint`
Expected: PASS (1 test) + `tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add src/connectors/gateway/gateway-daemon.ts src/cli/commands/gateway.ts src/cli/index.ts src/cli/helpers/messages.ts tests/cli/gateway.test.ts
git commit -m "feat(gateway): G1 T8 — gateway daemon + CLI (listen/start/stop/status + runtime child)"
```

---

## Task 9: ADR + docs + Tier-1 Smoke proof-of-function

**Files:**
- Modify: `DECKENT.md` (feature note), `.deckent/workspace/IDENTITY.md` (feature list)
- Create: `docs/adr/` entry OR insert via Brain (see step 2)
- Build + run-verify (no new test file; a real-binary Smoke)

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: tsc + copy-assets succeed (no errors). (Coordinate `/mcp restart` with Alperen per CLAUDE.md — do not run during a live sprint.)

- [ ] **Step 2: Add the ADR** (new architectural decision — Brain rule: insert into `.brain/memory.db`)

Title: **"Project-Scoped Messaging Gateway — Control-Plane Daemon + Spawned Per-Project Runtimes"** — amends **ADR-016**. Body: the decision (global daemon, single poller per token, project-scoped sessions, spawned per-project runtime children with auth-strip), context (409 constraint + auth invariant + crash isolation), consequences (new `~/.deckent/gateway/` home; `deckent bot` deprecation path). Insert via `store.insert({ type: 'adr', status: 'accepted', ... })` (or the project's ADR tooling), then `deckent memory export`.

- [ ] **Step 3: Tier-1 Smoke (ADR-079 — real binary, NOT a unit test)**

```bash
# Hermetic gateway home + a fake echo connector is not available to the real binary,
# so smoke the lifecycle + unbound-guidance path against the real CLI:
export DECKENT_GATEWAY_HOME="$(mktemp -d)"
node dist/cli/entry.js gateway status        # → "not running"
node dist/cli/entry.js gateway start          # → "started pid=…" + reboot note
node dist/cli/entry.js gateway status         # → "running pid=…"
node dist/cli/entry.js gateway stop           # → "stopped pid=…"
```

Expected output: status reports not-running → running → stopped across start/stop; pidfile created under `$DECKENT_GATEWAY_HOME/gateway.pid` and cleaned on stop. **Record the actual stdout in the result/PR.** (Inbound message round-trip needs a live Telegram token + bound project; document that manual check separately — it is the G2 live-verify gate.)

- [ ] **Step 4: Update docs**

Add a one-line feature note to `DECKENT.md` (gateway section) and to `.deckent/workspace/IDENTITY.md` Features list: "Project-Scoped Messaging Gateway G1 (control-plane daemon + per-project spawned runtimes, `deckent gateway`)".

- [ ] **Step 5: Commit**

```bash
git add DECKENT.md .deckent/workspace/IDENTITY.md .brain/exports/
git commit -m "docs(gateway): G1 T9 — ADR (amends ADR-016) + feature notes + Smoke evidence"
```

---

## Self-Review

**1. Spec coverage** (spec §2 in-scope → task):
- Global daemon + home → T1, T8. ✅
- Single connector/poller (409) → T8 (one ConnectorPool, one connector). ✅
- SessionRegistry persist → T2. ✅
- RuntimeSupervisor spawn/restart/idle/auth-strip → T6 (idle-evict is the one deferred sub-item — see note). ⚠️
- Router resolve + `/use /projects /unbind /whoami` → T7. ✅
- gateway-ipc partial-frame forward-compat → T4. ✅
- Auth-strip invariant (code + test) → T6 (test asserts no `ANTHROPIC_API_KEY`). ✅
- i18n en/tr → T7 + T8 keys. ✅
- ADR + Tier-1 Smoke → T9. ✅
- `/pending` + pairing → **deferred note below.**

**2. Placeholder scan:** No "TBD/TODO". Two scoped simplifications are called out explicitly, not hidden:
- **`/pending` + `pair approve`**: the spec lists these; T7 implements `/use /projects /unbind /whoami`. `/pending` (cross-gate approval list) and the `gateway pair approve` CLI are **intentionally deferred to a T7b/T8b follow-up** to keep G1's first cut shippable — the pairing allowlist currently defaults to `isAuthorized: () => true` (T8). Flag this in the PR; it is a known gap, not silent.
- **idle-evict** (TTL/LRU) in the supervisor is designed in the spec but T6 ships spawn+restart only; add a `sendTimeoutMs`-style idle sweep in a G1 follow-up. Marked here so it is not mistaken for "done".

**3. Type consistency:** `chatKeyOf` / `chatKey` `${connector}:${channelId}` is uniform (T7 produces, T8 splits with `split(':').slice(1)` to tolerate colons in channelId). `GatewayRequest`/`GatewayResponse` identical across T4/T5/T6/T7. `RuntimeHandle.send` returns `GatewayResponse`; router consumes `resp.kind === 'final'`. `makeChatResponder({agentic,root,lang}).chat(channelId,text)` — **verify against `chat-bridge.ts` in T8 step 3a** (flagged inline).

> **One pre-flight for the implementer:** before T8, open `src/connectors/chat-bridge.ts` and confirm the `ChatResponder.chat` signature + `dispose`. The plan assumes `chat(channelId: string, text: string): Promise<string>` (consistent with `connector-bootstrap.ts` usage). If it differs, adjust T8 step 3a's `respond` wiring only.

---

## Out of scope (G1 → later)

grammY swap + webhook (G2) · humanizer/voice + streaming frames send (Faz 1) · systemd reboot-survive (G4) · per-session memory/context isolation (G3) · `/pending` + pairing allowlist hardening (G1 follow-up) · idle-evict sweep (G1 follow-up).
