# Doc-Tracking (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repo'daki her (geçici-olmayan) `.md` dokümanına içerik-hash + son-güncelleme + sayısal önem-kodu (DCR) atayan, bunları front-matter + `memory.db`'de izleyen ve çok-sinyalli stale tespiti yapan bir mekanizma (Faz 1: content-drift + age sinyalleri, `deckent docs track scan/status/sync`).

**Architecture:** Bağımsız `src/core/doc-tracking/` modülü (types/glob/git-date/frontmatter/rank-resolver/stale-scorer/store/scanner). `DocTrackingStore` kendi `better-sqlite3` bağlantısını `.brain/memory.db`'ye açıp `doc_tracking` tablosunu idempotent kurar (MemoryStore'a dokunmaz, ADR-008-temiz). Mevcut `doc-cache.contentHash` (SHA-1) korunur; doc-tracking gövde için SHA-256 kullanır. CLI `deckent docs track` managed-docs `registerDocs`'a eklenir.

**Tech Stack:** TypeScript/ESM (Node16, `.js` import uzantısı zorunlu), better-sqlite3 (mevcut dep), vitest, commander (mevcut). Yeni runtime-dep YOK (ADR-010).

## Global Constraints

- **ESM:** Tüm relative import'lar `.js` ile biter (Node16 resolution).
- **i18n-FIRST:** User-facing string ASLA hardcode edilmez; `getMessage(key, lang, vars?)` (`src/cli/helpers/messages.ts`) üzerinden. Çekirdek modüller (types/glob/.../scanner/store) **string-free**; yalnız CLI katmanı `getMessage` çağırır.
- **No new runtime dep (ADR-010):** yaml lib YOK → front-matter minimal el-parser; glob lib YOK → minimal `matchGlob`.
- **Hermetik test (ADR-087, CUSTOM Test Hermeticity):** tüm fixture `os.tmpdir()` altında; `afterEach` temizler; **`spawnSync` YASAK** → async `child_process.spawn`; proje kökü/HOME'a yazma yok.
- **Mock-only test YASAK:** gerçek dosya/DB/front-matter etkisini assert et.
- **Hash = GÖVDE hash'i** (front-matter HARİÇ), `sha256:` prefix; normalize: CRLF→LF + tek trailing `\n`. → metadata değişince hash değişmez (churn-loop yok).
- **Geçici doc hashlenmez:** `status ∈ {draft,temp}` veya `scratch/` → `content_hash=null`, `state=EXEMPT`, stale'e girmez.
- **`entries` tablosuna / MemoryStore'a DOKUNULMAZ.** `.brain/memory.db` ASLA silinmez.
- **tsc --noEmit temiz + ilgili suite + `npm run test:ci-sim` yeşil** her task sonunda.
- **Git:** İş `feat/doc-tracking` branch'inde (önce `git branch -vv` + branch oluştur). Commit yalnız Alperen onayıyla; plan'daki commit adımları executor tarafından bu kurala göre uygulanır.

---

## File Structure

| Dosya | Sorumluluk |
|---|---|
| `src/core/doc-tracking/types.ts` | Tüm arayüzler + `DEFAULT_DOC_TRACKING_CONFIG` |
| `src/core/doc-tracking/glob.ts` | `matchGlob(path, pattern)` — minimal `**`/`*` glob (dep yok) |
| `src/core/doc-tracking/config.ts` | `loadDocTrackingConfig(root)` — docs.json `tracking` + defaults merge |
| `src/core/doc-tracking/git-date.ts` | `getFileGitDateAsync(root, path)` — async spawn, mtime fallback |
| `src/core/doc-tracking/frontmatter.ts` | `parseFrontmatter`, `hashBody`, `writeManagedFrontmatter` |
| `src/core/doc-tracking/rank-resolver.ts` | `resolveRank(path, fm, config)` — override→rankMap→default |
| `src/core/doc-tracking/stale-scorer.ts` | `scoreDoc(...)` — saf fonksiyon (§6 skor) |
| `src/core/doc-tracking/store.ts` | `DocTrackingStore` — kendi sqlite bağlantısı + `doc_tracking` tablosu |
| `src/core/doc-tracking/scanner.ts` | `scanDocs(root, config, store, opts)` — uçtan uca tarama |
| `src/cli/commands/docs.ts` | `docs track scan/status/sync` alt-komutu (MODIFY) |
| `src/cli/helpers/messages.ts` | `docs.track.*` i18n key'leri (MODIFY) |
| `docs/adr/090-doc-tracking.md` | ADR-090 (CREATE) |
| `docs/reference/api-surface.md` | `doc_tracking` tablo + docs.json `tracking` şeması (MODIFY) |
| `tests/core/doc-tracking/*.test.ts` | Her modül için hermetik test |

---

## Task 1: Types, glob matcher, config loader

**Files:**
- Create: `src/core/doc-tracking/types.ts`
- Create: `src/core/doc-tracking/glob.ts`
- Create: `src/core/doc-tracking/config.ts`
- Test: `tests/core/doc-tracking/glob.test.ts`, `tests/core/doc-tracking/config.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (later tasks rely on these EXACT names/types):
  - `DocStatus = 'active'|'draft'|'temp'|'frozen'|'superseded'`
  - `DocState = 'FRESH'|'DRIFT'|'STALE'|'CRITICAL_STALE'|'EXEMPT'`
  - `DocFrontmatter`, `DocSignals`, `DocRecord`, `DocTrackingConfig`, `DocTrackingScoringConfig` (see code)
  - `DEFAULT_DOC_TRACKING_CONFIG: DocTrackingConfig`
  - `matchGlob(path: string, pattern: string): boolean`
  - `loadDocTrackingConfig(root: string): DocTrackingConfig`

- [ ] **Step 1: Write `types.ts`** (no test — pure types/constants, exercised via config/glob tests)

```ts
// src/core/doc-tracking/types.ts
export type DocStatus = 'active' | 'draft' | 'temp' | 'frozen' | 'superseded';
export type DocState = 'FRESH' | 'DRIFT' | 'STALE' | 'CRITICAL_STALE' | 'EXEMPT';

export interface DocFrontmatter {
  doc_rank?: number;
  status?: DocStatus;
  last_updated?: string;
  content_hash?: string;
  tracks?: string[];
  [key: string]: unknown;
}

export interface DocSignals {
  content_drift: boolean;
  code_drift: boolean | null; // null = not evaluated (no `tracks`)
  age_days: number;
}

export interface DocRecord {
  path: string;            // repo-relative POSIX
  content_hash: string | null;
  last_updated: string;    // ISO8601
  doc_rank: number;
  status: DocStatus;
  stale_score: number;     // 0..100 (rank-independent severity)
  priority_score: number;  // 0..100 (rank-weighted urgency)
  state: DocState;
  signals: DocSignals;
  tracked_code: string[] | null;
  first_seen: string;      // ISO8601
  last_scanned: string;    // ISO8601
}

export interface DocTrackingScoringConfig {
  weights: { content: number; code: number; ageMax: number };
  criticalAt: number;
  staleAt: number;
  maxRank: number;
}

export interface DocTrackingConfig {
  rankMap: Record<string, number>;
  defaultRank: number;
  trackIgnore: string[];
  noFrontmatter: string[];
  scoring: DocTrackingScoringConfig;
  sizeCapBytes: number;
}

export const DEFAULT_DOC_TRACKING_CONFIG: DocTrackingConfig = {
  rankMap: {
    'CLAUDE.md': 0, 'DECKENT.md': 0, 'AGENTS.md': 0,
    'docs/DOC-POLICY.md': 0, 'docs/MASTER-PLAN.md': 0,
    'docs/architecture/**': 5,
    'docs/adr/**': 1,
    'docs/reference/**': 10,
    'docs/guide/**': 20, 'docs/development/**': 20,
    'docs/analysis/**': 90,
    'docs/customer/**': 95, 'docs/launch/**': 95,
  },
  defaultRank: 50,
  trackIgnore: [
    'node_modules/**', 'dist/**', '.git/**', '**/worktrees/**',
    '.brain/exports/**', '.brain/archive/**', '**/archive/**',
    'scratch/**', 'coverage/**', '**/*.template.md',
  ],
  noFrontmatter: ['CLAUDE.md', 'DECKENT.md', 'AGENTS.md', 'GEMINI.md'],
  scoring: {
    weights: { content: 50, code: 30, ageMax: 20 },
    criticalAt: 80,
    staleAt: 50,
    maxRank: 100,
  },
  sizeCapBytes: 2 * 1024 * 1024,
};
```

- [ ] **Step 2: Write the failing glob test**

```ts
// tests/core/doc-tracking/glob.test.ts
import { describe, it, expect } from 'vitest';
import { matchGlob } from '../../../src/core/doc-tracking/glob.js';

describe('matchGlob', () => {
  it('matches ** across path segments', () => {
    expect(matchGlob('docs/adr/090-x.md', 'docs/adr/**')).toBe(true);
    expect(matchGlob('docs/reference/api.md', 'docs/adr/**')).toBe(false);
  });
  it('matches * within a single segment only', () => {
    expect(matchGlob('a/b.md', '**/*.md')).toBe(true);
    expect(matchGlob('foo.template.md', '**/*.template.md')).toBe(true);
  });
  it('matches exact literal paths', () => {
    expect(matchGlob('CLAUDE.md', 'CLAUDE.md')).toBe(true);
    expect(matchGlob('docs/CLAUDE.md', 'CLAUDE.md')).toBe(false);
  });
  it('matches node_modules anywhere', () => {
    expect(matchGlob('node_modules/x/y.md', 'node_modules/**')).toBe(true);
    expect(matchGlob('a/node_modules/y.md', '**/worktrees/**')).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/core/doc-tracking/glob.test.ts`
Expected: FAIL — "Cannot find module .../glob.js".

- [ ] **Step 4: Write `glob.ts`**

```ts
// src/core/doc-tracking/glob.ts
// Minimal glob → RegExp. Supports `**` (any chars incl. `/`), `*` (any chars
// except `/`), and literals. No dependency (ADR-010).
function globToRegExp(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') { re += '.*'; i++; }
      else { re += '[^/]*'; }
    } else if ('.+^${}()|[]\\'.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  return new RegExp('^' + re + '$');
}

export function matchGlob(path: string, pattern: string): boolean {
  return globToRegExp(pattern).test(path);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/core/doc-tracking/glob.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Write the failing config test**

```ts
// tests/core/doc-tracking/config.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDocTrackingConfig } from '../../../src/core/doc-tracking/config.js';
import { DEFAULT_DOC_TRACKING_CONFIG } from '../../../src/core/doc-tracking/types.js';

let dir: string;
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

describe('loadDocTrackingConfig', () => {
  it('returns defaults when docs.json is absent', () => {
    dir = mkdtempSync(join(tmpdir(), 'dt-'));
    const cfg = loadDocTrackingConfig(dir);
    expect(cfg.defaultRank).toBe(DEFAULT_DOC_TRACKING_CONFIG.defaultRank);
    expect(cfg.trackIgnore).toContain('node_modules/**');
  });
  it('merges a tracking block from .deckent/settings/docs.json over defaults', () => {
    dir = mkdtempSync(join(tmpdir(), 'dt-'));
    mkdirSync(join(dir, '.deckent/settings'), { recursive: true });
    writeFileSync(join(dir, '.deckent/settings/docs.json'),
      JSON.stringify({ tracking: { defaultRank: 7, rankMap: { 'x/**': 3 } } }));
    const cfg = loadDocTrackingConfig(dir);
    expect(cfg.defaultRank).toBe(7);
    expect(cfg.rankMap['x/**']).toBe(3);
    // unspecified fields fall back to defaults
    expect(cfg.scoring.criticalAt).toBe(80);
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npx vitest run tests/core/doc-tracking/config.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 8: Write `config.ts`**

```ts
// src/core/doc-tracking/config.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_DOC_TRACKING_CONFIG, type DocTrackingConfig } from './types.js';

export function loadDocTrackingConfig(root: string): DocTrackingConfig {
  const d = DEFAULT_DOC_TRACKING_CONFIG;
  let tracking: Partial<DocTrackingConfig> = {};
  try {
    const raw = readFileSync(join(root, '.deckent/settings/docs.json'), 'utf-8');
    const parsed = JSON.parse(raw) as { tracking?: Partial<DocTrackingConfig> };
    tracking = parsed.tracking ?? {};
  } catch {
    // missing/invalid → defaults
  }
  return {
    rankMap: { ...d.rankMap, ...(tracking.rankMap ?? {}) },
    defaultRank: tracking.defaultRank ?? d.defaultRank,
    trackIgnore: tracking.trackIgnore ?? d.trackIgnore,
    noFrontmatter: tracking.noFrontmatter ?? d.noFrontmatter,
    scoring: { ...d.scoring, ...(tracking.scoring ?? {}) },
    sizeCapBytes: tracking.sizeCapBytes ?? d.sizeCapBytes,
  };
}
```

- [ ] **Step 9: Run tests + tsc**

Run: `npx vitest run tests/core/doc-tracking/ && npx tsc --noEmit`
Expected: PASS (glob 4 + config 2); tsc clean.

- [ ] **Step 10: Commit**

```bash
git add src/core/doc-tracking/types.ts src/core/doc-tracking/glob.ts src/core/doc-tracking/config.ts tests/core/doc-tracking/glob.test.ts tests/core/doc-tracking/config.test.ts
git commit -m "feat(doc-tracking): types, glob matcher, config loader"
```

---

## Task 2: Async git-date helper

**Files:**
- Create: `src/core/doc-tracking/git-date.ts`
- Test: `tests/core/doc-tracking/git-date.test.ts`

**Interfaces:**
- Produces: `getFileGitDateAsync(root: string, filePath: string): Promise<number>` — epoch ms of last commit author-date; mtime fallback; `0` if neither.
- Note: bilinçli olarak `cli/commands/sync.ts`'teki sync `getFileGitDate` DOKUNULMAZ (sync caller'ları var; ripple/risk yok). Bu ADR-087-temiz async ileri-yön sürümüdür (core, cli→core değil core→cli değil).

- [ ] **Step 1: Write the failing test** (real git repo in tmpdir + mtime fallback)

```ts
// tests/core/doc-tracking/git-date.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process'; // test-only setup, not in src
import { getFileGitDateAsync } from '../../../src/core/doc-tracking/git-date.js';

let dir: string;
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

describe('getFileGitDateAsync', () => {
  it('returns the git commit date for a tracked file', async () => {
    dir = mkdtempSync(join(tmpdir(), 'dt-git-'));
    const run = (args: string[]) => spawnSync('git', args, { cwd: dir, encoding: 'utf-8' });
    run(['init']); run(['config', 'user.email', 't@t']); run(['config', 'user.name', 't']);
    writeFileSync(join(dir, 'a.md'), '# a');
    run(['add', 'a.md']); run(['commit', '-m', 'x']);
    const ms = await getFileGitDateAsync(dir, 'a.md');
    expect(ms).toBeGreaterThan(0);
  });
  it('falls back to mtime for an untracked file (no git)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'dt-nogit-'));
    writeFileSync(join(dir, 'b.md'), '# b');
    const ms = await getFileGitDateAsync(dir, 'b.md');
    expect(ms).toBeGreaterThan(0);
  });
  it('returns 0 for a missing file with no git', async () => {
    dir = mkdtempSync(join(tmpdir(), 'dt-miss-'));
    const ms = await getFileGitDateAsync(dir, 'nope.md');
    expect(ms).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/doc-tracking/git-date.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `git-date.ts`**

```ts
// src/core/doc-tracking/git-date.ts
import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { join } from 'node:path';

function gitLogDate(root: string, filePath: string): Promise<number> {
  return new Promise((resolve) => {
    let out = '';
    let settled = false;
    const done = (v: number) => { if (!settled) { settled = true; resolve(v); } };
    try {
      const p = spawn('git', ['log', '-1', '--format=%aI', '--', filePath], { cwd: root });
      const timer = setTimeout(() => { p.kill(); done(0); }, 5000);
      p.stdout.on('data', (d) => { out += d.toString(); });
      p.on('error', () => { clearTimeout(timer); done(0); });
      p.on('close', () => {
        clearTimeout(timer);
        const ts = new Date(out.trim()).getTime();
        done(out.trim() && !isNaN(ts) ? ts : 0);
      });
    } catch {
      done(0);
    }
  });
}

export async function getFileGitDateAsync(root: string, filePath: string): Promise<number> {
  const gitMs = await gitLogDate(root, filePath);
  if (gitMs > 0) return gitMs;
  try {
    return statSync(join(root, filePath)).mtimeMs;
  } catch {
    return 0;
  }
}
```

- [ ] **Step 4: Run test + tsc**

Run: `npx vitest run tests/core/doc-tracking/git-date.test.ts && npx tsc --noEmit`
Expected: PASS (3 tests); tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/core/doc-tracking/git-date.ts tests/core/doc-tracking/git-date.test.ts
git commit -m "feat(doc-tracking): async git-date helper (ADR-087 spawn, mtime fallback)"
```

---

## Task 3: Front-matter parse / body-hash / managed-write

**Files:**
- Create: `src/core/doc-tracking/frontmatter.ts`
- Test: `tests/core/doc-tracking/frontmatter.test.ts`

**Interfaces:**
- Produces:
  - `parseFrontmatter(content: string): { ok: boolean; data: DocFrontmatter; body: string }`
  - `hashBody(body: string): string` → `'sha256:'+hex`
  - `writeManagedFrontmatter(content: string, fields: { doc_rank: number; status: DocStatus; last_updated: string; content_hash: string | null }): string`
- Rules: front-matter geçerli ANCAK 1. satır tam `---` ve sonraki `---` ile kapanıyorsa. Yönetilen 4 scalar key güncellenir/eklenir, diğer satırlar (title/tracks/...) verbatim korunur. `content_hash=null` → satır `content_hash: <temp>`. Front-matter yoksa başa eklenir. İdempotent: aynı fields ile ikinci yazım dosyayı DEĞİŞTİRMEZ.

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/doc-tracking/frontmatter.test.ts
import { describe, it, expect } from 'vitest';
import { parseFrontmatter, hashBody, writeManagedFrontmatter } from '../../../src/core/doc-tracking/frontmatter.js';

const FM = `---\ntitle: Hi\ndoc_rank: 10\ntracks:\n  - src/a.ts\n---\n\n# Body\ntext\n`;

describe('parseFrontmatter', () => {
  it('parses managed scalars + tracks list and isolates body', () => {
    const r = parseFrontmatter(FM);
    expect(r.ok).toBe(true);
    expect(r.data.doc_rank).toBe(10);
    expect(r.data.tracks).toEqual(['src/a.ts']);
    expect(r.body).toBe('# Body\ntext\n');
  });
  it('reports no front-matter when line 1 is not ---', () => {
    const r = parseFrontmatter('# ADR\n---\nx\n');
    expect(r.ok).toBe(false);
    expect(r.body).toBe('# ADR\n---\nx\n');
  });
});

describe('hashBody', () => {
  it('is stable across CRLF and trailing whitespace', () => {
    expect(hashBody('a\r\nb  \n')).toBe(hashBody('a\nb\n'));
  });
  it('has sha256: prefix', () => {
    expect(hashBody('x')).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

describe('writeManagedFrontmatter', () => {
  it('updates managed keys, preserves others (title/tracks), keeps body', () => {
    const out = writeManagedFrontmatter(FM, { doc_rank: 1, status: 'active', last_updated: '2026-06-18', content_hash: 'sha256:abc' });
    expect(out).toContain('title: Hi');
    expect(out).toContain('- src/a.ts');
    expect(out).toContain('doc_rank: 1');
    expect(out).toContain('status: active');
    expect(out).toContain('content_hash: sha256:abc');
    expect(out).toContain('# Body');
  });
  it('prepends front-matter when none exists', () => {
    const out = writeManagedFrontmatter('# Plain\n', { doc_rank: 5, status: 'active', last_updated: '2026-06-18', content_hash: 'sha256:z' });
    expect(out.startsWith('---\n')).toBe(true);
    expect(out).toContain('# Plain');
  });
  it('is idempotent for identical fields', () => {
    const f = { doc_rank: 1, status: 'active' as const, last_updated: '2026-06-18', content_hash: 'sha256:abc' };
    const once = writeManagedFrontmatter(FM, f);
    expect(writeManagedFrontmatter(once, f)).toBe(once);
  });
  it('writes <temp> when content_hash is null', () => {
    const out = writeManagedFrontmatter('# X\n', { doc_rank: 9, status: 'temp', last_updated: '2026-06-18', content_hash: null });
    expect(out).toContain('content_hash: <temp>');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/doc-tracking/frontmatter.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `frontmatter.ts`**

```ts
// src/core/doc-tracking/frontmatter.ts
import { createHash } from 'node:crypto';
import type { DocFrontmatter, DocStatus } from './types.js';

const MANAGED_KEYS = ['doc_rank', 'status', 'last_updated', 'content_hash'] as const;

export function parseFrontmatter(content: string): { ok: boolean; data: DocFrontmatter; body: string } {
  if (!content.startsWith('---\n')) return { ok: false, data: {}, body: content };
  const end = content.indexOf('\n---', 4);
  if (end === -1) return { ok: false, data: {}, body: content };
  const block = content.slice(4, end);
  // body = everything after the closing '---' line
  const afterClose = content.indexOf('\n', end + 1);
  const body = afterClose === -1 ? '' : content.slice(afterClose + 1);
  const data: DocFrontmatter = {};
  const lines = block.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    const key = m[1];
    const val = m[2].trim();
    if (val === '') {
      // possible list
      const list: string[] = [];
      while (i + 1 < lines.length && /^\s*-\s+/.test(lines[i + 1])) {
        list.push(lines[++i].replace(/^\s*-\s+/, '').trim());
      }
      if (list.length) (data as Record<string, unknown>)[key] = list;
    } else if (key === 'doc_rank') {
      data.doc_rank = Number.parseInt(val, 10);
    } else {
      (data as Record<string, unknown>)[key] = val;
    }
  }
  return { ok: true, data, body };
}

function normalizeBody(body: string): string {
  return body.replace(/\r\n/g, '\n').replace(/\s+$/, '') + '\n';
}

export function hashBody(body: string): string {
  return 'sha256:' + createHash('sha256').update(normalizeBody(body)).digest('hex');
}

export function writeManagedFrontmatter(
  content: string,
  fields: { doc_rank: number; status: DocStatus; last_updated: string; content_hash: string | null },
): string {
  const managed: Record<string, string> = {
    doc_rank: String(fields.doc_rank),
    status: fields.status,
    last_updated: fields.last_updated,
    content_hash: fields.content_hash ?? '<temp>',
  };
  const has = content.startsWith('---\n') && content.indexOf('\n---', 4) !== -1;
  if (!has) {
    const fm = MANAGED_KEYS.map(k => `${k}: ${managed[k]}`).join('\n');
    return `---\n${fm}\n---\n\n${content}`;
  }
  const end = content.indexOf('\n---', 4);
  const block = content.slice(4, end);
  const afterClose = content.indexOf('\n', end + 1);
  const rest = afterClose === -1 ? '' : content.slice(afterClose); // includes leading \n
  const lines = block.split('\n');
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const m = /^([A-Za-z0-9_]+):/.exec(line);
    const key = m?.[1];
    if (key && (MANAGED_KEYS as readonly string[]).includes(key)) {
      out.push(`${key}: ${managed[key]}`);
      seen.add(key);
    } else {
      out.push(line);
    }
  }
  for (const k of MANAGED_KEYS) if (!seen.has(k)) out.push(`${k}: ${managed[k]}`);
  return `---\n${out.join('\n')}\n---${rest}`;
}
```

- [ ] **Step 4: Run test + tsc**

Run: `npx vitest run tests/core/doc-tracking/frontmatter.test.ts && npx tsc --noEmit`
Expected: PASS (all); tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/core/doc-tracking/frontmatter.ts tests/core/doc-tracking/frontmatter.test.ts
git commit -m "feat(doc-tracking): front-matter parse + body-hash + managed-write"
```

---

## Task 4: DCR rank resolver

**Files:**
- Create: `src/core/doc-tracking/rank-resolver.ts`
- Test: `tests/core/doc-tracking/rank-resolver.test.ts`

**Interfaces:**
- Consumes: `matchGlob` (Task 1), `DocFrontmatter`/`DocTrackingConfig` (Task 1).
- Produces: `resolveRank(path: string, fm: DocFrontmatter, config: DocTrackingConfig): number`.
- Rule: front-matter `doc_rank` (finite int ≥0) > rankMap (en-spesifik = en uzun pattern string) > `defaultRank`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/doc-tracking/rank-resolver.test.ts
import { describe, it, expect } from 'vitest';
import { resolveRank } from '../../../src/core/doc-tracking/rank-resolver.js';
import { DEFAULT_DOC_TRACKING_CONFIG as C } from '../../../src/core/doc-tracking/types.js';

describe('resolveRank', () => {
  it('front-matter doc_rank overrides everything', () => {
    expect(resolveRank('docs/adr/090.md', { doc_rank: 3 }, C)).toBe(3);
  });
  it('rankMap glob applies when no override', () => {
    expect(resolveRank('docs/adr/090.md', {}, C)).toBe(1);
    expect(resolveRank('docs/analysis/x.md', {}, C)).toBe(90);
  });
  it('most-specific (longest) pattern wins', () => {
    expect(resolveRank('docs/DOC-POLICY.md', {}, C)).toBe(0); // exact beats docs/**-style
  });
  it('falls back to defaultRank', () => {
    expect(resolveRank('random/x.md', {}, C)).toBe(C.defaultRank);
  });
  it('ignores invalid override (negative / NaN)', () => {
    expect(resolveRank('docs/adr/090.md', { doc_rank: -2 }, C)).toBe(1);
    expect(resolveRank('random/x.md', { doc_rank: Number.NaN }, C)).toBe(C.defaultRank);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/doc-tracking/rank-resolver.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `rank-resolver.ts`**

```ts
// src/core/doc-tracking/rank-resolver.ts
import { matchGlob } from './glob.js';
import type { DocFrontmatter, DocTrackingConfig } from './types.js';

export function resolveRank(path: string, fm: DocFrontmatter, config: DocTrackingConfig): number {
  if (typeof fm.doc_rank === 'number' && Number.isInteger(fm.doc_rank) && fm.doc_rank >= 0) {
    return fm.doc_rank;
  }
  let best: { rank: number; spec: number } | null = null;
  for (const [pattern, rank] of Object.entries(config.rankMap)) {
    if (matchGlob(path, pattern)) {
      const spec = pattern.replace(/\*/g, '').length; // more literal chars = more specific
      if (!best || spec > best.spec) best = { rank, spec };
    }
  }
  return best ? best.rank : config.defaultRank;
}
```

- [ ] **Step 4: Run test + tsc**

Run: `npx vitest run tests/core/doc-tracking/rank-resolver.test.ts && npx tsc --noEmit`
Expected: PASS (5 tests); tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/core/doc-tracking/rank-resolver.ts tests/core/doc-tracking/rank-resolver.test.ts
git commit -m "feat(doc-tracking): DCR rank resolver (override > rankMap > default)"
```

---

## Task 5: Multi-signal stale scorer (pure)

**Files:**
- Create: `src/core/doc-tracking/stale-scorer.ts`
- Test: `tests/core/doc-tracking/stale-scorer.test.ts`

**Interfaces:**
- Consumes: `DocStatus`, `DocState`, `DocSignals`, `DocTrackingConfig` (Task 1).
- Produces: `scoreDoc(input: { doc_rank: number; status: DocStatus; signals: DocSignals }, config: DocTrackingConfig): { stale_score: number; priority_score: number; state: DocState }` and `ageThresholdDays(rank: number): number`.
- Formula (spec §6.2/§6.3):
  - `ageThresholdDays(rank) = min(365, max(14, round(30 + rank*1.5)))`
  - `ageComponent = clamp(age_days/threshold,0,1)*weights.ageMax`
  - `stale_score = clamp((content_drift?weights.content:0)+(code_drift===true?weights.code:0)+ageComponent, 0,100)`
  - `rankWeight = 1 + (maxRank - min(rank,maxRank))/maxRank`
  - `priority_score = clamp(stale_score*rankWeight,0,100)`
  - state: EXEMPT if status∈{draft,temp,frozen,superseded}; else FRESH if stale_score==0; else CRITICAL_STALE if priority_score≥criticalAt; else STALE if priority_score≥staleAt OR age_days>threshold; else DRIFT.

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/doc-tracking/stale-scorer.test.ts
import { describe, it, expect } from 'vitest';
import { scoreDoc, ageThresholdDays } from '../../../src/core/doc-tracking/stale-scorer.js';
import { DEFAULT_DOC_TRACKING_CONFIG as C } from '../../../src/core/doc-tracking/types.js';

const sig = (o: Partial<{ content_drift: boolean; code_drift: boolean | null; age_days: number }>) =>
  ({ content_drift: false, code_drift: null, age_days: 0, ...o });

describe('ageThresholdDays', () => {
  it('is rank-sensitive and clamped', () => {
    expect(ageThresholdDays(0)).toBe(30);
    expect(ageThresholdDays(100)).toBe(180);
    expect(ageThresholdDays(1000)).toBe(365);
  });
});

describe('scoreDoc', () => {
  it('EXEMPT for draft/temp/frozen regardless of signals', () => {
    expect(scoreDoc({ doc_rank: 0, status: 'temp', signals: sig({ content_drift: true }) }, C).state).toBe('EXEMPT');
  });
  it('FRESH when no drift and within age threshold', () => {
    const r = scoreDoc({ doc_rank: 50, status: 'active', signals: sig({}) }, C);
    expect(r.stale_score).toBe(0);
    expect(r.state).toBe('FRESH');
  });
  it('content_drift on a rank-0 doc escalates to CRITICAL_STALE', () => {
    const r = scoreDoc({ doc_rank: 0, status: 'active', signals: sig({ content_drift: true }) }, C);
    // stale_score=50, rankWeight=2 → priority=100 ≥ 80
    expect(r.stale_score).toBe(50);
    expect(r.priority_score).toBe(100);
    expect(r.state).toBe('CRITICAL_STALE');
  });
  it('content_drift on a high-rank doc is only DRIFT', () => {
    const r = scoreDoc({ doc_rank: 95, status: 'active', signals: sig({ content_drift: true }) }, C);
    // rankWeight≈1.05 → priority≈52.5 ≥ staleAt(50) → STALE (age not over) ... assert tier
    expect(['DRIFT', 'STALE']).toContain(r.state);
    expect(r.stale_score).toBe(50);
  });
  it('age beyond threshold yields STALE even without drift', () => {
    const r = scoreDoc({ doc_rank: 0, status: 'active', signals: sig({ age_days: 100 }) }, C);
    expect(r.state).toBe('STALE');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/doc-tracking/stale-scorer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `stale-scorer.ts`**

```ts
// src/core/doc-tracking/stale-scorer.ts
import type { DocState, DocStatus, DocSignals, DocTrackingConfig } from './types.js';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function ageThresholdDays(rank: number): number {
  return clamp(Math.round(30 + rank * 1.5), 14, 365);
}

export function scoreDoc(
  input: { doc_rank: number; status: DocStatus; signals: DocSignals },
  config: DocTrackingConfig,
): { stale_score: number; priority_score: number; state: DocState } {
  const { doc_rank, status, signals } = input;
  const { weights, criticalAt, staleAt, maxRank } = config.scoring;

  if (status === 'draft' || status === 'temp' || status === 'frozen' || status === 'superseded') {
    return { stale_score: 0, priority_score: 0, state: 'EXEMPT' };
  }

  const threshold = ageThresholdDays(doc_rank);
  const ageComponent = clamp(signals.age_days / threshold, 0, 1) * weights.ageMax;
  const stale_score = clamp(
    (signals.content_drift ? weights.content : 0) +
    (signals.code_drift === true ? weights.code : 0) +
    ageComponent, 0, 100,
  );
  const rankWeight = 1 + (maxRank - Math.min(doc_rank, maxRank)) / maxRank;
  const priority_score = clamp(stale_score * rankWeight, 0, 100);

  let state: DocState;
  if (stale_score === 0) state = 'FRESH';
  else if (priority_score >= criticalAt) state = 'CRITICAL_STALE';
  else if (priority_score >= staleAt || signals.age_days > threshold) state = 'STALE';
  else state = 'DRIFT';

  return { stale_score, priority_score, state };
}
```

- [ ] **Step 4: Run test + tsc**

Run: `npx vitest run tests/core/doc-tracking/stale-scorer.test.ts && npx tsc --noEmit`
Expected: PASS (all); tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/core/doc-tracking/stale-scorer.ts tests/core/doc-tracking/stale-scorer.test.ts
git commit -m "feat(doc-tracking): multi-signal stale scorer (pure)"
```

---

## Task 6: DocTrackingStore (own sqlite connection + doc_tracking table)

**Files:**
- Create: `src/core/doc-tracking/store.ts`
- Test: `tests/core/doc-tracking/store.test.ts`

**Interfaces:**
- Consumes: `DocRecord`, `DocSignals` (Task 1).
- Produces: class `DocTrackingStore` with:
  - `constructor(dbPath: string)` — opens better-sqlite3, `pragma WAL`, `CREATE TABLE IF NOT EXISTS doc_tracking`.
  - `upsertDoc(rec: DocRecord): void`
  - `getByPath(path: string): DocRecord | null`
  - `getAll(): DocRecord[]` (ordered by doc_rank ASC, priority_score DESC)
  - `pruneDeleted(existingPaths: string[]): number`
  - `close(): void`
- Note: `entries`/MemoryStore'a DOKUNMAZ; ayrı bağlantı (WAL çoklu-bağlantı güvenli). Test tmp db dosyasına işaret eder.

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/doc-tracking/store.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DocTrackingStore } from '../../../src/core/doc-tracking/store.js';
import type { DocRecord } from '../../../src/core/doc-tracking/types.js';

let dir: string; let store: DocTrackingStore;
const rec = (path: string, over: Partial<DocRecord> = {}): DocRecord => ({
  path, content_hash: 'sha256:a', last_updated: '2026-06-18T00:00:00Z', doc_rank: 10,
  status: 'active', stale_score: 0, priority_score: 0, state: 'FRESH',
  signals: { content_drift: false, code_drift: null, age_days: 0 },
  tracked_code: null, first_seen: '2026-06-18T00:00:00Z', last_scanned: '2026-06-18T00:00:00Z', ...over,
});
afterEach(() => { store?.close(); if (dir) rmSync(dir, { recursive: true, force: true }); });

describe('DocTrackingStore', () => {
  it('upserts and reads back a record (round-trip incl. JSON signals)', () => {
    dir = mkdtempSync(join(tmpdir(), 'dt-store-')); store = new DocTrackingStore(join(dir, 'memory.db'));
    store.upsertDoc(rec('docs/a.md', { state: 'DRIFT', signals: { content_drift: true, code_drift: null, age_days: 5 } }));
    const got = store.getByPath('docs/a.md');
    expect(got?.state).toBe('DRIFT');
    expect(got?.signals.content_drift).toBe(true);
  });
  it('upsert is last-write-wins on path PK', () => {
    dir = mkdtempSync(join(tmpdir(), 'dt-store-')); store = new DocTrackingStore(join(dir, 'memory.db'));
    store.upsertDoc(rec('docs/a.md', { doc_rank: 10 }));
    store.upsertDoc(rec('docs/a.md', { doc_rank: 2 }));
    expect(store.getByPath('docs/a.md')?.doc_rank).toBe(2);
    expect(store.getAll().length).toBe(1);
  });
  it('pruneDeleted removes rows whose path is no longer present', () => {
    dir = mkdtempSync(join(tmpdir(), 'dt-store-')); store = new DocTrackingStore(join(dir, 'memory.db'));
    store.upsertDoc(rec('docs/a.md')); store.upsertDoc(rec('docs/gone.md'));
    const n = store.pruneDeleted(['docs/a.md']);
    expect(n).toBe(1);
    expect(store.getByPath('docs/gone.md')).toBeNull();
  });
  it('does not create or touch the entries table', () => {
    dir = mkdtempSync(join(tmpdir(), 'dt-store-')); store = new DocTrackingStore(join(dir, 'memory.db'));
    store.upsertDoc(rec('docs/a.md'));
    // re-open same file: doc_tracking persists, no error
    store.close(); store = new DocTrackingStore(join(dir, 'memory.db'));
    expect(store.getAll().length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/doc-tracking/store.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `store.ts`**

```ts
// src/core/doc-tracking/store.ts
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DocRecord, DocSignals, DocState, DocStatus } from './types.js';

interface Row {
  path: string; content_hash: string | null; last_updated: string; doc_rank: number;
  status: string; stale_score: number; priority_score: number; state: string;
  signals: string; tracked_code: string | null; first_seen: string; last_scanned: string;
}

export class DocTrackingStore {
  private db: DatabaseType;
  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true }); // ensure .brain/ exists
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS doc_tracking (
        path TEXT PRIMARY KEY,
        content_hash TEXT,
        last_updated TEXT,
        doc_rank INTEGER,
        status TEXT,
        stale_score REAL,
        priority_score REAL,
        state TEXT,
        signals TEXT,
        tracked_code TEXT,
        first_seen TEXT,
        last_scanned TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_doc_tracking_state ON doc_tracking(state);
      CREATE INDEX IF NOT EXISTS idx_doc_tracking_rank ON doc_tracking(doc_rank);
    `);
  }

  private toRecord(r: Row): DocRecord {
    return {
      path: r.path, content_hash: r.content_hash, last_updated: r.last_updated,
      doc_rank: r.doc_rank, status: r.status as DocStatus, stale_score: r.stale_score,
      priority_score: r.priority_score, state: r.state as DocState,
      signals: JSON.parse(r.signals) as DocSignals,
      tracked_code: r.tracked_code ? (JSON.parse(r.tracked_code) as string[]) : null,
      first_seen: r.first_seen, last_scanned: r.last_scanned,
    };
  }

  upsertDoc(rec: DocRecord): void {
    this.db.prepare(`
      INSERT INTO doc_tracking
        (path, content_hash, last_updated, doc_rank, status, stale_score, priority_score, state, signals, tracked_code, first_seen, last_scanned)
      VALUES (@path,@content_hash,@last_updated,@doc_rank,@status,@stale_score,@priority_score,@state,@signals,@tracked_code,@first_seen,@last_scanned)
      ON CONFLICT(path) DO UPDATE SET
        content_hash=excluded.content_hash, last_updated=excluded.last_updated, doc_rank=excluded.doc_rank,
        status=excluded.status, stale_score=excluded.stale_score, priority_score=excluded.priority_score,
        state=excluded.state, signals=excluded.signals, tracked_code=excluded.tracked_code,
        last_scanned=excluded.last_scanned
    `).run({
      path: rec.path, content_hash: rec.content_hash, last_updated: rec.last_updated,
      doc_rank: rec.doc_rank, status: rec.status, stale_score: rec.stale_score,
      priority_score: rec.priority_score, state: rec.state,
      signals: JSON.stringify(rec.signals),
      tracked_code: rec.tracked_code ? JSON.stringify(rec.tracked_code) : null,
      first_seen: rec.first_seen, last_scanned: rec.last_scanned,
    });
  }

  getByPath(path: string): DocRecord | null {
    const r = this.db.prepare(`SELECT * FROM doc_tracking WHERE path = ?`).get(path) as Row | undefined;
    return r ? this.toRecord(r) : null;
  }

  getAll(): DocRecord[] {
    const rows = this.db.prepare(`SELECT * FROM doc_tracking ORDER BY doc_rank ASC, priority_score DESC`).all() as Row[];
    return rows.map(r => this.toRecord(r));
  }

  pruneDeleted(existingPaths: string[]): number {
    const keep = new Set(existingPaths);
    const all = this.db.prepare(`SELECT path FROM doc_tracking`).all() as Array<{ path: string }>;
    const del = this.db.prepare(`DELETE FROM doc_tracking WHERE path = ?`);
    let n = 0;
    for (const { path } of all) if (!keep.has(path)) { del.run(path); n++; }
    return n;
  }

  close(): void { this.db.close(); }
}
```

- [ ] **Step 4: Run test + tsc**

Run: `npx vitest run tests/core/doc-tracking/store.test.ts && npx tsc --noEmit`
Expected: PASS (4 tests); tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/core/doc-tracking/store.ts tests/core/doc-tracking/store.test.ts
git commit -m "feat(doc-tracking): DocTrackingStore (own sqlite conn + doc_tracking table)"
```

---

## Task 7: Scanner (end-to-end orchestration)

**Files:**
- Create: `src/core/doc-tracking/scanner.ts`
- Test: `tests/core/doc-tracking/scanner.test.ts`

**Interfaces:**
- Consumes: `loadDocTrackingConfig` is NOT used here (caller passes config); uses `matchGlob`, `parseFrontmatter`/`hashBody`/`writeManagedFrontmatter`, `resolveRank`, `scoreDoc`, `getFileGitDateAsync`, `DocTrackingStore`.
- Produces: `scanDocs(root: string, config: DocTrackingConfig, store: DocTrackingStore, opts: { write: boolean; prune: boolean; now?: number }): Promise<{ records: DocRecord[]; skipped: string[] }>`.
- Behavior per file: read → parseFrontmatter → status (`fm.status` || (`scratch/` prefix ? 'temp' : 'active')) → resolveRank → temp/draft ? hash=null : hashBody(body) → git-date → prev=store.getByPath → content_drift = (prev?.content_hash && hash && prev.content_hash!==hash) → code_drift=null (Phase 1) → age_days from last_updated → scoreDoc → if opts.write && !noFrontmatter: writeManagedFrontmatter → upsertDoc. Skips: trackIgnore match, non-`.md`, size>cap, unreadable. `now` injectable for deterministic age.

- [ ] **Step 1: Write the failing test** (real tmp repo tree)

```ts
// tests/core/doc-tracking/scanner.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanDocs } from '../../../src/core/doc-tracking/scanner.js';
import { DocTrackingStore } from '../../../src/core/doc-tracking/store.js';
import { DEFAULT_DOC_TRACKING_CONFIG as C } from '../../../src/core/doc-tracking/types.js';

let dir: string; let store: DocTrackingStore;
const mk = (p: string, body: string) => { mkdirSync(join(dir, p, '..'), { recursive: true }); writeFileSync(join(dir, p), body); };
afterEach(() => { store?.close(); if (dir) rmSync(dir, { recursive: true, force: true }); });

describe('scanDocs', () => {
  it('writes managed front-matter and records a fresh doc; ignores node_modules', async () => {
    dir = mkdtempSync(join(tmpdir(), 'dt-scan-')); store = new DocTrackingStore(join(dir, 'memory.db'));
    mk('docs/guide/x.md', '# Guide\nhello\n');
    mk('node_modules/pkg/readme.md', '# nope\n');
    const r = await scanDocs(dir, C, store, { write: true, prune: false, now: Date.parse('2026-06-18T00:00:00Z') });
    expect(r.records.find(x => x.path === 'docs/guide/x.md')?.doc_rank).toBe(20);
    expect(r.records.some(x => x.path.includes('node_modules'))).toBe(false);
    const written = readFileSync(join(dir, 'docs/guide/x.md'), 'utf-8');
    expect(written.startsWith('---\n')).toBe(true);
    expect(written).toContain('content_hash: sha256:');
  });

  it('detects content_drift on second scan after body edit', async () => {
    dir = mkdtempSync(join(tmpdir(), 'dt-scan-')); store = new DocTrackingStore(join(dir, 'memory.db'));
    mk('docs/reference/a.md', '# A\nv1\n');
    await scanDocs(dir, C, store, { write: true, prune: false, now: Date.parse('2026-06-18T00:00:00Z') });
    // edit body
    const cur = readFileSync(join(dir, 'docs/reference/a.md'), 'utf-8');
    writeFileSync(join(dir, 'docs/reference/a.md'), cur.replace('v1', 'v2-changed'));
    const r2 = await scanDocs(dir, C, store, { write: true, prune: false, now: Date.parse('2026-06-18T00:00:00Z') });
    const rec = r2.records.find(x => x.path === 'docs/reference/a.md')!;
    expect(rec.signals.content_drift).toBe(true);
  });

  it('treats scratch/ and status:temp as EXEMPT (no hash)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'dt-scan-')); store = new DocTrackingStore(join(dir, 'memory.db'));
    mk('scratch/note.md', '# tmp\n');
    mk('docs/d.md', '---\nstatus: draft\n---\n# d\n');
    const r = await scanDocs(dir, C, store, { write: false, prune: false, now: Date.now() });
    expect(r.records.find(x => x.path === 'scratch/note.md')).toBeUndefined(); // scratch is in trackIgnore
    expect(r.records.find(x => x.path === 'docs/d.md')?.state).toBe('EXEMPT');
    expect(r.records.find(x => x.path === 'docs/d.md')?.content_hash).toBeNull();
  });
});
```

> Not: `scratch/**` trackIgnore'da → taranmaz (kayıt yok); `status:draft` → taranır ama EXEMPT + hash yok. İkisi de "geçici hashlenmez" kuralını karşılar (biri exclude, biri exempt). Test ikisini de doğrular.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/doc-tracking/scanner.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `scanner.ts`**

```ts
// src/core/doc-tracking/scanner.ts
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { matchGlob } from './glob.js';
import { parseFrontmatter, hashBody, writeManagedFrontmatter } from './frontmatter.js';
import { resolveRank } from './rank-resolver.js';
import { scoreDoc } from './stale-scorer.js';
import { getFileGitDateAsync } from './git-date.js';
import type { DocTrackingStore } from './store.js';
import type { DocRecord, DocStatus, DocTrackingConfig } from './types.js';

const toPosix = (p: string) => p.split(sep).join('/');

function isIgnored(rel: string, config: DocTrackingConfig): boolean {
  return config.trackIgnore.some(g => matchGlob(rel, g));
}

async function walkMarkdown(root: string, config: DocTrackingConfig): Promise<string[]> {
  const out: string[] = [];
  async function rec(absDir: string): Promise<void> {
    let entries;
    try { entries = await readdir(absDir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const abs = join(absDir, e.name);
      const rel = toPosix(relative(root, abs));
      if (e.isDirectory()) {
        // dir-level prune (skip node_modules/dist/.git/archive/… without descending)
        if (config.trackIgnore.some(g => matchGlob(rel, g) || matchGlob(rel + '/_probe.md', g))) continue;
        await rec(abs);
      } else if (e.isFile() && e.name.endsWith('.md')) {
        if (isIgnored(rel, config)) continue;
        out.push(rel);
      }
    }
  }
  await rec(root);
  return out;
}

export async function scanDocs(
  root: string,
  config: DocTrackingConfig,
  store: DocTrackingStore,
  opts: { write: boolean; prune: boolean; now?: number },
): Promise<{ records: DocRecord[]; skipped: string[] }> {
  const now = opts.now ?? Date.now();
  const nowIso = new Date(now).toISOString();
  const files = await walkMarkdown(root, config);
  const records: DocRecord[] = [];
  const skipped: string[] = [];

  for (const rel of files) {
    const abs = join(root, rel);
    let raw: string;
    try {
      const st = await stat(abs);
      if (st.size > config.sizeCapBytes) { skipped.push(rel); continue; }
      raw = await readFile(abs, 'utf-8');
    } catch { skipped.push(rel); continue; }

    const parsed = parseFrontmatter(raw);
    const fm = parsed.data;
    const isScratch = rel.startsWith('scratch/');
    const status: DocStatus = (fm.status as DocStatus) ?? (isScratch ? 'temp' : 'active');
    const isTemp = status === 'draft' || status === 'temp';
    const doc_rank = resolveRank(rel, fm, config);
    const tracked_code = Array.isArray(fm.tracks) ? fm.tracks : null;

    const content_hash = isTemp ? null : hashBody(parsed.ok ? parsed.body : raw);
    const gitMs = await getFileGitDateAsync(root, rel);
    const last_updated = gitMs > 0 ? new Date(gitMs).toISOString() : nowIso;
    const age_days = gitMs > 0 ? Math.max(0, Math.floor((now - gitMs) / 86400000)) : 0;

    const prev = store.getByPath(rel);
    const content_drift = !!(prev?.content_hash && content_hash && prev.content_hash !== content_hash);
    const signals = { content_drift, code_drift: null as boolean | null, age_days };

    const { stale_score, priority_score, state } = scoreDoc({ doc_rank, status, signals }, config);

    if (opts.write && !isTemp && !config.noFrontmatter.some(g => matchGlob(rel, g))) {
      const updated = writeManagedFrontmatter(raw, { doc_rank, status, last_updated: last_updated.slice(0, 10), content_hash });
      if (updated !== raw) {
        try { await writeFile(abs, updated, 'utf-8'); } catch { /* warn-and-continue */ }
      }
    }

    const rec: DocRecord = {
      path: rel, content_hash, last_updated, doc_rank, status,
      stale_score, priority_score, state, signals, tracked_code,
      first_seen: prev?.first_seen ?? nowIso, last_scanned: nowIso,
    };
    store.upsertDoc(rec);
    records.push(rec);
  }

  if (opts.prune) store.pruneDeleted(records.map(r => r.path));
  return { records, skipped };
}
```

> **content_drift idempotency notu:** ilk scan `content_hash`'i hem dosyaya yazar hem DB'ye kaydeder. İkinci scan front-matter'lı dosyayı okur, gövde-hash'i değişmediyse drift=false. Test "edit body" senaryosunda gövde değişir → hash değişir → drift=true. Front-matter'ın kendi içindeki `content_hash` satırı gövdeye dahil olmadığından (parse ile ayrılır) churn yok.

- [ ] **Step 4: Run test + tsc + full doc-tracking suite**

Run: `npx vitest run tests/core/doc-tracking/ && npx tsc --noEmit`
Expected: PASS (all modules); tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/core/doc-tracking/scanner.ts tests/core/doc-tracking/scanner.test.ts
git commit -m "feat(doc-tracking): scanner (walk + hash + git-date + score + write + record)"
```

---

## Task 8: CLI `docs track scan|status|sync` + i18n

**Files:**
- Modify: `src/cli/commands/docs.ts` (add `track` subcommand inside `registerDocs`)
- Modify: `src/cli/helpers/messages.ts` (add `docs.track.*` keys)
- Test: `tests/cli/docs-track.test.ts`

**Interfaces:**
- Consumes: `loadDocTrackingConfig`, `scanDocs`, `DocTrackingStore` (Tasks 1/6/7), `getMessage`/`getLanguage`, `resolveProjectRoot`, `print`/`printError`.
- Produces: CLI verbs `deckent docs track scan [--no-write] [--prune]`, `deckent docs track status [--stale] [--rank <n>] [--json]`, `deckent docs track sync`. `.brain/memory.db` yolu = `join(root, '.brain/memory.db')`.

- [ ] **Step 1: Add i18n keys to `messages.ts`** (insert into the `MESSAGES` object, near other command groups)

```ts
  // ─── docs track command ─────────────────────────────────────────────
  'docs.track.scanned': {
    en: 'Scanned {count} docs ({stale} need attention).',
    tr: '{count} doküman tarandı ({stale} dikkat gerektiriyor).',
  },
  'docs.track.none': {
    en: 'No tracked docs found.',
    tr: 'İzlenen doküman bulunamadı.',
  },
  'docs.track.header': {
    en: 'rank  state           score  path',
    tr: 'kod   durum           skor   yol',
  },
  'docs.track.synced': {
    en: 'Synced {count} docs to memory.db (no front-matter written).',
    tr: '{count} doküman memory.db ile senkronlandı (front-matter yazılmadı).',
  },
```

- [ ] **Step 2: Write the failing CLI test** (drives the real action via a small exported handler)

```ts
// tests/cli/docs-track.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runDocsTrackScan } from '../../src/cli/commands/docs.js';

let dir: string;
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

describe('runDocsTrackScan', () => {
  it('scans the repo, writes front-matter, persists to memory.db', async () => {
    dir = mkdtempSync(join(tmpdir(), 'dt-cli-'));
    mkdirSync(join(dir, 'docs/guide'), { recursive: true });
    writeFileSync(join(dir, 'docs/guide/g.md'), '# G\nbody\n');
    const res = await runDocsTrackScan(dir, { write: true, prune: false });
    expect(res.count).toBeGreaterThanOrEqual(1);
    expect(readFileSync(join(dir, 'docs/guide/g.md'), 'utf-8')).toContain('doc_rank:');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/cli/docs-track.test.ts`
Expected: FAIL — `runDocsTrackScan` not exported.

- [ ] **Step 4: Implement in `docs.ts`** — add exported handlers + wire commander `track` subcommand. Add these imports at top and the handlers + registration (inside `registerDocs`, after the `docs list` block).

```ts
// add to imports in src/cli/commands/docs.ts
import { loadDocTrackingConfig } from '../../core/doc-tracking/config.js';
import { scanDocs } from '../../core/doc-tracking/scanner.js';
import { DocTrackingStore } from '../../core/doc-tracking/store.js';
import { getLanguage, getMessage } from '../helpers/messages.js';

// exported handler (testable without commander)
export async function runDocsTrackScan(
  root: string,
  opts: { write: boolean; prune: boolean },
): Promise<{ count: number; stale: number }> {
  const config = loadDocTrackingConfig(root);
  const store = new DocTrackingStore(join(root, '.brain/memory.db'));
  try {
    const { records } = await scanDocs(root, config, store, { write: opts.write, prune: opts.prune });
    const stale = records.filter(r => r.state === 'STALE' || r.state === 'CRITICAL_STALE').length;
    return { count: records.length, stale };
  } finally {
    store.close();
  }
}

export function runDocsTrackStatus(
  root: string,
  filter: { stale: boolean; rank?: number },
): Array<{ doc_rank: number; state: string; priority_score: number; path: string }> {
  const store = new DocTrackingStore(join(root, '.brain/memory.db'));
  try {
    return store.getAll()
      .filter(r => (filter.stale ? r.state === 'STALE' || r.state === 'CRITICAL_STALE' || r.state === 'DRIFT' : true))
      .filter(r => (filter.rank === undefined ? true : r.doc_rank <= filter.rank))
      .map(r => ({ doc_rank: r.doc_rank, state: r.state, priority_score: r.priority_score, path: r.path }));
  } finally {
    store.close();
  }
}
```

Then register the subcommand (inside `registerDocs`, after `docs list`):

```ts
  // ─── docs track ─────────────────────────────────────────────────────────
  const track = docs.command('track').description('Track doc freshness (hash + DCR + stale)');

  track
    .command('scan')
    .description('Hash + timestamp + rank all docs; write front-matter; sync memory.db')
    .option('--no-write', 'Do not modify front-matter (DB-only)')
    .option('--prune', 'Remove records for deleted docs')
    .action(async (opts: { write: boolean; prune?: boolean }) => {
      const root = resolveProjectRoot();
      const lang = getLanguage();
      const { count, stale } = await runDocsTrackScan(root, { write: opts.write, prune: !!opts.prune });
      print(getMessage('docs.track.scanned', lang, { count: String(count), stale: String(stale) }));
    });

  track
    .command('status')
    .description('Report tracked docs by rank + stale state')
    .option('--stale', 'Only DRIFT/STALE/CRITICAL_STALE')
    .option('--rank <n>', 'Only docs with doc_rank <= n', parseInt)
    .option('--json', 'Raw JSON output')
    .action((opts: { stale?: boolean; rank?: number; json?: boolean }) => {
      const root = resolveProjectRoot();
      const lang = getLanguage();
      const rows = runDocsTrackStatus(root, { stale: !!opts.stale, rank: opts.rank });
      if (opts.json) { print(JSON.stringify(rows, null, 2)); return; }
      if (rows.length === 0) { print(getMessage('docs.track.none', lang)); return; }
      print(getMessage('docs.track.header', lang));
      for (const r of rows) {
        print(`${String(r.doc_rank).padEnd(5)} ${r.state.padEnd(15)} ${String(Math.round(r.priority_score)).padEnd(6)} ${r.path}`);
      }
    });

  track
    .command('sync')
    .description('Update memory.db only (no front-matter writes)')
    .action(async () => {
      const root = resolveProjectRoot();
      const lang = getLanguage();
      const { count } = await runDocsTrackScan(root, { write: false, prune: false });
      print(getMessage('docs.track.synced', lang, { count: String(count) }));
    });
```

> Commander `--no-write` otomatik `opts.write` (boolean, default true) üretir. `scan` default front-matter yazar; `--no-write` DB-only.

- [ ] **Step 5: Run test + tsc**

Run: `npx vitest run tests/cli/docs-track.test.ts && npx tsc --noEmit`
Expected: PASS; tsc clean.

- [ ] **Step 6: Proof-of-function (real binary, Tier-1 user-surface)**

Run:
```bash
npm run build
node dist/cli/entry.js docs track scan --no-write
node dist/cli/entry.js docs track status --stale
```
Expected: `Scanned N docs (...)` ve stale tablo/`No tracked docs` çıktısı (gerçek stdout, mock değil). (Build sonrası MCP kullanılacaksa `/mcp restart` Alperen tarafından.)

- [ ] **Step 7: Commit**

```bash
git add src/cli/commands/docs.ts src/cli/helpers/messages.ts tests/cli/docs-track.test.ts
git commit -m "feat(doc-tracking): deckent docs track scan/status/sync CLI + i18n"
```

---

## Task 9: ADR-090 + api-surface documentation

**Files:**
- Create: `docs/adr/090-doc-tracking.md`
- Modify: `docs/reference/api-surface.md` (add `doc_tracking` table + docs.json `tracking` block)
- (No test — documentation. tsc unaffected.)

- [ ] **Step 1: Write `docs/adr/090-doc-tracking.md`** (MADR v3 hibrit; mevcut ADR formatına uy — `# ADR-090: ...`, `**Status:** accepted`, `**Date:** 2026-06-18`, `---`, Context/Decision/Consequences/References)

```markdown
# ADR-090: Documentation Tracking & Staleness (DCR + content-hash + multi-signal)

**Status:** accepted

**Date:** 2026-06-18

---

**Context:** Projelerde dokümantasyon karmaşıklaşıyor; hangi doc güncel, hangisi koddan geride, hangisi önemli — körlemesine. DOC-POLICY.md'nin 4-katmanlı tiering'i el-bakımlı; ADR-031 content-hash yalnız managed-docs auto-section'ları için.

**Decision:** Her (geçici-olmayan) `.md` dokümana **DCR (Document Criticality Rank — `doc_rank`, 0=en kritik, sonsuz seviye)** + **gövde-content-hash (sha256)** + **last_updated** ata; bunları hem YAML front-matter'da hem `memory.db` `doc_tracking` tablosunda (ayrı `better-sqlite3` bağlantısı, `entries`'e dokunmadan) izle. **Çok-sinyalli stale**: content-drift + age (rank-duyarlı eşik) + (Faz 2) code-drift; `doc_rank` ile ağırlıklı `priority_score`. Geçici doc (`scratch/` veya `status:draft|temp`) hashlenmez (EXEMPT). Kapsam: tüm repo `**/*.md` − `trackIgnore`. `CLAUDE.md`/`DECKENT.md`/`AGENTS.md`/`GEMINI.md` = DB-only (front-matter enjeksiyonu riskli).

**Consequences (+):** Stale/önemli doc'lar makine-tespitli; takip/öneri/analiz netleşir; DOC-POLICY tiering'inin sayısal genelleştirmesi. Mevcut `doc-cache` (SHA-1) ve MemoryStore bozulmaz (additive).

**Consequences (−):** Front-matter mutasyonu git-diff gürültüsü ekler (gövde-only hash ile churn sınırlı); ikinci sqlite bağlantısı (WAL ile güvenli). Code-drift + CI-gate + MCP/dashboard Faz 2'ye ertelendi.

**References:** `docs/superpowers/specs/2026-06-18-doc-tracking-design.md`, ADR-029/030/031 (managed-docs), ADR-088 (Memory V2), ADR-010 (no new dep), ADR-087 (async I/O).
```

- [ ] **Step 2: Append `doc_tracking` schema to `docs/reference/api-surface.md`** (under the `.brain/ File Formats` area). Add this section:

```markdown
## doc_tracking Table (ADR-090)

Separate `better-sqlite3` connection to `.brain/memory.db` (does NOT touch `entries`).

| Column | Type | Meaning |
|--------|------|---------|
| path | TEXT PK | repo-relative POSIX path |
| content_hash | TEXT | `sha256:…` of body (front-matter excluded); null when EXEMPT/temp |
| last_updated | TEXT | ISO8601 git author-date (mtime fallback) |
| doc_rank | INTEGER | DCR — 0=most critical, unbounded |
| status | TEXT | active\|draft\|temp\|frozen\|superseded |
| stale_score | REAL | 0..100 rank-independent severity |
| priority_score | REAL | 0..100 rank-weighted urgency |
| state | TEXT | FRESH\|DRIFT\|STALE\|CRITICAL_STALE\|EXEMPT |
| signals | TEXT | JSON {content_drift, code_drift, age_days} |
| tracked_code | TEXT | JSON string[] (`tracks` globs) or null |
| first_seen / last_scanned | TEXT | ISO8601 |

`.deckent/settings/docs.json` additive `tracking` block: `rankMap`, `defaultRank`, `trackIgnore`, `noFrontmatter`, `scoring{weights,criticalAt,staleAt,maxRank}`, `sizeCapBytes`.
```

- [ ] **Step 3: Verify lint/docs**

Run: `npm run lint:adr && npx tsc --noEmit`
Expected: ADR validator passes (ADR-090 well-formed); tsc clean.

- [ ] **Step 4: Commit**

```bash
git add docs/adr/090-doc-tracking.md docs/reference/api-surface.md
git commit -m "docs(doc-tracking): ADR-090 + api-surface doc_tracking schema"
```

- [ ] **Step 5: Final full-suite gate**

Run: `npm run lint && npx vitest run tests/core/doc-tracking/ tests/cli/docs-track.test.ts && npm run test:ci-sim`
Expected: tsc clean; all doc-tracking + CLI tests pass; ci-sim green (hermetic).

> **Memory hook (post-merge, manuel):** Brain `memory.db`'ye ADR-090 entry'si ekler (`store.insert({type:'adr', status:'accepted', ...})`); `deckent memory export` ile `.brain/exports/decisions.md` yenilenir. MASTER-PLAN §10'a "Doc-Tracking Faz 1 ✅" satırı + Faz 2 (code-drift/`--check`/sprint-hook/MCP-dashboard) açık-iş eklenir.

---

## Notes / Spec deviations (intentional, low-risk)
- **git-date:** spec §7 `sync.ts`'teki util'i core'a TAŞIMAYI önermişti; bunun yerine core'da yeni **async** `getFileGitDateAsync` yazıldı, `sync.ts`'in sync sürümü dokunulmadan bırakıldı (caller-ripple/risk yok + ADR-087 async). Küçük duplikasyon, ADR-008/087 ile gerekçeli.
- **DB:** spec §5 `applyAdditiveMigrations`'a ekleme önerisiydi; `DocTrackingStore` kendi bağlantısını açar (MemoryStore'a sıfır-dokunuş, hermetik-test-kolay, ADR-008-temiz). `doc_tracking` tablosu `entries`'ten bağımsız.
- **code-drift:** Faz 1'de `code_drift` daima `null` (scorer hazır; `tracks` git-karşılaştırma wiring'i Faz 2).
