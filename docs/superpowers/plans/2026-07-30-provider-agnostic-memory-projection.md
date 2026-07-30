# Provider-Agnostic Core-Memory Projection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** deckent projects the single core-memory authority (`.deckent/docs/core-memory/`) one-way onto all five assistant surfaces (claude-code, codex, gemini-cli, cursor, copilot) via native file mirrors + namespaced managed instruction blocks, driven by one shared `runWorkspaceSync` service (CLI + MCP + finalizer + Stop hook).

**Architecture:** Approach A from the spec (`docs/superpowers/specs/2026-07-30-provider-agnostic-memory-projection-design.md`): new sibling modules in `src/core/` following the `rule-generator.ts` marker discipline but with a `DECKENT:CORE-MEMORY` namespace, an ownership manifest as the only deletion authority, and a shared workspace-sync service consumed by every trigger surface. rule-generator itself is not modified.

**Tech Stack:** TypeScript (Node16 ESM — every relative import ends in `.js`), `node:fs`/`node:path`/`node:crypto`, vitest (hermetic tmpdir), existing `getMessage` i18n (en+tr).

## Global Constraints

- **Spec is authority:** `docs/superpowers/specs/2026-07-30-provider-agnostic-memory-projection-design.md`. On conflict, spec wins; flag it, don't improvise.
- **ESM:** relative imports MUST end in `.js` (Node16 resolution).
- **i18n-FIRST:** generator modules are string-free (typed `messageKey`); CLI/MCP render via `getMessage(key, lang)` with en+tr entries in `src/cli/helpers/messages.ts`. Generated file content is English mechanism-content (ADR-032, same as rule-generator).
- **Hermetic tests:** all fixtures under `os.tmpdir()` (`mkdtempSync`), cleanup in `afterEach`, async `spawn` only (no `spawnSync` in tests), suite runs with `VITEST_MAX_FORKS=2`, ≤16 GB.
- **One-way projection:** authority is never written; `--backup/--restore/--bidirectional` are typed errors; timestamp newer-wins forbidden.
- **`enabled` defaults to `false`** — dogfood enablement is a config change in deckent-dev only (Task 14).
- **Deletion authority = ownership manifest only.** Foreign files are never deleted.
- **Commits are owner-gated** (project rule: commit only when Alperen asks). A task's "Commit" step means: `git add` the listed files, report the intended commit message, and commit **only at an owner-approved checkpoint**. `git branch -vv` before any actual commit.
- **No sprint-time `npm run build`** if a deckent sprint is live; Task 14's build happens at an owner-coordinated moment.
- Test count/lint gates: `npm run lint` (tsc --noEmit) must stay green after every task.

## File Structure (locked decomposition)

| File | Responsibility |
|---|---|
| `src/core/assistant-surface-registry.ts` (new) | Surface contracts: ids, dirs, formats, capabilities. Zero I/O. |
| `src/core/memory-projection-manifest.ts` (new) | Manifest schema, read/validate/atomic-write, sha256 digests. |
| `src/core/memory-projection-render.ts` (new) | Namespaced markers, block rendering, link rewrite, skeletons. Pure. |
| `src/core/memory-projection-generator.ts` (new) | Orchestrates mirror+block+manifest per target; lock; result contract. |
| `src/core/workspace-sync.ts` (new) | `runWorkspaceSync` shared service (adapters + memory scopes, modes, exit codes). |
| `src/core/config-types.ts` (modify) | `MemoryProjectionConfig` + key on both config interfaces. |
| `src/core/config.ts` (modify) | Validation, CONFIG_METADATA, **both** twin literals. |
| `src/core/identity-generator.ts` (modify) | Post-finalize Step 5 (memory projection) + result fields. |
| `src/cli/commands/sync.ts` (modify) | `--memory-only`, `--check`, `--memory-deprovision` flags; service call; exit codes; i18n output. |
| `src/mcp/tools/sync.ts` (modify) | `mode`/`scope` args; structured result via the same service. |
| `src/cli/helpers/messages.ts` (modify) | `sync.memory.*` keys, en+tr. |
| `scripts/sync-core-memory.mjs` (rewrite) | Thin compatibility wrapper → CLI `sync --memory-only`; guards preserved. |
| `.claude/settings.json` (modify) | Stop hook → wrapper without `--backup`. |
| `docs/MASTER-PLAN.md` (modify) | Rows 190/230 reconciliation. |
| `docs/reference/config-reference.md`, `docs/reference/features.md`, `DECKENT.md` (modify) | Docs. |

---

### Task 1: MASTER-PLAN reconciliation (rows 190/230)

**Files:**
- Modify: `docs/MASTER-PLAN.md:434` (row 190 `MEMORY-AUTHORITY-001`), `docs/MASTER-PLAN.md:438` (row 230 `MEMORY-SYNC-001`)

**Interfaces:** none (docs). Later tasks cite these row IDs in commit messages.

- [ ] **Step 1: Amend row 190.** In the row 190 line, replace the acceptance text `Revision/hash conflict journal; no silent delete; Claude, Codex, Gemini parity` with `Revision/hash conflict journal; no silent delete (ownership manifest); Claude, Codex, Gemini, Cursor, Copilot parity` and replace the note `` `sync-core-memory.mjs` currently Claude-authoritative `` with `` design locked: docs/superpowers/specs/2026-07-30-provider-agnostic-memory-projection-design.md ``. Update the row's date cell to `2026-07-30`.
- [ ] **Step 2: Amend row 230.** Replace the acceptance text `Hash/revision conflict journal, no silent delete, dry-run, backup/restore and platform adapters` with `Hash/revision conflict journal, no silent delete (ownership manifest), dry-run/check, one-way only + typed forbidden modes, platform adapters, Cursor+Copilot coverage`. Replace the note `Current script mirrors Claude HOME destructively` with `rev-2 design approved 2026-07-30; backup/restore criterion retired (one-way decision)`. Update the date cell to `2026-07-30`.
- [ ] **Step 3: Verify.** Run: `grep -n "MEMORY-AUTHORITY-001\|MEMORY-SYNC-001" docs/MASTER-PLAN.md` — both rows show the new text, no `backup/restore` remains in row 230.
- [ ] **Step 4: Stage (owner-gated commit).** `git add docs/MASTER-PLAN.md` — message: `docs(master-plan): reconcile MEMORY-AUTHORITY-001/MEMORY-SYNC-001 with one-way projection design`

---

### Task 2: Assistant-surface registry

**Files:**
- Create: `src/core/assistant-surface-registry.ts`
- Test: `tests/core/assistant-surface-registry.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 3, 5, 6, 7, 9):
  - `type AssistantSurfaceId = 'claude-code' | 'codex' | 'gemini-cli' | 'cursor' | 'copilot'`
  - `interface AssistantSurface { id: AssistantSurfaceId; instructionFile: string; memoryDir: string; instructionFormat: 'markdown' | 'mdc'; importStyle: 'none' | 'at-relative'; coLoadedInstructionFiles: string[]; skeleton: 'markdown-title' | 'mdc-always-apply'; }`
  - `const ASSISTANT_SURFACES: readonly AssistantSurface[]`
  - `function getAssistantSurface(id: string): AssistantSurface | null`
  - `function isAssistantSurfaceId(value: string): value is AssistantSurfaceId`

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/assistant-surface-registry.test.ts
import { describe, it, expect } from 'vitest';
import {
  ASSISTANT_SURFACES, getAssistantSurface, isAssistantSurfaceId,
} from '../../src/core/assistant-surface-registry.js';

describe('assistant-surface-registry', () => {
  it('contains exactly the five spec surfaces', () => {
    expect(ASSISTANT_SURFACES.map(s => s.id).sort()).toEqual(
      ['claude-code', 'codex', 'copilot', 'cursor', 'gemini-cli'],
    );
  });

  it('codex has no import support and roots at AGENTS.md', () => {
    const codex = getAssistantSurface('codex')!;
    expect(codex.instructionFile).toBe('AGENTS.md');
    expect(codex.memoryDir).toBe('.codex/memory');
    expect(codex.importStyle).toBe('none');
  });

  it('cursor is mdc with alwaysApply skeleton', () => {
    const cursor = getAssistantSurface('cursor')!;
    expect(cursor.instructionFile).toBe('.cursor/rules/memory.mdc');
    expect(cursor.instructionFormat).toBe('mdc');
    expect(cursor.skeleton).toBe('mdc-always-apply');
  });

  it('copilot declares co-loaded instruction files (duplicate-free contract input)', () => {
    const copilot = getAssistantSurface('copilot')!;
    expect(copilot.coLoadedInstructionFiles).toEqual(['AGENTS.md', 'CLAUDE.md', 'GEMINI.md']);
    expect(copilot.importStyle).toBe('at-relative');
    expect(copilot.memoryDir).toBe('.github/deckent-memory');
  });

  it('rejects unknown ids honestly', () => {
    expect(getAssistantSurface('ollama')).toBeNull();
    expect(isAssistantSurfaceId('claude')).toBe(false);   // execution ProviderName, not a surface id
    expect(isAssistantSurfaceId('claude-code')).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `npx vitest run tests/core/assistant-surface-registry.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement**

```ts
// src/core/assistant-surface-registry.ts
// ═══ Assistant Surface Registry ══════════════════════════════════
// Single source of assistant-surface contracts for core-memory projection.
// Surface ids identify HOST surfaces, not execution providers (see
// buildHostAdapterSyncMap in src/cli/commands/sync.ts) — 'cursor'/'copilot'
// are never valid ProviderName values and must not mix with routing.

export type AssistantSurfaceId = 'claude-code' | 'codex' | 'gemini-cli' | 'cursor' | 'copilot';

export interface AssistantSurface {
  id: AssistantSurfaceId;
  /** Repo-relative managed-block target. */
  instructionFile: string;
  /** Repo-relative projector-owned mirror dir (never a native writable memory). */
  memoryDir: string;
  instructionFormat: 'markdown' | 'mdc';
  /** Native import support inside the instruction file. */
  importStyle: 'none' | 'at-relative';
  /** Other instruction files this surface also auto-loads (duplicate-free contract input). */
  coLoadedInstructionFiles: string[];
  skeleton: 'markdown-title' | 'mdc-always-apply';
}

export const ASSISTANT_SURFACES: readonly AssistantSurface[] = Object.freeze([
  { id: 'claude-code', instructionFile: 'CLAUDE.md', memoryDir: '.claude/memory',
    instructionFormat: 'markdown', importStyle: 'at-relative', coLoadedInstructionFiles: [], skeleton: 'markdown-title' },
  { id: 'codex', instructionFile: 'AGENTS.md', memoryDir: '.codex/memory',
    instructionFormat: 'markdown', importStyle: 'none', coLoadedInstructionFiles: [], skeleton: 'markdown-title' },
  { id: 'gemini-cli', instructionFile: 'GEMINI.md', memoryDir: '.gemini/memory',
    instructionFormat: 'markdown', importStyle: 'at-relative', coLoadedInstructionFiles: [], skeleton: 'markdown-title' },
  { id: 'cursor', instructionFile: '.cursor/rules/memory.mdc', memoryDir: '.cursor/memory',
    instructionFormat: 'mdc', importStyle: 'none', coLoadedInstructionFiles: [], skeleton: 'mdc-always-apply' },
  { id: 'copilot', instructionFile: '.github/copilot-instructions.md', memoryDir: '.github/deckent-memory',
    instructionFormat: 'markdown', importStyle: 'at-relative',
    coLoadedInstructionFiles: ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md'], skeleton: 'markdown-title' },
].map(s => Object.freeze(s)));

export function getAssistantSurface(id: string): AssistantSurface | null {
  return ASSISTANT_SURFACES.find(s => s.id === id) ?? null;
}

export function isAssistantSurfaceId(value: string): value is AssistantSurfaceId {
  return getAssistantSurface(value) !== null;
}
```

- [ ] **Step 4: Run to verify pass.** `npx vitest run tests/core/assistant-surface-registry.test.ts` — Expected: PASS. Then `npm run lint`.
- [ ] **Step 5: Stage (owner-gated).** Message: `feat(memory-projection): assistant-surface registry (MEMORY-AUTHORITY-001)`

---

### Task 3: `memory_projection` config key (types + validation + twins + metadata)

**Files:**
- Modify: `src/core/config-types.ts` (interface + both config interfaces at the `cross_verify` anchors, `:1251` and `:1807`)
- Modify: `src/core/config.ts` (validation near the `cross_verify` block `~:1049`; `CONFIG_METADATA` `:2410`; **both** twin literals `~:2148` and `~:2964`)
- Test: extend `tests/core/config-validation.test.ts` and the config-flag-roundtrip parity test (`tests/core/config.test.ts` — locate the existing type-vs-live check with `grep -n "roundtrip" tests/core/*.test.ts`)

**Interfaces:**
- Produces (consumed by Tasks 6, 7, 9, 12):

```ts
export interface MemoryProjectionConfig {
  /** Master gate. Absent/false = feature off (zero writes). */
  enabled?: boolean;
  /** AssistantSurfaceId values (JSON key name 'providers' is an owner decision). Omitted while enabled = full registry. */
  providers?: string[];
  /** Absolute or '~/'-prefixed isolated projector-owned extra target dirs. */
  extra_targets?: string[];
  /** Repo-relative, project-root-contained authority override. Default: .deckent/docs/core-memory */
  authority_dir?: string;
}
```

- [ ] **Step 1: Write the failing tests** (extend `tests/core/config-validation.test.ts`):

```ts
describe('memory_projection validation', () => {
  it('accepts a full valid block', () => {
    const errors = validateConfig({ memory_projection: {
      enabled: true, providers: ['claude-code', 'copilot'],
      extra_targets: ['~/deckent-projections/dev'], authority_dir: '.deckent/docs/core-memory',
    } } as never);
    expect(errors.filter(e => e.includes('memory_projection'))).toEqual([]);
  });
  it('rejects unknown surface ids (execution provider names are not surfaces)', () => {
    const errors = validateConfig({ memory_projection: { enabled: true, providers: ['claude'] } } as never);
    expect(errors.some(e => e.includes('memory_projection.providers'))).toBe(true);
  });
  it('rejects authority_dir escaping the project root', () => {
    const errors = validateConfig({ memory_projection: { enabled: true, authority_dir: '../outside' } } as never);
    expect(errors.some(e => e.includes('memory_projection.authority_dir'))).toBe(true);
  });
  it('rejects relative non-tilde extra_targets', () => {
    const errors = validateConfig({ memory_projection: { enabled: true, extra_targets: ['relative/dir'] } } as never);
    expect(errors.some(e => e.includes('memory_projection.extra_targets'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify fail.** `npx vitest run tests/core/config-validation.test.ts` — FAIL (key unknown / no validation).
- [ ] **Step 3: Implement.** (a) Add `MemoryProjectionConfig` to `config-types.ts` exactly as in Interfaces; add `memory_projection?: MemoryProjectionConfig;` to **both** `DeckentConfig` (next to `:1251`) and `ResolvedConfig` (next to `:1807`). (b) In `config.ts` validation (pattern-match the `cross_verify` block at `~:1049`): `enabled`/booleans type-checked; `providers` each must satisfy `isAssistantSurfaceId` (import from `./assistant-surface-registry.js`); `authority_dir` must not be absolute and its `path.normalize` must not start with `..`; `extra_targets` entries must be absolute (`path.isAbsolute`) or start with `~/`. (c) Add `memory_projection: config.memory_projection,` to **both** twin literals (`loadConfig` ~`:2148` and `mergeConfigs` ~`:2964`), each with the same 3-line comment referencing the born-464 lesson. (d) Add a `CONFIG_METADATA` entry for `memory_projection` (description: one-way core-memory projection to assistant surfaces; default disabled).
- [ ] **Step 4: Run tests + roundtrip.** `npx vitest run tests/core/config-validation.test.ts tests/core/config.test.ts` — PASS, including the type-vs-live twin parity check picking up the new key. `npm run lint`.
- [ ] **Step 5: Stage (owner-gated).** Message: `feat(config): memory_projection key with twin-literal passthrough (born-464 guard)`

---

### Task 4: Ownership manifest module

**Files:**
- Create: `src/core/memory-projection-manifest.ts`
- Test: `tests/core/memory-projection-manifest.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 6, 7):
  - `const MEMORY_PROJECTION_MANIFEST_FILE = '.deckent-memory-manifest.json'`
  - `interface MemoryProjectionManifest { schemaVersion: 1; authorityDigest: string; ownedFiles: Record<string, string>; }`
  - `function sha256OfContent(content: string | Buffer): string` — returns `sha256:<64hex>`
  - `function readMemoryProjectionManifest(dir: string): MemoryProjectionManifest | null` — null when absent; **throws `ManifestInvalidError`** (exported, has `.code = 'manifest_invalid'`) on unparsable/mis-shaped content — never guesses.
  - `function writeMemoryProjectionManifestAtomic(dir: string, manifest: MemoryProjectionManifest): void` — temp file + `renameSync`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/memory-projection-manifest.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  MEMORY_PROJECTION_MANIFEST_FILE, sha256OfContent,
  readMemoryProjectionManifest, writeMemoryProjectionManifestAtomic, ManifestInvalidError,
} from '../../src/core/memory-projection-manifest.js';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'deckent-manifest-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('memory-projection manifest', () => {
  it('round-trips atomically', () => {
    const m = { schemaVersion: 1 as const, authorityDigest: sha256OfContent('x'), ownedFiles: { 'MEMORY.md': sha256OfContent('y') } };
    writeMemoryProjectionManifestAtomic(dir, m);
    expect(readMemoryProjectionManifest(dir)).toEqual(m);
    expect(existsSync(join(dir, MEMORY_PROJECTION_MANIFEST_FILE))).toBe(true);
  });
  it('returns null when absent', () => {
    expect(readMemoryProjectionManifest(dir)).toBeNull();
  });
  it('throws typed error on garbage — never guesses', () => {
    writeFileSync(join(dir, MEMORY_PROJECTION_MANIFEST_FILE), '{not json');
    expect(() => readMemoryProjectionManifest(dir)).toThrowError(ManifestInvalidError);
  });
  it('sha256OfContent is canonical sha256:<hex>', () => {
    expect(sha256OfContent('abc')).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});
```

- [ ] **Step 2: Run to verify fail.** `npx vitest run tests/core/memory-projection-manifest.test.ts` — FAIL.
- [ ] **Step 3: Implement**

```ts
// src/core/memory-projection-manifest.ts
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const MEMORY_PROJECTION_MANIFEST_FILE = '.deckent-memory-manifest.json';

export interface MemoryProjectionManifest {
  schemaVersion: 1;
  authorityDigest: string;
  ownedFiles: Record<string, string>;
}

export class ManifestInvalidError extends Error {
  readonly code = 'manifest_invalid';
  constructor(readonly path: string, detail: string) {
    super(`invalid memory-projection manifest at ${path}: ${detail}`);
  }
}

export function sha256OfContent(content: string | Buffer): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

const SHA_RE = /^sha256:[a-f0-9]{64}$/;

export function readMemoryProjectionManifest(dir: string): MemoryProjectionManifest | null {
  const path = join(dir, MEMORY_PROJECTION_MANIFEST_FILE);
  if (!existsSync(path)) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(readFileSync(path, 'utf-8')); }
  catch (err) { throw new ManifestInvalidError(path, err instanceof Error ? err.message : 'parse failure'); }
  const m = parsed as Partial<MemoryProjectionManifest>;
  if (m?.schemaVersion !== 1) throw new ManifestInvalidError(path, 'schemaVersion must be 1');
  if (typeof m.authorityDigest !== 'string' || !SHA_RE.test(m.authorityDigest)) {
    throw new ManifestInvalidError(path, 'authorityDigest must be sha256:<64hex>');
  }
  if (m.ownedFiles === null || typeof m.ownedFiles !== 'object') {
    throw new ManifestInvalidError(path, 'ownedFiles must be an object');
  }
  for (const [file, digest] of Object.entries(m.ownedFiles)) {
    if (typeof digest !== 'string' || !SHA_RE.test(digest)) {
      throw new ManifestInvalidError(path, `ownedFiles['${file}'] must be sha256:<64hex>`);
    }
  }
  return { schemaVersion: 1, authorityDigest: m.authorityDigest, ownedFiles: { ...m.ownedFiles } as Record<string, string> };
}

export function writeMemoryProjectionManifestAtomic(dir: string, manifest: MemoryProjectionManifest): void {
  const path = join(dir, MEMORY_PROJECTION_MANIFEST_FILE);
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
  renameSync(tmp, path);
}
```

- [ ] **Step 4: Run to verify pass** + `npm run lint`.
- [ ] **Step 5: Stage (owner-gated).** Message: `feat(memory-projection): ownership manifest — sole deletion authority`

---

### Task 5: Managed-block renderer (markers, link rewrite, skeletons)

**Files:**
- Create: `src/core/memory-projection-render.ts`
- Test: `tests/core/memory-projection-render.test.ts`

**Interfaces:**
- Consumes: `AssistantSurface` (Task 2).
- Produces (consumed by Tasks 6, 7):
  - `const CORE_MEMORY_AUTO_START = '<!-- DECKENT:CORE-MEMORY:AUTO-START -->'`
  - `const CORE_MEMORY_AUTO_END = '<!-- DECKENT:CORE-MEMORY:AUTO-END -->'`
  - `class MarkerIntegrityError extends Error` with `.code = 'marker_integrity'` and `.detail: 'missing-start' | 'missing-end' | 'reversed' | 'multiple'`
  - `function rewriteIndexLinks(indexMarkdown: string, opts: { instructionFileDir: string; memoryDir: string; ownedFiles: string[] }): string` — rewrites `](law_x.md)` / `](file.md)` targets that name an owned file into the correct relative path from the instruction file's dir to the mirror dir (POSIX separators); non-owned link targets untouched.
  - `function renderMemoryBlock(surface: AssistantSurface, indexMarkdown: string, ownedFiles: string[]): string` — full block including markers; copilot (any surface with `coLoadedInstructionFiles.length > 0`) renders the duplicate-free pointer variant (`@<memoryDir>/MEMORY.md` import line + source header, no embedded index); `importStyle:'at-relative'` surfaces without co-loading may embed rewritten index (claude-code, gemini-cli) — per spec both allowed; we embed for uniform grep'ability; codex embeds (no import support); block always starts with the source header line `> AUTO (DECKENT:CORE-MEMORY) — do not edit; source: .deckent/docs/core-memory/`.
  - `function applyManagedBlock(existing: string | null, block: string, surface: AssistantSurface, projectName: string): string` — replaces content between markers; appends block when markers absent; creates skeleton when `existing === null` (markdown-title: `# ${projectName} — assistant instructions\n\n` + block; mdc-always-apply: frontmatter lines exactly `---\ndescription: Deckent core-memory index\nglobs:\nalwaysApply: true\n---\n` + block); throws `MarkerIntegrityError` on missing-one/reversed/multiple pairs.

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/memory-projection-render.test.ts
import { describe, it, expect } from 'vitest';
import { getAssistantSurface } from '../../src/core/assistant-surface-registry.js';
import {
  CORE_MEMORY_AUTO_START, CORE_MEMORY_AUTO_END, MarkerIntegrityError,
  rewriteIndexLinks, renderMemoryBlock, applyManagedBlock,
} from '../../src/core/memory-projection-render.js';

const INDEX = '# Memory\n1. **[Scale](law_scale.md)** — x\n2. See [MASTER](docs/MASTER-PLAN.md).\n';

describe('rewriteIndexLinks', () => {
  it('rewrites owned links relative to the instruction file, leaves foreign links', () => {
    const out = rewriteIndexLinks(INDEX, { instructionFileDir: '.', memoryDir: '.codex/memory', ownedFiles: ['law_scale.md', 'MEMORY.md'] });
    expect(out).toContain('](.codex/memory/law_scale.md)');
    expect(out).toContain('](docs/MASTER-PLAN.md)');       // untouched
  });
  it('computes relative path from nested instruction files', () => {
    const out = rewriteIndexLinks(INDEX, { instructionFileDir: '.cursor/rules', memoryDir: '.cursor/memory', ownedFiles: ['law_scale.md'] });
    expect(out).toContain('](../memory/law_scale.md)');
  });
});

describe('renderMemoryBlock', () => {
  it('embeds rewritten index for codex inside namespaced markers', () => {
    const block = renderMemoryBlock(getAssistantSurface('codex')!, INDEX, ['law_scale.md']);
    expect(block.startsWith(CORE_MEMORY_AUTO_START)).toBe(true);
    expect(block.trimEnd().endsWith(CORE_MEMORY_AUTO_END)).toBe(true);
    expect(block).toContain('.codex/memory/law_scale.md');
    expect(block).toContain('do not edit; source: .deckent/docs/core-memory/');
  });
  it('copilot gets duplicate-free pointer, never the embedded index', () => {
    const block = renderMemoryBlock(getAssistantSurface('copilot')!, INDEX, ['law_scale.md']);
    expect(block).toContain('@.github/deckent-memory/MEMORY.md');
    expect(block).not.toContain('law_scale.md');           // no embedded index lines
  });
});

describe('applyManagedBlock', () => {
  const surface = getAssistantSurface('codex')!;
  const block = `${CORE_MEMORY_AUTO_START}\nNEW\n${CORE_MEMORY_AUTO_END}`;
  it('replaces only between markers; outside content is opaque', () => {
    const existing = `OWNER TOP\n${CORE_MEMORY_AUTO_START}\nOLD\n${CORE_MEMORY_AUTO_END}\nOWNER BOTTOM <!-- AUTO-START --> ruleGen owns this <!-- AUTO-END -->`;
    const out = applyManagedBlock(existing, block, surface, 'proj');
    expect(out).toContain('OWNER TOP');
    expect(out).toContain('NEW');
    expect(out).not.toContain('OLD');
    expect(out).toContain('ruleGen owns this');            // generic markers untouched
  });
  it('appends when markers absent', () => {
    expect(applyManagedBlock('JUST OWNER TEXT\n', block, surface, 'proj')).toMatch(/JUST OWNER TEXT[\s\S]*NEW/);
  });
  it('creates markdown-title skeleton when file absent', () => {
    const out = applyManagedBlock(null, block, surface, 'proj');
    expect(out.startsWith('# proj — assistant instructions\n')).toBe(true);
  });
  it('creates mdc skeleton with frontmatter at line 1', () => {
    const out = applyManagedBlock(null, block, getAssistantSurface('cursor')!, 'proj');
    expect(out.split('\n')[0]).toBe('---');
    expect(out).toContain('alwaysApply: true');
  });
  it('throws typed error on reversed / multiple / half markers', () => {
    expect(() => applyManagedBlock(`${CORE_MEMORY_AUTO_END}\n${CORE_MEMORY_AUTO_START}`, block, surface, 'p')).toThrowError(MarkerIntegrityError);
    expect(() => applyManagedBlock(`${CORE_MEMORY_AUTO_START}`, block, surface, 'p')).toThrowError(MarkerIntegrityError);
    expect(() => applyManagedBlock(`${CORE_MEMORY_AUTO_START}\n${CORE_MEMORY_AUTO_END}\n${CORE_MEMORY_AUTO_START}\n${CORE_MEMORY_AUTO_END}`, block, surface, 'p')).toThrowError(MarkerIntegrityError);
  });
});
```

- [ ] **Step 2: Run to verify fail.**
- [ ] **Step 3: Implement.** Pure module, no I/O. Key logic: `rewriteIndexLinks` uses regex `/\]\(([^)#\s]+)\)/g`, rewrites when the captured target's basename ∈ `ownedFiles` and the target has no `/` (authority-relative); relative path via `path.posix.relative(instructionFileDir, memoryDir)`. `applyManagedBlock` counts `indexOf`/`lastIndexOf` of both markers: zero of both → append (or skeleton when `existing === null`); exactly one full ordered pair → splice; anything else → `MarkerIntegrityError` with the right `detail`. `renderMemoryBlock`: header line + (co-loaded surfaces → `@${memoryDir}/MEMORY.md` pointer line + one sentence pointing at mirror dir; else → `rewriteIndexLinks(index, …)` body) wrapped in markers.
- [ ] **Step 4: Run to verify pass** + `npm run lint`.
- [ ] **Step 5: Stage (owner-gated).** Message: `feat(memory-projection): namespaced block renderer with deterministic link rewrite`

---

### Task 6: Projector core — mirror + manifest + write safety

**Files:**
- Create: `src/core/memory-projection-generator.ts` (this task: types + target mirroring; Task 7 completes it)
- Test: `tests/core/memory-projection-generator.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 4, 5 exports; `ResolvedConfig` (Task 3).
- Produces (consumed by Tasks 7, 9, 11, 12) — **exact spec contract:**

```ts
export type ProjectionMode = 'write' | 'check' | 'dry-run';
export interface TargetResult {
  surface: AssistantSurfaceId | 'extra-target';
  targetDir: string;
  state: 'written' | 'unchanged' | 'drifted' | 'deprovisioned' | 'error' | 'held';
  manifestUpdated: boolean;
}
export interface ProjectionError {
  code: string; surface: AssistantSurfaceId | 'extra-target';
  operation: 'mirror' | 'block' | 'manifest' | 'deprovision' | 'lock';
  path: string; messageKey: string; params?: Record<string, string>;
}
export interface MemoryProjectionResult {
  mode: ProjectionMode; authorityDigest?: string;
  filesWritten: string[]; filesDeleted: string[]; filesUnchanged: string[];
  driftedFiles: string[]; foreignFilesPreserved: string[];
  targets: TargetResult[]; errors: ProjectionError[];
}
export interface MemoryProjectionOptions {
  projectRoot: string; mode: ProjectionMode; config: ResolvedConfig; deprovision?: boolean;
}
export function runMemoryProjection(opts: MemoryProjectionOptions): Promise<MemoryProjectionResult>;
```

- [ ] **Step 1: Write the failing tests** — tmpdir fixture with authority (`MEMORY.md` + `law_a.md`), config enabling `['codex']`:

```ts
// tests/core/memory-projection-generator.test.ts  (core cases this task)
it('mirrors authority into .codex/memory with manifest, atomic content', async () => {
  const res = await runMemoryProjection({ projectRoot: root, mode: 'write', config: cfg(['codex']) });
  expect(readFileSync(join(root, '.codex/memory/MEMORY.md'), 'utf-8')).toBe(readFileSync(join(root, AUTH, 'MEMORY.md'), 'utf-8')); // byte-verbatim
  const manifest = readMemoryProjectionManifest(join(root, '.codex/memory'))!;
  expect(Object.keys(manifest.ownedFiles).sort()).toEqual(['MEMORY.md', 'law_a.md']);
  expect(res.errors).toEqual([]);
});
it('second run is zero writes (idempotent)', async () => {
  await runMemoryProjection({ projectRoot: root, mode: 'write', config: cfg(['codex']) });
  const res2 = await runMemoryProjection({ projectRoot: root, mode: 'write', config: cfg(['codex']) });
  expect(res2.filesWritten).toEqual([]);
  expect(res2.filesUnchanged.length).toBeGreaterThan(0);
});
it('deletes only manifest-owned stale files; preserves foreign files', async () => {
  await runMemoryProjection({ projectRoot: root, mode: 'write', config: cfg(['codex']) });
  rmSync(join(root, AUTH, 'law_a.md'));                                  // authority shrinks
  writeFileSync(join(root, '.codex/memory/user-note.md'), 'mine');       // foreign file
  const res = await runMemoryProjection({ projectRoot: root, mode: 'write', config: cfg(['codex']) });
  expect(existsSync(join(root, '.codex/memory/law_a.md'))).toBe(false);  // owned stale removed
  expect(existsSync(join(root, '.codex/memory/user-note.md'))).toBe(true);
  expect(res.foreignFilesPreserved).toContain(join('.codex/memory', 'user-note.md'));
});
it('missing authority is a typed error, no writes', async () => {
  const res = await runMemoryProjection({ projectRoot: emptyRoot, mode: 'write', config: cfg(['codex']) });
  expect(res.errors[0]?.code).toBe('authority_missing');
});
it('enabled:false ⇒ zero writes and empty result', async () => {
  const res = await runMemoryProjection({ projectRoot: root, mode: 'write', config: cfg(['codex'], { enabled: false }) });
  expect(res.filesWritten).toEqual([]);
  expect(res.targets).toEqual([]);
});
it('symlinked memoryDir escaping root ⇒ typed symlink_escape error, fail-closed', async () => {
  mkdirSync(join(root, '.codex'), { recursive: true });
  symlinkSync(outsideDir, join(root, '.codex/memory'));
  const res = await runMemoryProjection({ projectRoot: root, mode: 'write', config: cfg(['codex']) });
  expect(res.errors[0]?.code).toBe('symlink_escape');
  expect(readdirSync(outsideDir)).toEqual([]);                            // nothing written outside
});
it('check mode reports drift without writing (exit decision is caller\'s)', async () => {
  const res = await runMemoryProjection({ projectRoot: root, mode: 'check', config: cfg(['codex']) });
  expect(res.driftedFiles.length).toBeGreaterThan(0);
  expect(existsSync(join(root, '.codex/memory'))).toBe(false);
});
```

- [ ] **Step 2: Run to verify fail.**
- [ ] **Step 3: Implement (this task's slice).** Structure: `resolveAuthorityDir` (config override validated root-contained → else `authority_escape` error); read authority `*.md` sorted, compute `authorityDigest = sha256OfContent(canonical concat of name+content)`; per target dir: `realpathSync` containment check after `mkdirSync` (compare `realpath(dir)` startsWith `realpath(projectRoot) + sep` → else `symlink_escape`); previous manifest via `readMemoryProjectionManifest` (`ManifestInvalidError` → `manifest_invalid` ProjectionError, target `state:'error'`, continue other targets); mirror loop = content-compare → temp+rename write (`writeFileAtomic` helper shared with manifest module pattern); stale loop = previous manifest `ownedFiles` keys not in authority → delete + `filesDeleted`; dir listing minus owned minus manifest file → `foreignFilesPreserved`; modes: `check`/`dry-run` compute the same diff into `driftedFiles` with zero fs mutation. All errors → `ProjectionError` with `messageKey: 'sync.memory.err.' + code`; generator emits no prose.
- [ ] **Step 4: Run to verify pass** + `npm run lint`.
- [ ] **Step 5: Stage (owner-gated).** Message: `feat(memory-projection): manifest-owned mirror projector with atomic writes + symlink fail-closed`

---

### Task 7: Projector core — managed blocks, lock, extra_targets guard, deprovision

**Files:**
- Modify: `src/core/memory-projection-generator.ts`
- Test: extend `tests/core/memory-projection-generator.test.ts`

**Interfaces:**
- Consumes: Task 5 renderer; Task 6 internals.
- Produces: completes `runMemoryProjection` behavior; exports `const MEMORY_PROJECTION_LOCK_FILE = '.deckent/memory-projection.lock'`, `const NATIVE_MEMORY_GUARD_PATTERNS: readonly RegExp[]`.

- [ ] **Step 1: Write the failing tests** (append):

```ts
it('writes namespaced block into AGENTS.md and preserves outside content', async () => {
  writeFileSync(join(root, 'AGENTS.md'), 'OWNER CONTENT\n');
  await runMemoryProjection({ projectRoot: root, mode: 'write', config: cfg(['codex']) });
  const agents = readFileSync(join(root, 'AGENTS.md'), 'utf-8');
  expect(agents).toContain('OWNER CONTENT');
  expect(agents).toContain('DECKENT:CORE-MEMORY:AUTO-START');
  expect(agents).toContain('.codex/memory/');
});
it('marker corruption ⇒ marker_integrity error for that surface only', async () => {
  writeFileSync(join(root, 'AGENTS.md'), '<!-- DECKENT:CORE-MEMORY:AUTO-END -->\n<!-- DECKENT:CORE-MEMORY:AUTO-START -->');
  const res = await runMemoryProjection({ projectRoot: root, mode: 'write', config: cfg(['codex', 'claude-code']) });
  expect(res.errors.some(e => e.code === 'marker_integrity' && e.surface === 'codex')).toBe(true);
  expect(res.targets.find(t => t.surface === 'claude-code')?.state).toBe('written'); // isolation
});
it('extra_target pointing at claude native auto-memory ⇒ held + native_memory_target', async () => {
  const native = join(fakeHome, '.claude', 'projects', 'x', 'memory');
  const res = await runMemoryProjection({ projectRoot: root, mode: 'write',
    config: cfg(['codex'], { extra_targets: [native] }) });
  const held = res.targets.find(t => t.surface === 'extra-target');
  expect(held?.state).toBe('held');
  expect(res.errors.some(e => e.code === 'native_memory_target')).toBe(true);
  expect(existsSync(join(native, 'law_a.md'))).toBe(false);
});
it('isolated extra_target mirrors with its own manifest', async () => {
  const iso = join(fakeHome, 'deckent-projections', 'dev');
  const res = await runMemoryProjection({ projectRoot: root, mode: 'write',
    config: cfg(['codex'], { extra_targets: [iso] }) });
  expect(readMemoryProjectionManifest(iso)).not.toBeNull();
  expect(res.errors).toEqual([]);
});
it('surface removed from config set ⇒ manifest-driven deprovision (owned files + block gone, foreign kept)', async () => {
  await runMemoryProjection({ projectRoot: root, mode: 'write', config: cfg(['codex']) });
  writeFileSync(join(root, '.codex/memory/user-note.md'), 'mine');
  const res = await runMemoryProjection({ projectRoot: root, mode: 'write', config: cfg(['claude-code']) });
  expect(existsSync(join(root, '.codex/memory/MEMORY.md'))).toBe(false);
  expect(existsSync(join(root, '.codex/memory/user-note.md'))).toBe(true);
  expect(readFileSync(join(root, 'AGENTS.md'), 'utf-8')).not.toContain('DECKENT:CORE-MEMORY');
  expect(res.targets.some(t => t.surface === 'codex' && t.state === 'deprovisioned')).toBe(true);
});
it('held lock ⇒ single lock_held error, no partial writes', async () => {
  mkdirSync(join(root, '.deckent'), { recursive: true });
  writeFileSync(join(root, '.deckent/memory-projection.lock'), JSON.stringify({ pid: 99999999, at: new Date().toISOString() }));
  const res = await runMemoryProjection({ projectRoot: root, mode: 'write', config: cfg(['codex']) });
  expect(res.errors.map(e => e.code)).toEqual(['lock_held']);
});
it('stale lock (>60s) is broken and run proceeds', async () => {
  mkdirSync(join(root, '.deckent'), { recursive: true });
  writeFileSync(join(root, '.deckent/memory-projection.lock'), JSON.stringify({ pid: 1, at: new Date(Date.now() - 120_000).toISOString() }));
  const res = await runMemoryProjection({ projectRoot: root, mode: 'write', config: cfg(['codex']) });
  expect(res.errors).toEqual([]);
});
```

- [ ] **Step 2: Run to verify fail.**
- [ ] **Step 3: Implement.** (a) Block application per surface after mirror: read instruction file (or null), `renderMemoryBlock` → `applyManagedBlock` → content-compare → atomic write; `MarkerIntegrityError` → ProjectionError `marker_integrity`, `state:'error'`, continue. (b) Lock: `.deckent/memory-projection.lock` JSON `{pid, at}` written with `flag:'wx'`; `EEXIST` → parse: age > 60_000 ms ⇒ unlink + retry once, else single `lock_held` error and return (check/dry-run modes skip the lock — read-only). `finally` unlink own lock. (c) `extra_targets`: `~/` resolved via `os.homedir()` (cross-platform); `NATIVE_MEMORY_GUARD_PATTERNS = [/[\\/]\.claude[\\/]projects[\\/][^\\/]+[\\/]memory[\\/]?$/]` — match ⇒ `native_memory_target`, `state:'held'`, no writes; otherwise treated exactly like a surface target minus instruction block. Env `DECKENT_MEMORY_PROJECTION_PATH` appended to extra_targets (legacy compat) through the same guard. (d) Deprovision: for each registry surface NOT in the resolved set whose `memoryDir` has a manifest ⇒ delete owned files + manifest, remove managed block from its instruction file (marker errors reported, not guessed), `state:'deprovisioned'`; with `opts.deprovision === true` the same sweep also runs when `enabled:false` (explicit `--memory-deprovision`).
- [ ] **Step 4: Run full projector suite** — PASS; `npm run lint`.
- [ ] **Step 5: Stage (owner-gated).** Message: `feat(memory-projection): managed blocks, projection lock, native-memory guard, deprovision`

---

### Task 8: i18n keys (en+tr)

**Files:**
- Modify: `src/cli/helpers/messages.ts` (append to the sync section; pattern-match the existing `xverify.*` block style)
- Test: extend existing messages parity test (locate with `grep -rn "every key has en and tr" tests/cli/`)

**Interfaces:**
- Produces keys (consumed by Tasks 9, 10, 11): `sync.memory.header`, `sync.memory.projected`, `sync.memory.unchanged`, `sync.memory.deleted`, `sync.memory.drift`, `sync.memory.clean`, `sync.memory.deprovisioned`, `sync.memory.disabled`, `sync.memory.held`, `sync.memory.err.authority_missing`, `sync.memory.err.authority_escape`, `sync.memory.err.manifest_invalid`, `sync.memory.err.marker_integrity`, `sync.memory.err.symlink_escape`, `sync.memory.err.native_memory_target`, `sync.memory.err.lock_held`, `sync.memory.err.unknown_surface`, `sync.memory.err.forbidden_mode`, `sync.memory.err.write_failed`, `sync.memory.flags.memory_only`, `sync.memory.flags.check`, `sync.memory.flags.deprovision`, `sync.memory.flags.conflict`.

- [ ] **Step 1: Write the failing test** — parity test asserts each new key exists in both `en` and `tr` maps and interpolates `{path}`/`{surface}`/`{count}` params where declared.
- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** — add all keys, en + tr, e.g. `'sync.memory.err.native_memory_target': { en: 'Refusing extra target {path}: it is a native writable memory surface (projector-owned dirs only)', tr: '{path} extra hedefi reddedildi: native yazılabilir memory yüzeyi (yalnız projector-owned dizinler)' }`.
- [ ] **Step 4: Verify pass** + `npm run lint`.
- [ ] **Step 5: Stage (owner-gated).** Message: `feat(i18n): sync.memory.* keys (en+tr)`

---

### Task 9: `runWorkspaceSync` shared service

**Files:**
- Create: `src/core/workspace-sync.ts`
- Test: `tests/core/workspace-sync.test.ts`

**Interfaces:**
- Consumes: `runMemoryProjection` (Tasks 6-7); `ensureDeckentImport` + `CLAUDE_FILE`/`AGENTS_FILE`/`DECKENT_FILE` from `src/core/constants.js` / `src/core/utils.js` (the exact pieces MCP sync uses today).
- Produces (consumed by Tasks 10, 11, 12, 13):

```ts
export interface WorkspaceSyncOptions {
  projectRoot: string;
  mode: 'write' | 'check' | 'dry-run';
  scope: 'all' | 'memory';
  resolvedConfig: ResolvedConfig;
  deprovisionMemory?: boolean;
}
export interface WorkspaceSyncResult {
  adapters: Record<string, { file: string; synced: boolean }> | null; // null when scope 'memory'
  memory: MemoryProjectionResult | null;   // null when memory_projection disabled and not deprovisioning
  exitCode: 0 | 1 | 2;                     // clean | drift (check mode) | operational/config error
}
export function runWorkspaceSync(opts: WorkspaceSyncOptions): Promise<WorkspaceSyncResult>;
```

- [ ] **Step 1: Write the failing tests** — tmpdir project with DECKENT.md + authority: `scope:'memory'` runs projection only (`adapters === null`); `scope:'all'` also ensures `@DECKENT.md` import in CLAUDE.md/AGENTS.md (mode-aware: `check`/`dry-run` never write); exitCode mapping: write+no errors ⇒ 0; check+drift ⇒ 1; check+clean ⇒ 0; any ProjectionError with code in `('authority_missing','authority_escape','lock_held','manifest_invalid','symlink_escape','write_failed')` ⇒ 2; disabled feature + `scope:'memory'` ⇒ `memory:null`, exitCode 0.
- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** — thin orchestration, no direct fs beyond delegating; adapters step reuses `ensureDeckentImport` exactly as `src/mcp/tools/sync.ts` does today (write mode only; in check/dry-run report `synced:false` without writing when the import is missing).
- [ ] **Step 4: Verify pass** + `npm run lint`.
- [ ] **Step 5: Stage (owner-gated).** Message: `feat(sync): shared runWorkspaceSync service (CLI/MCP parity core)`

---

### Task 10: CLI wire — flags, exit codes, output

**Files:**
- Modify: `src/cli/commands/sync.ts` (registration at `:659+`; keep the existing broad pipeline; insert service call)
- Test: `tests/cli/sync-memory-flags.test.ts`

**Interfaces:**
- Consumes: `runWorkspaceSync` (Task 9), `getMessage` keys (Task 8).
- Produces: CLI contract — `deckent sync [--git-only|--adapters-only|--memory-only] [--dry-run|--check] [--memory-deprovision] [--json]`.

- [ ] **Step 1: Write the failing tests** — spawn the built CLI? No: unit-test the new `resolveSyncMode(opts)` pure helper exported from `sync.ts` + one async-spawn smoke against `dist` happens in Task 14. Unit cases: `--check` + `--dry-run` together ⇒ usage error (messageKey `sync.memory.flags.conflict`); `--memory-only` ⇒ `scope:'memory'`; `--git-only` ⇒ service NOT called (flag matrix: skips ALL managed-file sync); default ⇒ `scope:'all'`, `mode:'write'`; `--check` ⇒ `mode:'check'` and process.exitCode set from `WorkspaceSyncResult.exitCode`.
- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** — add `.option('--memory-only', getMessage('sync.memory.flags.memory_only', lang))`, `.option('--check', …)`, `.option('--memory-deprovision', …)`; in the action: flag-conflict guard first; `--git-only` keeps current git-detection-only path (service skipped entirely); otherwise call `runWorkspaceSync` with mapped mode/scope, keep the existing agent-prompt/manifest pipeline steps only for full (non-`--memory-only`) runs; render memory summary lines via `getMessage` (`sync.memory.projected` with counts, per-error `sync.memory.err.*` with params); `--json` includes the raw `WorkspaceSyncResult`; set `process.exitCode = result.exitCode`.
- [ ] **Step 4: Verify pass** + `npm run lint`.
- [ ] **Step 5: Stage (owner-gated).** Message: `feat(cli): deckent sync --memory-only/--check/--memory-deprovision via shared service`

---

### Task 11: MCP wire — parity through the same service

**Files:**
- Modify: `src/mcp/tools/sync.ts`
- Test: `tests/mcp/tools/sync.test.ts`

**Interfaces:**
- Consumes: `runWorkspaceSync` (Task 9).
- Produces: `deckent_sync` input schema `{ mode?: 'write'|'check'|'dry-run', scope?: 'all'|'memory' }` (defaults `write`/`all`), response JSON = `WorkspaceSyncResult` (structured drift result included).

- [ ] **Step 1: Write the failing tests** — registered tool accepts `{mode:'check', scope:'memory'}` and returns parsed JSON containing `memory.driftedFiles` array + `exitCode`; default call keeps ensuring `@DECKENT.md` imports (behavior parity with today); DECKENT.md-missing precondition error preserved.
- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** — replace the inline `ensureDeckentImport` body with a `runWorkspaceSync` call (config via existing MCP config loading pattern — match how other tools resolve `loadConfig`); zod schema for the two args; keep `enrichResponse('sync', …)`.
- [ ] **Step 4: Verify pass** + `npm run lint`.
- [ ] **Step 5: Stage (owner-gated).** Message: `feat(mcp): deckent_sync mode/scope args + structured drift result (CLI parity)`

---

### Task 12: Finalizer Step 5

**Files:**
- Modify: `src/core/identity-generator.ts` (post-finalize chain at `:444+`; rule regen is Step 4)
- Test: `tests/core/identity-generator-step5.test.ts`

**Interfaces:**
- Consumes: `runWorkspaceSync` (Task 9).
- Produces: `PostFinalizeHookOptions` gains `skipMemoryProjection?: boolean` and `resolvedConfig?: ResolvedConfig`; the hook result gains `memoryProjection: MemoryProjectionResult | null; memoryProjectionCalled: boolean;`. **Central default wiring:** the chain itself invokes `runWorkspaceSync({ scope: 'memory', mode: 'write', … })` as Step 5 when `resolvedConfig?.memory_projection?.enabled === true` — CLI finalize, Brain finalize and default finalizer pass config, never their own callbacks.

- [ ] **Step 1: Write the failing tests** — (a) enabled config ⇒ `memoryProjectionCalled === true` and result attached; (b) disabled/absent config ⇒ `memoryProjectionCalled === false`, `memoryProjection === null`; (c) projection throwing ⇒ chain result still returned (sprint never rolled back) with the failure surfaced in the hook result's findings/receipt fields — assert the failure string is present in the returned findings and NOT swallowed.
- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** — Step 5 after rule regen; wrap in try/catch that records `memoryProjection: null, memoryProjectionCalled: true` + pushes a finding `memory-projection: <code>` into the chain's findings list (visible in completion receipt + debug log per spec).
- [ ] **Step 4: Verify pass** + `npm run lint`; run the existing identity-generator tests to prove no regression.
- [ ] **Step 5: Stage (owner-gated).** Message: `feat(finalizer): independent Step 5 memory projection with receipt-visible settlement`

---

### Task 13: Compatibility wrapper + Stop hook fix

**Files:**
- Rewrite: `scripts/sync-core-memory.mjs`
- Modify: `.claude/settings.json:9`
- Test: manual + Task 14 smoke (script is out of vitest scope; keep it thin)

**Interfaces:**
- Consumes: built CLI `dist/cli/entry.js sync --memory-only`.
- Produces: wrapper contract — forbidden flags still typed errors; `--target` maps to `DECKENT_MEMORY_PROJECTION_PATH` env for the child; `--check`/`--dry-run` pass through; missing `dist/` ⇒ honest error (exit 2), never silent.

- [ ] **Step 1: Rewrite wrapper**

```js
#!/usr/bin/env node
/**
 * Thin compatibility wrapper — repo-local core-memory is the only authority.
 * Delegates to the product projector: `deckent sync --memory-only`.
 * One-way only: --backup/--restore/--bidirectional remain typed errors.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve, isAbsolute } from 'node:path';

const args = process.argv.slice(2);
const forbidden = ['--backup', '--restore', '--bidirectional'].filter(f => args.includes(f));
if (forbidden.length > 0) {
  console.error(`[core-memory] ${forbidden.join(', ')} removed: repo-local core-memory is the only authority; use --target for one-way projection`);
  process.exit(2);
}
const projectRoot = resolve(process.env.DECKENT_PROJECT_ROOT || process.cwd());
const cli = join(projectRoot, 'dist', 'cli', 'entry.js');
if (!existsSync(cli)) {
  console.error(`[core-memory] built CLI not found at ${cli} — run npm run build first`);
  process.exit(2);
}
const passThrough = args.filter(a => a === '--check' || a === '--dry-run');
const env = { ...process.env };
const targetIdx = args.indexOf('--target');
if (targetIdx !== -1) {
  const target = args[targetIdx + 1];
  if (!target || target.startsWith('--') || !isAbsolute(target)) {
    console.error('[core-memory] --target requires an absolute path');
    process.exit(2);
  }
  env.DECKENT_MEMORY_PROJECTION_PATH = target;
}
const child = spawn(process.execPath, [cli, 'sync', '--memory-only', ...passThrough], {
  cwd: projectRoot, env, stdio: 'inherit',
});
child.on('exit', code => process.exit(code ?? 2));
```

- [ ] **Step 2: Fix the Stop hook.** In `.claude/settings.json:9` replace `"command": "node \"$CLAUDE_PROJECT_DIR/scripts/sync-core-memory.mjs\" --backup"` with `"command": "node \"$CLAUDE_PROJECT_DIR/scripts/sync-core-memory.mjs\""`.
- [ ] **Step 3: Verify by hand.** `node scripts/sync-core-memory.mjs --backup` ⇒ exit 2 with the removed-flag message; `node scripts/sync-core-memory.mjs --check` before build ⇒ honest exit 2 (dist message) — full happy-path verified in Task 14.
- [ ] **Step 4: Stage (owner-gated).** Message: `fix(dogfood): sync-core-memory wrapper delegates to product projector; Stop hook drops removed --backup`

---

### Task 14: Dogfood enablement + build + real-binary smoke (Tier-1 proof)

**Files:**
- Modify: `.deckent/config.json` (deckent-dev only) — add `"memory_projection": { "enabled": true }`
- No new source files.

**Interfaces:** none — operational proof of everything above.

- [ ] **Step 1: Owner-coordinated build.** Confirm no live sprint (`deckent status`), then `npm run build`. Expected: clean tsc.
- [ ] **Step 2: Real-binary smoke (the Tier-1 `Smoke:` line).**
  `Smoke: node dist/cli/entry.js sync --memory-only → 5 surfaces projected (targets[].state written); rerun → filesWritten=[]; node dist/cli/entry.js sync --memory-only --check → exit 0`
  Run each and paste actual output into the task result.
- [ ] **Step 3: Wrapper + hook proof.** `node scripts/sync-core-memory.mjs` ⇒ exit 0, zero-write log; end a Claude Code turn and confirm the Stop hook reports success (no non-blocking error).
- [ ] **Step 4: Full test suite.** `VITEST_MAX_FORKS=2 npm test` — green; `npm run test:ci-sim` for hermeticity.
- [ ] **Step 5: Stage (owner-gated).** Message: `chore(dogfood): enable memory_projection in deckent-dev (MEMORY-SYNC-001)`

---

### Task 15: Docs + generated references

**Files:**
- Modify: `docs/reference/config-reference.md` (new `memory_projection` section, pattern-match the `cross_verify` section), `docs/reference/features.md` (new feature row: one-way core-memory projection, 5 surfaces, manifest-owned), `DECKENT.md` (workflow note: sync now projects memory)
- Regenerate any AUTOGEN blocks: `npm run docs:ref` if the MCP tools reference includes `deckent_sync` (its description changed in Task 11).

**Interfaces:** none.

- [ ] **Step 1: Write the three doc sections** — config keys with defaults + the native-memory guard warning + flag matrix table copied from the spec.
- [ ] **Step 2: Run doc gates.** `npm run lint:link` (and `npm run docs:ref` if present per `package.json`) — clean.
- [ ] **Step 3: Stage (owner-gated).** Message: `docs: memory projection config/feature/workflow reference`

---

### Task 16 (owner-driven): Fresh-session host proof

Not a code task — operational acceptance per spec step 11. For each surface open a fresh session and record evidence: Claude context shows the index; Codex loaded instructions include the AGENTS.md block; Gemini `/memory show`; Cursor rule active; Copilot `/instructions`. Any unreachable host is recorded as typed `unavailable`/HOLD — a structural test is never presented as live proof. Results land in the MASTER-PLAN row-190/230 evidence cells.

---

## Self-Review (done at plan-writing time)

- **Spec coverage:** rows 190/230 (T1), registry+capabilities (T2), config+twins+metadata (T3), manifest (T4), markers/link-rewrite/skeletons/copilot-pointer (T5), mirror+atomic+symlink (T6), lock+guard+deprovision+blocks (T7), i18n (T8), shared service+exit codes (T9), CLI flags (T10), MCP parity (T11), finalizer Step 5 (T12), wrapper+hook (T13), dogfood+smoke (T14), docs (T15), host proof (T16). Gap check: none found.
- **Type consistency:** `MemoryProjectionResult`/`TargetResult`/`ProjectionError` defined once (T6), consumed by T7/T9/T11/T12 under the same names; `AssistantSurfaceId` string union identical in T2/T3/T6.
- **Placeholder scan:** clean — every step carries code or an exact command/expected pair.
