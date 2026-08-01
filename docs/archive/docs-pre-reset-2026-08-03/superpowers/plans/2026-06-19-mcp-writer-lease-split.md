# MCP Writer-Lease Split (MCP-W1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let every IDE window run its own deckent MCP server (reads work everywhere) while serializing mutating tools to one window via an auto-handover writer-lease, eliminating the `-32000` multi-window failure.

**Architecture:** Remove the whole-server boot singleton. In `createServer`, intercept `server.registerTool` once so every `readOnlyHint:false` tool's handler is wrapped with a writer-lease check; mixed read/write tools get a per-action predicate so their reads stay ungated. The lease (`.deckent/mcp-writer.lease`, pid + heartbeat + ttl) auto-transfers on owner death/staleness. Denials are graceful i18n tool-results, never transport crashes.

**Tech Stack:** TypeScript (ESM, Node16 — `.js` import suffixes), `@modelcontextprotocol/sdk`, zod/v4, vitest. Reuses the O_EXCL + pid-liveness pattern from `src/core/file-lock.ts` / `src/mcp/server-singleton-lock.ts`.

## Global Constraints

- **ESM:** every relative import ends in `.js` (Node16 resolution).
- **i18n-first:** no user-facing hardcoded strings — denial text comes from `getMessage('mcp.writer_lease.denied', lang, vars)` (`src/cli/helpers/messages.ts`, en/tr). Mechanism modules stay string-free; labels are injected from the caller.
- **Hermetic tests:** all file I/O under `os.tmpdir()`, cleaned in `afterEach`; no gitignored local state; async only (no `spawnSync`); dependency-inject `isAlive`/`now` instead of relying on real foreign pids.
- **Surgical + lossless:** `tsc --noEmit` clean; existing tool behavior unchanged; only the listed files touched.
- **No `-32000`:** the gate never throws to the transport — every denial is a normal tool result `{ isError:true, code:'WRITER_LEASE_DENIED', ownerPid, message }`.
- **TTL default:** `DEFAULT_WRITER_LEASE_TTL_MS = 120_000`. (Spec §G config knob `mcp.writer_lease_ttl_ms` is **deferred — YAGNI**: ttl is a code constant + optional param; the deep sprint-lock backstops the only dangerous op, so a knob earns nothing yet. Add later if tuning is ever needed.)

---

### Task 1: Writer-lease primitive (`writer-lease.ts`)

**Files:**
- Create: `src/mcp/writer-lease.ts`
- Test: `tests/mcp/writer-lease.test.ts`

**Interfaces:**
- Produces:
  - `DEFAULT_WRITER_LEASE_TTL_MS: number` (= `120_000`)
  - `interface WriterLeaseInfo { pid: number; acquiredAt: string; heartbeatAt: string; ttlMs: number }`
  - `type LeaseResult = { ok: true; ownerPid: number; stolen: boolean } | { ok: false; ownerPid: number }`
  - `interface LeaseOpts { ttlMs?: number; isAlive?: (pid: number) => boolean; now?: () => number }`
  - `acquireOrCheckWriterLease(projectRoot: string, opts?: LeaseOpts): LeaseResult`
  - `releaseWriterLease(projectRoot: string): void`
  - `readWriterLease(projectRoot: string): WriterLeaseInfo | null`
  - `isProcessAlive(pid: number): boolean`
  - `installWriterLeaseReleaseHooks(projectRoot: string): void`

- [ ] **Step 1: Write the failing tests**

Create `tests/mcp/writer-lease.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  acquireOrCheckWriterLease,
  releaseWriterLease,
  readWriterLease,
  isProcessAlive,
  DEFAULT_WRITER_LEASE_TTL_MS,
} from '../../src/mcp/writer-lease.js';

const dirs: string[] = [];
function sandbox(): string {
  const d = mkdtempSync(join(tmpdir(), 'wlease-'));
  dirs.push(d);
  mkdirSync(join(d, '.deckent'), { recursive: true });
  return d;
}
function leasePath(root: string): string {
  return join(root, '.deckent', 'mcp-writer.lease');
}
function seed(root: string, info: Record<string, unknown>): void {
  writeFileSync(leasePath(root), JSON.stringify(info), 'utf-8');
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('writer-lease', () => {
  it('acquires when no lease exists and writes this pid', () => {
    const root = sandbox();
    const r = acquireOrCheckWriterLease(root);
    expect(r).toEqual({ ok: true, ownerPid: process.pid, stolen: false });
    expect(readWriterLease(root)?.pid).toBe(process.pid);
  });

  it('refreshes heartbeat when already owned by self', () => {
    const root = sandbox();
    seed(root, { pid: process.pid, acquiredAt: '2020-01-01T00:00:00.000Z', heartbeatAt: '2020-01-01T00:00:00.000Z', ttlMs: DEFAULT_WRITER_LEASE_TTL_MS });
    const r = acquireOrCheckWriterLease(root, { now: () => 1_700_000_000_000 });
    expect(r.ok).toBe(true);
    expect(readWriterLease(root)?.heartbeatAt).toBe(new Date(1_700_000_000_000).toISOString());
  });

  it('denies when owned by another live + fresh pid', () => {
    const root = sandbox();
    const now = 1_700_000_000_000;
    seed(root, { pid: 999_001, acquiredAt: new Date(now).toISOString(), heartbeatAt: new Date(now).toISOString(), ttlMs: 120_000 });
    const r = acquireOrCheckWriterLease(root, { isAlive: () => true, now: () => now + 1_000 });
    expect(r).toEqual({ ok: false, ownerPid: 999_001 });
  });

  it('steals when owner pid is dead', () => {
    const root = sandbox();
    const now = 1_700_000_000_000;
    seed(root, { pid: 999_002, acquiredAt: new Date(now).toISOString(), heartbeatAt: new Date(now).toISOString(), ttlMs: 120_000 });
    const r = acquireOrCheckWriterLease(root, { isAlive: () => false, now: () => now + 1_000 });
    expect(r).toEqual({ ok: true, ownerPid: process.pid, stolen: true });
    expect(readWriterLease(root)?.pid).toBe(process.pid);
  });

  it('steals when owner is alive but heartbeat is stale (> ttl)', () => {
    const root = sandbox();
    const now = 1_700_000_000_000;
    seed(root, { pid: 999_003, acquiredAt: new Date(now).toISOString(), heartbeatAt: new Date(now).toISOString(), ttlMs: 120_000 });
    const r = acquireOrCheckWriterLease(root, { isAlive: () => true, now: () => now + 200_000 });
    expect(r.ok).toBe(true);
    expect(r.stolen).toBe(true);
  });

  it('treats a corrupt lease file as free and acquires', () => {
    const root = sandbox();
    writeFileSync(leasePath(root), '{ this is not json', 'utf-8');
    const r = acquireOrCheckWriterLease(root);
    expect(r.ok).toBe(true);
    expect(readWriterLease(root)?.pid).toBe(process.pid);
  });

  it('release removes the lease only when owned by self', () => {
    const root = sandbox();
    acquireOrCheckWriterLease(root);
    releaseWriterLease(root);
    expect(readWriterLease(root)).toBeNull();
  });

  it('release is a no-op when the lease is owned by another pid', () => {
    const root = sandbox();
    seed(root, { pid: 999_004, acquiredAt: '2020-01-01T00:00:00.000Z', heartbeatAt: '2020-01-01T00:00:00.000Z', ttlMs: 120_000 });
    releaseWriterLease(root);
    expect(readWriterLease(root)?.pid).toBe(999_004);
  });

  it('isProcessAlive returns true for the current process and false for an impossible pid', () => {
    expect(isProcessAlive(process.pid)).toBe(true);
    expect(isProcessAlive(2_147_483_646)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/mcp/writer-lease.test.ts`
Expected: FAIL — module `src/mcp/writer-lease.js` does not exist.

- [ ] **Step 3: Implement `src/mcp/writer-lease.ts`**

```typescript
/**
 * MCP writer-lease (MCP-W1). Project-scoped single-writer lease so that, while
 * every IDE window boots its own MCP server (reads everywhere), mutating tools
 * are serialized to one window. The lease auto-transfers when the owner exits
 * (dead pid) or goes stale (no heartbeat past ttl). Mirrors the O_EXCL +
 * pid-liveness pattern of file-lock.ts / the retired server-singleton-lock.ts.
 */
import {
  closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeSync, writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { DECKENT_DIR } from '../core/constants.js';

export const DEFAULT_WRITER_LEASE_TTL_MS = 120_000;
const LEASE_FILE = 'mcp-writer.lease';

export interface WriterLeaseInfo {
  pid: number;
  acquiredAt: string;
  heartbeatAt: string;
  ttlMs: number;
}

export type LeaseResult =
  | { ok: true; ownerPid: number; stolen: boolean }
  | { ok: false; ownerPid: number };

export interface LeaseOpts {
  ttlMs?: number;
  isAlive?: (pid: number) => boolean;
  now?: () => number;
}

export function isProcessAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function leasePathFor(projectRoot: string): string {
  return join(projectRoot, DECKENT_DIR, LEASE_FILE);
}

export function readWriterLease(projectRoot: string): WriterLeaseInfo | null {
  try {
    const raw = readFileSync(leasePathFor(projectRoot), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<WriterLeaseInfo>;
    if (typeof parsed.pid !== 'number' || !Number.isFinite(parsed.pid)) return null;
    return {
      pid: parsed.pid,
      acquiredAt: String(parsed.acquiredAt ?? ''),
      heartbeatAt: String(parsed.heartbeatAt ?? parsed.acquiredAt ?? ''),
      ttlMs: typeof parsed.ttlMs === 'number' ? parsed.ttlMs : DEFAULT_WRITER_LEASE_TTL_MS,
    };
  } catch {
    return null;
  }
}

function writeLease(projectRoot: string, ttlMs: number, nowMs: number): void {
  const path = leasePathFor(projectRoot);
  mkdirSync(dirname(path), { recursive: true });
  const iso = new Date(nowMs).toISOString();
  const info: WriterLeaseInfo = { pid: process.pid, acquiredAt: iso, heartbeatAt: iso, ttlMs };
  writeFileSync(path, JSON.stringify(info), 'utf-8');
}

export function acquireOrCheckWriterLease(projectRoot: string, opts: LeaseOpts = {}): LeaseResult {
  const ttlMs = opts.ttlMs ?? DEFAULT_WRITER_LEASE_TTL_MS;
  const isAlive = opts.isAlive ?? isProcessAlive;
  const nowMs = (opts.now ?? Date.now)();
  const existing = readWriterLease(projectRoot);

  // No (or corrupt) lease — acquire.
  if (existing === null) {
    writeLease(projectRoot, ttlMs, nowMs);
    return { ok: true, ownerPid: process.pid, stolen: false };
  }

  // Owned by self — refresh heartbeat.
  if (existing.pid === process.pid) {
    writeLease(projectRoot, ttlMs, nowMs);
    return { ok: true, ownerPid: process.pid, stolen: false };
  }

  // Owned by another, alive AND fresh — deny.
  const heartbeatMs = new Date(existing.heartbeatAt).getTime();
  const fresh = Number.isFinite(heartbeatMs) && nowMs - heartbeatMs <= (existing.ttlMs || ttlMs);
  if (isAlive(existing.pid) && fresh) {
    return { ok: false, ownerPid: existing.pid };
  }

  // Owner dead or stale — steal.
  writeLease(projectRoot, ttlMs, nowMs);
  return { ok: true, ownerPid: process.pid, stolen: true };
}

export function releaseWriterLease(projectRoot: string): void {
  const existing = readWriterLease(projectRoot);
  if (existing === null || existing.pid !== process.pid) return;
  try {
    unlinkSync(leasePathFor(projectRoot));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      // best-effort: never throw from release
    }
  }
}

let releaseHooksInstalled = false;

export function installWriterLeaseReleaseHooks(projectRoot: string): void {
  if (releaseHooksInstalled) return;
  releaseHooksInstalled = true;
  const release = (): void => {
    try { releaseWriterLease(projectRoot); } catch { /* best-effort */ }
  };
  process.on('exit', release);
  process.on('SIGTERM', () => { release(); process.exit(0); });
  process.on('SIGINT', () => { release(); process.exit(0); });
}
```

> Note: `openSync`/`writeSync`/`closeSync` are imported for parity with the file-lock pattern but the lease uses `writeFileSync` for the refresh/steal overwrite (single-owner writes are safe; corrupt-as-free handles the rare race). Keep only the imports you use — remove `openSync/writeSync/closeSync` if `tsc`/lint flags them unused.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/mcp/writer-lease.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Typecheck**

Run: `npm run lint` (tsc --noEmit)
Expected: no errors (fix any unused-import warning per the note above).

- [ ] **Step 6: Commit**

```bash
git add src/mcp/writer-lease.ts tests/mcp/writer-lease.test.ts
git commit -m "feat(mcp): writer-lease primitive — pid+heartbeat+ttl, auto-handover (MCP-W1)"
```

---

### Task 2: i18n denial message

**Files:**
- Modify: `src/cli/helpers/messages.ts` (add one key to the `MESSAGES` map, before the closing `};` at line ~1485)
- Test: `tests/cli/messages-writer-lease.test.ts`

**Interfaces:**
- Produces: message key `'mcp.writer_lease.denied'` with `{tool}` and `{pid}` placeholders, consumed via `getMessage(key, lang, { tool, pid })`.

- [ ] **Step 1: Write the failing test**

Create `tests/cli/messages-writer-lease.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getMessage } from '../../src/cli/helpers/messages.js';

describe('mcp.writer_lease.denied message', () => {
  it('renders English with tool + pid filled', () => {
    const msg = getMessage('mcp.writer_lease.denied', 'en', { tool: 'deckent_start', pid: '4242' });
    expect(msg).toContain('deckent_start');
    expect(msg).toContain('4242');
    expect(msg).not.toContain('{tool}');
    expect(msg).not.toContain('{pid}');
  });

  it('renders Turkish with tool + pid filled', () => {
    const msg = getMessage('mcp.writer_lease.denied', 'tr', { tool: 'deckent_start', pid: '4242' });
    expect(msg).toContain('deckent_start');
    expect(msg).toContain('4242');
    expect(msg).not.toContain('{tool}');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/cli/messages-writer-lease.test.ts`
Expected: FAIL — `getMessage` returns the raw key `'mcp.writer_lease.denied'` (key not found), so `toContain('deckent_start')` fails.

- [ ] **Step 3: Add the message key**

In `src/cli/helpers/messages.ts`, add inside the `MESSAGES` object (e.g. right after the `'docs.track.check_violations'` entry, before the closing `};`):

```typescript
  'mcp.writer_lease.denied': {
    en: "Write tool '{tool}' is held by another deckent window (pid {pid}). Read tools work here; mutations run in that window — the lease transfers automatically when it exits.",
    tr: "'{tool}' yazma aracı başka bir deckent penceresinde (pid {pid}) kilitli. Okuma araçları burada çalışır; değişiklikler o pencerede yürür — pencere kapanınca yetki otomatik devrolur.",
  },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/cli/messages-writer-lease.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/cli/helpers/messages.ts tests/cli/messages-writer-lease.test.ts
git commit -m "feat(i18n): mcp.writer_lease.denied message (en/tr) for MCP-W1 gate"
```

---

### Task 3: Annotation fixes (truthful write/read classification)

**Files:**
- Modify: `src/mcp/tools/plan.ts` (the `annotations` object — `readOnlyHint: true → false`)
- Modify: `src/mcp/tools/process.ts` (add `annotations` to the `registerTool` config)
- Modify: `src/mcp/tools/nervous.ts` (per-sub-tool annotations — see below)
- Test: `tests/mcp/tool-annotations.test.ts`

**Interfaces:**
- Consumes: each `registerXTool(server)` calls `server.registerTool(name, config, cb)` — the test captures `config.annotations.readOnlyHint`.
- Produces: `deckent_plan`, `deckent_process`, `deckent_nervous_accept`, `deckent_nervous_reject`, `deckent_nervous_config` register with `readOnlyHint:false`; `deckent_nervous_subscribe`, `deckent_nervous_status` with `readOnlyHint:true`.

- [ ] **Step 1: Write the failing test**

Create `tests/mcp/tool-annotations.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerPlanTool } from '../../src/mcp/tools/plan.js';
import { registerProcessTool } from '../../src/mcp/tools/process.js';
import { registerNervousTools } from '../../src/mcp/tools/nervous.js';

function captureAnnotations(register: (s: McpServer) => void): Map<string, boolean | undefined> {
  const hints = new Map<string, boolean | undefined>();
  const stub = {
    registerTool: (name: string, config: { annotations?: { readOnlyHint?: boolean } }) => {
      hints.set(name, config.annotations?.readOnlyHint);
      return {};
    },
  } as unknown as McpServer;
  register(stub);
  return hints;
}

describe('tool annotations — truthful write/read classification (MCP-W1)', () => {
  it('deckent_plan is a write tool (readOnlyHint:false — it writes .tasks/)', () => {
    expect(captureAnnotations(registerPlanTool).get('deckent_plan')).toBe(false);
  });

  it('deckent_process is a write tool (readOnlyHint:false)', () => {
    expect(captureAnnotations(registerProcessTool).get('deckent_process')).toBe(false);
  });

  it('nervous sub-tools carry correct read/write hints', () => {
    const hints = captureAnnotations(registerNervousTools);
    expect(hints.get('deckent_nervous_subscribe')).toBe(true);
    expect(hints.get('deckent_nervous_status')).toBe(true);
    expect(hints.get('deckent_nervous_accept')).toBe(false);
    expect(hints.get('deckent_nervous_reject')).toBe(false);
    expect(hints.get('deckent_nervous_config')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/mcp/tool-annotations.test.ts`
Expected: FAIL — `deckent_plan` is currently `true`; `deckent_process` has no annotations (`undefined`); nervous hints may be wrong/missing.

- [ ] **Step 3: Fix `plan.ts`**

In `src/mcp/tools/plan.ts`, change the `annotations` line so `readOnlyHint` is `false`:

```typescript
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
```

- [ ] **Step 4: Fix `process.ts`**

In `src/mcp/tools/process.ts`, add an `annotations` field to the `registerTool` config object (alongside `title`/`description`/`inputSchema`):

```typescript
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
```

- [ ] **Step 5: Audit `nervous.ts` annotations**

In `src/mcp/tools/nervous.ts`, ensure each `server.registerTool(...)` config has the correct `annotations.readOnlyHint`:
- `deckent_nervous_subscribe` → `readOnlyHint: true`
- `deckent_nervous_status` → `readOnlyHint: true`
- `deckent_nervous_accept` → `readOnlyHint: false`
- `deckent_nervous_reject` → `readOnlyHint: false`
- `deckent_nervous_config` → `readOnlyHint: false`

(Add the `annotations` object where missing; correct the value where present. Pattern: `annotations: { readOnlyHint: <bool>, destructiveHint: false, idempotentHint: <true for reads> }`.)

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/mcp/tool-annotations.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Regression — existing nervous/plan/process suites still green**

Run: `npx vitest run tests/mcp/`
Expected: PASS (no regressions from the annotation edits).

- [ ] **Step 8: Commit**

```bash
git add src/mcp/tools/plan.ts src/mcp/tools/process.ts src/mcp/tools/nervous.ts tests/mcp/tool-annotations.test.ts
git commit -m "fix(mcp): truthful readOnlyHint — plan/process are writes, nervous sub-tools audited (MCP-W1)"
```

---

### Task 4: Writer-lease gate (`writer-lease-gate.ts`)

**Files:**
- Create: `src/mcp/writer-lease-gate.ts`
- Test: `tests/mcp/writer-lease-gate.test.ts`

**Interfaces:**
- Consumes: `acquireOrCheckWriterLease`, `LeaseOpts` (Task 1); `getMessage` (`../cli/helpers/messages.js`); `formatErrorResponse`, `wrapResponse` (`./helpers/format.js`).
- Produces:
  - `interface WriterLeaseGateContext { projectRoot: string; lang: string; ttlMs?: number; isAlive?: (pid:number)=>boolean; now?: () => number }`
  - `WRITE_ACTION_PREDICATES: Record<string, (args: any) => boolean>`
  - `isWriteCall(toolName: string, args: unknown): boolean`
  - `buildLeaseDenialResponse(toolName: string, ownerPid: number, lang: string): { content: {type:'text';text:string}[]; isError: true }`
  - `installWriterLeaseGate(server: McpServer, ctx: WriterLeaseGateContext): void`

- [ ] **Step 1: Write the failing tests**

Create `tests/mcp/writer-lease-gate.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  isWriteCall,
  buildLeaseDenialResponse,
  installWriterLeaseGate,
} from '../../src/mcp/writer-lease-gate.js';

const dirs: string[] = [];
function sandbox(): string {
  const d = mkdtempSync(join(tmpdir(), 'wgate-'));
  dirs.push(d);
  mkdirSync(join(d, '.deckent'), { recursive: true });
  return d;
}
function seedOtherOwner(root: string, pid: number): void {
  const iso = new Date(1_700_000_000_000).toISOString();
  writeFileSync(
    join(root, '.deckent', 'mcp-writer.lease'),
    JSON.stringify({ pid, acquiredAt: iso, heartbeatAt: iso, ttlMs: 120_000 }),
    'utf-8',
  );
}
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

// Minimal stub that captures the (possibly gated) handler per tool name.
function makeStub() {
  const handlers = new Map<string, (args: unknown, extra: unknown) => Promise<unknown>>();
  const server = {
    registerTool: (name: string, _config: unknown, cb: (a: unknown, e: unknown) => Promise<unknown>) => {
      handlers.set(name, cb);
      return {};
    },
  } as unknown as McpServer;
  return { server, handlers };
}

describe('isWriteCall', () => {
  it('non-mixed write tools are always writes', () => {
    expect(isWriteCall('deckent_start', {})).toBe(true);
  });
  it('config read is not a write; config set is', () => {
    expect(isWriteCall('deckent_config', { action: 'read' })).toBe(false);
    expect(isWriteCall('deckent_config', { action: 'set' })).toBe(true);
  });
  it('docs list is read; docs track-scan is write', () => {
    expect(isWriteCall('deckent_docs', { action: 'list' })).toBe(false);
    expect(isWriteCall('deckent_docs', { action: 'track-scan' })).toBe(true);
  });
});

describe('buildLeaseDenialResponse', () => {
  it('returns a non-throwing tool result with code + ownerPid', () => {
    const res = buildLeaseDenialResponse('deckent_start', 4242, 'en');
    expect(res.isError).toBe(true);
    const text = res.content[0]!.text;
    expect(text).toContain('WRITER_LEASE_DENIED');
    expect(text).toContain('4242');
  });
});

describe('installWriterLeaseGate', () => {
  it('read tools (readOnlyHint:true) run ungated even when another window holds the lease', async () => {
    const root = sandbox();
    seedOtherOwner(root, 999_010);
    const { server, handlers } = makeStub();
    installWriterLeaseGate(server, { projectRoot: root, lang: 'en', isAlive: () => true });
    server.registerTool('deckent_status', { annotations: { readOnlyHint: true } }, async () => 'ran');
    await expect(handlers.get('deckent_status')!({}, {})).resolves.toBe('ran');
  });

  it('write tool is denied when another live window owns the lease', async () => {
    const root = sandbox();
    seedOtherOwner(root, 999_011);
    const { server, handlers } = makeStub();
    installWriterLeaseGate(server, { projectRoot: root, lang: 'en', isAlive: () => true, now: () => 1_700_000_001_000 });
    server.registerTool('deckent_start', { annotations: { readOnlyHint: false } }, async () => 'ran');
    const out = await handlers.get('deckent_start')!({}, {}) as { isError?: boolean; content: { text: string }[] };
    expect(out.isError).toBe(true);
    expect(out.content[0]!.text).toContain('WRITER_LEASE_DENIED');
  });

  it('write tool runs after handover (owner dead → steal)', async () => {
    const root = sandbox();
    seedOtherOwner(root, 999_012);
    const { server, handlers } = makeStub();
    installWriterLeaseGate(server, { projectRoot: root, lang: 'en', isAlive: () => false });
    server.registerTool('deckent_start', { annotations: { readOnlyHint: false } }, async () => 'ran');
    await expect(handlers.get('deckent_start')!({}, {})).resolves.toBe('ran');
  });

  it('mixed tool read action runs even when lease is held', async () => {
    const root = sandbox();
    seedOtherOwner(root, 999_013);
    const { server, handlers } = makeStub();
    installWriterLeaseGate(server, { projectRoot: root, lang: 'en', isAlive: () => true });
    server.registerTool('deckent_config', { annotations: { readOnlyHint: false } }, async (a: unknown) => `ran:${(a as { action: string }).action}`);
    await expect(handlers.get('deckent_config')!({ action: 'read' }, {})).resolves.toBe('ran:read');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/mcp/writer-lease-gate.test.ts`
Expected: FAIL — module `src/mcp/writer-lease-gate.js` does not exist.

- [ ] **Step 3: Implement `src/mcp/writer-lease-gate.ts`**

```typescript
/**
 * Writer-lease gate (MCP-W1). Single choke-point installed over
 * server.registerTool: any tool registered with readOnlyHint:false has its
 * handler wrapped with a writer-lease check. Mixed read/write tools get a
 * per-action predicate so their read actions stay ungated. Denials are
 * graceful tool-results — the gate never throws to the transport (no -32000).
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { acquireOrCheckWriterLease, type LeaseOpts } from './writer-lease.js';
import { getMessage } from '../cli/helpers/messages.js';
import { formatErrorResponse, wrapResponse } from './helpers/format.js';

export interface WriterLeaseGateContext {
  projectRoot: string;
  lang: string;
  ttlMs?: number;
  isAlive?: (pid: number) => boolean;
  now?: () => number;
}

// Per-action write predicates for MIXED tools (one tool, both read and write
// actions). A gated tool NOT listed here is always a write.
// Action strings mirror each tool's inputSchema enum — verify on edit.
export const WRITE_ACTION_PREDICATES: Record<string, (args: any) => boolean> = {
  deckent_config: (a) => a?.action === 'set',
  deckent_docs: (a) => ['add', 'remove', 'update', 'run', 'track-scan'].includes(a?.action),
  deckent_autonomous: (a) =>
    ['start', 'stop', 'backlog_add', 'backlog_remove', 'approve', 'reject'].includes(a?.action),
  deckent_nervous_config: (a) => ['set_preset', 'set_override', 'reset'].includes(a?.action),
};

export function isWriteCall(toolName: string, args: unknown): boolean {
  const predicate = WRITE_ACTION_PREDICATES[toolName];
  return predicate ? predicate(args) : true;
}

export function buildLeaseDenialResponse(
  toolName: string,
  ownerPid: number,
  lang: string,
): { content: { type: 'text'; text: string }[]; isError: true } {
  const message = getMessage('mcp.writer_lease.denied', lang, { tool: toolName, pid: String(ownerPid) });
  const errData = { error: true, success: false, code: 'WRITER_LEASE_DENIED', ownerPid, message };
  const errSummary = formatErrorResponse({ code: 'WRITER_LEASE_DENIED', message });
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(wrapResponse(errData, errSummary)) }],
    isError: true,
  };
}

export function installWriterLeaseGate(server: McpServer, ctx: WriterLeaseGateContext): void {
  type RegisterFn = (name: string, config: any, cb: any) => unknown;
  const original = (server.registerTool as RegisterFn).bind(server);
  const leaseOpts: LeaseOpts = { ttlMs: ctx.ttlMs, isAlive: ctx.isAlive, now: ctx.now };

  (server as { registerTool: RegisterFn }).registerTool = (name, config, cb) => {
    const readOnly = config?.annotations?.readOnlyHint === true;
    if (readOnly) return original(name, config, cb);

    const gated = async (args: unknown, extra: unknown): Promise<unknown> => {
      if (!isWriteCall(name, args)) return cb(args, extra);
      const lease = acquireOrCheckWriterLease(ctx.projectRoot, leaseOpts);
      if (!lease.ok) return buildLeaseDenialResponse(name, lease.ownerPid, ctx.lang);
      return cb(args, extra);
    };
    return original(name, config, gated);
  };
}
```

> `formatErrorResponse(data)` accepts `{ code?, message? }` (see `src/mcp/helpers/format.ts:256`); `wrapResponse(data, summary)` wraps any data with a summary (`:278`). Both are already used by `tools/start.ts`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/mcp/writer-lease-gate.test.ts`
Expected: PASS (all `isWriteCall`, `buildLeaseDenialResponse`, `installWriterLeaseGate` cases).

- [ ] **Step 5: Typecheck**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/mcp/writer-lease-gate.ts tests/mcp/writer-lease-gate.test.ts
git commit -m "feat(mcp): writer-lease gate — per-action predicates + graceful denial (MCP-W1)"
```

---

### Task 5: Wire gate into `createServer`, remove the boot singleton

**Files:**
- Modify: `src/mcp/server.ts` (install gate in `createServer`; resolve lang in `main`; install lease release hooks; remove `bootSingletonGuard` + `installSingletonReleaseHooks` + singleton imports + the `main()` call)
- Modify: `tests/orchestra/brain-crash-injection.test.ts` (remove the singleton imports + the whole `S3: Double-MCP singleton race` test block — it asserts the retired behavior)
- Delete: `src/mcp/server-singleton-lock.ts`
- Delete: `tests/mcp/server-singleton.test.ts`
- Test: `tests/mcp/server-boot-no-singleton.test.ts`

**Interfaces:**
- Consumes: `installWriterLeaseGate`, `WriterLeaseGateContext` (Task 4); `installWriterLeaseReleaseHooks`, `acquireOrCheckWriterLease` (Task 1); `getLanguage` (`../cli/helpers/messages.js`); `loadConfig` (`../core/config.js`).
- Produces: `createServer(ctx?: Partial<WriterLeaseGateContext>): McpServer` (gate installed before `registerTools`); `main()` no longer calls any singleton guard.

- [ ] **Step 1: Write the failing test**

Create `tests/mcp/server-boot-no-singleton.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireOrCheckWriterLease } from '../../src/mcp/writer-lease.js';

const dirs: string[] = [];
function sandbox(): string {
  const d = mkdtempSync(join(tmpdir(), 'boot-'));
  dirs.push(d);
  mkdirSync(join(d, '.deckent'), { recursive: true });
  return d;
}
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('MCP boot is no longer a whole-server singleton (MCP-W1)', () => {
  it('the singleton-lock module is gone', async () => {
    await expect(import('../../src/mcp/server-singleton-lock.js')).rejects.toThrow();
  });

  it('two boot-equivalent lease acquisitions never throw (no SingletonLockError)', () => {
    const root = sandbox();
    // First "window" acquires; a second self-acquire just refreshes — boot never throws.
    expect(() => acquireOrCheckWriterLease(root)).not.toThrow();
    expect(() => acquireOrCheckWriterLease(root)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/mcp/server-boot-no-singleton.test.ts`
Expected: FAIL — `server-singleton-lock.js` still imports successfully (module not yet deleted).

- [ ] **Step 3: Edit `src/mcp/server.ts`**

1. Replace the singleton imports block (lines ~13-18) and the `MCP_SERVER_PID_FILE` constant — remove them. Add:

```typescript
import { installWriterLeaseGate, type WriterLeaseGateContext } from './writer-lease-gate.js';
import { installWriterLeaseReleaseHooks } from './writer-lease.js';
import { getLanguage } from '../cli/helpers/messages.js';
import { loadConfig } from '../core/config.js';
```

2. Change `createServer` to accept context and install the gate **before** `registerTools`:

```typescript
export function createServer(ctx?: Partial<WriterLeaseGateContext>): McpServer {
  const server = new McpServer(
    { name: 'deckent', version: DECKENT_VERSION },
    { instructions: DECKENT_MCP_INSTRUCTIONS },
  );

  const gateCtx: WriterLeaseGateContext = {
    projectRoot: ctx?.projectRoot ?? process.cwd(),
    lang: ctx?.lang ?? getLanguage(),
    ttlMs: ctx?.ttlMs,
  };
  installWriterLeaseGate(server, gateCtx);

  registerTools(server);
  registerResources(server);

  mcpNotifyAdapter = new McpNotificationAdapter(server);
  try {
    initializeNotifyDispatcher(server, process.cwd());
  } catch (err) {
    process.stderr.write(
      `deckent-mcp: notify dispatcher init failed: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }
  return server;
}
```

3. Delete the `bootSingletonGuard`, `installSingletonReleaseHooks`, and `singletonReleaseHooksInstalled` definitions.

4. Replace `main()`:

```typescript
async function main(): Promise<void> {
  const root = process.cwd();
  let lang = 'en';
  try {
    const config = await loadConfig(root);
    lang = getLanguage(config.language);
  } catch {
    // default 'en' — config load is best-effort for the denial locale
  }
  installWriterLeaseReleaseHooks(root);
  const server = createServer({ projectRoot: root, lang });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
```

- [ ] **Step 4: Delete the singleton files**

```bash
git rm src/mcp/server-singleton-lock.ts tests/mcp/server-singleton.test.ts
```

- [ ] **Step 5: Remove the retired singleton test from `brain-crash-injection.test.ts`**

`tests/orchestra/brain-crash-injection.test.ts` imports `acquireSingletonLock, releaseSingletonLock, SingletonLockError` from `server-singleton-lock.js` (lines ~124-125) and has a `S3: Double-MCP singleton race` test block (lines ~291-308) asserting `acquireSingletonLock` throws `SingletonLockError`. That behavior is **retired** by MCP-W1 — double-window coexistence + handover is now covered by the writer-lease tests. So:

1. Delete the import block:

```typescript
// REMOVE these lines:
//   acquireSingletonLock, releaseSingletonLock, SingletonLockError,
// } from '../../src/mcp/server-singleton-lock.js';
```

2. Delete the entire `it('S3: Double-MCP — second acquireSingletonLock throws SingletonLockError (T-006)', ...)` block (and the `S3` section comment).
3. Grep the file to confirm zero remaining references to `acquireSingletonLock` / `releaseSingletonLock` / `SingletonLockError` / `server-singleton-lock`.

- [ ] **Step 6: Run the new test + typecheck**

Run: `npx vitest run tests/mcp/server-boot-no-singleton.test.ts`
Expected: PASS (2 tests).

Run: `npm run lint`
Expected: no errors (no dangling singleton references).

- [ ] **Step 7: Regression — full MCP suite + the touched orchestra test**

Run: `npx vitest run tests/mcp/ tests/orchestra/brain-crash-injection.test.ts`
Expected: PASS — no `server-singleton` references remain; brain-crash-injection still green.

- [ ] **Step 8: Commit**

```bash
git add src/mcp/server.ts tests/mcp/server-boot-no-singleton.test.ts tests/orchestra/brain-crash-injection.test.ts
git commit -m "feat(mcp): remove boot singleton, wire writer-lease gate + release hooks (MCP-W1)"
```

---

## Final Verification (after all tasks)

- [ ] `npm run lint` — tsc --noEmit clean.
- [ ] `npx vitest run tests/mcp/ tests/cli/messages-writer-lease.test.ts tests/orchestra/brain-crash-injection.test.ts` — all green.
- [ ] **Real-binary multi-window smoke** (proof-of-function, the actual `-32000` repro): build, then start two MCP server instances against the same project root and confirm both boot (no `process.exit(2)`), reads succeed on both, and a write on the non-owner returns `WRITER_LEASE_DENIED` (not a `-32000` transport error). Document the commands + observed output. Example:

```bash
npm run build
# window A
node dist/mcp/server.js   # boots, acquires lease on first write
# window B (separate shell, same cwd)
node dist/mcp/server.js   # ALSO boots (previously exited 2 → -32000)
# Drive a read tool on B → ok; a write tool on B while A holds lease → WRITER_LEASE_DENIED
```

(Since `deckent_status`/`deckent_start` go through stdio JSON-RPC, drive them with an MCP client harness or `deckent`'s own MCP registration — `/mcp restart` after build is Alperen's step.)

- [ ] `git branch -vv` before any push (shared-worktree HEAD-drift guard); push only when Alperen asks.

## Self-Review (plan vs spec)

- **Spec coverage:** §A writer-lease → Task 1. §B gate + predicates → Task 4 (in its own `writer-lease-gate.ts`, called from `createServer` — see deviation). §C annotation fixes → Task 3. §D server wiring → Task 5. §E deletions → Task 5. §F i18n → Task 2. §G config knob → **deferred (documented in Global Constraints)**. Data-flow, error-handling (fail-open, no-`-32000`), and the full test matrix → Tasks 1/4 + Final Verification smoke.
- **Deviations from spec (intentional, within spec intent):**
  1. The gate lives in a new `src/mcp/writer-lease-gate.ts` and is installed from `createServer` (server.ts) — **`src/mcp/tools/index.ts` is NOT modified**. This preserves the spec's "single choke-point" while keeping `index.ts` untouched and the gate independently testable (smaller blast radius).
  2. Spec §G config knob deferred (YAGNI) — ttl is a constant + param.
  3. `config.ts` is therefore NOT modified (it was listed in the spec's file scope only for §G).
- **Placeholder scan:** none — every code step shows complete code; the one "verify action strings against enum" note refers to concrete values already listed.
- **Type consistency:** `acquireOrCheckWriterLease(projectRoot, opts)` / `LeaseResult` / `LeaseOpts` are defined in Task 1 and consumed unchanged in Tasks 4-5; `WriterLeaseGateContext` defined in Task 4, consumed in Task 5; `isProcessAlive` defined in Task 1, re-pointed in Task 5; message key `'mcp.writer_lease.denied'` defined in Task 2, consumed in Task 4. Consistent across tasks.
