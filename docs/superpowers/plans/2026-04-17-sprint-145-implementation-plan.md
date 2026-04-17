# Sprint 145 Implementation Plan — i18n 95 + Test A + Dokümantasyon + .deckent Temizlik + Observability + Feature Co-Evolve

> **For agentic workers:** Deckent Native mode. Sprint 144 chain safety gate PASS ise otomatik başlar. Sprint 145 sonu TOPLU REVIEW (Alperen + Claude Code joint audit) — zincir buradan Sprint 146 brainstorming'ine handoff.

**Spec referansı:** `docs/superpowers/specs/2026-04-17-sprint-143-144-145-zincir-reform-design.md` § 4

**Goal:** Kalite + meta — i18n 95 puan, test A kapsamı, dokümantasyon full sync, `.deckent/` temizlik politikası, observability katmanı, feature-level brain co-evolve (Karar 4-D C), chain toplu review raporu.

**Architecture:** 6 wave — Feature co-evolve → i18n 95 → Test A + CI → Doc → .deckent temizlik + observability + config → Toplu review. Son sprint olduğu için tüm 11 sağlık boyutu hedefleri bu sprint sonu karşılanmalı.

**Tech Stack:** TypeScript (ESM), Zod, better-sqlite3, vitest, React (dashboard), i18n (dashboard pattern).

**Süre:** ~4.5 saat hard cap | **Cost budget:** $15 | **Opus task:** 12/18 | **Sonnet task:** 6/18 (P2: MCP i18n, dashboard i18n, skill test, .npmignore, cleanup policy, DECISIONS archive finalize)

---

## File Structure — Yaratılacak / Değişecek Dosyalar

### Yeni dosyalar
- `.deckent/features-manifest.json` — canlı feature manifest (Karar 4-D-C)
- `scripts/sync-docs.mjs` — manifest → docs/reference/ auto-gen
- `scripts/deckent-cleanup-policy.mjs` — periyodik arşiv öneri
- `docs/reference/mcp-tools.md`, `cli-commands.md`, `agents.md`, `skills.md` — auto-generated
- `src/core/config-schema.ts` — Zod validation schema
- `src/mcp/helpers/i18n.ts` — MCP tool description i18n
- `docs/audits/sprint-145/CHAIN-REVIEW-REPORT.md` — toplu review raporu
- `.brain/sprints/sprint-146-preflight.md` — Sprint 146 hazırlığı

### Değişecek dosyalar
- `src/mcp/server.ts` — features manifest entegrasyon
- `src/cli/index.ts` — features manifest entegrasyon
- `src/cli/helpers/messages.ts` — tam CLI i18n (T-144-010'dan genişletme, +35 mesaj)
- `src/cli/commands/*.ts` — hardcoded string'ler messages.ts'ye (35+ dosya)
- `src/mcp/tools/*.ts` — 22 tool description TR/EN
- `src/dashboard/src/i18n/tr.ts`, `en.ts` — 28 eksik ConfigPage key
- `src/dashboard/src/pages/Memory.tsx`, `hooks/useApi.ts`, `components/DebtTable.tsx` — V2 uyum
- `src/core/debug-log.ts` (T-143-006'dan genişlet) — 4 seviye complete
- `src/core/errors.ts` — unified hierarchy (BrainError → DeckentError)
- `src/core/stack-detector.ts` — ENOENT noise filter
- `src/core/config.ts`, `config-types.ts` — Zod on-load
- `.github/workflows/ci.yml` — matrix fail-fast:false + Node 22 fix
- `README.md`, `README-TR.md`, `AGENTS.md`, `CLAUDE.md`, `DECKENT.md`, `.deckent/workspace/IDENTITY.md`, `DECKENT-MASTER-BLUEPRINT.md`
- `docs/architecture/memory-system.md` — rewrite
- `.npmignore`, `package.json` (files field)
- `tests/` — vitest flaky stabilize + skill tests + god test split

---

## Wave 1 — Feature Co-Evolve (Karar 4-D-C, 1 task)

### Task T-145-001: Feature-Level Co-Evolve (features-manifest.json + sync-docs.mjs)

**Agent:** `architect` | **Skills:** `typescript-expert`, `system-architect` | **Model:** opus | **Effort:** high

**Files:**
- Create: `.deckent/features-manifest.json` — canlı manifest
- Create: `scripts/sync-docs.mjs` — manifest → docs auto-gen
- Modify: `src/mcp/server.ts` — manifest register hook
- Modify: `src/cli/index.ts` — manifest register hook
- Create: `docs/reference/mcp-tools.md`, `cli-commands.md`, `agents.md`, `skills.md` — auto-gen targets
- Create: `src/core/features-manifest.ts` — schema + write helpers
- Create: `tests/scripts/sync-docs.test.ts`
- Modify: `src/orchestra/sprint-finalizer.ts` — sync-docs hook integration

**Scope:** `.deckent/`, `scripts/`, `src/mcp/`, `src/cli/`, `src/core/`, `src/orchestra/`, `docs/reference/`, `tests/scripts/`

**Implementation Strategy:**

**Problem (Direktif 31):** "gelişen değişen özellikler brain'i güncellemeli". Sprint 143 A+B sprint-finalizer + rule gen çözdü ama **feature-level** (MCP tool, CLI komut, agent, skill ekleme) henüz auto-sync değil.

**Manifest schema:**

```typescript
// src/core/features-manifest.ts
export interface FeaturesManifest {
  version: string;
  generated_at: string;
  mcp_tools: Array<{
    name: string;
    description: { en: string; tr: string };
    parameters: Record<string, unknown>;
    resource?: string;
    read_only: boolean;
    destructive: boolean;
  }>;
  cli_commands: Array<{
    name: string;
    description: { en: string; tr: string };
    args: string[];
    subcommands?: string[];
    options: Array<{ flag: string; description: string; required: boolean }>;
  }>;
  agents: Array<{
    id: string;
    description: string;
    skills: string[];
    activation: string[];
    prompt_path: string;
  }>;
  skills: Array<{
    id: string;
    description: string;
    manifest_version: number;
    activation_rules: string[];
  }>;
  stats: {
    mcp_tool_count: number;
    cli_command_count: number;
    agent_count: number;
    skill_count: number;
  };
}

export async function writeManifest(root: string, manifest: FeaturesManifest): Promise<void> {
  const manifestPath = path.join(root, '.deckent', 'features-manifest.json');
  await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}

export async function readManifest(root: string): Promise<FeaturesManifest> {
  const manifestPath = path.join(root, '.deckent', 'features-manifest.json');
  return JSON.parse(await fs.promises.readFile(manifestPath, 'utf-8'));
}
```

**Manifest generation sources:**
- MCP tools: `src/mcp/tools/index.ts` register sırasında auto-collect
- CLI commands: `src/cli/index.ts` commander program'dan introspect
- Agents: `.deckent/agents/*/agent.json` read all
- Skills: `.deckent/skills/*/manifest.json` read all

**sync-docs.mjs:**

```javascript
#!/usr/bin/env node
import { readManifest } from '../dist/core/features-manifest.js';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

async function main() {
  const root = process.cwd();
  const manifest = await readManifest(root);
  const docsDir = path.join(root, 'docs', 'reference');
  await fs.mkdir(docsDir, { recursive: true });

  // mcp-tools.md
  await fs.writeFile(path.join(docsDir, 'mcp-tools.md'), renderMcpTools(manifest));
  // cli-commands.md
  await fs.writeFile(path.join(docsDir, 'cli-commands.md'), renderCliCommands(manifest));
  // agents.md
  await fs.writeFile(path.join(docsDir, 'agents.md'), renderAgents(manifest));
  // skills.md
  await fs.writeFile(path.join(docsDir, 'skills.md'), renderSkills(manifest));

  console.log(`[sync-docs] Generated 4 reference files for Sprint ${await getCurrentSprint()}`);
}

main();
```

Template formats:
```markdown
<!-- docs/reference/mcp-tools.md -->
# MCP Tools Reference ({{stats.mcp_tool_count}} tools)

<!-- AUTO-GENERATED from .deckent/features-manifest.json — do not edit -->

## Tools
{{#each mcp_tools}}
### `{{this.name}}`
**Description (EN):** {{this.description.en}}
**Description (TR):** {{this.description.tr}}
**Read-only:** {{this.read_only}} | **Destructive:** {{this.destructive}}

Parameters:
```json
{{this.parameters | json}}
```
{{/each}}
```

**Hook integration (sprint-finalizer.ts):**

```typescript
// runCoEvolveHook() içine (T-143-010'dan genişletme):
// 6. Regenerate features manifest + sync docs
await regenerateFeaturesManifest(store, root);
await syncDocs(root);
```

**GO Criteria:**
- `.deckent/features-manifest.json` 22 tool + 41+ CLI + 16 agent + 21 skill içerir
- `docs/reference/*.md` 4 dosya auto-generated
- Manuel edit koruması: `<!-- AUTO-GENERATED -->` header
- Sprint 145 finalize sonrası manifest güncel

**Kanıt:**
```bash
jq '.stats' .deckent/features-manifest.json
# { "mcp_tool_count": 22, "cli_command_count": 41, "agent_count": 16, "skill_count": 21 }
```

**Test:** 15+ test (schema validation, collection from each source, render output, idempotency).

---

## Wave 2 — i18n 95 (Direktif 19, 4 task, paralel)

### Task T-145-002: CLI Tam i18n (35+ hardcoded → messages.ts)

**Agent:** `refactorer` | **Skills:** `typescript-expert` | **Model:** opus | **Effort:** high

**Files:**
- Modify: `src/cli/helpers/messages.ts` — massive expansion
- Modify: ~35 CLI komut dosyası (output.ts, wizard.ts, doctor.ts, start.ts, status.ts, init.ts, retro.ts, history.ts, etc.)
- Modify: tests

**Scope:** `src/cli/`, `tests/cli/`

**Implementation Strategy:**

T-144-010 başlangıç (5 komut). Şimdi **35+ hardcoded string** tümü messages.ts'ye taşınır.

Audit: `grep -rn "console\.log(['\"][A-Z]" src/cli/` → tüm hardcoded mesajlar
Her biri için:
- TR çeviri + EN orijinal → messages.ts nested key
- Komut dosyasında `msg('<key>')` kullan

Namespace organization:
```typescript
// messages.ts
const messages = {
  init: { ... },       // T-144-010'dan (5 key)
  start: { ... },
  status: { ... },
  help: { ... },
  doctor: { ... },
  recall: { ... },     // T-143-006 recall tamamlayıcı
  remember: { ... },
  memory: { ... },
  retro: { ... },
  history: { ... },
  cleanup: { ... },
  config: { ... },
  output: {            // src/cli/helpers/output.ts için
    success: { en: '✓ Success', tr: '✓ Başarılı' },
    failure: { en: '✗ Failed', tr: '✗ Başarısız' },
    warning: { en: '⚠ Warning', tr: '⚠ Uyarı' },
    redacted: { en: '[redacted]', tr: '[gizlendi]' },
    // ...
  },
  wizard: {
    welcome: { en: '...', tr: '...' },
    prompt_name: { en: '...', tr: '...' },
    // ...
  },
  // ... totaling ~40 namespace keys
};
```

Total: ~200 message × 2 locale = ~400 string.

**GO Criteria:**
- `grep -rn "console\.log(['\"][A-Z]" src/cli/commands/ | wc -l` → 0
- TR/EN parity %100 (every key has both en + tr)
- `LANG=tr deckent <each-command>` → full TR output

**Test:** 30+ test.

---

### Task T-145-003: MCP Tool i18n (22 tool description)

**Agent:** `refactorer` | **Skills:** `typescript-expert` | **Model:** sonnet | **Effort:** normal

**Files:**
- Modify: `src/mcp/tools/*.ts` (22 tool) — description TR/EN
- Create: `src/mcp/helpers/i18n.ts` — MCP locale resolver
- Modify: tests

**Scope:** `src/mcp/`, `tests/mcp/`

**Implementation Strategy:**

MCP tool registration sırasında description locale-aware:

```typescript
// src/mcp/helpers/i18n.ts
export function mcpLocale(): 'tr' | 'en' {
  return process.env['MCP_LANG']?.startsWith('tr') ? 'tr' : 'en';
}

// src/mcp/tools/init.ts (örnek)
export const initTool: MCPTool = {
  name: 'deckent_init',
  description: {
    en: 'Initialize Deckent in the current project directory',
    tr: 'Mevcut proje dizininde Deckent başlat',
  }[mcpLocale()],
  // ...
};
```

22 tool description tr + en.

**GO Criteria:**
- `MCP_LANG=tr` → TR tool description
- Schema error messages i18n-aware

**Test:** 22 × 2 locale = 44 description check.

---

### Task T-145-004: Dashboard 28 Eksik ConfigPage i18n Key

**Agent:** `frontend-designer` | **Skills:** `react-specialist` | **Model:** sonnet | **Effort:** normal

**Files:**
- Modify: `src/dashboard/src/i18n/tr.ts`, `en.ts`
- Modify: `src/dashboard/src/pages/Config.tsx`
- Modify: tests

**Scope:** `src/dashboard/`, `tests/dashboard/`

**Implementation Strategy:**

God Analysis'te 28 ConfigPage key eksik. Her iki locale dosyasında da eksik → 56 yeni entry (28 × 2).

Audit: `tr.ts` ve `en.ts` key count karşılaştırma, eksik olanlar doldurulur.

ConfigPage.tsx'teki tüm `t('config.xxx')` çağrıları iki dilde yanıt verecek.

**GO Criteria:**
- `tr.ts` key count === `en.ts` key count
- ConfigPage render test TR + EN PASS

**Test:** 10+ test (locale parity, render, missing key warning).

---

### Task T-145-005: Dashboard Memory V2 Tam Uyum

**Agent:** `frontend-designer` | **Skills:** `react-specialist`, `typescript-expert` | **Model:** opus | **Effort:** normal

**Files:**
- Modify: `src/dashboard/src/pages/Memory.tsx`, `ADRs.tsx` (veya entegre)
- Modify: `src/dashboard/src/hooks/useApi.ts`
- Modify: `src/dashboard/src/components/DebtTable.tsx`
- Modify: tests

**Scope:** `src/dashboard/`, `tests/dashboard/`

**Implementation Strategy:**

Dashboard Memory V2 tam uyum:
- `Memory.tsx` — DB entry listing, FTS5 search UI, relation graph viz
- `DebtTable.tsx` — `store.getByType('debt')` (via API `GET /api/memory?type=debt`)
- ADR list: FTS5 search input + result rendering
- `useApi.ts` — lazy refetch + abort on unmount (T-145-010 polish ile birlikte)

**GO Criteria:** Dashboard Memory sayfası DB entries live render ederek +search +relations (T-143-007 sonrası).

**Test:** 12+ test.

---

## Wave 3 — Test A + CI Stabilize (3 task, paralel)

### Task T-145-006: CI Workflow Yeşil (Sprint 141 Matrix Issue)

**Agent:** `ci-guardian` | **Skills:** `ci-testing`, `devops-engineer` | **Model:** opus | **Effort:** normal

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: tests

**Scope:** `.github/workflows/`, `tests/ci/`

**Implementation Strategy:**

Sprint 141 commit serisi (19c2e04→48653ea→4082d22) lokal PASS ama CI orchestra 20.x FAIL + 22.x/18.x cancel. Memory hipotez: matrix `fail-fast: true` default + Node 20 vs 22 vitest ayrışması.

Fix:
1. `fail-fast: false` ekle (matrix'in tam durumunu gör)
2. Node 22 specific issue audit: vitest version + better-sqlite3 native binding + fsync behavior
3. better-sqlite3 `npm rebuild` step CI'da Node 22 için zorunlu olabilir

```yaml
# .github/workflows/ci.yml
strategy:
  fail-fast: false  # ← key change
  matrix:
    node: [18.x, 20.x, 22.x]
    os: [ubuntu-latest, macos-latest]
steps:
  - uses: actions/setup-node@v4
    with:
      node-version: ${{ matrix.node }}
  - run: npm ci
  - run: npm rebuild better-sqlite3  # ← Node ver mismatch fix
  - run: npx tsc --noEmit
  - run: npx vitest run
```

**GO Criteria:** 3 Node × 2 OS = 6 matrix job tümü PASS.

**Test:** CI run on PR trigger, all green.

---

### Task T-145-007: Vitest Pass %99.9 Stabilize

**Agent:** `test-writer` | **Skills:** `testing-expert` | **Model:** opus | **Effort:** high

**Files:**
- Audit + fix 10-20 flaky test dosyası
- Split god tests: `tests/cli/init.test.ts` (2270 LoC), `tests/cli/commands.test.ts` (1687 LoC) T-144-001/002 ile koordineli
- Modify: `vitest.config.ts` — retry + isolation settings

**Scope:** `tests/`, root

**Implementation Strategy:**

**Flaky audit:**
- 5 ardışık `vitest run` → her biri identical PASS sonucu mu?
- Fail olan test'ler: timing-dependent (setTimeout, Promise order), network mock state leak, fs race condition
- Fix: deterministic timers, isolated temp dirs, sync before async

**God test split (T-144-001, T-144-002 ile koordineli):**
- init.test.ts 2270 → 4 dosya (init-router.test.ts, init-steps.test.ts, init-templates.test.ts, init-wizard.test.ts)
- commands.test.ts 1687 → per-command split

**vitest.config.ts enhancement:**
```typescript
export default defineConfig({
  test: {
    pool: 'forks',           // isolate test files
    isolate: true,
    retry: 0,                // no retry — catch flaky
    sequence: { concurrent: false, shuffle: false },
  },
});
```

**GO Criteria:**
- 5 ardışık `vitest run` → 5/5 identical PASS
- Flaky test count 0
- God test'ler bölünmüş

**Test:** Entire suite stabilize.

---

### Task T-145-008: Skill Test Coverage (11 eksik → 21 tested)

**Agent:** `test-writer` | **Skills:** `testing-expert` | **Model:** sonnet | **Effort:** normal

**Files:**
- Create: `tests/skills/<skill-id>.test.ts` (11 dosya)

**Scope:** `tests/skills/`

**Implementation Strategy:**

21 built-in skill → 10 test edilmiş → 11 eksik:
- `api-builder`, `ci-testing`, `code-simplifier`, `devops-engineer`, `docker-expert`, `frontend-design`, `git-expert`, `graphql-expert`, `migration-expert`, `monorepo-expert`, `system-architect` (inventory'den 11)

Her skill için ≥5 test:
- Manifest schema valid
- AST sandbox validation PASS
- Activation rules parse
- Prompt content non-empty
- Integration with skill-pool

**GO Criteria:** `tests/skills/` 21 dosya.

**Test:** 55+ test (11 × 5).

---

## Wave 4 — Dokümantasyon (4 task, paralel)

### Task T-145-009: README + README-TR Güncel

**Agent:** `doc-writer` | **Skills:** `documentation-writer` | **Model:** opus | **Effort:** normal

**Files:**
- Modify: `README.md`, `README-TR.md`

**Scope:** root

**Implementation Strategy:**

11 sprint geride. Güncellenecek:
- Memory V2 DB-first (SQLite FTS5)
- 22 MCP tool (eski 15-17)
- 41+ CLI komut (eski 30+)
- 16 agent + 21 skill
- 3 provider (Claude/Codex/Gemini)
- better-sqlite3 + @modelcontextprotocol/sdk + zod dependencies (ADR-010 amendment)
- Kurulum: `npm install && npm run build && deckent init` 3-adım
- Quick start section

**GO Criteria:** README section'ları Sprint 145 state yansıtıyor. Tüm sayılar güncel.

**Test:** Manual review + link checker.

---

### Task T-145-010: AGENTS + CLAUDE + DECKENT + IDENTITY Cross-Validation

**Agent:** `doc-writer` | **Skills:** `documentation-writer` | **Model:** opus | **Effort:** normal

**Files:**
- Modify: `AGENTS.md`, `CLAUDE.md`, `DECKENT.md`, `.deckent/workspace/IDENTITY.md`, `.brain/PROJECT-IDENTITY.md`

**Scope:** root, `.deckent/`, `.brain/`

**Implementation Strategy:**

AGENTS.md 39 sprint geride (Sprint 102 → 141). Tümünde cross-validation:
- MCP tool sayısı: 22
- CLI komut sayısı: 41+
- ADR sayısı: 40
- Test sayısı: 12485+
- Sprint numarası: 145 (live sprint)
- Agent sayısı: 16 built-in + N temp
- Skill sayısı: 21 built-in

T-143-010 sprint-finalizer co-evolve hook otomatik güncelliyor olmalı — ama **initial sync** bu task'ta.

T-145-001 features-manifest.json bu rakamların canonical source'u — tüm .md dosyaları manifest'ten üretilmiş sayıları referanslamalı.

**GO Criteria:** Tüm 5 .md dosyasında sayılar eşit + manifest ile uyumlu.

**Test:** `scripts/validate-cross-references.mjs` (eğer yoksa yarat) — doc sayıları vs manifest check.

---

### Task T-145-011: docs/architecture/memory-system.md Rewrite + BLUEPRINT

**Agent:** `doc-writer` | **Skills:** `documentation-writer`, `system-architect` | **Model:** opus | **Effort:** high

**Files:**
- Modify: `docs/architecture/memory-system.md` — full rewrite
- Modify: `DECKENT-MASTER-BLUEPRINT.md` — Memory V2 section

**Scope:** `docs/`, root

**Implementation Strategy:**

docs/architecture/memory-system.md pre-V2 (eski .md parse) içeriyor. Rewrite:

```markdown
# Memory V2 — DB-First Architecture

## Overview
Memory V2 is SQLite-backed single-source-of-truth for brain knowledge (ADRs, sprint learnings, debt, patterns, retros). Markdown files are generated exports, not source.

## Schema (v1)
- **entries**: 20 columns (id TEXT PK, type, source, title, content, summary, tag_text, 4x _norm cols, status, priority, sprint_id, sprint_num, lang, decay_exempt, metadata, created_at, updated_at, deleted_at)
- **tags**: many-to-many (entry_id FK CASCADE, tag TEXT)
- **relations**: cross-ref (from_id, to_id, rel_type ∈ {references, supersedes, caused_by, resolves, blocks, depends_on})
- **entry_history**: field-level audit trail
- **entries_fts**: FTS5 virtual table (8 cols: 4 original + 4 normalized)
- **schema_version**: migration safety

## FTS5 Dual-Layer Search
Original columns + turkishNormalize (TR/EN/DE %100 recall).
Query builder (Sprint 143 T-143-006): default OR join between tokens, explicit `--mode=and` for AND.

## Relations (Sprint 143 T-143-007)
- Backfill script: pattern-based extraction (ADR regex, sprint cross-ref)
- Manuel gate: Alperen reviews preview before DB insert
- Write-time: insert() auto-extracts ADR references, sprint-finalizer writes triple-link

## Brain Co-Evolve (Sprint 143+145)
- Sprint finalize hook: export + IDENTITY + CHANGELOG + SPRINT-LOG + rule regen (Sprint 143 T-143-010+011)
- Feature-level: features-manifest.json → docs/reference/*.md (Sprint 145 T-145-001)

## CLI / MCP API
- `deckent recall "query" [--mode=and|or]`
- `deckent remember "note"`
- `deckent memory rebuild|export|stats|relations review`
- MCP: `deckent_memory_query`

## Exports (Generated, Git-Tracked)
- `.brain/exports/summary.md` — 40 ADR table + active debt + recent learnings
- `.brain/exports/decisions.md` — 40 ADR full text
- `.brain/exports/memory.md` — sprint learnings
- `.brain/exports/debt.md` — debt table
- `.brain/exports/relations.md` — (new, Sprint 143+) relations graph in Mermaid

## Migration History
- v0 (pre-Sprint 139): .md files (DECISIONS.md 96K, MEMORY.md, DEBT.md, RETRO.md, PATTERNS.md)
- v1 (Sprint 139): SQLite DB + exports. .md files archived to .brain/archive/pre-v2/
- Amendments: Sprint 143 query builder fix, relations backfill, brain co-evolve
```

BLUEPRINT.md Memory V2 section kısa versiyonu + diyagram.

**GO Criteria:** docs/architecture/memory-system.md ≥300 satır + komple Memory V2 dokümantasyonu.

**Test:** Markdown lint PASS + link checker PASS.

---

### Task T-145-012: .npmignore + publishing rule (Direktif 33)

**Agent:** `devops-engineer` | **Skills:** `devops-engineer` | **Model:** sonnet | **Effort:** low

**Files:**
- Modify: `.npmignore`
- Modify: `package.json` — `files` field

**Scope:** root

**Implementation Strategy:**

Direktif 33: `docs/superpowers/` Deckent internal — npm publish'e dahil olmamalı.

**.npmignore:**
```
# Internal dev assets
docs/superpowers/
docs/audits/
docs/design/
docs/analysis/

# Sprint state
.deckent/sprint-*-*.md
.deckent/sprint-*-seq
.deckent/sprint-*-events.jsonl
.deckent/jobs/
.deckent/pids/
.deckent/routing/
.deckent/workspace/BOOT.md  # user-specific

# Brain internals (DB generated on init)
.brain/memory.db*
.brain/archive/
.brain/sprints/
.brain/ERRORS.md

# Internal docs
DECKENT-MASTER-BLUEPRINT.md
DECKENT-ANA-PLAN-TR.md
BETA-TRACKER*.md

# Testing
tests/
coverage/

# Dev config
.claude/
.codex/
.gemini/
```

**package.json `files` field** — whitelist approach (safer than blacklist):
```json
"files": [
  "dist/",
  "README.md",
  "README-TR.md",
  "VISION.md",
  "VISION-TR.md",
  "LICENSE",
  "CHANGELOG.md",
  "docs/reference/",
  "docs/guide/",
  "docs/architecture/",
  "docs/release/"
]
```

**GO Criteria:**
- `npm pack --dry-run` output'ta:
  - ✅ dist/, README, docs/reference/, docs/guide/, docs/architecture/
  - ❌ docs/superpowers/ YOK
  - ❌ DECKENT-MASTER-BLUEPRINT.md YOK
  - ❌ .brain/, .deckent/sprint-*, tests/, .claude/ YOK

**Test:** 5 test (npm pack dry-run content validation).

---

## Wave 5 — .deckent Temizlik + Observability + Config (Direktif 13+21+22, 4 task)

### Task T-145-013: .deckent Temizlik Politikası + Periyodik Arşiv

**Agent:** `devops-engineer` | **Skills:** `devops-engineer` | **Model:** sonnet | **Effort:** normal

**Files:**
- Create: `scripts/deckent-cleanup-policy.mjs`
- Modify: `src/orchestra/sprint-finalizer.ts` — policy enforcement hook
- Modify: `src/cli/commands/cleanup.ts` — `--policy` flag
- Modify: tests

**Scope:** `scripts/`, `src/orchestra/`, `src/cli/commands/`, `tests/`

**Implementation Strategy:**

Direktif 13 retention policy:

```javascript
// scripts/deckent-cleanup-policy.mjs
const POLICY = {
  'config.json.bak*': { retention: 3, strategy: 'keep-newest' },
  'sprint-*-events.jsonl': { retention: 5, strategy: 'archive-after' },
  'sprint-*-seq': { retention: 3, strategy: 'archive-after' },
  'sprint-*-layer3-scorecard.md': { retention: 3, strategy: 'archive-after' },
  'jobs/*': { retention_days: 1, strategy: 'delete-after', exclude: ['active'] },
  'sprint-god-analysis/': { retention: 1, strategy: 'keep' },  // bu sprint özel
};

export async function runCleanupPolicy(root, mode = 'suggest') {
  // mode: 'suggest' → write .deckent/cleanup-suggestions.md
  // mode: 'apply' → move to .deckent/archive/ or delete
}
```

Sprint bitiminde `mode='suggest'`, periyodik (3 sprint'te bir) Alperen'e cleanup-suggestions.md rapor edilir. Alperen `deckent cleanup --policy --apply` ile onaylar.

`.deckent/routing/` Memory V2 uyum check:
- Eski routing cache (pre-V2) delete
- Mevcut routing/*.json Memory V2 entry'leriyle referans cross-check

**GO Criteria:**
- `.deckent/cleanup-suggestions.md` üretiliyor
- `deckent cleanup --policy --apply` retention'a göre arşivliyor/siliyor
- `.deckent/archive/` altında arşivlenen dosyalar

**Test:** 12 test.

---

### Task T-145-014: Observability Katmanı (debug-log + error hierarchy + ERRORS.md filter)

**Agent:** `architect` | **Skills:** `typescript-expert` | **Model:** opus | **Effort:** high

**Files:**
- Modify: `src/core/debug-log.ts` (T-143-006'dan genişletme) — 4 seviye complete
- Modify: `src/core/errors.ts` — unified `DeckentError` hierarchy
- Modify: `src/core/stack-detector.ts` — ENOENT noise filter
- Audit + refactor: tüm `console.warn`/`console.error` → `debugLog.warn`/`debugLog.error`
- Audit: `catch (err)` → `catch (err: unknown)` + proper type narrow
- Tests

**Scope:** `src/core/`, `src/`, `tests/`

**Implementation Strategy:**

**Direktif 22:** "hata kalıplarımız loglarımız zayıf neyi nereden kaybettik hata aldık yakalayamıyoruz kritik"

**1. debug-log.ts full implementation (T-143-006 genişletme):**

```typescript
export class DebugLog {
  private level: DebugLevel;

  constructor() {
    this.level = this.resolveLevel();
  }

  private resolveLevel(): DebugLevel {
    const env = process.env['DECKENT_LOG_LEVEL']?.toLowerCase();
    if (env === 'trace') return 'trace';
    if (env === 'info') return 'info';
    if (env === 'warn') return 'warn';
    if (process.env['DECKENT_DEBUG'] === '1') return 'trace';
    return 'warn';  // default: only warn + error
  }

  error(source: string, message: string, context?: object): void { this.emit('error', source, message, context); }
  warn(source: string, message: string, context?: object): void { this.emit('warn', source, message, context); }
  info(source: string, message: string, context?: object): void { this.emit('info', source, message, context); }
  trace(source: string, message: string, context?: object): void { this.emit('trace', source, message, context); }

  private emit(level: DebugLevel, source: string, message: string, context?: object): void {
    const LEVELS: Record<DebugLevel, number> = { trace: 0, info: 1, warn: 2, error: 3 };
    if (LEVELS[level] < LEVELS[this.level]) return;

    const event = {
      timestamp: new Date().toISOString(),
      level,
      source,
      message,
      ...(context ? { context } : {}),
      pid: process.pid,
    };
    process.stderr.write(JSON.stringify(event) + '\n');
  }
}

export const debugLog = new DebugLog();
```

**2. Error hierarchy (errors.ts):**

```typescript
export class DeckentError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly context: Record<string, unknown> = {},
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'DeckentError';
  }
}

export class BrainError extends DeckentError {
  constructor(code: string, message: string, context?: Record<string, unknown>, cause?: Error) {
    super(code, message, context, cause);
    this.name = 'BrainError';
  }
}

export class ValidationError extends DeckentError { /* T-143-001'den kalan, şimdi parent DeckentError */ }
export class MemoryQueryError extends DeckentError { /* T-143-006'dan */ }
export class ConfigError extends DeckentError { /* T-145-015'te kullanılacak */ }
export class NetworkError extends DeckentError { /* API calls */ }
export class ProviderError extends DeckentError { /* provider-specific */ }

// Utility: is DeckentError?
export function isDeckentError(err: unknown): err is DeckentError {
  return err instanceof DeckentError;
}
```

Tüm mevcut `BrainError` kullanımları `DeckentError` base'inden türemiş — backward compat.

**3. stack-detector.ts noise filter:**

```typescript
// Eski: her build file için statSync — yok ise ENOENT log
// Yeni: detectLanguages() önce proje type'ını tespit eder, sonra relevant files check
export async function detectLanguages(root: string): Promise<Language[]> {
  const hints = await detectProjectType(root);  // hızlı scan
  const checks: Array<Promise<Language | null>> = [];

  if (hints.includes('typescript') || hints.includes('javascript')) {
    checks.push(detectNodeProject(root));
  }
  if (hints.includes('rust')) {
    checks.push(detectRustProject(root));
  }
  // ... diğerleri

  const results = await Promise.all(checks);
  return results.filter((l): l is Language => l !== null);
}
```

Sonuç: Cargo.toml, go.mod, pom.xml sadece ilgili dil hinti varsa aranır. ENOENT spam 400+ → <5/sprint.

**4. Global catch audit:**

```bash
grep -rn "catch (err)" src/ | wc -l  # baseline
# → Her match için `catch (err: unknown)` + type narrow
# if (err instanceof DeckentError) { ... } else { ... }
```

**5. console.* migration:**

```bash
grep -rn "console\.\(warn\|error\|log\)" src/ | grep -v "// keep: explicit user output"
# Her match → debugLog equivalent
```

**GO Criteria:**
- `.brain/ERRORS.md` noise <50 satır/sprint (önceki 400+)
- Tüm `catch (err)` → `catch (err: unknown)`
- `console.warn/error` (non-user-output) → debugLog
- `DECKENT_LOG_LEVEL=trace deckent doctor` full trace output

**Test:** 20+ test.

---

### Task T-145-015: Config Katı Yapı (Zod Validation, Direktif 21)

**Agent:** `architect` | **Skills:** `typescript-expert`, `security-specialist` | **Model:** opus | **Effort:** normal

**Files:**
- Create: `src/core/config-schema.ts` — Zod schemas
- Modify: `src/core/config.ts` — validate on load
- Modify: `src/core/config-types.ts` — schema-derived types
- Modify: `.deckent/project-stack.json` — buildTool fix
- Modify: tests

**Scope:** `src/core/`, `.deckent/`, `tests/`

**Implementation Strategy:**

**Direktif 21:** "configlerde katı yapı ilerlemeli kullanıcılar config düzenlemeye itilmeli."

**Zod schemas (config-schema.ts):**

```typescript
import { z } from 'zod';

export const ProviderSchema = z.enum(['claude', 'codex', 'gemini']);
export const TierSchema = z.enum(['premium_plus', 'premium', 'standard', 'economy']);
export const PlanningModeSchema = z.enum(['ai', 'structured', 'auto']);

export const MemoryV2ConfigSchema = z.object({
  backend: z.literal('sqlite'),
  search: z.object({
    fts5_mode: z.enum(['and', 'or']).default('or'),
    turkish_normalize: z.boolean().default(true),
  }),
  decay_after_sprints: z.number().int().positive().default(10),
});

export const DeckentConfigSchema = z.object({
  brain_provider: ProviderSchema.default('claude'),
  worker_provider: ProviderSchema.default('claude'),
  fallback_provider: ProviderSchema.optional(),
  brain_tier: TierSchema.default('premium'),
  worker_tier: TierSchema.default('standard'),
  brain_planning: PlanningModeSchema.default('auto'),
  max_workers: z.number().int().positive().max(10).default(3),
  memory: MemoryV2ConfigSchema,
  // ... other fields
});

export type DeckentConfig = z.infer<typeof DeckentConfigSchema>;
```

**config.ts loadConfig validation:**

```typescript
export async function loadConfig(root: string): Promise<DeckentConfig> {
  const raw = await readConfigFile(root);
  try {
    return DeckentConfigSchema.parse(raw);
  } catch (err) {
    if (err instanceof z.ZodError) {
      debugLog.error('config', 'Config validation failed', { issues: err.issues });
      throw new ConfigError('INVALID_CONFIG', 'Config validation failed', { issues: err.issues });
    }
    throw err;
  }
}
```

**project-stack.json fix:** `buildTool: "vite"` → `buildTool: "tsc"` (mevcut hata).

**Migration helper:**

```typescript
export function migrateFlat2Nested(flat: Record<string, unknown>): DeckentConfig {
  // Eski flat config → yeni nested
  // Örnek: flat.memory_fts5_mode → nested.memory.search.fts5_mode
}
```

**GO Criteria:**
- Invalid config ile boot → `ConfigError` throw + clear message
- `.deckent/config.json` Zod schema conform
- project-stack.json `"buildTool": "tsc"`

**Test:** 15+ test (valid, invalid, migration, edge case).

---

### Task T-145-016: DECISIONS.md Archive Finalize (Direktif 29)

**Agent:** `devops-engineer` | **Skills:** `git-expert` | **Model:** sonnet | **Effort:** low

**Files:**
- Verify: `.brain/archive/decisions-root-pre-sprint145/DECISIONS.md` (T-143-009'da oluşturulmuştu)
- Modify: `.brain/PROJECT-IDENTITY.md` referans
- Update: `.brain/archive/decisions-root-pre-sprint145/MANIFEST.json` (SHA hash update)

**Scope:** `.brain/`

**Implementation Strategy:**

T-143-009 başlattı (root DECISIONS.md archive'a taşındı). Sprint 145'te finalizasyon:
1. Archive manifest SHA hash güncel mi doğrula
2. `.brain/PROJECT-IDENTITY.md` içinde "See .brain/DECISIONS.md for 28 ADRs" → "See .brain/exports/decisions.md for {{adrCount}} ADRs" (T-143-010 auto-regen yapıyor olmalı, ama baseline için verify)
3. `.brain/archive/` altında retention policy (T-145-013) ile kalıcı kayıt

**GO Criteria:**
- `.brain/DECISIONS.md` yok
- `.brain/archive/decisions-root-pre-sprint145/MANIFEST.json` valid
- PROJECT-IDENTITY.md ADR sayısı 40 (manifest ile uyumlu)

**Test:** 3 test.

---

## Wave 6 — Toplu Review Preparation (2 task)

### Task T-145-017: Chain Toplu Review Raporu

**Agent:** `architect` | **Skills:** `documentation-writer`, `system-architect` | **Model:** opus | **Effort:** high

**Files:**
- Create: `docs/audits/sprint-145/CHAIN-REVIEW-REPORT.md`

**Scope:** `docs/audits/sprint-145/`

**Implementation Strategy:**

3 sprint birleşik rapor (zincir değerlendirmesi):

```markdown
# Sprint 143-144-145 Chain Review Report

## 1. Executive Summary
- Chain start: 2026-04-17
- Chain end: {{date}}
- Total duration: ~14 saat (Sprint 143 4h + Sprint 144 5h + Sprint 145 4.5h)
- Total task: 59
- Chain safety gate triggers: ...
- Final health score: {{92+/100}}

## 2. Baseline vs Final (11 dimension)
| Boyut | Sprint 142 | Sprint 143 | Sprint 144 | Sprint 145 | Hedef | Karşılanıyor? |
|-------|-----------|-----------|-----------|-----------|-------|---------------|
| Brain Sağlık | 72 | 85 | 89 | 95+ | 95+ | ✅ |
| Memory V2 | 82 | 100 | 100 | 100 | 100 | ✅ |
| ... (11 boyut)

## 3. 60 Borç Madde Closure Status
- P0 (6): ... closed
- P1 (19): ... closed
- P2 (20): ... closed
- P3 (15): deferred to Sprint 146+

## 4. 5 Karar Execution Trace
- Karar 1 (B): operasyonel 18-task dağıldı, Sprint 143 6/6 + 144 6/6 + 145 6/6 ✅
- Karar 2 (A): FTS5 query fix Sprint 143 T-143-006 ✅
- Karar 3 (C): relations hibrit Sprint 143 T-143-007 ✅ (backfill +80 + auto-extract +20 + finalizer +2)
- Karar 4 (D): brain co-evolve A+B Sprint 143 (T-143-010+011) ✅, C Sprint 145 T-145-001 ✅
- Karar 5 (D): chain safety 0 ABORT veya N ABORT (trace)

## 5. Chain Safety Gate Pass/Fail History
- Sprint 143 gate: PASS (doctor ✅, tsc ✅, vitest 12525 PASS, cost $11, no_go 0)
- Sprint 144 gate: ...
- Sprint 145 gate: ...

## 6. Remaining Work (Sprint 146+)
- Multi-provider (Codex + Gemini) dogfood
- macOS + Windows support
- 100-task long-running live test
- Documentation finalization (388 .md review)
- Public Beta GA

## 7. Recommendations for Sprint 146
- Tema: Multi-provider + Multi-platform
- Öncelik: Codex API integration test, macOS dogfood
- Expected tasks: ~15-20
- Süre: ~4-5h

## 8. Risk / Incident Log
- (Sprint 143'te herhangi incident?)
- (Sprint 144 god split regresyon var mı?)
- (Sprint 145 i18n coverage eksik mi?)

## 9. MVP Yasak Check
- 0 worker output "acaba" pattern tespit edildi mi? (retro'lardan)
- Tüm task'lar kök neden analizi + kesin çözüm uyguladı mı?

## 10. Next Steps
- Alperen + Claude Code joint audit session
- Sprint 146 brainstorming start
- Memory update: project_sprint143_144_145_chain_completed.md
```

**GO Criteria:** Rapor ≥500 satır, tüm 11 boyut metriği + kanıt + recommendation.

**Test:** Manual review.

---

### Task T-145-018: Sprint 146 Pre-Flight

**Agent:** `architecture-planner` | **Skills:** `system-architect` | **Model:** sonnet | **Effort:** low

**Files:**
- Create: `.brain/sprints/sprint-146-preflight.md`

**Scope:** `.brain/sprints/`

**Implementation Strategy:**

Sprint 146 pre-flight checklist:
- Tema: Multi-provider + macOS/Windows dogfood
- Pre-requisites: Chain 143-145 gate PASS, coverage ≥1.5x, brain health 95+
- Task candidates (15-20 tahmini):
  - Codex API live test (OPENAI_API_KEY scenarios)
  - Gemini live test (GOOGLE_API_KEY scenarios)
  - macOS dogfood (Darwin-specific fs/spawn quirks)
  - Windows initial spike (WSL2 vs native)
  - Provider equivalence benchmark (claude vs codex vs gemini)
  - Cost comparison analysis
- Risks: API quota burn (Sprint 140 tipi), platform-specific regressions
- Budget estimate: ~$20
- Süre: ~5h

**GO Criteria:** Pre-flight dokümanı hazır, Sprint 146 brainstorming için temel.

**Test:** Manual review.

---

## Sprint 145 Sonu — TOPLU REVIEW (Zincir Handoff)

Sprint 145 finalize sonrası **chain safety gate** aynen çalışır (PASS → fakat bir sonraki sprint otomatik tetiklenmez, sadece Sprint 146 brainstorming için hazır).

**Alperen + Claude Code joint audit session:**
1. `docs/audits/sprint-145/CHAIN-REVIEW-REPORT.md` birlikte okunur
2. 11 sağlık boyutu hedefleri karşılanıyor mu?
3. MVP yasak ihlali (retro'lardan worker "acaba" pattern tespit) var mı?
4. Core bozulmadı mı (brain finalize/cleanup/heartbeat)?
5. Opus-only P0/P1 uyumu kanıtlı mı?
6. 60 borç maddesi closure status
7. Sprint 146 kararı (brainstorming new cycle)

---

## Self-Review Checklist

- [x] **Spec coverage:** 18/18 task spec §4 ile birebir
- [x] **Placeholder scan:** 0 TBD/TODO
- [x] **Type consistency:** `FeaturesManifest`, `DebugEvent`, `DeckentError`, `ConfigError`, `DeckentConfig` tutarlı
- [x] **Cross-sprint dep:**
  - T-145-001 uses T-143-010 sprint-finalizer hook (manifest gen entegre)
  - T-145-014 genişletir T-143-006 debug-log
  - T-145-010 cross-validation uses T-145-001 manifest as canonical source
  - T-145-016 finalize eder T-143-009 DECISIONS archive
  - T-145-013 retention policy uses T-143-013 safeArchive pattern
- [x] **MVP yasak + core bozulamaz:** Her task kesin çözüm + test. Dashboard + i18n + observability + config birlikte bir "kalite felsefi katman".

---

## Referanslar

- Spec: `docs/superpowers/specs/2026-04-17-sprint-143-144-145-zincir-reform-design.md`
- FINAL-REPORT §§ 4, 7, 11, 14, 15, 16: i18n + doc + config + error + TODO
- `meta/i18n-parity-coverage.md`: i18n baseline analizi
- Memory: `project_doc_finalization_sprint.md` (Sprint 148 hint, bu plan ile uyumlu)
