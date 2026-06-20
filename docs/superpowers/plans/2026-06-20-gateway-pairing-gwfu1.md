# Gateway Pairing & Per-Project Authorization (GW-FU1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the gateway's `isAuthorized: () => true` stub with a real per-project chat allowlist + an openclaw-style pairing flow, so an unpaired chat cannot bind to or message a project. Removes the "gateway must not be exposed" caveat from ADR-091.

**Architecture:** A new `gateway-access.ts` owns two disk-backed stores under the gateway home: an **allowlist** (`{ [projectPath]: chatKey[] }`) and **pending pairings** (`{ [code]: { chatKey, requestedAt } }`). The router gates BOTH `/use` (binding) and the message path with `isAuthorized`; an unauthorized `/use` triggers a pairing code instead of binding. A new `gateway pair list|approve|reject` CLI lets the owner approve a code, moving the chat onto a project's allowlist.

**Tech Stack:** TypeScript ESM (Node16, `.js` imports), Node ≥24, vitest, commander, `node:crypto` (randomInt for codes — built-in).

> Builds on G1 (ADR-091). G1 modules already exist in `src/connectors/gateway/`.

## Global Constraints

- ESM imports MUST use the `.js` extension.
- No new runtime dependency (Node built-ins only: `node:fs/promises`, `node:path`, `node:crypto`).
- i18n-first: every chat-facing/operator string via `getMessage(key, lang)` with en+tr. No hardcoded user-facing strings.
- Hermetic tests: file I/O under `os.tmpdir()`; gateway home overridden via `DECKENT_GATEWAY_HOME`; async fs only (no `*Sync`); inject `genCode`/`now` seams — no `Math.random`/`Date.now` in assertions.
- Atomic persist = write `<path>.tmp` then `rename` (mirror session-registry/project-registry).
- Gate before each commit: `npx tsc --noEmit` clean + the named test files GREEN (from the worktree root).
- Commits on `feat/gateway-pairing`; stage only the files each task creates/edits.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/connectors/gateway/gateway-access.ts` | AllowlistStore + PairingStore: `isAuthorized/authorize/revoke/requestPairing/approvePairing/rejectPairing/listPairings`, atomic persist, fail-safe load |
| `src/connectors/gateway/gateway-router.ts` (modify) | Gate `/use` + message path with `isAuthorized`; unauthorized `/use` → `requestPairing` reply |
| `src/connectors/gateway/gateway-daemon.ts` (modify) | Load `gateway-access`; pass real `isAuthorized` + `requestPairing` to the router |
| `src/cli/commands/gateway.ts` (modify) | `gateway pair list|approve <code> <project>|reject <code>` |
| `src/cli/helpers/messages.ts` (modify) | `gateway.pair_*` i18n keys (en+tr) |

Tests: `tests/connectors/gateway/gateway-access.test.ts`, update `tests/connectors/gateway/gateway-router.test.ts`, `tests/cli/gateway-pair.test.ts`.

---

## Task 1: gateway-access — allowlist + pairing stores

**Files:**
- Create: `src/connectors/gateway/gateway-access.ts`
- Test: `tests/connectors/gateway/gateway-access.test.ts`

**Interfaces:**
- Consumes: `gatewayHome()` from `./gateway-paths.js`.
- Produces:
  - `interface PendingPairing { code: string; chatKey: string; requestedAt: string }`
  - `interface GatewayAccess { isAuthorized(chatKey: string, projectPath: string): boolean; authorize(chatKey: string, projectPath: string): Promise<void>; revoke(chatKey: string, projectPath: string): Promise<void>; requestPairing(chatKey: string): Promise<string>; approvePairing(code: string, projectPath: string): Promise<{ chatKey: string } | null>; rejectPairing(code: string): Promise<boolean>; listPairings(): PendingPairing[] }`
  - `interface LoadGatewayAccessOptions { allowlistPath?: string; pairingsPath?: string; genCode?: () => string; now?: () => string }`
  - `loadGatewayAccess(opts?: LoadGatewayAccessOptions): Promise<GatewayAccess>`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/connectors/gateway/gateway-access.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadGatewayAccess } from '../../../src/connectors/gateway/gateway-access.js';

async function paths(): Promise<{ allowlistPath: string; pairingsPath: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'gw-access-'));
  return { allowlistPath: join(dir, 'allowlist.json'), pairingsPath: join(dir, 'pairings.json') };
}

describe('gateway-access', () => {
  it('denies by default, authorizes, persists across reload', async () => {
    const p = await paths();
    const a = await loadGatewayAccess(p);
    expect(a.isAuthorized('telegram:1', '/foo')).toBe(false);
    await a.authorize('telegram:1', '/foo');
    expect(a.isAuthorized('telegram:1', '/foo')).toBe(true);
    expect(a.isAuthorized('telegram:1', '/bar')).toBe(false); // per-project
    const a2 = await loadGatewayAccess(p);
    expect(a2.isAuthorized('telegram:1', '/foo')).toBe(true);
  });

  it('pairing: request → approve moves chat onto the project allowlist', async () => {
    const p = await paths();
    let n = 0;
    const a = await loadGatewayAccess({ ...p, genCode: () => `CODE${++n}`, now: () => '2026-06-20T00:00:00Z' });
    const code = await a.requestPairing('telegram:9');
    expect(code).toBe('CODE1');
    expect(a.listPairings()).toHaveLength(1);
    const res = await a.approvePairing(code, '/foo');
    expect(res?.chatKey).toBe('telegram:9');
    expect(a.isAuthorized('telegram:9', '/foo')).toBe(true);
    expect(a.listPairings()).toHaveLength(0); // consumed
    expect(await a.approvePairing(code, '/foo')).toBeNull(); // already consumed
  });

  it('requestPairing reuses the pending code for the same chat', async () => {
    const p = await paths();
    let n = 0;
    const a = await loadGatewayAccess({ ...p, genCode: () => `C${++n}` });
    const c1 = await a.requestPairing('telegram:5');
    const c2 = await a.requestPairing('telegram:5');
    expect(c1).toBe(c2);
    expect(a.listPairings()).toHaveLength(1);
  });

  it('rejectPairing removes a pending pairing', async () => {
    const p = await paths();
    const a = await loadGatewayAccess({ ...p, genCode: () => 'Z' });
    await a.requestPairing('telegram:3');
    expect(await a.rejectPairing('Z')).toBe(true);
    expect(a.listPairings()).toHaveLength(0);
    expect(await a.rejectPairing('Z')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/connectors/gateway/gateway-access.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/connectors/gateway/gateway-access.ts
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomInt } from 'node:crypto';
import { gatewayHome } from './gateway-paths.js';
import { join } from 'node:path';

export interface PendingPairing { code: string; chatKey: string; requestedAt: string }

export interface GatewayAccess {
  isAuthorized(chatKey: string, projectPath: string): boolean;
  authorize(chatKey: string, projectPath: string): Promise<void>;
  revoke(chatKey: string, projectPath: string): Promise<void>;
  requestPairing(chatKey: string): Promise<string>;
  approvePairing(code: string, projectPath: string): Promise<{ chatKey: string } | null>;
  rejectPairing(code: string): Promise<boolean>;
  listPairings(): PendingPairing[];
}

export interface LoadGatewayAccessOptions {
  allowlistPath?: string;
  pairingsPath?: string;
  genCode?: () => string;
  now?: () => string;
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try { return JSON.parse(await readFile(path, 'utf-8')) as T; } catch { return fallback; }
}
async function writeJson(path: string, obj: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(obj, null, 2), 'utf-8');
  await rename(tmp, path);
}

export async function loadGatewayAccess(opts: LoadGatewayAccessOptions = {}): Promise<GatewayAccess> {
  const allowlistPath = opts.allowlistPath ?? join(gatewayHome(), 'allowlist.json');
  const pairingsPath = opts.pairingsPath ?? join(gatewayHome(), 'pairings.json');
  const genCode = opts.genCode ?? ((): string => String(randomInt(100000, 1000000)));
  const now = opts.now ?? ((): string => new Date().toISOString());

  const allow = await readJson<Record<string, string[]>>(allowlistPath, {});
  const pairings = await readJson<Record<string, PendingPairing>>(pairingsPath, {});

  return {
    isAuthorized(chatKey, projectPath) {
      return (allow[projectPath] ?? []).includes(chatKey);
    },
    async authorize(chatKey, projectPath) {
      const list = allow[projectPath] ?? (allow[projectPath] = []);
      if (!list.includes(chatKey)) { list.push(chatKey); await writeJson(allowlistPath, allow); }
    },
    async revoke(chatKey, projectPath) {
      const list = allow[projectPath];
      if (!list) return;
      const i = list.indexOf(chatKey);
      if (i >= 0) { list.splice(i, 1); await writeJson(allowlistPath, allow); }
    },
    async requestPairing(chatKey) {
      const existing = Object.values(pairings).find((p) => p.chatKey === chatKey);
      if (existing) return existing.code;
      const code = genCode();
      pairings[code] = { code, chatKey, requestedAt: now() };
      await writeJson(pairingsPath, pairings);
      return code;
    },
    async approvePairing(code, projectPath) {
      const p = pairings[code];
      if (!p) return null;
      delete pairings[code];
      await writeJson(pairingsPath, pairings);
      const list = allow[projectPath] ?? (allow[projectPath] = []);
      if (!list.includes(p.chatKey)) { list.push(p.chatKey); await writeJson(allowlistPath, allow); }
      return { chatKey: p.chatKey };
    },
    async rejectPairing(code) {
      if (!pairings[code]) return false;
      delete pairings[code];
      await writeJson(pairingsPath, pairings);
      return true;
    },
    listPairings() { return Object.values(pairings); },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/connectors/gateway/gateway-access.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/connectors/gateway/gateway-access.ts tests/connectors/gateway/gateway-access.test.ts
git commit -m "feat(gateway): GW-FU1 T1 — gateway-access (allowlist + pairing stores)"
```

---

## Task 2: router wire — gate `/use` + pairing reply + i18n

**Files:**
- Modify: `src/connectors/gateway/gateway-router.ts`
- Modify: `src/cli/helpers/messages.ts` (add `gateway.pair_needed`, `gateway.pair_unauthorized`)
- Modify: `tests/connectors/gateway/gateway-router.test.ts` (add `requestPairing` to deps stub + 1 new test)

**Interfaces:**
- `GatewayRouterDeps` gains: `requestPairing: (chatKey: string) => Promise<string>` (alongside the existing `isAuthorized`).

- [ ] **Step 1: Add i18n keys to `messages.ts`**

```typescript
  'gateway.pair_needed': {
    tr: 'Bu sohbet {project} için yetkili değil. Eşleştirme kodu: {code}. Sahibi şunu çalıştırsın: deckent gateway pair approve {code} {project}',
    en: 'This chat is not authorized for {project}. Pairing code: {code}. Ask the owner to run: deckent gateway pair approve {code} {project}',
  },
```

- [ ] **Step 2: Update the router test (add deps stub + a new failing test)**

In `tests/connectors/gateway/gateway-router.test.ts`, add `requestPairing: async () => 'PAIR1'` to the `deps()` default `d` object. Then add this test:

```typescript
  it('/use by an unauthorized chat returns a pairing code and does NOT bind', async () => {
    const { d, sent } = await deps({ isAuthorized: () => false, requestPairing: async () => 'PAIR1' });
    makeGatewayRouter(d)(msg('/use foo'));
    await waitFor(() => sent.length > 0);
    expect(d.sessions.resolve(chatKeyOf('telegram', '42'))).toBeUndefined(); // NOT bound
    expect(sent[0]!.parts.join(' ')).toContain('PAIR1');
  });
```

(Keep the existing `/use foo` happy-path test, which uses the default `isAuthorized: () => true`.)

- [ ] **Step 3: Run the router test to verify the new test fails**

Run: `npx vitest run tests/connectors/gateway/gateway-router.test.ts`
Expected: the new pairing test FAILS (router still binds unconditionally); existing tests pass.

- [ ] **Step 4: Edit the router**

In `src/connectors/gateway/gateway-router.ts`:

(a) Add to `GatewayRouterDeps` (after the `isAuthorized` line):
```typescript
  requestPairing: (chatKey: string) => Promise<string>;
```

(b) Destructure it: change `const { sessions, projects, supervisor, send, isAuthorized, lang } = deps;` to include `requestPairing`:
```typescript
  const { sessions, projects, supervisor, send, isAuthorized, requestPairing, lang } = deps;
```

(c) In the `/use` case, gate binding with authorization — replace the bind+confirm block:
```typescript
      case '/use': {
        if (!arg) { await send(chatKey, [getMessage('gateway.use_usage', lang)]); return; }
        const proj = projects.resolve(arg);
        if (!proj) { await send(chatKey, [getMessage('gateway.use_unknown', lang, { name: arg })]); return; }
        if (!isAuthorized(chatKey, proj.path)) {
          const code = await requestPairing(chatKey);
          await send(chatKey, [getMessage('gateway.pair_needed', lang, { project: proj.name, code })]);
          return;
        }
        await sessions.bind(chatKey, proj.path, chatKey);
        await send(chatKey, [getMessage('gateway.bound_ok', lang, { project: proj.name })]);
        return;
      }
```

(The message-path `isAuthorized` guard at the existing line stays unchanged — defense in depth.)

- [ ] **Step 5: Run the router test to verify all pass**

Run: `npx vitest run tests/connectors/gateway/gateway-router.test.ts && npx tsc --noEmit`
Expected: all router tests PASS (5) + tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/connectors/gateway/gateway-router.ts src/cli/helpers/messages.ts tests/connectors/gateway/gateway-router.test.ts
git commit -m "feat(gateway): GW-FU1 T2 — gate /use with authorization + pairing reply"
```

---

## Task 3: daemon + CLI `gateway pair`

**Files:**
- Modify: `src/connectors/gateway/gateway-daemon.ts` (load access; pass real `isAuthorized` + `requestPairing`)
- Modify: `src/cli/commands/gateway.ts` (`gateway pair list|approve|reject`)
- Modify: `src/cli/helpers/messages.ts` (`gateway.pair_*` operator keys)
- Test: `tests/cli/gateway-pair.test.ts`

**Interfaces:**
- Consumes: `loadGatewayAccess` from `../../connectors/gateway/gateway-access.js`.

- [ ] **Step 1: Daemon — load access and wire the router (edit `gateway-daemon.ts`)**

Add the import:
```typescript
import { loadGatewayAccess } from './gateway-access.js';
```
In `startGatewayListen`, after the registries/supervisor are built and BEFORE constructing the router, add:
```typescript
  const access = await loadGatewayAccess();
```
Then change the `makeGatewayRouter({ ... })` call: replace `isAuthorized: () => true,` with:
```typescript
    isAuthorized: (chatKey, projectPath) => access.isAuthorized(chatKey, projectPath),
    requestPairing: (chatKey) => access.requestPairing(chatKey),
```

- [ ] **Step 2: Add operator i18n keys to `messages.ts`**

```typescript
  'gateway.pair_approved': {
    tr: 'Eşleştirme onaylandı: {chatKey} → {project}',
    en: 'Pairing approved: {chatKey} → {project}',
  },
  'gateway.pair_unknown_code': {
    tr: 'Bilinmeyen eşleştirme kodu: {code}',
    en: 'Unknown pairing code: {code}',
  },
  'gateway.pair_rejected': {
    tr: 'Eşleştirme reddedildi: {code}',
    en: 'Pairing rejected: {code}',
  },
  'gateway.pair_list_empty': {
    tr: 'Bekleyen eşleştirme yok.',
    en: 'No pending pairings.',
  },
  'gateway.pair_list_row': {
    tr: '• {code} — {chatKey} ({requestedAt})',
    en: '• {code} — {chatKey} ({requestedAt})',
  },
  'gateway.pair_usage': {
    tr: 'Kullanım: deckent gateway pair approve <code> <project> | reject <code> | list',
    en: 'Usage: deckent gateway pair approve <code> <project> | reject <code> | list',
  },
```

- [ ] **Step 3: Write the failing CLI test**

```typescript
// tests/cli/gateway-pair.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleGatewayPairApprove, handleGatewayPairList } from '../../src/cli/commands/gateway.js';
import { loadGatewayAccess } from '../../src/connectors/gateway/gateway-access.js';

describe('gateway pair CLI', () => {
  it('approve moves a pending pairing onto the project allowlist', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gw-pair-'));
    process.env['DECKENT_GATEWAY_HOME'] = dir;
    try {
      const access = await loadGatewayAccess();
      await access.requestPairing('telegram:77');
      const code = access.listPairings()[0]!.code;
      const out: string[] = [];
      await handleGatewayPairApprove({ code, project: '/proj', lang: 'en', print: (s) => out.push(s) });
      expect(out.join(' ')).toContain('telegram:77');
      const after = await loadGatewayAccess();
      expect(after.isAuthorized('telegram:77', '/proj')).toBe(true);
    } finally {
      delete process.env['DECKENT_GATEWAY_HOME'];
    }
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `npx vitest run tests/cli/gateway-pair.test.ts`
Expected: FAIL — `handleGatewayPairApprove` not exported.

- [ ] **Step 5: Implement the `gateway pair` handlers + subcommand in `gateway.ts`**

Add near the top imports:
```typescript
import { loadGatewayAccess } from '../../connectors/gateway/gateway-access.js';
```
Add exported handlers (so they are unit-testable):
```typescript
export async function handleGatewayPairList(opts: { lang?: string; print?: (s: string) => void } = {}): Promise<void> {
  const lang = getLanguage(opts.lang);
  const print = opts.print ?? ((s: string): void => console.log(s));
  const access = await loadGatewayAccess();
  const pending = access.listPairings();
  if (pending.length === 0) { print(getMessage('gateway.pair_list_empty', lang)); return; }
  for (const p of pending) print(getMessage('gateway.pair_list_row', lang, { code: p.code, chatKey: p.chatKey, requestedAt: p.requestedAt }));
}

export async function handleGatewayPairApprove(opts: { code: string; project: string; lang?: string; print?: (s: string) => void }): Promise<void> {
  const lang = getLanguage(opts.lang);
  const print = opts.print ?? ((s: string): void => console.log(s));
  const access = await loadGatewayAccess();
  const res = await access.approvePairing(opts.code, opts.project);
  print(res
    ? getMessage('gateway.pair_approved', lang, { chatKey: res.chatKey, project: opts.project })
    : getMessage('gateway.pair_unknown_code', lang, { code: opts.code }));
}

export async function handleGatewayPairReject(opts: { code: string; lang?: string; print?: (s: string) => void }): Promise<void> {
  const lang = getLanguage(opts.lang);
  const print = opts.print ?? ((s: string): void => console.log(s));
  const access = await loadGatewayAccess();
  const ok = await access.rejectPairing(opts.code);
  print(ok ? getMessage('gateway.pair_rejected', lang, { code: opts.code }) : getMessage('gateway.pair_unknown_code', lang, { code: opts.code }));
}
```
Register the `pair` subcommand group inside `registerGateway`, after the `status` subcommand:
```typescript
  const pair = cmd.command('pair').description(getMessage('gateway.pair_usage', getLanguage(undefined)));
  pair.command('list').option('--lang <code>', 'Language override (en|tr)')
    .action(async (opts: { lang?: string }) => { await handleGatewayPairList(opts); });
  pair.command('approve <code> <project>').option('--lang <code>', 'Language override (en|tr)')
    .action(async (code: string, project: string, opts: { lang?: string }) => { await handleGatewayPairApprove({ code, project, lang: opts.lang }); });
  pair.command('reject <code>').option('--lang <code>', 'Language override (en|tr)')
    .action(async (code: string, opts: { lang?: string }) => { await handleGatewayPairReject({ code, lang: opts.lang }); });
```

- [ ] **Step 6: Run tests + lint**

Run: `npx vitest run tests/cli/gateway-pair.test.ts tests/cli/gateway.test.ts tests/connectors/gateway && npx tsc --noEmit`
Expected: all PASS + tsc clean.

- [ ] **Step 7: Commit**

```bash
git add src/connectors/gateway/gateway-daemon.ts src/cli/commands/gateway.ts src/cli/helpers/messages.ts tests/cli/gateway-pair.test.ts
git commit -m "feat(gateway): GW-FU1 T3 — daemon access-wire + gateway pair CLI (list/approve/reject)"
```

---

## Task 4: ADR note + Tier-1 Smoke (build = user-coordinated)

- [ ] **Step 1: Whole-branch green check**

Run: `npx vitest run tests/connectors/gateway tests/cli/gateway.test.ts tests/cli/gateway-pair.test.ts && npx tsc --noEmit`
Expected: all GREEN + clean.

- [ ] **Step 2: ADR-091 consequence update (DB, after build — user-coordinated)**

After the user builds, append a note to ADR-091 in `memory.db` (via `store.upsert` or a follow-up entry) that the pairing/authorization gap is CLOSED by GW-FU1 (`gateway-access` allowlist + `gateway pair` CLI); `isAuthorized` is now allowlist-backed. Then `deckent memory export` (only when `.brain/exports` is clean).

- [ ] **Step 3: Tier-1 Smoke (real binary — needs build)**

```bash
export DECKENT_GATEWAY_HOME="$(mktemp -d)"
node dist/cli/entry.js gateway pair list          # → "No pending pairings."
node dist/cli/entry.js gateway pair approve ZZZ /x # → "Unknown pairing code: ZZZ"
```
Expected: list shows empty; approve of a non-existent code reports unknown. Record actual stdout. (Full pair round-trip is covered by the hermetic unit test.)

- [ ] **Step 4: Commit any doc/Smoke evidence**

```bash
git add -A && git commit -m "docs(gateway): GW-FU1 — ADR-091 pairing-closed note + Smoke evidence"
```

---

## Self-Review

**Spec coverage:** allowlist (T1) · pairing stores (T1) · `/use` gated + pairing reply (T2) · message-path guard retained (T2) · daemon access-wire (T3) · `gateway pair` CLI (T3) · i18n en+tr (T2/T3) · Smoke (T4). ✅

**Placeholder scan:** none. Pairing code default uses `randomInt` (crypto, built-in); tests inject `genCode`.

**Type consistency:** `GatewayAccess` shape used identically in T1 (produce), T2 (router consumes `requestPairing`), T3 (daemon consumes `isAuthorized`+`requestPairing`, CLI consumes the store). `requestPairing(chatKey) => Promise<string>` consistent across router deps + access.

## Out of scope (GW-FU2/3)

`/pending` (parked-approval list) · approval-callback resolution (button → bound runtime parked-action) · idle-evict — these remain the next gateway follow-ups. grammY/webhook = G2; voice/streaming = Faz 1.
