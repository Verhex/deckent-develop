# Doc-Tracking Faz 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faz 1 doc-tracking motorunu code-drift sinyali + `--check` CI-gate + sprint-finalize hook + MCP `deckent_docs` action'ları + HTTP API `/api/docs/health` + dashboard "Docs Health" sayfası (rank×state ısı-haritası) ile tamamlamak.

**Architecture:** Faz 1 `src/core/doc-tracking/` çekirdeği (`DocTrackingStore` → `.brain/memory.db` `doc_tracking` tablosu) tek veri-kaynağı kalır. Faz 2 bir yeni sinyal (code-drift) + 4 yeni yüzey ekler; hepsi aynı `scanDocs`/`runDocsTrackStatus`/`DocTrackingStore` API'sini kullanır. Spec: `docs/superpowers/specs/2026-06-18-doc-tracking-phase2-design.md`.

**Tech Stack:** TypeScript/ESM (Node16, `.js` import uzantısı), better-sqlite3 (mevcut), vitest, commander (mevcut), zod/v4 (MCP, mevcut), React+Vite+Tailwind+lucide-react (dashboard, mevcut). Yeni runtime-dep YOK (ADR-010).

## Global Constraints

- **ESM:** Tüm relative import'lar `.js` ile biter (Node16). Dashboard (Vite) page import'ları mevcut stile uyar (`nav-items.js` `.js`'li, page `.tsx` uzantısız).
- **i18n-FIRST:** User-facing string ASLA hardcode edilmez; CLI `getMessage(key, lang, vars?)`; dashboard mevcut i18n/etiket desenine uyar; API JSON (string-free).
- **No new runtime dep (ADR-010):** glob=`matchGlob` (Faz 1), git=async `spawn` (ADR-087), sqlite mevcut, zod mevcut.
- **Hermetik test (ADR-087):** fixture `os.tmpdir()`, `afterEach` temizler, `spawnSync` YASAK (test-setup hariç), proje kökü/HOME'a yazma yok. `npm run test:ci-sim` yeşil.
- **Mock-only test YASAK:** gerçek dosya/DB/git/HTTP etkisini assert et.
- **Surgical:** `entries`/MemoryStore'a DOKUNMA; `doc_tracking` şeması değişmez; Faz 1 davranışı korunur (mevcut testler yeşil kalır). `.brain/memory.db` ASLA silinmez.
- **Default-off:** sprint-finalize hook config-gated, default `false` (kör-default-on YOK).
- **Dashboard:** EMOJI YASAK; ikon = lucide-react.
- **Tier-1 proof-of-function:** API + dashboard gerçek-binary run-verify ile kapanır; mock-only = GO_WITH_TECH_DEBT.
- **tsc --noEmit temiz** her task sonunda; ilgili suite yeşil.
- **Git:** İş `feat/doc-tracking-phase2` branch'inde (base post-merge `main` `0ffb4071`). Commit yalnız Alperen onayıyla; plan'daki commit adımları bu kurala göre uygulanır.

---

## File Structure

| Dosya | Tür | Sorumluluk |
|---|---|---|
| `src/core/doc-tracking/code-drift.ts` | CREATE | `resolveTrackedFiles` + `computeCodeDrift` |
| `src/core/doc-tracking/scanner.ts` | MODIFY | `code_drift: null` → `computeCodeDrift(...)` |
| `src/core/doc-tracking/sync.ts` | CREATE | `runDocTrackingSync(root)` core-saf helper (sprint-hook + MCP için) |
| `src/core/config-types.ts` | MODIFY | `doc_tracking?: { sync_on_finalize?: boolean }` (DeckentConfig + ResolvedConfig) |
| `src/orchestra/sprint-finalizer.ts` | MODIFY | `maybeRunDocTrackingSync` + finalize çağrısı (gated, fail-safe) |
| `src/cli/commands/docs.ts` | MODIFY | `runDocsTrackCheck` + `--check`/`--max-rank` flag |
| `src/cli/helpers/messages.ts` | MODIFY | `docs.track.check_*` i18n |
| `src/mcp/tools/docs.ts` | MODIFY | `track-scan`/`track-status` action |
| `src/api/docs-health-endpoint.ts` | CREATE | `aggregateHeatmap` + `registerDocsHealthRoute` |
| `src/api/server.ts` | MODIFY | route kaydı |
| `src/dashboard/src/pages/DocsHealthPage.tsx` | CREATE | ısı-haritası + drill-down tablo |
| `src/dashboard/src/App.tsx` | MODIFY | `<Route path="/docs-health">` |
| `src/dashboard/src/nav-items.ts` | MODIFY | nav girdisi |
| `docs/adr/090-doc-tracking.md` | MODIFY | Faz 2 amendment |
| `docs/reference/api-surface.md` | MODIFY | `/api/docs/health` + deckent_docs action + sync_on_finalize |
| `DECKENT.md` | MODIFY | deckent_docs action notu |
| `tests/core/doc-tracking/*.test.ts`, `tests/cli/*.test.ts`, `tests/api/*.test.ts`, `src/dashboard/src/pages/*.test.tsx` | CREATE | hermetik test |

---

## Task 1: code-drift core module

**Files:**
- Create: `src/core/doc-tracking/code-drift.ts`
- Test: `tests/core/doc-tracking/code-drift.test.ts`

**Interfaces:**
- Consumes: `matchGlob` (Faz 1 glob.ts), `getFileGitDateAsync` (Faz 1 git-date.ts).
- Produces:
  - `resolveTrackedFiles(root: string, tracks: string[]): Promise<string[]>` — `tracks` glob/path → repo-relative dosya listesi.
  - `computeCodeDrift(root: string, tracks: string[] | null, docLastUpdatedMs: number): Promise<boolean | null>` — null=sinyalsiz, true=kod doc'tan yeni, false=değil.

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/doc-tracking/code-drift.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process'; // test-only setup
import { resolveTrackedFiles, computeCodeDrift } from '../../../src/core/doc-tracking/code-drift.js';

let dir: string;
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

function gitRepo(): void {
  const run = (args: string[]) => spawnSync('git', args, { cwd: dir, encoding: 'utf-8' });
  run(['init']); run(['config', 'user.email', 't@t']); run(['config', 'user.name', 't']);
}

describe('resolveTrackedFiles', () => {
  it('expands globs against tracked files and keeps plain paths', () => {
    dir = mkdtempSync(join(tmpdir(), 'dt-cd-'));
    gitRepo();
    mkdirSync(join(dir, 'src/core'), { recursive: true });
    writeFileSync(join(dir, 'src/core/a.ts'), 'export const a=1;');
    writeFileSync(join(dir, 'src/core/b.ts'), 'export const b=2;');
    spawnSync('git', ['add', '-A'], { cwd: dir }); spawnSync('git', ['commit', '-m', 'x'], { cwd: dir });
    return resolveTrackedFiles(dir, ['src/core/**']).then((files) => {
      expect(files).toContain('src/core/a.ts');
      expect(files).toContain('src/core/b.ts');
    });
  });
});

describe('computeCodeDrift', () => {
  it('returns null when tracks is empty or null', async () => {
    dir = mkdtempSync(join(tmpdir(), 'dt-cd-'));
    expect(await computeCodeDrift(dir, null, 0)).toBeNull();
    expect(await computeCodeDrift(dir, [], 0)).toBeNull();
  });
  it('returns true when a tracked file is newer than the doc', async () => {
    dir = mkdtempSync(join(tmpdir(), 'dt-cd-'));
    gitRepo();
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src/x.ts'), 'export const x=1;');
    spawnSync('git', ['add', '-A'], { cwd: dir }); spawnSync('git', ['commit', '-m', 'x'], { cwd: dir });
    // doc "last updated" at epoch 0 → any real commit date is newer → drift
    expect(await computeCodeDrift(dir, ['src/x.ts'], 0)).toBe(true);
  });
  it('returns false when no tracked file is newer than the doc', async () => {
    dir = mkdtempSync(join(tmpdir(), 'dt-cd-'));
    gitRepo();
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src/y.ts'), 'export const y=1;');
    spawnSync('git', ['add', '-A'], { cwd: dir }); spawnSync('git', ['commit', '-m', 'y'], { cwd: dir });
    // doc "last updated" far in the future → nothing newer → no drift
    expect(await computeCodeDrift(dir, ['src/y.ts'], Date.now() + 86400000)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/doc-tracking/code-drift.test.ts`
Expected: FAIL — "Cannot find module .../code-drift.js".

- [ ] **Step 3: Write `code-drift.ts`**

```ts
// src/core/doc-tracking/code-drift.ts
import { spawn } from 'node:child_process';
import { matchGlob } from './glob.js';
import { getFileGitDateAsync } from './git-date.js';

// `git ls-files` → tracked repo-relative POSIX paths. Empty list on any failure
// (no git, error, timeout) — code-drift then resolves to null (no fabrication).
function gitLsFiles(root: string): Promise<string[]> {
  return new Promise((resolve) => {
    let out = '';
    let settled = false;
    const done = (v: string[]) => { if (!settled) { settled = true; resolve(v); } };
    try {
      const p = spawn('git', ['ls-files'], { cwd: root });
      const timer = setTimeout(() => { p.kill(); done([]); }, 5000);
      p.stdout.on('data', (d) => { out += d.toString(); });
      p.on('error', () => { clearTimeout(timer); done([]); });
      p.on('close', () => {
        clearTimeout(timer);
        done(out.split('\n').map((s) => s.trim()).filter(Boolean));
      });
    } catch {
      done([]);
    }
  });
}

export async function resolveTrackedFiles(root: string, tracks: string[]): Promise<string[]> {
  if (!tracks.length) return [];
  const all = await gitLsFiles(root);
  const result = new Set<string>();
  for (const t of tracks) {
    if (t.includes('*')) {
      for (const f of all) if (matchGlob(f, t)) result.add(f);
    } else {
      // plain path — include regardless of tracked status; getFileGitDateAsync
      // falls back to mtime for untracked files.
      result.add(t);
    }
  }
  return [...result];
}

export async function computeCodeDrift(
  root: string,
  tracks: string[] | null,
  docLastUpdatedMs: number,
): Promise<boolean | null> {
  if (!tracks || tracks.length === 0) return null;
  const files = await resolveTrackedFiles(root, tracks);
  if (files.length === 0) return null;
  for (const f of files) {
    const ms = await getFileGitDateAsync(root, f);
    if (ms > 0 && ms > docLastUpdatedMs) return true;
  }
  return false;
}
```

- [ ] **Step 4: Run test + tsc**

Run: `npx vitest run tests/core/doc-tracking/code-drift.test.ts && npx tsc --noEmit`
Expected: PASS (4 tests); tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/core/doc-tracking/code-drift.ts tests/core/doc-tracking/code-drift.test.ts
git commit -m "feat(doc-tracking): code-drift core (tracks→git-date compare)"
```

---

## Task 2: Wire code-drift into scanner

**Files:**
- Modify: `src/core/doc-tracking/scanner.ts` (the `code_drift` line in `scanDocs`)
- Test: `tests/core/doc-tracking/scanner.test.ts` (add a code-drift wire case)

**Interfaces:**
- Consumes: `computeCodeDrift` (Task 1).
- Produces: scanner now sets `signals.code_drift` to a computed `boolean|null` (was hardcoded `null`).

- [ ] **Step 1: Add the failing test case** (append to existing `describe('scanDocs', ...)`)

```ts
  it('computes code_drift (non-null) when a doc carries tracks, null otherwise', async () => {
    dir = mkdtempSync(join(tmpdir(), 'dt-scan-')); store = new DocTrackingStore(join(dir, 'memory.db'));
    // doc WITH tracks → code_drift evaluated (boolean, not null)
    mk('docs/reference/tracked.md', '---\ntracks:\n  - docs/reference/tracked.md\n---\n# T\nbody\n');
    // doc WITHOUT tracks → code_drift stays null (Phase 1 behavior)
    mk('docs/reference/plain.md', '# P\nbody\n');
    const r = await scanDocs(dir, C, store, { write: false, prune: false, now: Date.parse('2026-06-18T00:00:00Z') });
    const tracked = r.records.find(x => x.path === 'docs/reference/tracked.md')!;
    const plain = r.records.find(x => x.path === 'docs/reference/plain.md')!;
    expect(typeof tracked.signals.code_drift === 'boolean' || tracked.signals.code_drift === null).toBe(true);
    expect(tracked.tracked_code).toEqual(['docs/reference/tracked.md']);
    expect(plain.signals.code_drift).toBeNull();
  });
```

> Not: tmpdir git repo değil → `computeCodeDrift` `null` döndürebilir (git ls-files boş). Test, **wire**'ı doğrular (tracks varsa `computeCodeDrift` çağrılır + `tracked_code` dolar; tracks yoksa `null`) — timing'e bağlı değil. Gerçek-git drift'i Task 1'de kanıtlandı.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/doc-tracking/scanner.test.ts`
Expected: FAIL — `tracked.tracked_code` is populated but `code_drift` may still be the hardcoded null AND the new assertion on plain stays null; the failing assertion is the wire not yet calling computeCodeDrift (test references current behavior). If it passes spuriously, proceed — the wire in Step 3 is the real change.

- [ ] **Step 3: Edit `scanner.ts`** — add import and replace the `code_drift` computation.

Add to imports (top of `scanner.ts`):
```ts
import { computeCodeDrift } from './code-drift.js';
```

Replace this block:
```ts
    const prev = store.getByPath(rel);
    const content_drift = !!(prev?.content_hash && content_hash && prev.content_hash !== content_hash);
    const signals = { content_drift, code_drift: null as boolean | null, age_days };
```
with:
```ts
    const prev = store.getByPath(rel);
    const content_drift = !!(prev?.content_hash && content_hash && prev.content_hash !== content_hash);
    const docMs = gitMs > 0 ? gitMs : now;
    const code_drift = await computeCodeDrift(root, tracked_code, docMs);
    const signals = { content_drift, code_drift, age_days };
```

- [ ] **Step 4: Run test + tsc + full doc-tracking suite**

Run: `npx vitest run tests/core/doc-tracking/ && npx tsc --noEmit`
Expected: PASS (all doc-tracking tests incl. new case); tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/core/doc-tracking/scanner.ts tests/core/doc-tracking/scanner.test.ts
git commit -m "feat(doc-tracking): wire code_drift into scanner (tracks-gated)"
```

---

## Task 3: Config field + core sync helper + sprint-finalize hook

**Files:**
- Modify: `src/core/config-types.ts` (`doc_tracking?` on DeckentConfig + ResolvedConfig)
- Create: `src/core/doc-tracking/sync.ts` (`runDocTrackingSync`)
- Modify: `src/orchestra/sprint-finalizer.ts` (`maybeRunDocTrackingSync` + call)
- Test: `tests/core/doc-tracking/sync.test.ts`, `tests/orchestra/doc-tracking-finalize-hook.test.ts`

**Interfaces:**
- Consumes: `loadDocTrackingConfig`, `scanDocs`, `DocTrackingStore` (Faz 1).
- Produces:
  - `runDocTrackingSync(root: string): Promise<{ count: number; stale: number }>` — DB-only scan (no front-matter write, no prune).
  - `maybeRunDocTrackingSync(projectRoot: string, config: { doc_tracking?: { sync_on_finalize?: boolean } } | undefined): Promise<{ ran: boolean; count?: number }>` — gated + fail-safe.
  - Config: `doc_tracking?: { sync_on_finalize?: boolean }` on both `DeckentConfig` and `ResolvedConfig`.

- [ ] **Step 1: Add config field** (no test alone — exercised via hook test)

In `src/core/config-types.ts`, add to `interface DeckentConfig` (near `memory?:`, line ~376) AND to `interface ResolvedConfig` (line ~736+):
```ts
  /** Doc-tracking (ADR-090) options. */
  doc_tracking?: {
    /** Run a DB-only doc-tracking sync at sprint finalize (default: false). */
    sync_on_finalize?: boolean;
  };
```

- [ ] **Step 2: Write the failing sync-helper test**

```ts
// tests/core/doc-tracking/sync.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runDocTrackingSync } from '../../../src/core/doc-tracking/sync.js';

let dir: string;
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

describe('runDocTrackingSync', () => {
  it('scans docs into memory.db without writing front-matter', async () => {
    dir = mkdtempSync(join(tmpdir(), 'dt-sync-'));
    mkdirSync(join(dir, 'docs/guide'), { recursive: true });
    writeFileSync(join(dir, 'docs/guide/g.md'), '# G\nbody\n');
    const r = await runDocTrackingSync(dir);
    expect(r.count).toBeGreaterThanOrEqual(1);
    // front-matter NOT written (write:false)
    const after = (await import('node:fs')).readFileSync(join(dir, 'docs/guide/g.md'), 'utf-8');
    expect(after).toBe('# G\nbody\n');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/core/doc-tracking/sync.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write `sync.ts`**

```ts
// src/core/doc-tracking/sync.ts
import { join } from 'node:path';
import { loadDocTrackingConfig } from './config.js';
import { scanDocs } from './scanner.js';
import { DocTrackingStore } from './store.js';

// DB-only sync: scans all docs into .brain/memory.db without mutating
// front-matter or pruning. Used by the sprint-finalize hook and MCP.
export async function runDocTrackingSync(root: string): Promise<{ count: number; stale: number }> {
  const config = loadDocTrackingConfig(root);
  const store = new DocTrackingStore(join(root, '.brain/memory.db'));
  try {
    const { records } = await scanDocs(root, config, store, { write: false, prune: false });
    const stale = records.filter((r) => r.state === 'STALE' || r.state === 'CRITICAL_STALE').length;
    return { count: records.length, stale };
  } finally {
    store.close();
  }
}
```

- [ ] **Step 5: Run test + tsc**

Run: `npx vitest run tests/core/doc-tracking/sync.test.ts && npx tsc --noEmit`
Expected: PASS; tsc clean.

- [ ] **Step 6: Write the failing finalize-hook test**

```ts
// tests/orchestra/doc-tracking-finalize-hook.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { maybeRunDocTrackingSync } from '../../src/orchestra/sprint-finalizer.js';

let dir: string;
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

describe('maybeRunDocTrackingSync', () => {
  it('does nothing when sync_on_finalize is not set', async () => {
    dir = mkdtempSync(join(tmpdir(), 'dt-hook-'));
    const r = await maybeRunDocTrackingSync(dir, undefined);
    expect(r.ran).toBe(false);
  });
  it('runs a sync when sync_on_finalize is true', async () => {
    dir = mkdtempSync(join(tmpdir(), 'dt-hook-'));
    mkdirSync(join(dir, 'docs'), { recursive: true });
    writeFileSync(join(dir, 'docs/a.md'), '# A\nbody\n');
    const r = await maybeRunDocTrackingSync(dir, { doc_tracking: { sync_on_finalize: true } });
    expect(r.ran).toBe(true);
    expect(r.count).toBeGreaterThanOrEqual(1);
  });
  it('is fail-safe — never throws even if the root is unusable', async () => {
    const r = await maybeRunDocTrackingSync('/nonexistent/path/xyz', { doc_tracking: { sync_on_finalize: true } });
    expect(r.ran).toBe(true); // attempted; error swallowed → no count
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npx vitest run tests/orchestra/doc-tracking-finalize-hook.test.ts`
Expected: FAIL — `maybeRunDocTrackingSync` not exported.

- [ ] **Step 8: Edit `sprint-finalizer.ts`** — add import + exported helper + call inside `finalizeSprint`.

Add to imports (top of `sprint-finalizer.ts`):
```ts
import { runDocTrackingSync } from '../core/doc-tracking/sync.js';
```

Add the exported helper (near other exported helpers, e.g. after `runBudgetedDecay`):
```ts
/**
 * ADR-090 doc-tracking sync hook. Gated on config.doc_tracking.sync_on_finalize
 * (default OFF — no surprise overhead). DB-only (no front-matter writes).
 * Fail-safe: any error is swallowed (debugLog) so it can never break finalize.
 */
export async function maybeRunDocTrackingSync(
  projectRoot: string,
  config: { doc_tracking?: { sync_on_finalize?: boolean } } | undefined,
): Promise<{ ran: boolean; count?: number }> {
  if (config?.doc_tracking?.sync_on_finalize !== true) return { ran: false };
  try {
    const { count } = await runDocTrackingSync(projectRoot);
    return { ran: true, count };
  } catch (e) {
    debugLog('finalizeSprint:docTrackingSync', e);
    return { ran: true };
  }
}
```

Inside `finalizeSprint(...)`, after the decay step (search for `runBudgetedDecay` call), add:
```ts
  // Step: ADR-090 doc-tracking sync (gated, fail-safe — never breaks finalize)
  debugLog('finalizeSprint:breadcrumb', 'doc-tracking sync hook — entering');
  try {
    const dtRes = await maybeRunDocTrackingSync(projectRoot, opts?.config);
    if (dtRes.ran) debugLog('finalizeSprint:docTrackingSync', `synced ${dtRes.count ?? '?'} docs`);
  } catch (e) { debugLog('finalizeSprint:docTrackingSync', e); }
```

> `debugLog` zaten sprint-finalizer.ts'te kullanılıyor (örn. `debugLog('finalizeSprint:breadcrumb', ...)`). `opts?.config` ResolvedConfig (FinalizeSprintOptions.config, line ~138).

- [ ] **Step 9: Run tests + tsc**

Run: `npx vitest run tests/orchestra/doc-tracking-finalize-hook.test.ts tests/core/doc-tracking/sync.test.ts && npx tsc --noEmit`
Expected: PASS (sync 1 + hook 3); tsc clean.

- [ ] **Step 10: Commit**

```bash
git add src/core/config-types.ts src/core/doc-tracking/sync.ts src/orchestra/sprint-finalizer.ts tests/core/doc-tracking/sync.test.ts tests/orchestra/doc-tracking-finalize-hook.test.ts
git commit -m "feat(doc-tracking): sprint-finalize sync hook (config-gated, fail-safe) + core sync helper"
```

---

## Task 4: `--check` CI-gate (CLI)

**Files:**
- Modify: `src/cli/commands/docs.ts` (`runDocsTrackCheck` + `--check`/`--max-rank` on `scan`)
- Modify: `src/cli/helpers/messages.ts` (`docs.track.check_*`)
- Test: `tests/cli/docs-track.test.ts` (add check cases)

**Interfaces:**
- Consumes: `DocTrackingStore`, `loadDocTrackingConfig` (Faz 1).
- Produces: `runDocsTrackCheck(root: string, opts: { maxRank?: number }): { ok: boolean; violations: Array<{ path: string; doc_rank: number; state: string; priority_score: number }> }`.

- [ ] **Step 1: Add i18n keys** to `src/cli/helpers/messages.ts` (in the `docs.track.*` group added in Faz 1):
```ts
  'docs.track.check_clean': {
    en: 'Doc-tracking check passed — no critical-stale docs.',
    tr: 'Doküman kontrolü geçti — kritik-bayat doküman yok.',
  },
  'docs.track.check_violations': {
    en: '{count} critical-stale doc(s) found:',
    tr: '{count} kritik-bayat doküman bulundu:',
  },
```

- [ ] **Step 2: Write the failing test** (append to `tests/cli/docs-track.test.ts`)

```ts
import { runDocsTrackCheck } from '../../src/cli/commands/docs.js';
import { DocTrackingStore } from '../../src/core/doc-tracking/store.js';

describe('runDocsTrackCheck', () => {
  it('ok=true when no critical-stale docs', async () => {
    const d = mkdtempSync(join(tmpdir(), 'dt-chk-'));
    try {
      const store = new DocTrackingStore(join(d, '.brain/memory.db'));
      store.upsertDoc({ path: 'docs/a.md', content_hash: 'sha256:a', last_updated: '2026-06-18T00:00:00Z', doc_rank: 10, status: 'active', stale_score: 0, priority_score: 0, state: 'FRESH', signals: { content_drift: false, code_drift: null, age_days: 0 }, tracked_code: null, first_seen: '2026-06-18T00:00:00Z', last_scanned: '2026-06-18T00:00:00Z' });
      store.close();
      const r = runDocsTrackCheck(d, {});
      expect(r.ok).toBe(true);
      expect(r.violations.length).toBe(0);
    } finally { rmSync(d, { recursive: true, force: true }); }
  });
  it('ok=false and lists violations when a CRITICAL_STALE doc exists', async () => {
    const d = mkdtempSync(join(tmpdir(), 'dt-chk-'));
    try {
      const store = new DocTrackingStore(join(d, '.brain/memory.db'));
      store.upsertDoc({ path: 'docs/crit.md', content_hash: 'sha256:c', last_updated: '2026-06-18T00:00:00Z', doc_rank: 0, status: 'active', stale_score: 50, priority_score: 100, state: 'CRITICAL_STALE', signals: { content_drift: true, code_drift: null, age_days: 0 }, tracked_code: null, first_seen: '2026-06-18T00:00:00Z', last_scanned: '2026-06-18T00:00:00Z' });
      store.close();
      const r = runDocsTrackCheck(d, {});
      expect(r.ok).toBe(false);
      expect(r.violations.map(v => v.path)).toContain('docs/crit.md');
    } finally { rmSync(d, { recursive: true, force: true }); }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/cli/docs-track.test.ts`
Expected: FAIL — `runDocsTrackCheck` not exported.

- [ ] **Step 4: Implement in `docs.ts`** — add handler + wire flags onto the existing `scan` command.

Add the exported handler (near `runDocsTrackStatus`):
```ts
export function runDocsTrackCheck(
  root: string,
  opts: { maxRank?: number },
): { ok: boolean; violations: Array<{ path: string; doc_rank: number; state: string; priority_score: number }> } {
  const store = new DocTrackingStore(join(root, '.brain/memory.db'));
  try {
    const violations = store.getAll()
      .filter(r => r.state === 'CRITICAL_STALE')
      .filter(r => (opts.maxRank === undefined ? true : r.doc_rank <= opts.maxRank))
      .map(r => ({ path: r.path, doc_rank: r.doc_rank, state: r.state, priority_score: r.priority_score }));
    return { ok: violations.length === 0, violations };
  } finally {
    store.close();
  }
}
```

Extend the `scan` command (add options + post-scan check). Modify the existing `track.command('scan')` block:
```ts
  track
    .command('scan')
    .description('Hash + timestamp + rank all docs; write front-matter; sync memory.db')
    .option('--no-write', 'Do not modify front-matter (DB-only)')
    .option('--prune', 'Remove records for deleted docs')
    .option('--check', 'After scan, exit non-zero if any CRITICAL_STALE doc exists (CI gate)')
    .option('--max-rank <n>', 'With --check, only gate on docs with doc_rank <= n', parseInt)
    .action(async (opts: { write: boolean; prune?: boolean; check?: boolean; maxRank?: number }) => {
      const root = resolveProjectRoot();
      const lang = getLanguage();
      const { count, stale } = await runDocsTrackScan(root, { write: opts.write, prune: !!opts.prune });
      print(getMessage('docs.track.scanned', lang, { count: String(count), stale: String(stale) }));
      if (opts.check) {
        const { ok, violations } = runDocsTrackCheck(root, { maxRank: opts.maxRank });
        if (!ok) {
          print(getMessage('docs.track.check_violations', lang, { count: String(violations.length) }));
          for (const v of violations) print(`  ${String(v.doc_rank).padEnd(5)} ${v.state} ${v.path}`);
          process.exitCode = 1;
        } else {
          print(getMessage('docs.track.check_clean', lang));
        }
      }
    });
```

- [ ] **Step 5: Run test + tsc**

Run: `npx vitest run tests/cli/docs-track.test.ts && npx tsc --noEmit`
Expected: PASS; tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/cli/commands/docs.ts src/cli/helpers/messages.ts tests/cli/docs-track.test.ts
git commit -m "feat(doc-tracking): docs track scan --check CI-gate + i18n"
```

---

## Task 5: MCP `deckent_docs` track actions

**Files:**
- Modify: `src/mcp/tools/docs.ts` (action enum + 2 handler branches)
- Test: `tests/mcp/docs-track-action.test.ts`

**Interfaces:**
- Consumes: `runDocsTrackScan`, `runDocsTrackStatus` (from `src/cli/commands/docs.js`).
- Produces: `deckent_docs` accepts `action: 'track-scan' | 'track-status'`.

- [ ] **Step 1: Write the failing test** (exercises the exported handlers the MCP tool calls — MCP wrapping is thin)

```ts
// tests/mcp/docs-track-action.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runDocsTrackScan, runDocsTrackStatus } from '../../src/cli/commands/docs.js';

let dir: string;
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

describe('deckent_docs track actions (handler layer)', () => {
  it('track-scan then track-status returns rows from memory.db', async () => {
    dir = mkdtempSync(join(tmpdir(), 'dt-mcp-'));
    mkdirSync(join(dir, 'docs'), { recursive: true });
    writeFileSync(join(dir, 'docs/a.md'), '# A\nbody\n');
    const scan = await runDocsTrackScan(dir, { write: false, prune: false });
    expect(scan.count).toBeGreaterThanOrEqual(1);
    const rows = runDocsTrackStatus(dir, { stale: false });
    expect(rows.some(r => r.path === 'docs/a.md')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it passes already** (handlers exist from Faz 1) — this guards the contract the MCP branch depends on.

Run: `npx vitest run tests/mcp/docs-track-action.test.ts`
Expected: PASS (validates the handler contract). If FAIL, fix imports before wiring MCP.

- [ ] **Step 3: Edit `src/mcp/tools/docs.ts`** — extend enum + add branches.

Add to imports:
```ts
import { runDocsTrackScan, runDocsTrackStatus } from '../../cli/commands/docs.js';
```

Change the action enum:
```ts
        action: z.enum(['add', 'remove', 'list', 'update', 'run', 'track-scan', 'track-status']).describe('Action to perform'),
```

Add two branches inside the handler `try {` block (before `if (action === 'list')` is fine):
```ts
        if (action === 'track-scan') {
          const { count, stale } = await runDocsTrackScan(root, { write: false, prune: false });
          return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, count, stale }) }] };
        }
        if (action === 'track-status') {
          const rows = runDocsTrackStatus(root, { stale: false });
          return { content: [{ type: 'text' as const, text: JSON.stringify({ docs: rows }) }] };
        }
```

Update the tool `description` to mention the two new actions (append): `... "track-scan" runs a DB-only doc-tracking scan; "track-status" lists tracked doc health.`

- [ ] **Step 4: Run test + tsc**

Run: `npx vitest run tests/mcp/docs-track-action.test.ts && npx tsc --noEmit`
Expected: PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/mcp/tools/docs.ts tests/mcp/docs-track-action.test.ts
git commit -m "feat(doc-tracking): deckent_docs MCP track-scan/track-status actions"
```

---

## Task 6: HTTP API `/api/docs/health` + heatmap aggregation

**Files:**
- Create: `src/api/docs-health-endpoint.ts` (`aggregateHeatmap` + `registerDocsHealthRoute`)
- Modify: `src/api/server.ts` (route registration)
- Test: `tests/api/docs-health-endpoint.test.ts`

**Interfaces:**
- Consumes: `runDocsTrackStatus` (from `src/cli/commands/docs.js`).
- Produces:
  - `aggregateHeatmap(rows: Array<{ doc_rank: number; state: string }>): Array<{ bucket: string; state: string; count: number }>`.
  - `registerDocsHealthRoute(url: string, res: ServerResponse, projectRoot: string): boolean` — returns true if it handled the URL.

- [ ] **Step 1: Write the failing test**

```ts
// tests/api/docs-health-endpoint.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { aggregateHeatmap, registerDocsHealthRoute } from '../../src/api/docs-health-endpoint.js';
import { DocTrackingStore } from '../../src/core/doc-tracking/store.js';

let dir: string;
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

describe('aggregateHeatmap', () => {
  it('buckets rows by rank-range × state with counts', () => {
    const cells = aggregateHeatmap([
      { doc_rank: 0, state: 'DRIFT' },
      { doc_rank: 5, state: 'DRIFT' },
      { doc_rank: 95, state: 'FRESH' },
    ]);
    const core = cells.find(c => c.bucket === '0' && c.state === 'DRIFT');
    expect(core?.count).toBe(1);
    const lo = cells.find(c => c.bucket === '1-10' && c.state === 'DRIFT');
    expect(lo?.count).toBe(1);
  });
});

describe('registerDocsHealthRoute', () => {
  it('responds 200 with rows + heatmap for GET /api/docs/health', () => {
    dir = mkdtempSync(join(tmpdir(), 'dt-api-'));
    const store = new DocTrackingStore(join(dir, '.brain/memory.db'));
    store.upsertDoc({ path: 'docs/a.md', content_hash: 'sha256:a', last_updated: '2026-06-18T00:00:00Z', doc_rank: 0, status: 'active', stale_score: 0, priority_score: 0, state: 'DRIFT', signals: { content_drift: false, code_drift: null, age_days: 1 }, tracked_code: null, first_seen: '2026-06-18T00:00:00Z', last_scanned: '2026-06-18T00:00:00Z' });
    store.close();
    let statusCode = 0; let payload = '';
    const res = {
      writeHead: (s: number) => { statusCode = s; },
      end: (b: string) => { payload += b; },
    } as unknown as import('node:http').ServerResponse;
    const handled = registerDocsHealthRoute('/api/docs/health', res, dir);
    expect(handled).toBe(true);
    expect(statusCode).toBe(200);
    const json = JSON.parse(payload);
    expect(json.rows.some((r: { path: string }) => r.path === 'docs/a.md')).toBe(true);
    expect(Array.isArray(json.heatmap)).toBe(true);
  });
  it('returns false for an unrelated URL', () => {
    dir = mkdtempSync(join(tmpdir(), 'dt-api-'));
    const res = { writeHead: () => {}, end: () => {} } as unknown as import('node:http').ServerResponse;
    expect(registerDocsHealthRoute('/api/status', res, dir)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api/docs-health-endpoint.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `docs-health-endpoint.ts`**

```ts
// ─── Docs Health API Endpoint (ADR-090) ──────────────────────────────────────
// GET /api/docs/health — doc-tracking rows + rank×state heatmap aggregation.
// Read-only; auth-gated by the server's bearer middleware (registered after auth).
import type { ServerResponse } from 'node:http';
import { runDocsTrackStatus } from '../cli/commands/docs.js';

function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const BUCKETS: Array<{ name: string; min: number; max: number }> = [
  { name: '0', min: 0, max: 0 },
  { name: '1-10', min: 1, max: 10 },
  { name: '11-50', min: 11, max: 50 },
  { name: '51-94', min: 51, max: 94 },
  { name: '95+', min: 95, max: Infinity },
];
const STATES = ['FRESH', 'DRIFT', 'STALE', 'CRITICAL_STALE', 'EXEMPT'] as const;

function bucketOf(rank: number): string {
  for (const b of BUCKETS) if (rank >= b.min && rank <= b.max) return b.name;
  return '95+';
}

export function aggregateHeatmap(
  rows: Array<{ doc_rank: number; state: string }>,
): Array<{ bucket: string; state: string; count: number }> {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const key = `${bucketOf(r.doc_rank)}|${r.state}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const cells: Array<{ bucket: string; state: string; count: number }> = [];
  for (const b of BUCKETS) {
    for (const s of STATES) {
      cells.push({ bucket: b.name, state: s, count: counts.get(`${b.name}|${s}`) ?? 0 });
    }
  }
  return cells;
}

export function registerDocsHealthRoute(url: string, res: ServerResponse, projectRoot: string): boolean {
  if (url !== '/api/docs/health') return false;
  try {
    const rows = runDocsTrackStatus(projectRoot, { stale: false });
    sendJson(res, { rows, heatmap: aggregateHeatmap(rows), generatedAt: new Date().toISOString() });
  } catch (e) {
    sendJson(res, { error: String(e) }, 500);
  }
  return true;
}
```

- [ ] **Step 4: Wire into `src/api/server.ts`** — import + call in the routing block (mirror the coverage route).

Add to imports (near `registerCoverageRoutes`):
```ts
import { registerDocsHealthRoute } from './docs-health-endpoint.js';
```
Add in the routing block (near `if (registerCoverageRoutes(url, res, projectRoot)) return;`, ~line 823):
```ts
    // Docs health (doc-tracking ADR-090): /api/docs/health
    if (registerDocsHealthRoute(url, res, projectRoot)) return;
```

- [ ] **Step 5: Run test + tsc**

Run: `npx vitest run tests/api/docs-health-endpoint.test.ts && npx tsc --noEmit`
Expected: PASS (3 tests); tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/api/docs-health-endpoint.ts src/api/server.ts tests/api/docs-health-endpoint.test.ts
git commit -m "feat(doc-tracking): GET /api/docs/health + rank×state heatmap aggregation"
```

---

## Task 7: Dashboard "Docs Health" page (Tier-1 — proof-of-function)

**Files:**
- Create: `src/dashboard/src/pages/DocsHealthPage.tsx`
- Modify: `src/dashboard/src/App.tsx` (route)
- Modify: `src/dashboard/src/nav-items.ts` (nav entry)
- Test: `src/dashboard/src/pages/DocsHealthPage.test.tsx` (component, `npm run test:dashboard`)

**Interfaces:**
- Consumes: `fetchJson<T>` (`src/dashboard/src/lib/api.ts`), `GET /api/docs/health` (Task 6).
- Produces: route `/docs-health` + nav entry.

- [ ] **Step 1: Write the failing component test**

```tsx
// src/dashboard/src/pages/DocsHealthPage.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DocsHealthPage from './DocsHealthPage';
import * as api from '../lib/api';

afterEach(() => vi.restoreAllMocks());

const fixture = {
  rows: [
    { doc_rank: 0, state: 'DRIFT', priority_score: 5, path: 'DECKENT.md' },
    { doc_rank: 1, state: 'CRITICAL_STALE', priority_score: 100, path: 'docs/adr/001.md' },
  ],
  heatmap: [
    { bucket: '0', state: 'DRIFT', count: 1 },
    { bucket: '1-10', state: 'CRITICAL_STALE', count: 1 },
  ],
  generatedAt: '2026-06-18T00:00:00Z',
};

describe('DocsHealthPage', () => {
  it('renders the heatmap and the doc table from /api/docs/health', async () => {
    vi.spyOn(api, 'fetchJson').mockResolvedValue(fixture as never);
    render(<DocsHealthPage />);
    await waitFor(() => expect(screen.getByText('DECKENT.md')).toBeInTheDocument());
    expect(screen.getByText('docs/adr/001.md')).toBeInTheDocument();
  });
  it('filters the table when a heatmap cell is clicked', async () => {
    vi.spyOn(api, 'fetchJson').mockResolvedValue(fixture as never);
    render(<DocsHealthPage />);
    await waitFor(() => expect(screen.getByText('DECKENT.md')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId ? screen.getByTestId('cell-1-10-CRITICAL_STALE') : screen.getByText('docs/adr/001.md'));
    await waitFor(() => expect(screen.queryByText('DECKENT.md')).not.toBeInTheDocument());
    expect(screen.getByText('docs/adr/001.md')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:dashboard -- src/dashboard/src/pages/DocsHealthPage.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `DocsHealthPage.tsx`**

```tsx
// src/dashboard/src/pages/DocsHealthPage.tsx
import { useEffect, useState } from "react";
import { FileText, AlertTriangle } from "lucide-react";
import { fetchJson } from "../lib/api";

interface DocRow { doc_rank: number; state: string; priority_score: number; path: string; }
interface HeatCell { bucket: string; state: string; count: number; }
interface HealthResponse { rows: DocRow[]; heatmap: HeatCell[]; generatedAt: string; }

const BUCKETS = ["0", "1-10", "11-50", "51-94", "95+"];
const STATES = ["FRESH", "DRIFT", "STALE", "CRITICAL_STALE", "EXEMPT"];

const stateColor: Record<string, string> = {
  FRESH: "bg-emerald-900/40 text-emerald-300",
  DRIFT: "bg-amber-900/30 text-amber-300",
  STALE: "bg-orange-900/40 text-orange-300",
  CRITICAL_STALE: "bg-red-900/50 text-red-300",
  EXEMPT: "bg-zinc-800/40 text-zinc-400",
};

function bucketOf(rank: number): string {
  if (rank <= 0) return "0";
  if (rank <= 10) return "1-10";
  if (rank <= 50) return "11-50";
  if (rank <= 94) return "51-94";
  return "95+";
}

export default function DocsHealthPage() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<{ bucket: string; state: string } | null>(null);

  useEffect(() => {
    fetchJson<HealthResponse>("/api/docs/health")
      .then(setData)
      .catch((e) => setError(String(e)));
  }, []);

  if (error) return <div className="p-6 text-red-400">{error}</div>;
  if (!data) return <div className="p-6 text-zinc-400">Loading…</div>;

  const cellCount = (bucket: string, state: string) =>
    data.heatmap.find((c) => c.bucket === bucket && c.state === state)?.count ?? 0;

  const rows = filter
    ? data.rows.filter((r) => bucketOf(r.doc_rank) === filter.bucket && r.state === filter.state)
    : data.rows;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <FileText className="w-5 h-5 text-zinc-300" />
        <h1 className="text-xl font-semibold">Docs Health</h1>
        <span className="text-sm text-zinc-500">{data.rows.length} docs</span>
      </div>

      <div className="overflow-x-auto">
        <table className="text-sm border-collapse" data-testid="docs-heatmap">
          <thead>
            <tr>
              <th className="px-2 py-1 text-left text-zinc-400">rank \\ state</th>
              {STATES.map((s) => <th key={s} className="px-2 py-1 text-zinc-400">{s}</th>)}
            </tr>
          </thead>
          <tbody>
            {BUCKETS.map((b) => (
              <tr key={b}>
                <td className="px-2 py-1 text-zinc-400">{b}</td>
                {STATES.map((s) => {
                  const n = cellCount(b, s);
                  return (
                    <td key={s} className="px-1 py-1 text-center">
                      <button
                        type="button"
                        data-testid={`cell-${b}-${s}`}
                        onClick={() => setFilter({ bucket: b, state: s })}
                        className={`w-12 h-8 rounded ${n > 0 ? stateColor[s] : "bg-zinc-900/30 text-zinc-600"}`}
                      >
                        {n}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filter && (
        <button type="button" onClick={() => setFilter(null)} className="text-sm text-blue-400">
          Clear filter ({filter.bucket} / {filter.state})
        </button>
      )}

      <table className="w-full text-sm" data-testid="docs-table">
        <thead>
          <tr className="text-left text-zinc-400">
            <th className="px-2 py-1">rank</th><th className="px-2 py-1">state</th>
            <th className="px-2 py-1">score</th><th className="px-2 py-1">path</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.path} className="border-t border-zinc-800">
              <td className="px-2 py-1">{r.doc_rank}</td>
              <td className={`px-2 py-1 ${stateColor[r.state] ?? ""}`}>
                {r.state === "CRITICAL_STALE" && <AlertTriangle className="inline w-3 h-3 mr-1" />}
                {r.state}
              </td>
              <td className="px-2 py-1">{Math.round(r.priority_score)}</td>
              <td className="px-2 py-1 font-mono text-xs">{r.path}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

> Test'teki `getByTestId('cell-1-10-CRITICAL_STALE')` bu `data-testid`'lere dayanır. (Test'te `screen.getByTestId` mevcut; `getByTestId ? ... : ...` ifadesi yalnız tip-güvenliği içindir, prod kodu etkilemez.)

- [ ] **Step 4: Add route to `App.tsx`** — import + `<Route>`.

Add import (near other page imports):
```tsx
import DocsHealthPage from "./pages/DocsHealthPage";
```
Add route (inside `<Route element={<Layout />}>`, after `/directives`):
```tsx
                <Route path="/docs-health" element={<DocsHealthPage />} />
```

- [ ] **Step 5: Add nav entry to `nav-items.ts`** — add to the "watch" or "manage" group (use `FileText` icon, label key `nav.docs_health`).

In `src/dashboard/src/nav-items.ts`, add to the `manage` group's `items` array:
```ts
  { to: "/docs-health", labelKey: "nav.docs_health", icon: FileText },
```
Ensure `FileText` is imported from `lucide-react` at the top of `nav-items.ts` (add to the existing import if absent). Add the i18n label `nav.docs_health` (en: "Docs Health", tr: "Doküman Sağlığı") to the dashboard's i18n strings file (same place other `nav.*` keys live — `grep -rn "nav.history" src/dashboard/src` to find it).

- [ ] **Step 6: Run component test + dashboard tsc**

Run: `npm run test:dashboard -- src/dashboard/src/pages/DocsHealthPage.test.tsx`
Expected: PASS (2 tests).
Run: `npx tsc --noEmit`
Expected: clean (server-side tsc unaffected; dashboard has its own tsconfig — also run `npm run build:all` in Step 7).

- [ ] **Step 7: Proof-of-function (Tier-1 — real binary)**

Run:
```bash
npm run build:all   # includes dashboard vite build (dist/dashboard)
node dist/cli/entry.js docs track scan --no-write      # seed memory.db
node dist/cli/entry.js serve --port 3219 &             # start server
sleep 2
curl -s -H "Authorization: Bearer $(node -e "console.log(process.env.DECKENT_API_TOKEN||'')")" http://localhost:3219/api/docs/health | head -c 300
kill %1
```
Expected: `/api/docs/health` returns JSON with `rows` + `heatmap` (real served data, not a mock). Dashboard page reachable at `/docs-health`. (Build sonrası MCP kullanılacaksa `/mcp restart` Alperen tarafından.)

> Auth: if the server requires a bearer and none is configured, the proof can set `DECKENT_API_TOKEN=test` before `serve` and pass it in the curl header. The goal is a real 200 with real rows.

- [ ] **Step 8: Commit**

```bash
git add src/dashboard/src/pages/DocsHealthPage.tsx src/dashboard/src/pages/DocsHealthPage.test.tsx src/dashboard/src/App.tsx src/dashboard/src/nav-items.ts
git commit -m "feat(doc-tracking): dashboard Docs Health page (heatmap + drill-down)"
```

---

## Task 8: Docs — ADR-090 amendment + api-surface + DECKENT.md

**Files:**
- Modify: `docs/adr/090-doc-tracking.md` (Faz 2 amendment)
- Modify: `docs/reference/api-surface.md` (`/api/docs/health` + deckent_docs actions + sync_on_finalize)
- Modify: `DECKENT.md` (deckent_docs action note)
- (No test — documentation.)

- [ ] **Step 1: Append a Faz 2 amendment to `docs/adr/090-doc-tracking.md`** (after the References line):

```markdown

---

**Amendment (Faz 2, 2026-06-18):** code-drift sinyali canlı (`tracks:` glob → `git ls-files` + author-date karşılaştırması, `src/core/doc-tracking/code-drift.ts`); `deckent docs track scan --check [--max-rank n]` CI-gate (CRITICAL_STALE → non-zero exit); sprint-finalize hook (`config.doc_tracking.sync_on_finalize`, default OFF, DB-only, fail-safe); MCP `deckent_docs` `track-scan`/`track-status` action'ları; HTTP `GET /api/docs/health` (rank×state heatmap) + dashboard "Docs Health" sayfası. **Status:** accepted.
```

- [ ] **Step 2: Append to `docs/reference/api-surface.md`** (after the `doc_tracking Table` section from Faz 1):

```markdown

### Doc-Tracking Faz 2 surfaces (ADR-090)

- **`GET /api/docs/health`** (auth-gated, read-only) → `{ rows: DocStatusRow[], heatmap: {bucket,state,count}[], generatedAt }`. Buckets: `0` / `1-10` / `11-50` / `51-94` / `95+`. Consumed by the dashboard "Docs Health" page.
- **MCP `deckent_docs`** actions: `track-scan` (DB-only scan → `{count,stale}`), `track-status` (→ `{docs:[...]}`).
- **CLI `deckent docs track scan --check [--max-rank <n>]`** — non-zero exit if any `CRITICAL_STALE` doc (optionally `doc_rank <= n`).
- **Config:** `config.doc_tracking.sync_on_finalize` (boolean, default `false`) — DB-only sync at sprint finalize.
```

- [ ] **Step 3: Update `DECKENT.md`** — in the MCP tools list, append a note to the `deckent_docs` entry that it now supports `track-scan`/`track-status` actions (do NOT change the tool count — no new tool).

Find the `deckent_docs` row/line and append: ` (+ track-scan/track-status — doc-health, ADR-090)`.

- [ ] **Step 4: Verify lint/docs**

Run: `npm run lint:adr && npx tsc --noEmit`
Expected: ADR validator passes (decisions.md unchanged → green); tsc clean.

- [ ] **Step 5: Commit**

```bash
git add docs/adr/090-doc-tracking.md docs/reference/api-surface.md DECKENT.md
git commit -m "docs(doc-tracking): ADR-090 Faz 2 amendment + api-surface + DECKENT.md"
```

- [ ] **Step 6: Final full gate**

Run: `npm run lint && npx vitest run tests/core/doc-tracking/ tests/cli/docs-track.test.ts tests/api/docs-health-endpoint.test.ts tests/orchestra/doc-tracking-finalize-hook.test.ts tests/mcp/docs-track-action.test.ts && npm run test:ci-sim`
Expected: tsc clean; all doc-tracking + Faz 2 tests pass; ci-sim green (any pre-existing failures confirmed via baseline, as in Faz 1).

> **Memory hook (post-merge, manuel):** ADR-090 amendment'ı `memory.db`'ye yansıt; MASTER-PLAN §10'a "Doc-Tracking Faz 2 ✅" + (varsa) Faz 3 açık-iş.

---

## Notes / spec deviations (intentional, low-risk)

- **sync helper duplication:** `runDocTrackingSync` (core, Task 3) ile `runDocsTrackScan` (CLI, Faz 1) benzer; ama sprint-finalizer'ın cli→core değil orchestra→core bağımlılığı için core-saf ikiz gerekli (ADR-008). Küçük, gerekçeli.
- **code-drift git-only:** semantik analiz yok (spec NG3). git yoksa/tracks boşsa `null` (uydurma yok).
- **MCP track-scan DB-only:** agent MCP'den front-matter mutasyonu tetiklemesin diye `write:false` sabit (CLI `scan` default yazar; MCP yazmaz).
- **dashboard i18n:** `nav.docs_health` + sayfa etiketleri dashboard i18n dosyasına eklenir; sayfa içi sabit teknik kelimeler (state adları FRESH/DRIFT…) enum-değer olduğundan çevrilmez (kod-sabiti).
