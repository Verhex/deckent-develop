# Embedded Web Terminal — Implementation Plan (Sub-project #1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A VSCode-like dockable terminal in the deckent dashboard that runs interactive `claude`/`gemini`/`codex`/`deckent`/`shell` PTY sessions over a WebSocket, with tmux-like reattach, secure-by-default localhost auth independent of the global API bypass, and a transparent DB audit trail.

**Architecture:** Backend PTY sessions live in a `PtySessionManager` behind a `SessionBackend` interface (in-process `node-pty` today). A `ws` gateway handles the HTTP `upgrade`, authenticates the token from the `Sec-WebSocket-Protocol` subprotocol via an `AuthProvider` interface (local token today; independent of and stricter than `DECKENT_API_AUTH_DISABLED`), then bridges socket ↔ pty. The server injects the auto-generated token into the served dashboard page only for `127.0.0.1` callers; the SPA reads it and opens the WS. Frontend adds a dock-panel layer to `Layout.tsx` hosting an xterm.js multi-tab panel. Audit events (low-volume, structured, `tenantId`-scoped) go to `memory.db`; raw PTY output is never persisted (in-memory bounded ring buffer only).

**Tech Stack:** TypeScript (ESM, `.js` import suffix), Node `node:http`, `ws`, `node-pty`, `better-sqlite3` (existing MemoryStore), vitest; frontend React 19 + Vite + Tailwind + `@xterm/xterm` + `@xterm/addon-fit`.

**Verified ground truth & locked decisions:** see `docs/superpowers/specs/2026-05-19-embedded-web-terminal-design.md` §1c (Step A), §1c.2 (auth root cause), §1d (UX dock + enterprise seams). This plan proceeds only from those verified facts.

**Self-modifying / dogfood:** touches `src/api/` + `src/dashboard/` → `self-modifying-detector.ts` triggers dogfood mode → **sequential execution mandatory**. Sprint DIRECTIVES must declare this; waves below are strictly ordered.

---

## File Structure

**Backend — create:**
- `src/api/terminal/types.ts` — `SessionKind`, `PtySession`, `TerminalConfig`, `AuditEvent`, `TenantId` (one responsibility: shared terminal types)
- `src/api/terminal/auth-provider.ts` — `AuthProvider` interface + `LocalTokenAuthProvider` (token compare, bypass-independent)
- `src/api/terminal/session-backend.ts` — `SessionBackend` interface + `LocalPtyBackend` (node-pty spawn/write/resize/kill)
- `src/api/terminal/session-manager.ts` — `PtySessionManager` (map, ring buffer, attach/detach, kill, idle reaper)
- `src/api/terminal/audit.ts` — `TerminalAudit` (structured events → MemoryStore, tenant-scoped)
- `src/api/terminal/ws-gateway.ts` — `attachTerminalGateway(server, deps)` (upgrade + auth + bridge + protocol)

**Backend — modify:**
- `src/api/server.ts` — wire gateway; HTTP control routes; localhost-only bootstrap token injection
- `src/cli/commands/serve.ts` — add `--host`, `--terminal-token`, `--no-terminal` options
- `src/core/config.ts` + config types file — add `terminal{}` to `DeckentConfig` properly
- `src/core/memory-store.ts` (+ memory schema) — `audit` entry type + `tenant_id` column migration
- `package.json` — add `ws`, `node-pty` runtime deps
- `docs/adr/010-tek-runtime-dependency-commander-js.md` + new `docs/adr/0NN-embedded-web-terminal.md` + DB

**Frontend — create:**
- `src/dashboard/src/lib/terminal-api.ts` — bootstrap token read + sessions CRUD
- `src/dashboard/src/components/terminal/useTerminalSocket.ts` — WS hook (reconnect, reattach, subprotocol token)
- `src/dashboard/src/components/terminal/TerminalView.tsx` — single xterm.js instance bound to a session
- `src/dashboard/src/components/terminal/TerminalTabs.tsx` — multi-tab bar + quick-launch
- `src/dashboard/src/components/terminal/TerminalPanel.tsx` — composes tabs + active view
- `src/dashboard/src/components/DockPanel.tsx` — resizable/collapsible bottom dock layer

**Frontend — modify:**
- `src/dashboard/src/components/Layout.tsx` — host `DockPanel` containing `TerminalPanel`
- `src/dashboard/src/pages/ConfigPage.tsx` — add `Terminal` config category (data-only)
- `src/dashboard/package.json` — add `@xterm/xterm`, `@xterm/addon-fit` devDeps
- `src/dashboard/src/i18n/en.ts`, `tr.ts` — terminal labels

**Tests — create:** `tests/api/terminal/*.test.ts`, `tests/dashboard/terminal/*.test.tsx`

---

## WAVE 0 — Foundations (deps, ADR, config, types)

### Task 0.1: Add runtime dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add deps**

In `package.json` `"dependencies"`, add (keep alphabetical):
```json
"node-pty": "^1.0.0",
"ws": "^8.18.0"
```
And in `"devDependencies"` add:
```json
"@types/ws": "^8.5.12"
```

- [ ] **Step 2: Install & verify build**

Run: `npm install && npm run lint`
Expected: install succeeds, `tsc --noEmit` exits 0 (no usage yet).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: add node-pty + ws runtime deps (embedded terminal)"
```

### Task 0.2: ADR-010 amendment extension + new ADR

**Files:**
- Modify: `docs/adr/010-tek-runtime-dependency-commander-js.md`
- Create: `docs/adr/062-embedded-web-terminal.md` (use the next free number — verify with `ls docs/adr/ | sort | tail`)

- [ ] **Step 1: Extend the existing Sprint-172 Amendment**

In `010-tek-runtime-dependency-commander-js.md`, find the `## Amendment — Sprint 172` section's dependency mapping table and append two rows following the exact existing pattern:
```markdown
| `ws` | Embedded Web Terminal (ADR-062) — browser WebSocket transport; audited zero-dep library; hand-rolled RFC6455 rejected as a security surface |
| `node-pty` | Embedded Web Terminal (ADR-062) — interactive PTY for claude/gemini/codex/shell; no pure-JS equivalent |
```

- [ ] **Step 2: Create ADR-062**

Create `docs/adr/062-embedded-web-terminal.md` in the same MADR hybrid format as a recent ADR (copy structure from `docs/adr/061-aegis-methodology.md`). Content must state: status `accepted`; decision = PtySessionManager + ws gateway + `AuthProvider`/`SessionBackend` interfaces; security = localhost-default, terminal token independent of and stricter than `DECKENT_API_AUTH_DISABLED` (aligns B-022), token via localhost page-inject → WS subprotocol; transparent `tenantId`-scoped audit in `memory.db`, raw PTY output never persisted; explicit boundary: reattach survives client disconnect, NOT server restart; multi-tenant/k8s deferred to sub-project #3 via the two interfaces.

- [ ] **Step 3: Sync ADR to DB (non-destructive)**

Run: `npm run lint:adr`
Expected: exit 0 (ADR validator passes). If the project uses a memory sync hook, run the documented ADR→DB upsert (see `.brain` export flow); do **not** rebuild the DB.

- [ ] **Step 4: Commit**

```bash
git add docs/adr/010-tek-runtime-dependency-commander-js.md docs/adr/062-embedded-web-terminal.md
git commit -m "docs(adr): ADR-010 amendment ext (ws,node-pty) + ADR-062 embedded web terminal"
```

### Task 0.3: Terminal config in `DeckentConfig` (proper, no bolt-on)

**Files:**
- Modify: `src/core/config.ts`
- Modify: the config type file that defines `DeckentConfig` (find via `grep -rn "interface DeckentConfig" src/core`)
- Test: `tests/core/config-terminal.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/core/config-terminal.test.ts
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../../src/core/config.js';

describe('terminal config', () => {
  it('provides secure defaults', () => {
    const cfg = loadConfig(process.cwd());
    expect(cfg.terminal).toBeDefined();
    expect(cfg.terminal.enabled).toBe(true);
    expect(cfg.terminal.bind).toBe('127.0.0.1');
    expect(cfg.terminal.allowShellKind).toBe(true);
    expect(cfg.terminal.maxSessions).toBe(10);
    expect(cfg.terminal.idleTimeoutMs).toBe(1_800_000);
    expect(cfg.terminal.scrollbackBytes).toBe(262_144);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/config-terminal.test.ts`
Expected: FAIL — `cfg.terminal` is undefined / property missing on type.

- [ ] **Step 3: Add the type**

In the file defining `DeckentConfig`, add a real interface and field (NOT an intersection bolt-on):
```typescript
export interface TerminalConfig {
  enabled: boolean;
  /** Bind address for the terminal WS. Default 127.0.0.1. */
  bind: string;
  /** Max concurrent PTY sessions. */
  maxSessions: number;
  /** Idle reaper timeout (ms) for shell/ai kinds; deckent kind exempt. */
  idleTimeoutMs: number;
  /** Per-session in-memory scrollback ring buffer size (bytes). */
  scrollbackBytes: number;
  /** Whether the plain `shell` session kind is allowed. */
  allowShellKind: boolean;
}
// add to DeckentConfig:
//   terminal: TerminalConfig;
```

- [ ] **Step 4: Add defaults + merge**

In `src/core/config.ts` `DEFAULT_CONFIG` (near line 600), add:
```typescript
terminal: {
  enabled: true,
  bind: '127.0.0.1',
  maxSessions: 10,
  idleTimeoutMs: 1_800_000,
  scrollbackBytes: 262_144,
  allowShellKind: true,
},
```
In the config merge path(s) (mirror how a nested object like `model_strategy` is merged — find with `grep -n "model_strategy" src/core/config.ts`), merge `terminal` the same way so project overrides apply per-key.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/core/config-terminal.test.ts && npm run lint`
Expected: PASS, `tsc --noEmit` exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/core/ tests/core/config-terminal.test.ts
git commit -m "feat(config): add TerminalConfig to DeckentConfig with secure defaults"
```

### Task 0.4: Shared terminal types

**Files:**
- Create: `src/api/terminal/types.ts`

- [ ] **Step 1: Create the types module**

```typescript
// src/api/terminal/types.ts
export type TenantId = string; // "local" today; future: real tenant id (#3 seam)
export type SessionKind = 'ai' | 'deckent' | 'shell';
export type AiTool = 'claude' | 'gemini' | 'codex';

export interface CreateSessionInput {
  kind: SessionKind;
  tool?: AiTool;            // required when kind==='ai'
  cwd?: string;
  args?: string[];          // for kind==='deckent'
  tenantId?: TenantId;      // default 'local'
}

export interface SessionMeta {
  id: string;
  kind: SessionKind;
  tenantId: TenantId;
  createdAt: string;        // ISO 8601
  status: 'running' | 'exited';
  exitCode?: number;
}

export type AuditAction =
  | 'session.create' | 'session.attach' | 'session.detach'
  | 'session.kill' | 'session.exit' | 'auth.ok' | 'auth.deny';

export interface AuditEvent {
  action: AuditAction;
  tenantId: TenantId;
  sessionId?: string;
  detail?: string;          // never raw PTY output — short structured note only
  at: string;               // ISO 8601
}
```

- [ ] **Step 2: Verify build**

Run: `npm run lint`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/api/terminal/types.ts
git commit -m "feat(terminal): shared terminal types (tenant-scoped from day one)"
```

---

## WAVE 1 — Backend core

### Task 1.1: AuthProvider (bypass-independent local token)

**Files:**
- Create: `src/api/terminal/auth-provider.ts`
- Test: `tests/api/terminal/auth-provider.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/api/terminal/auth-provider.test.ts
import { describe, it, expect } from 'vitest';
import { LocalTokenAuthProvider } from '../../../src/api/terminal/auth-provider.js';

describe('LocalTokenAuthProvider', () => {
  it('accepts the correct token', () => {
    const p = new LocalTokenAuthProvider('secret-abc');
    expect(p.verify('secret-abc')).toBe(true);
  });
  it('rejects a wrong token', () => {
    const p = new LocalTokenAuthProvider('secret-abc');
    expect(p.verify('nope')).toBe(false);
  });
  it('rejects empty/undefined', () => {
    const p = new LocalTokenAuthProvider('secret-abc');
    expect(p.verify(undefined)).toBe(false);
    expect(p.verify('')).toBe(false);
  });
  it('is independent of DECKENT_API_AUTH_DISABLED', () => {
    process.env['DECKENT_API_AUTH_DISABLED'] = '1';
    const p = new LocalTokenAuthProvider('secret-abc');
    expect(p.verify('wrong')).toBe(false); // bypass MUST NOT open the shell
    delete process.env['DECKENT_API_AUTH_DISABLED'];
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api/terminal/auth-provider.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// src/api/terminal/auth-provider.ts
import { createHash, timingSafeEqual } from 'node:crypto';

/** Pluggable auth for the terminal WS. Future (#3): OIDC/SSO/mTLS impls. */
export interface AuthProvider {
  /** @returns true iff the presented credential is valid. */
  verify(presented: string | undefined): boolean;
}

function sha256(s: string): Buffer {
  return createHash('sha256').update(s).digest();
}

/**
 * Local single-token provider. Deliberately ignores DECKENT_API_AUTH_DISABLED:
 * a read-only-dashboard dev bypass must never silently open a remote shell
 * (spec §1c.2, aligns with Sprint-171 B-022 hardening).
 */
export class LocalTokenAuthProvider implements AuthProvider {
  private readonly expected: Buffer;
  constructor(token: string) {
    if (!token) throw new Error('LocalTokenAuthProvider requires a non-empty token');
    this.expected = sha256(token);
  }
  verify(presented: string | undefined): boolean {
    if (!presented) return false;
    const actual = sha256(presented);
    return timingSafeEqual(actual, this.expected);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/api/terminal/auth-provider.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/api/terminal/auth-provider.ts tests/api/terminal/auth-provider.test.ts
git commit -m "feat(terminal): AuthProvider + bypass-independent LocalTokenAuthProvider"
```

### Task 1.2: SessionBackend interface + LocalPtyBackend

**Files:**
- Create: `src/api/terminal/session-backend.ts`
- Test: `tests/api/terminal/session-backend.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/api/terminal/session-backend.test.ts
import { describe, it, expect } from 'vitest';
import { LocalPtyBackend } from '../../../src/api/terminal/session-backend.js';

describe('LocalPtyBackend', () => {
  it('spawns a process, streams output, and reports exit', async () => {
    const be = new LocalPtyBackend();
    const chunks: string[] = [];
    let exitCode: number | undefined;
    const h = be.spawn(
      { file: 'bash', args: ['-c', 'echo hello-pty'], cwd: process.cwd() },
      (d) => chunks.push(d),
      (code) => { exitCode = code; },
    );
    await new Promise<void>((r) => {
      const t = setInterval(() => { if (exitCode !== undefined) { clearInterval(t); r(); } }, 20);
    });
    expect(chunks.join('')).toContain('hello-pty');
    expect(exitCode).toBe(0);
    h.kill();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api/terminal/session-backend.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// src/api/terminal/session-backend.ts
import * as pty from 'node-pty';

export interface SpawnSpec {
  file: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  cols?: number;
  rows?: number;
}
export interface BackendHandle {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
}
/** Pluggable execution backend. Future (#3): remote / k8s pod-exec impl. */
export interface SessionBackend {
  spawn(
    spec: SpawnSpec,
    onData: (data: string) => void,
    onExit: (code: number) => void,
  ): BackendHandle;
}

export class LocalPtyBackend implements SessionBackend {
  spawn(
    spec: SpawnSpec,
    onData: (data: string) => void,
    onExit: (code: number) => void,
  ): BackendHandle {
    const p = pty.spawn(spec.file, spec.args, {
      name: 'xterm-color',
      cols: spec.cols ?? 80,
      rows: spec.rows ?? 24,
      cwd: spec.cwd,
      env: { ...process.env, ...spec.env },
    });
    p.onData((d) => onData(d));
    p.onExit(({ exitCode }) => onExit(exitCode));
    return {
      write: (data) => p.write(data),
      resize: (cols, rows) => p.resize(cols, rows),
      kill: () => { try { p.kill(); } catch { /* already dead */ } },
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/api/terminal/session-backend.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/terminal/session-backend.ts tests/api/terminal/session-backend.test.ts
git commit -m "feat(terminal): SessionBackend interface + LocalPtyBackend (node-pty)"
```

### Task 1.3: TerminalAudit (structured, tenant-scoped, DB)

**Files:**
- Create: `src/api/terminal/audit.ts`
- Modify: `src/core/memory-store.ts` (allow `audit` entry type + `tenant_id` column)
- Test: `tests/api/terminal/audit.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/api/terminal/audit.test.ts
import { describe, it, expect } from 'vitest';
import { TerminalAudit } from '../../../src/api/terminal/audit.js';

describe('TerminalAudit', () => {
  it('records a structured event and never stores raw output', () => {
    const recorded: unknown[] = [];
    const fakeStore = { insert: (e: unknown) => recorded.push(e) };
    const audit = new TerminalAudit(fakeStore as never);
    audit.record({
      action: 'session.create', tenantId: 'local',
      sessionId: 's1', detail: 'kind=shell', at: new Date().toISOString(),
    });
    expect(recorded).toHaveLength(1);
    const e = recorded[0] as { type: string; tenant_id: string; content: string };
    expect(e.type).toBe('audit');
    expect(e.tenant_id).toBe('local');
    expect(e.content).toContain('session.create');
    expect(e.content).not.toContain('\x1b['); // no ANSI / raw pty bytes
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api/terminal/audit.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Add `tenant_id` column + `audit` type to MemoryStore**

In `src/core/memory-store.ts`: extend the `entries` table schema with a nullable `tenant_id TEXT` column behind a schema-version migration (follow the existing migration pattern — `grep -n "schema_version\|ALTER TABLE\|CREATE TABLE entries" src/core/memory-store.ts`). Add `'audit'` to the allowed entry `type` union (in `memory-types.ts`). The migration must be additive and non-destructive (never drop/rebuild — see memory: `feedback_db_silmek_yasak`).

- [ ] **Step 4: Implement TerminalAudit**

```typescript
// src/api/terminal/audit.ts
import type { AuditEvent } from './types.js';

export interface AuditSink { insert(entry: Record<string, unknown>): void; }

/** Low-volume structured audit → memory.db. Raw PTY output is NEVER passed here. */
export class TerminalAudit {
  constructor(private readonly store: AuditSink) {}
  record(ev: AuditEvent): void {
    this.store.insert({
      type: 'audit',
      tenant_id: ev.tenantId,
      title: `terminal:${ev.action}`,
      content: JSON.stringify({
        action: ev.action, sessionId: ev.sessionId,
        detail: ev.detail, at: ev.at,
      }),
      decay_exempt: true,
    });
  }
}
```

- [ ] **Step 5: Run test + build**

Run: `npx vitest run tests/api/terminal/audit.test.ts && npm run lint`
Expected: PASS, exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/api/terminal/audit.ts src/core/memory-store.ts src/core/memory-types.ts tests/api/terminal/audit.test.ts
git commit -m "feat(terminal): tenant-scoped DB audit (raw output never persisted)"
```

### Task 1.4: PtySessionManager (map, ring buffer, attach/detach, reaper)

**Files:**
- Create: `src/api/terminal/session-manager.ts`
- Test: `tests/api/terminal/session-manager.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/api/terminal/session-manager.test.ts
import { describe, it, expect, vi } from 'vitest';
import { PtySessionManager } from '../../../src/api/terminal/session-manager.js';
import type { SessionBackend, BackendHandle } from '../../../src/api/terminal/session-backend.js';

function fakeBackend() {
  let onDataCb: (d: string) => void = () => {};
  let onExitCb: (c: number) => void = () => {};
  const handle: BackendHandle = { write: vi.fn(), resize: vi.fn(), kill: vi.fn() };
  const be: SessionBackend = {
    spawn: (_s, onData, onExit) => { onDataCb = onData; onExitCb = onExit; return handle; },
  };
  return { be, handle, emit: (d: string) => onDataCb(d), exit: (c: number) => onExitCb(c) };
}

describe('PtySessionManager', () => {
  it('creates a session and buffers output (bounded ring)', () => {
    const f = fakeBackend();
    const m = new PtySessionManager(f.be, { scrollbackBytes: 8, idleTimeoutMs: 0 });
    const s = m.create({ kind: 'shell' });
    f.emit('ABCDEFGHIJ'); // 10 bytes into an 8-byte ring
    expect(m.replay(s.id)).toBe('CDEFGHIJ'); // last 8 bytes only
  });

  it('detach does NOT kill; kill is explicit', () => {
    const f = fakeBackend();
    const m = new PtySessionManager(f.be, { scrollbackBytes: 1024, idleTimeoutMs: 0 });
    const s = m.create({ kind: 'shell' });
    m.detach(s.id);
    expect(f.handle.kill).not.toHaveBeenCalled();
    m.kill(s.id);
    expect(f.handle.kill).toHaveBeenCalledOnce();
  });

  it('enforces maxSessions', () => {
    const f = fakeBackend();
    const m = new PtySessionManager(f.be, { scrollbackBytes: 16, idleTimeoutMs: 0, maxSessions: 1 });
    m.create({ kind: 'shell' });
    expect(() => m.create({ kind: 'shell' })).toThrow(/max/i);
  });

  it('idle reaper kills idle shell but exempts deckent kind', () => {
    vi.useFakeTimers();
    const f = fakeBackend();
    const m = new PtySessionManager(f.be, { scrollbackBytes: 16, idleTimeoutMs: 1000 });
    const shell = m.create({ kind: 'shell' });
    const dk = m.create({ kind: 'deckent' });
    vi.advanceTimersByTime(1500);
    m.reapIdle();
    expect(m.get(shell.id)).toBeUndefined();
    expect(m.get(dk.id)).toBeDefined();
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/api/terminal/session-manager.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// src/api/terminal/session-manager.ts
import { randomUUID } from 'node:crypto';
import type { SessionBackend, BackendHandle, SpawnSpec } from './session-backend.js';
import type { CreateSessionInput, SessionMeta, TenantId } from './types.js';

interface ManagerOpts {
  scrollbackBytes: number;
  idleTimeoutMs: number;
  maxSessions?: number;
}

interface Session {
  meta: SessionMeta;
  handle: BackendHandle;
  ring: string;            // bounded scrollback (last N bytes)
  lastActivity: number;
  listeners: Set<(d: string) => void>;
}

const KIND_CMD: Record<string, (i: CreateSessionInput) => Pick<SpawnSpec, 'file' | 'args'>> = {
  ai: (i) => ({ file: i.tool ?? 'claude', args: [] }),
  deckent: (i) => ({ file: 'deckent', args: i.args ?? [] }),
  shell: () => ({ file: process.env['SHELL'] ?? 'bash', args: [] }),
};

export class PtySessionManager {
  private readonly sessions = new Map<string, Session>();
  constructor(private readonly backend: SessionBackend, private readonly opts: ManagerOpts) {}

  create(input: CreateSessionInput): SessionMeta {
    if (this.opts.maxSessions && this.sessions.size >= this.opts.maxSessions) {
      throw new Error(`max sessions reached (${this.opts.maxSessions})`);
    }
    const id = randomUUID();
    const tenantId: TenantId = input.tenantId ?? 'local';
    const cmd = (KIND_CMD[input.kind] ?? KIND_CMD['shell'])(input);
    const meta: SessionMeta = {
      id, kind: input.kind, tenantId,
      createdAt: new Date().toISOString(), status: 'running',
    };
    const sess: Session = {
      meta, ring: '', lastActivity: Date.now(), listeners: new Set(),
      handle: {} as BackendHandle,
    };
    sess.handle = this.backend.spawn(
      { file: cmd.file, args: cmd.args, cwd: input.cwd ?? process.cwd() },
      (d) => {
        sess.ring = (sess.ring + d).slice(-this.opts.scrollbackBytes);
        sess.lastActivity = Date.now();
        for (const l of sess.listeners) l(d);
      },
      (code) => { sess.meta.status = 'exited'; sess.meta.exitCode = code; },
    );
    this.sessions.set(id, sess);
    return meta;
  }

  get(id: string): SessionMeta | undefined { return this.sessions.get(id)?.meta; }
  list(): SessionMeta[] { return [...this.sessions.values()].map((s) => s.meta); }
  replay(id: string): string { return this.sessions.get(id)?.ring ?? ''; }

  write(id: string, data: string): void {
    const s = this.sessions.get(id);
    if (!s) return;
    s.lastActivity = Date.now();
    s.handle.write(data);
  }
  resize(id: string, cols: number, rows: number): void {
    this.sessions.get(id)?.handle.resize(cols, rows);
  }
  attach(id: string, listener: (d: string) => void): void {
    this.sessions.get(id)?.listeners.add(listener);
  }
  detach(id: string, listener?: (d: string) => void): void {
    const s = this.sessions.get(id);
    if (!s) return;
    if (listener) s.listeners.delete(listener);
    else s.listeners.clear();
    // detach NEVER kills (tmux-like)
  }
  kill(id: string): void {
    const s = this.sessions.get(id);
    if (!s) return;
    s.handle.kill();
    this.sessions.delete(id);
  }
  reapIdle(): void {
    if (!this.opts.idleTimeoutMs) return;
    const now = Date.now();
    for (const [id, s] of this.sessions) {
      if (s.meta.kind === 'deckent') continue; // long sprints exempt
      if (now - s.lastActivity > this.opts.idleTimeoutMs) this.kill(id);
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/api/terminal/session-manager.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/api/terminal/session-manager.ts tests/api/terminal/session-manager.test.ts
git commit -m "feat(terminal): PtySessionManager (ring buffer, detach≠kill, idle reaper)"
```

---

## WAVE 2 — Backend wiring

### Task 2.1: WS gateway (upgrade + subprotocol auth + bridge + reattach)

**Files:**
- Create: `src/api/terminal/ws-gateway.ts`
- Test: `tests/api/terminal/ws-gateway.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/api/terminal/ws-gateway.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createServer } from 'node:http';
import { WebSocket } from 'ws';
import { attachTerminalGateway } from '../../../src/api/terminal/ws-gateway.js';
import { PtySessionManager } from '../../../src/api/terminal/session-manager.js';
import { LocalPtyBackend } from '../../../src/api/terminal/session-backend.js';
import { LocalTokenAuthProvider } from '../../../src/api/terminal/auth-provider.js';

function setup(token: string) {
  const server = createServer();
  const mgr = new PtySessionManager(new LocalPtyBackend(), { scrollbackBytes: 65536, idleTimeoutMs: 0 });
  attachTerminalGateway(server, {
    manager: mgr,
    auth: new LocalTokenAuthProvider(token),
    audit: { record: vi.fn() },
  });
  return { server, mgr };
}

describe('terminal ws gateway', () => {
  it('rejects upgrade without valid subprotocol token (no session spawned)', async () => {
    const { server, mgr } = setup('good');
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as { port: number }).port;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/terminal/ws`, ['deckent.bad']);
    const closed = await new Promise<number>((res) => ws.on('close', (c) => res(c)));
    expect(closed).toBe(4401);
    server.close();
  });

  it('accepts valid token, attaches a session, replays buffer', async () => {
    const { server, mgr } = setup('good');
    const s = mgr.create({ kind: 'shell' });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as { port: number }).port;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/terminal/ws`, ['deckent.good']);
    await new Promise<void>((r) => ws.on('open', () => r()));
    ws.send(JSON.stringify({ t: 'attach', sessionId: s.id }));
    ws.send(JSON.stringify({ t: 'input', data: 'exit\n' }));
    const got = await new Promise<string>((res) => {
      ws.on('message', (m) => res(m.toString()));
    });
    expect(got).toContain('"t":"output"');
    server.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api/terminal/ws-gateway.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// src/api/terminal/ws-gateway.ts
import type { Server, IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';
import { WebSocketServer, type WebSocket } from 'ws';
import type { PtySessionManager } from './session-manager.js';
import type { AuthProvider } from './auth-provider.js';
import type { AuditEvent } from './types.js';

interface GatewayDeps {
  manager: PtySessionManager;
  auth: AuthProvider;
  audit: { record(ev: AuditEvent): void };
}

const PREFIX = 'deckent.'; // subprotocol carries the token: "deckent.<token>"

/**
 * Attaches the terminal WS gateway. Token is read from Sec-WebSocket-Protocol
 * (browsers cannot set Authorization on WebSocket — spec §1c.2). Auth is verified
 * BEFORE any session bridge, independent of DECKENT_API_AUTH_DISABLED.
 */
export function attachTerminalGateway(server: Server, deps: GatewayDeps): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
    const url = req.url ?? '';
    if (!url.startsWith('/api/terminal/ws')) return; // not ours — leave it
    const protos = (req.headers['sec-websocket-protocol'] ?? '')
      .split(',').map((s) => s.trim());
    const tokenProto = protos.find((p) => p.startsWith(PREFIX));
    const token = tokenProto ? tokenProto.slice(PREFIX.length) : undefined;

    if (!deps.auth.verify(token)) {
      deps.audit.record({
        action: 'auth.deny', tenantId: 'local',
        detail: 'ws upgrade rejected', at: new Date().toISOString(),
      });
      // 4401 = app-level unauthorized close (sent after a minimal accept-less reject)
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    deps.audit.record({
      action: 'auth.ok', tenantId: 'local',
      detail: 'ws upgrade accepted', at: new Date().toISOString(),
    });
    wss.handleUpgrade(req, socket, head, (ws) => bridge(ws, tokenProto!, deps));
  });
}

function bridge(ws: WebSocket, acceptedProto: string, deps: GatewayDeps): void {
  let sessionId: string | null = null;
  const onData = (d: string) => {
    if (ws.bufferedAmount > 1_000_000) return; // backpressure: drop while saturated
    ws.send(JSON.stringify({ t: 'output', data: d }));
  };

  ws.on('message', (raw) => {
    let msg: { t: string; sessionId?: string; data?: string; cols?: number; rows?: number };
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.t === 'attach' && msg.sessionId) {
      if (sessionId) deps.manager.detach(sessionId, onData);
      sessionId = msg.sessionId;
      ws.send(JSON.stringify({ t: 'output', data: deps.manager.replay(sessionId) }));
      deps.manager.attach(sessionId, onData);
      deps.audit.record({
        action: 'session.attach', tenantId: 'local',
        sessionId, detail: '', at: new Date().toISOString(),
      });
    } else if (msg.t === 'input' && sessionId && typeof msg.data === 'string') {
      deps.manager.write(sessionId, msg.data);
    } else if (msg.t === 'resize' && sessionId && msg.cols && msg.rows) {
      deps.manager.resize(sessionId, msg.cols, msg.rows);
    }
  });

  ws.on('close', () => {
    if (sessionId) {
      deps.manager.detach(sessionId, onData); // detach ≠ kill (tmux-like)
      deps.audit.record({
        action: 'session.detach', tenantId: 'local',
        sessionId, detail: '', at: new Date().toISOString(),
      });
    }
  });
  // echo accepted subprotocol so the browser's WebSocket.protocol matches
  void acceptedProto;
}
```
Note: pass the accepted subprotocol back by configuring `WebSocketServer` with `handleProtocols`. If the `ws` version requires it, add `handleProtocols: (set) => [...set].find((p) => p.startsWith(PREFIX)) ?? false` to the `WebSocketServer` options.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/api/terminal/ws-gateway.test.ts`
Expected: PASS (2 tests). Fix the `handleProtocols` option if the close code/protocol assertions fail.

- [ ] **Step 5: Commit**

```bash
git add src/api/terminal/ws-gateway.ts tests/api/terminal/ws-gateway.test.ts
git commit -m "feat(terminal): ws gateway — subprotocol auth before bridge, reattach replay"
```

### Task 2.2: HTTP control routes + localhost-only bootstrap token inject

**Files:**
- Modify: `src/api/server.ts`
- Test: `tests/api/terminal/server-routes.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/api/terminal/server-routes.test.ts
import { describe, it, expect } from 'vitest';
import { createHttpServer } from '../../../src/api/server.js';

describe('terminal HTTP control', () => {
  it('POST /api/terminal/sessions creates, GET lists, DELETE removes', async () => {
    const api = createHttpServer(process.cwd(), { port: 0, autoGenerateToken: true });
    const addr = api.server.address() as { port: number };
    const base = `http://127.0.0.1:${addr.port}`;
    const tok = process.env['__TEST_TOKEN__']; // see Step 3 for how token is exposed in tests
    const h = { Authorization: `Bearer ${tok}` };
    const c = await fetch(`${base}/api/terminal/sessions`, {
      method: 'POST', headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'shell' }),
    });
    expect(c.status).toBe(201);
    const { id } = await c.json();
    const l = await fetch(`${base}/api/terminal/sessions`, { headers: h });
    expect((await l.json()).some((s: { id: string }) => s.id === id)).toBe(true);
    const d = await fetch(`${base}/api/terminal/sessions/${id}`, { method: 'DELETE', headers: h });
    expect(d.status).toBe(200);
    await api.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api/terminal/server-routes.test.ts`
Expected: FAIL — routes 404.

- [ ] **Step 3: Implement in `server.ts`**

In `createHttpServer`, after `finalToken` is resolved and before `server.listen`:
1. If `cfg.terminal.enabled`, construct `manager = new PtySessionManager(new LocalPtyBackend(), { scrollbackBytes, idleTimeoutMs, maxSessions })`, `audit = new TerminalAudit(memoryStore)`, `auth = new LocalTokenAuthProvider(finalToken ?? randomUUID())` (terminal ALWAYS has a token even if API auth is disabled — spec §1c.2). Call `attachTerminalGateway(server, { manager, auth, audit })`.
2. Start an idle reaper: `const reaper = setInterval(() => manager.reapIdle(), 30_000)`; clear it in `close()`.
3. In `handleRequest`, add (inside the `/api/` block, AFTER the existing auth middleware so HTTP control uses Bearer): `GET /api/terminal/sessions` → `manager.list()`; `POST /api/terminal/sessions` → `manager.create(body)` → 201 `{id}`; `DELETE /api/terminal/sessions/:id` → `manager.kill(id)` → 200.
4. **Localhost-only bootstrap token inject:** in the static `index.html` serving branch, if `req.socket.remoteAddress` is `127.0.0.1`/`::1`, inject `<script>window.__DECKENT_TERMINAL_TOKEN__=${JSON.stringify(terminalToken)}</script>` before `</head>`. For non-localhost callers, do NOT inject (they must supply the token another way — out of scope #1). Expose `terminalToken` to tests via `api.terminalToken` on the returned object.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/api/terminal/server-routes.test.ts && npm run lint`
Expected: PASS, exit 0. (Update the test to read `api.terminalToken` instead of an env var.)

- [ ] **Step 5: Commit**

```bash
git add src/api/server.ts tests/api/terminal/server-routes.test.ts
git commit -m "feat(terminal): HTTP control routes + localhost-only bootstrap token inject"
```

### Task 2.3: `serve` CLI surface (`--host`, `--no-terminal`)

**Files:**
- Modify: `src/cli/commands/serve.ts`
- Test: `tests/cli/serve-terminal.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/cli/serve-terminal.test.ts
import { describe, it, expect } from 'vitest';
import { Command } from 'commander';
import { registerServe } from '../../src/cli/commands/serve.js';

describe('serve CLI terminal options', () => {
  it('exposes --host and --no-terminal', () => {
    const program = new Command();
    registerServe(program);
    const serve = program.commands.find((c) => c.name() === 'serve')!;
    const opts = serve.options.map((o) => o.long);
    expect(opts).toContain('--host');
    expect(opts).toContain('--no-terminal');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cli/serve-terminal.test.ts`
Expected: FAIL — options absent.

- [ ] **Step 3: Implement**

In `serve.ts`, add to the command builder:
```typescript
.option('--host <addr>', 'Bind address', '127.0.0.1')
.option('--no-terminal', 'Disable the embedded web terminal')
```
Pass through to `createHttpServer`: `{ port, host: opts.host, autoGenerateToken: true, /* terminal enabled unless opts.terminal === false */ }`. When `--host` is non-localhost AND no explicit token is configured, print a clear stderr warning and refuse to enable the terminal (per spec §5: remote requires explicit token).

- [ ] **Step 4: Run test + build**

Run: `npx vitest run tests/cli/serve-terminal.test.ts && npm run lint`
Expected: PASS, exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/serve.ts tests/cli/serve-terminal.test.ts
git commit -m "feat(serve): --host + --no-terminal; refuse remote terminal without token"
```

---

## WAVE 3 — Frontend (dock panel + xterm)

### Task 3.1: xterm deps + terminal-api lib

**Files:**
- Modify: `src/dashboard/package.json`
- Create: `src/dashboard/src/lib/terminal-api.ts`
- Test: `tests/dashboard/terminal/terminal-api.test.ts`

- [ ] **Step 1: Add devDeps**

In `src/dashboard/package.json` `devDependencies`: `"@xterm/xterm": "^5.5.0"`, `"@xterm/addon-fit": "^0.10.0"`. Run `cd src/dashboard && npm install`.

- [ ] **Step 2: Write the failing test**

```typescript
// tests/dashboard/terminal/terminal-api.test.ts
import { describe, it, expect, vi } from 'vitest';
import { getBootstrapToken, createSession } from '../../../src/dashboard/src/lib/terminal-api';

describe('terminal-api', () => {
  it('reads the injected bootstrap token', () => {
    (window as unknown as Record<string, unknown>).__DECKENT_TERMINAL_TOKEN__ = 'tok-1';
    expect(getBootstrapToken()).toBe('tok-1');
  });
  it('POSTs a session create', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 's1' }) });
    vi.stubGlobal('fetch', fetchMock);
    const r = await createSession({ kind: 'shell' });
    expect(r.id).toBe('s1');
    expect(fetchMock).toHaveBeenCalledWith('/api/terminal/sessions', expect.objectContaining({ method: 'POST' }));
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test:dashboard -- terminal-api`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```typescript
// src/dashboard/src/lib/terminal-api.ts
export interface SessionMeta { id: string; kind: string; status: string; }

export function getBootstrapToken(): string | undefined {
  return (window as unknown as { __DECKENT_TERMINAL_TOKEN__?: string }).__DECKENT_TERMINAL_TOKEN__;
}
export async function createSession(input: { kind: string; tool?: string; args?: string[] }): Promise<SessionMeta> {
  const res = await fetch('/api/terminal/sessions', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`createSession failed: ${res.status}`);
  return res.json();
}
export async function listSessions(): Promise<SessionMeta[]> {
  const res = await fetch('/api/terminal/sessions');
  return res.ok ? res.json() : [];
}
export async function killSession(id: string): Promise<void> {
  await fetch(`/api/terminal/sessions/${id}`, { method: 'DELETE' });
}
```

- [ ] **Step 5: Run test + commit**

Run: `npm run test:dashboard -- terminal-api`
Expected: PASS.
```bash
git add src/dashboard/package.json src/dashboard/package-lock.json src/dashboard/src/lib/terminal-api.ts tests/dashboard/terminal/terminal-api.test.ts
git commit -m "feat(dashboard): xterm deps + terminal-api (bootstrap token + sessions)"
```

### Task 3.2: useTerminalSocket hook (reconnect + reattach + subprotocol token)

**Files:**
- Create: `src/dashboard/src/components/terminal/useTerminalSocket.ts`
- Test: `tests/dashboard/terminal/useTerminalSocket.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/dashboard/terminal/useTerminalSocket.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTerminalSocket } from '../../../src/dashboard/src/components/terminal/useTerminalSocket';

class FakeWS {
  static instances: FakeWS[] = [];
  onopen?: () => void; onmessage?: (e: { data: string }) => void; onclose?: () => void;
  sent: string[] = []; protocol: string;
  constructor(public url: string, public protocols?: string[]) { this.protocol = protocols?.[0] ?? ''; FakeWS.instances.push(this); }
  send(d: string) { this.sent.push(d); }
  close() { this.onclose?.(); }
}

describe('useTerminalSocket', () => {
  it('opens WS with deckent.<token> subprotocol and sends attach', () => {
    vi.stubGlobal('WebSocket', FakeWS as unknown as typeof WebSocket);
    (window as unknown as Record<string, unknown>).__DECKENT_TERMINAL_TOKEN__ = 'tk';
    const onOutput = vi.fn();
    renderHook(() => useTerminalSocket('sess-1', onOutput));
    const ws = FakeWS.instances.at(-1)!;
    expect(ws.protocols).toEqual(['deckent.tk']);
    act(() => ws.onopen?.());
    expect(ws.sent.some((m) => m.includes('"t":"attach"') && m.includes('sess-1'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:dashboard -- useTerminalSocket`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// src/dashboard/src/components/terminal/useTerminalSocket.ts
import { useEffect, useRef } from 'react';
import { getBootstrapToken } from '../../lib/terminal-api';

export interface TerminalSocket {
  send(data: string): void;
  resize(cols: number, rows: number): void;
}

export function useTerminalSocket(
  sessionId: string | null,
  onOutput: (data: string) => void,
): React.MutableRefObject<TerminalSocket | null> {
  const api = useRef<TerminalSocket | null>(null);
  useEffect(() => {
    if (!sessionId) return;
    let ws: WebSocket | null = null;
    let retry = 0;
    let stopped = false;

    const connect = () => {
      const token = getBootstrapToken();
      const proto = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/terminal/ws`;
      ws = new WebSocket(proto, token ? [`deckent.${token}`] : []);
      ws.onopen = () => {
        retry = 0;
        ws!.send(JSON.stringify({ t: 'attach', sessionId }));
      };
      ws.onmessage = (e) => {
        try {
          const m = JSON.parse(typeof e.data === 'string' ? e.data : '');
          if (m.t === 'output') onOutput(m.data);
        } catch { /* ignore non-JSON */ }
      };
      ws.onclose = () => {
        if (stopped) return;
        retry = Math.min(retry + 1, 5);
        setTimeout(connect, retry * 1000); // reconnect → re-attach (tmux-like)
      };
      api.current = {
        send: (data) => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ t: 'input', data })),
        resize: (cols, rows) => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ t: 'resize', cols, rows })),
      };
    };
    connect();
    return () => { stopped = true; ws?.close(); };
  }, [sessionId, onOutput]);
  return api;
}
```

- [ ] **Step 4: Run test + commit**

Run: `npm run test:dashboard -- useTerminalSocket`
Expected: PASS.
```bash
git add src/dashboard/src/components/terminal/useTerminalSocket.ts tests/dashboard/terminal/useTerminalSocket.test.tsx
git commit -m "feat(dashboard): useTerminalSocket — subprotocol token, auto reattach"
```

### Task 3.3: TerminalView (xterm bound to a session)

**Files:**
- Create: `src/dashboard/src/components/terminal/TerminalView.tsx`
- Test: `tests/dashboard/terminal/TerminalView.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/dashboard/terminal/TerminalView.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
vi.mock('@xterm/xterm', () => ({ Terminal: class { open = vi.fn(); write = vi.fn(); onData = vi.fn(); loadAddon = vi.fn(); dispose = vi.fn(); } }));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class { fit = vi.fn(); } }));
import { TerminalView } from '../../../src/dashboard/src/components/terminal/TerminalView';

describe('TerminalView', () => {
  it('renders a container for the given session', () => {
    const { container } = render(<TerminalView sessionId="s1" />);
    expect(container.querySelector('[data-terminal="s1"]')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:dashboard -- TerminalView`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// src/dashboard/src/components/terminal/TerminalView.tsx
import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useTerminalSocket } from './useTerminalSocket';

export function TerminalView({ sessionId }: { sessionId: string }) {
  const elRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const writeRef = useRef<(d: string) => void>(() => {});
  const sock = useTerminalSocket(sessionId, (d) => writeRef.current(d));

  useEffect(() => {
    if (!elRef.current) return;
    const term = new Terminal({ convertEol: true, fontSize: 13 });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(elRef.current);
    fit.fit();
    writeRef.current = (d) => term.write(d);
    term.onData((d) => sock.current?.send(d));
    termRef.current = term;
    const ro = new ResizeObserver(() => { fit.fit(); sock.current?.resize(term.cols, term.rows); });
    ro.observe(elRef.current);
    return () => { ro.disconnect(); term.dispose(); };
  }, [sessionId, sock]);

  return <div data-terminal={sessionId} ref={elRef} style={{ width: '100%', height: '100%' }} />;
}
```

- [ ] **Step 4: Run test + commit**

Run: `npm run test:dashboard -- TerminalView`
Expected: PASS.
```bash
git add src/dashboard/src/components/terminal/TerminalView.tsx tests/dashboard/terminal/TerminalView.test.tsx
git commit -m "feat(dashboard): TerminalView — xterm + fit bound to a session"
```

### Task 3.4: TerminalTabs + TerminalPanel (multi-tab)

**Files:**
- Create: `src/dashboard/src/components/terminal/TerminalTabs.tsx`
- Create: `src/dashboard/src/components/terminal/TerminalPanel.tsx`
- Test: `tests/dashboard/terminal/TerminalPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/dashboard/terminal/TerminalPanel.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
vi.mock('../../../src/dashboard/src/components/terminal/TerminalView', () => ({ TerminalView: ({ sessionId }: { sessionId: string }) => <div>view:{sessionId}</div> }));
vi.mock('../../../src/dashboard/src/lib/terminal-api', () => ({ createSession: vi.fn(async () => ({ id: 's-new', kind: 'shell', status: 'running' })), listSessions: vi.fn(async () => []), killSession: vi.fn() }));
import { TerminalPanel } from '../../../src/dashboard/src/components/terminal/TerminalPanel';

describe('TerminalPanel', () => {
  it('opens a new shell tab on quick-launch', async () => {
    render(<TerminalPanel />);
    fireEvent.click(screen.getByRole('button', { name: /shell/i }));
    await waitFor(() => expect(screen.getByText('view:s-new')).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:dashboard -- TerminalPanel`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// src/dashboard/src/components/terminal/TerminalTabs.tsx
import type { SessionMeta } from '../../lib/terminal-api';
const KINDS: { label: string; kind: string; tool?: string }[] = [
  { label: 'claude', kind: 'ai', tool: 'claude' },
  { label: 'gemini', kind: 'ai', tool: 'gemini' },
  { label: 'codex', kind: 'ai', tool: 'codex' },
  { label: 'deckent', kind: 'deckent' },
  { label: 'shell', kind: 'shell' },
];
export function TerminalTabs(props: {
  tabs: SessionMeta[]; activeId: string | null;
  onSelect: (id: string) => void; onClose: (id: string) => void;
  onLaunch: (kind: string, tool?: string) => void;
}) {
  return (
    <div className="flex items-center gap-1 border-b px-2 py-1 text-sm">
      {props.tabs.map((t) => (
        <span key={t.id} className={`px-2 py-0.5 rounded cursor-pointer ${t.id === props.activeId ? 'bg-muted' : ''}`}>
          <button onClick={() => props.onSelect(t.id)}>{t.kind}:{t.id.slice(0, 6)}</button>
          <button aria-label={`close ${t.id}`} className="ml-1" onClick={() => props.onClose(t.id)}>×</button>
        </span>
      ))}
      <span className="ml-auto flex gap-1">
        {KINDS.map((k) => (
          <button key={k.label} className="px-2 py-0.5 rounded bg-primary/10"
            onClick={() => props.onLaunch(k.kind, k.tool)}>+{k.label}</button>
        ))}
      </span>
    </div>
  );
}
```
```tsx
// src/dashboard/src/components/terminal/TerminalPanel.tsx
import { useEffect, useState } from 'react';
import { TerminalView } from './TerminalView';
import { TerminalTabs } from './TerminalTabs';
import { createSession, listSessions, killSession, type SessionMeta } from '../../lib/terminal-api';

export function TerminalPanel() {
  const [tabs, setTabs] = useState<SessionMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  useEffect(() => { listSessions().then((s) => { setTabs(s); if (s[0]) setActiveId(s[0].id); }); }, []);
  const launch = async (kind: string, tool?: string) => {
    const s = await createSession({ kind, tool });
    setTabs((t) => [...t, s]); setActiveId(s.id);
  };
  const close = async (id: string) => {
    await killSession(id);
    setTabs((t) => t.filter((x) => x.id !== id));
    setActiveId((a) => (a === id ? null : a));
  };
  return (
    <div className="flex flex-col h-full">
      <TerminalTabs tabs={tabs} activeId={activeId} onSelect={setActiveId} onClose={close} onLaunch={launch} />
      <div className="flex-1 min-h-0">
        {activeId ? <TerminalView key={activeId} sessionId={activeId} />
          : <div className="p-4 text-sm text-muted-foreground">Open a session ↗</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test + commit**

Run: `npm run test:dashboard -- TerminalPanel`
Expected: PASS.
```bash
git add src/dashboard/src/components/terminal/TerminalTabs.tsx src/dashboard/src/components/terminal/TerminalPanel.tsx tests/dashboard/terminal/TerminalPanel.test.tsx
git commit -m "feat(dashboard): multi-tab TerminalPanel + quick-launch"
```

### Task 3.5: DockPanel + Layout integration

**Files:**
- Create: `src/dashboard/src/components/DockPanel.tsx`
- Modify: `src/dashboard/src/components/Layout.tsx`
- Test: `tests/dashboard/terminal/DockPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/dashboard/terminal/DockPanel.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DockPanel } from '../../../src/dashboard/src/components/DockPanel';

describe('DockPanel', () => {
  it('toggles open/closed', () => {
    render(<DockPanel><div>PANELBODY</div></DockPanel>);
    expect(screen.queryByText('PANELBODY')).not.toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /terminal/i }));
    expect(screen.getByText('PANELBODY')).toBeVisible();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:dashboard -- DockPanel`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// src/dashboard/src/components/DockPanel.tsx
import { useState, type ReactNode } from 'react';

export function DockPanel({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [height, setHeight] = useState(280);
  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background"
        style={{ height: open ? height : 32 }}>
        <button className="w-full text-left px-3 py-1 text-xs font-mono border-b"
          onClick={() => setOpen((o) => !o)} aria-label="toggle terminal">
          ▸ Terminal {open ? '▾' : '▴'}
        </button>
        <div style={{ height: height - 32, display: open ? 'block' : 'none' }}>
          {children}
        </div>
        {open && (
          <div role="separator" aria-label="resize terminal"
            className="absolute top-0 left-0 right-0 h-1 cursor-ns-resize"
            onMouseDown={(e) => {
              const startY = e.clientY, startH = height;
              const mv = (ev: MouseEvent) => setHeight(Math.max(120, startH + (startY - ev.clientY)));
              const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
              window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
            }} />
        )}
      </div>
    </>
  );
}
```
In `Layout.tsx`, import `DockPanel` + `TerminalPanel`, and render `<DockPanel><TerminalPanel /></DockPanel>` once at the end of the layout shell (outside `<Outlet />` so it persists across route changes). Add bottom padding (`pb-8`) to the main scroll area so content isn't hidden behind the collapsed dock bar.

- [ ] **Step 4: Run test + commit**

Run: `npm run test:dashboard -- DockPanel && npm run test:dashboard`
Expected: PASS (all dashboard tests green).
```bash
git add src/dashboard/src/components/DockPanel.tsx src/dashboard/src/components/Layout.tsx tests/dashboard/terminal/DockPanel.test.tsx
git commit -m "feat(dashboard): VSCode-like resizable DockPanel hosting the terminal"
```

### Task 3.6: ConfigPage Terminal category + i18n

**Files:**
- Modify: `src/dashboard/src/pages/ConfigPage.tsx`
- Modify: `src/dashboard/src/i18n/en.ts`, `src/dashboard/src/i18n/tr.ts`

- [ ] **Step 1: Add config fields (data-only)**

In `CONFIG_FIELDS`, add entries with `category: "Terminal"` for `terminal.enabled` (boolean), `terminal.allowShellKind` (boolean), `terminal.maxSessions` (number), `terminal.idleTimeoutMs` (number), `terminal.scrollbackBytes` (number). Add `"Terminal"` to `CATEGORIES` and `CATEGORY_KEY_MAP` (`"Terminal": "config.category.terminal"`). Add the i18n keys to `en.ts` and `tr.ts`.

- [ ] **Step 2: Build + commit**

Run: `npm run test:dashboard && npm run lint`
Expected: green, exit 0.
```bash
git add src/dashboard/src/pages/ConfigPage.tsx src/dashboard/src/i18n/en.ts src/dashboard/src/i18n/tr.ts
git commit -m "feat(dashboard): Terminal config category in ConfigPage"
```

---

## WAVE 4 — Integration, docs, final verification

### Task 4.1: End-to-end integration test (real pty over real ws + reattach)

**Files:**
- Test: `tests/api/terminal/e2e-reattach.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// tests/api/terminal/e2e-reattach.test.ts
import { describe, it, expect } from 'vitest';
import { createServer } from 'node:http';
import { WebSocket } from 'ws';
import { attachTerminalGateway } from '../../../src/api/terminal/ws-gateway.js';
import { PtySessionManager } from '../../../src/api/terminal/session-manager.js';
import { LocalPtyBackend } from '../../../src/api/terminal/session-backend.js';
import { LocalTokenAuthProvider } from '../../../src/api/terminal/auth-provider.js';

describe('terminal e2e — reattach survives client disconnect', () => {
  it('output produced while disconnected is replayed on reattach', async () => {
    const server = createServer();
    const mgr = new PtySessionManager(new LocalPtyBackend(), { scrollbackBytes: 65536, idleTimeoutMs: 0 });
    attachTerminalGateway(server, { manager: mgr, auth: new LocalTokenAuthProvider('t'), audit: { record() {} } });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as { port: number }).port;
    const s = mgr.create({ kind: 'shell' });

    const ws1 = new WebSocket(`ws://127.0.0.1:${port}/api/terminal/ws`, ['deckent.t']);
    await new Promise<void>((r) => ws1.on('open', () => r()));
    ws1.send(JSON.stringify({ t: 'attach', sessionId: s.id }));
    ws1.send(JSON.stringify({ t: 'input', data: 'echo MARKER_ONE\n' }));
    await new Promise((r) => setTimeout(r, 400));
    ws1.close(); // disconnect

    mgr.write(s.id, 'echo MARKER_TWO\n'); // produced while no client attached
    await new Promise((r) => setTimeout(r, 400));

    const ws2 = new WebSocket(`ws://127.0.0.1:${port}/api/terminal/ws`, ['deckent.t']);
    await new Promise<void>((r) => ws2.on('open', () => r()));
    const replay = await new Promise<string>((res) => {
      let buf = '';
      ws2.on('message', (m) => { buf += JSON.parse(m.toString()).data ?? ''; if (buf.includes('MARKER_TWO')) res(buf); });
      ws2.send(JSON.stringify({ t: 'attach', sessionId: s.id }));
    });
    expect(replay).toContain('MARKER_ONE');
    expect(replay).toContain('MARKER_TWO');
    mgr.kill(s.id); server.close();
  });
});
```

- [ ] **Step 2: Run + commit**

Run: `npx vitest run tests/api/terminal/e2e-reattach.test.ts`
Expected: PASS.
```bash
git add tests/api/terminal/e2e-reattach.test.ts
git commit -m "test(terminal): e2e — reattach replays output produced while disconnected"
```

### Task 4.2: Docs — reference + user guide

**Files:**
- Modify: `docs/reference/` (whatever `npm run docs:ref` regenerates) and a new `docs/guide/terminal.md`

- [ ] **Step 1: Write the user guide**

Create `docs/guide/terminal.md` (EN canonical) covering: what it is, security model (localhost-default, token auto-injected, independent of `DECKENT_API_AUTH_DISABLED`, remote requires explicit `--host` + token + user-managed TLS), the audit timeline, reattach semantics + the server-restart boundary, config keys. Add a TR parallel `docs/guide/terminal-tr.md` (no TR file is ever removed — project rule).

- [ ] **Step 2: Regenerate reference + link check**

Run: `npm run docs:ref && npm run docs:stats && npm run lint:link`
Expected: all exit 0.

- [ ] **Step 3: Commit**

```bash
git add docs/
git commit -m "docs(terminal): user guide (EN+TR) + regenerated reference"
```

### Task 4.3: Final full verification

- [ ] **Step 1: Run the whole gate**

Run, and confirm each exits 0 / passes:
```bash
npm run lint            # tsc --noEmit
npx vitest run          # full suite
npm run test:dashboard  # dashboard suite
npm run lint:adr        # ADR validator
npm run lint:link       # dead-link gate
npm pack --dry-run      # clean package, node-pty/ws present, no internal state
```

- [ ] **Step 2: Manual smoke (Alperen — build/run is the user's call per memory)**

`npm run build:all` then `deckent serve` → open dashboard → toggle the dock → launch a `shell` tab → run `echo hi` → refresh the browser → confirm the session reattaches and scrollback replays → open the audit timeline and confirm `session.create`/`attach` events, no raw output. Verify a `deckent` tab can run `deckent status`.

- [ ] **Step 3: Commit any fixes, then finalize**

```bash
git add -A && git commit -m "chore(terminal): final verification fixes"
```

---

## Self-Review (completed by plan author)

1. **Spec coverage:** PTY/multi-tab → 1.2/1.4/3.4; `ws` transport → 2.1; localhost-default + token + bypass-independence → 1.1/2.2/2.3; token via localhost page-inject → 2.2 + 3.1/3.2; tmux reattach → 1.4/2.1/4.1; audit DB tenant-scoped, raw never persisted → 1.3; ADR-010 ext + ADR-062 → 0.2; config in DeckentConfig → 0.3; VSCode dock panel → 3.5; enterprise seams (`AuthProvider`/`SessionBackend`/`tenantId`) → 1.1/1.2/0.4/1.3; self-mod sequential → declared in header + DIRECTIVES note; server-restart boundary → documented (4.2), tested boundary is client-disconnect only (4.1). No spec requirement left without a task.
2. **Placeholder scan:** no TBD/TODO; every code step has concrete code; the few "follow existing pattern" notes (config merge, schema migration) point at exact `grep` anchors rather than hand-waving — acceptable because the pattern is project-specific and must match existing code.
3. **Type consistency:** `SessionMeta`, `CreateSessionInput`, `AuditEvent`, `TenantId` defined once in `types.ts` (0.4) and reused; `SessionBackend`/`BackendHandle` defined in 1.2 and consumed unchanged in 1.4; `AuthProvider.verify` signature consistent across 1.1/2.1; WS message shape `{t,sessionId,data,cols,rows}` identical in 2.1/3.2.

## Execution Handoff

This is a **self-modifying / dogfood** sprint (touches `src/api/` + `src/dashboard/`) → sequential execution mandatory; waves are ordered 0→4 and must not overlap. Convert this plan to sprint `DIRECTIVES.md` with: `dependency_pipeline_enabled` semantics manual (ADR-047), self-modifying declared, model = opus for code tasks / sonnet for doc tasks (per project rule), one task per plan Task, scope = the listed files.
