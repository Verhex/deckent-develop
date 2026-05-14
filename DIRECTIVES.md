# DIRECTIVES — Sprint 169: Audit Remediation + Brain Pipeline Closure

## Spec + Plan Referansları

- **Spec:** `docs/superpowers/specs/2026-05-15-sprint-169-design.md`
- **Plan:** `docs/superpowers/plans/2026-05-15-sprint-169-plan.md`
- **Predecessor:** Sprint 168 GO_WITH_TECH_DEBT (`b5a0acb`, 13 commit origin/main'de)
- **Sprint 168 archive:** `.brain/archive/DIRECTIVES-sprint-168.md`
- **Audit input:** `.audit/sprint-167/T7-cross-cutting-synthesis.md`

## Goal

Sprint 167 T7 audit'in açık 7 task'ını (C1 Memory Relations, C2 Bug Z3 Rebuild Safety, H1 ADR DB→FS Export, H2 Stub Backfill, H3 Secret Scan Baseline, H4 Dashboard CI Gate, H5 dep_pipeline_enabled Flip) ve Sprint 168 smoke test'in ortaya çıkardığı 2 brain pipeline quirk'ünü (W3.1 C0c collision live trigger, W3.2 dep parser fix) closure. Sprint 170 OSS GA (`VerhexIO/deckent` public flip + `npm publish v1.0.0-beta.2` + Show HN) için anchor sprint.

## Brain Planning Instructions

Mode: Brain tam otonom (Sprint 168 smoke kanıtladı). Wave structure: 3 wave (Wave 1 = 6 paralel, Wave 2 = 2 paralel depends C1, Wave 3 = H5 final). Max workers: 6. Dependency format: JSON array (`["169-003"]`) — W3.2 parser fix öncesi bypass. Alperen review: sprint başlangıç + finalize 2 checkpoint.

## Worker Contract

Tüm worker'lar plan dosyasındaki kendi Task bölümünü mutlaka okumalı: `docs/superpowers/plans/2026-05-15-sprint-169-plan.md`. TDD enforcement (failing test → fix → pass), JSON array dependency format, scope.filesWrite STRICT (Auditor `git diff --stat` izler), `.tasks/task-<id>.result` yazımı, worker prompt `.prompt-*.txt` selective cleanup (ADR-048), ADR-046 + ADR-047 + ADR-048 invariant korunur — bunların hepsi plan dosyasında. Plan referansı bağlayıcı kontrattır.

## Task 1: W3.1 C0c Collision Detection Live Trigger Investigation + Fix

- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/sprint-spawner.ts, src/orchestra/decision-engine.ts, tests/orchestra/c0c-collision-live-fire.test.ts
- Scope: src/orchestra/, tests/orchestra/, .audit/sprint-169/
- Agent: bug-fixer

### Description

Sprint 168 smoke evidence: `detectScopeCollisions` wire layer var (Sprint 168 W2.5 integration) ama runtime `BRAIN→SPAWN:BLOCKED` event tetiklenmiyor. Forensic investigation: `.deckent/events.jsonl` trace, subscriber path registration timing, scope normalization (`./src/foo` vs `src/foo`). RC bul + fix + live-fire test. Plan Task 2 (Steps 2.1-2.8) detaylı runbook. RC dosyası `.audit/sprint-169/W3.1-root-cause.md` yazılır.

**Kanıt:** `grep "normalizeScopeFiles\|detectScopeCollisions" src/orchestra/sprint-spawner.ts` 2+ match. RC docu mevcut.

**Test:** 3 TDD test PASS (paralel collision detect, scope normalize, double-slash handling)

## Task 2: W3.2 Smoke Directive Dependency Parser Fix

- Model: opus
- Effort: low
- Skills: typescript-expert
- Files: src/orchestra/task-builder.ts, tests/orchestra/dep-parser-string-to-array.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Agent: bug-fixer

### Description

Sprint 168 smoke test T3 NO_GO RC: DIRECTIVES.md `- Dependencies: foo` bare string parse edilmiyor, task.json'a literal kalıyor. `parseDependencyField` helper 3 format kabul eder: bare string, comma-separated list, JSON array (idempotent). DIRECTIVES parser çağrı noktası güncellenir. Plan Task 1 (Steps 1.1-1.6) detaylı runbook.

**Kanıt:** `grep "parseDependencyField" src/orchestra/task-builder.ts` 2+ match (export + use).

**Test:** 6 TDD test PASS (bare string, comma list, JSON array, multi-element, empty, whitespace)

## Task 3: C1 Memory Relations Migration

- Model: opus
- Effort: high
- Skills: database-migration, typescript-expert
- Files: src/core/memory-store.ts, src/core/memory-types.ts, scripts/memory/migrate-relations.mjs, tests/core/memory-relations-migration.test.ts
- Scope: src/core/, scripts/memory/, tests/core/
- Agent: data-engineer

### Description

memory.db `relations` tablosu Sprint 159 Memory V2 schema'da var ama backfill eksik. `.brain/archive/pre-v2/DECISIONS.md` regex parse ile 6 MADR v3 relation tipi (references, supersedes, caused_by, resolves, blocks, depends_on) extract + insert. Idempotent (INSERT OR IGNORE), FK validation (orphan skip + log). `insertRelation` + `getRelations` API memory-store.ts'e eklenir. Plan Task 3 (Steps 3.1-3.9) detaylı runbook.

**Kanıt:** `grep "insertRelation\|getRelations" src/core/memory-store.ts` 2+ match. `SELECT COUNT FROM relations` > 0. Idempotent re-run aynı count.

**Test:** 4 TDD test PASS (insert basic, dedupe, FK validation orphan reject, 6 MADR types)

## Task 4: H2 Stub Memory Entries Backfill

- Model: opus
- Effort: normal
- Skills: database-migration
- Files: scripts/memory/backfill-stub-entries.mjs, src/core/memory-store.ts, tests/core/memory-stub-backfill.test.ts
- Scope: src/core/, scripts/memory/, tests/core/
- Agent: data-engineer

### Description

Sprint 159-161 memory entries stub flag (backfill Sprint 168 stub eklendi, gerçek içerik eksik). `.brain/archive/sprints/sprint-{159,160,161}.md` retrieve + content swap. `stub_flag: true → false`. Idempotent: zaten dolu entries dokunulmaz. `memory-store.ts` getById + update API yoksa eklenir. Plan Task 4 (Steps 4.1-4.7) detaylı runbook.

**Kanıt:** `length(content) > 100` for sprint-159/160/161 memory entries. `json_extract(metadata, '$.stub_flag') = 0` (false).

**Test:** 2 TDD test PASS (backfill replaces, idempotent skip)

## Task 5: H3 OSS Pre-Flip Secret Scan Baseline

- Model: opus
- Effort: normal
- Skills: security-specialist, devops-engineer
- Files: .github/workflows/secret-scan.yml, scripts/security/secret-baseline.mjs, .secrets-baseline
- Scope: .github/workflows/, scripts/security/, root
- Agent: security-auditor

### Description

OSS public flip öncesi secret scan baseline (Sprint 170 öncesi guardrail). 10 regex pattern (AWS, GitHub PAT, OpenAI, Anthropic, Google, Discord, Telegram, Private keys, env vars). Tüm tracked dosyalarda scan (`git ls-files`). `.secrets-baseline` allowlist (bilinen test fixture'lar). GitHub Actions: PR + push main/master gate. Plan Task 5 (Steps 5.1-5.5) detaylı runbook.

**Kanıt:** `ls .github/workflows/secret-scan.yml` mevcut. `ls .secrets-baseline` mevcut JSON. Local script run exit 0.

**Test:** 1 functional smoke (script run + exit code)

## Task 6: H4 Dashboard Build CI Gate

- Model: opus
- Effort: normal
- Skills: react-specialist, devops-engineer, ci-testing
- Files: .github/workflows/dashboard-build.yml, package.json, tests/dashboard/dashboard-build-smoke.test.ts
- Scope: .github/workflows/, tests/dashboard/, root
- Agent: devops-engineer

### Description

Sprint 167 retro finding: React+Vite+Tailwind dashboard build CI'da yoktu (sadece local). Node 18/20/22 matrix + artifact size threshold (5MB max) + smoke test. `npm run build:dashboard` + `npm run build:all` scripts package.json'a eklenir (yoksa). Plan Task 6 (Steps 6.1-6.6) detaylı runbook.

**Kanıt:** `ls .github/workflows/dashboard-build.yml` mevcut. `grep "build:dashboard\|build:all" package.json` 2+ match.

**Test:** 3 TDD test PASS (scripts defined, vite config exists, build produces dist — CI-only)

## Task 7: C2 Bug Z3 Memory Rebuild Safety

- Model: opus
- Effort: normal
- Skills: database-migration, typescript-expert
- Files: src/core/memory-import.ts, tests/core/memory-rebuild-safety.test.ts
- Scope: src/core/, tests/core/
- Agent: data-engineer
- Dependencies: ["169-003"]

### Description

Sprint 167 audit Bug Z3: `deckent memory rebuild` relations tablosunu DROP edip re-insert ediyor AMA re-insert eksik (relations export tarafından regenerated değil). Rebuild: relations backup → import → verify → rollback contract. strict mode: relation count düşerse throw + rollback. Plan Task 7 (Steps 7.1-7.5) detaylı runbook. Task 3 (C1) DONE öncesi başlatılmaz.

**Kanıt:** Pre-rebuild + post-rebuild relations count equal. strict mode rollback test PASS.

**Test:** 2 TDD test PASS (preserve, verify-fail rollback)

## Task 8: H1 ADR DB→FS Export Pipeline + ADR-046 Reverse Hook

- Model: opus
- Effort: high
- Skills: database-migration, documentation-writer
- Files: src/core/memory-export.ts, scripts/memory/export-adr-fs.mjs, docs/adr/046-brain-self-update-hook.md, docs/adr/, tests/core/adr-fs-export.test.ts
- Scope: src/core/, scripts/memory/, docs/adr/, tests/core/
- Agent: data-engineer
- Dependencies: ["169-003"]

### Description

Sprint 167 audit Bug R: 43 ADR memory.db'de accepted ama `docs/adr/*.md` eksik (Sprint 166 hook tek yön: FS→DB). DB→FS export pipeline + MADR v3 format + idempotent (existing .md mtime > DB updated_at → skip, manuel edit korunur) + eksik field placeholder (`_To be backfilled_`). ADR-046 amendment: bi-directional hook contract (FS ↔ DB her iki yön sync). Plan Task 8 (Steps 8.1-8.8) detaylı runbook. Task 3 (C1) DONE öncesi başlatılmaz.

**Kanıt:** `ls docs/adr/*.md | wc -l` 43+. `grep "Amendment 2026-05-15" docs/adr/046-*.md` 1+ match.

**Test:** 3 TDD test PASS (complete export, partial placeholder, idempotent)

## Task 9: H5 dep_pipeline_enabled Flip + 3-Layer Doc Fix

- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer
- Files: src/core/config.ts, DECKENT.md, CLAUDE.md, .contracts/api-surface.md, tests/core/config-dep-pipeline-default.test.ts
- Scope: src/core/, root, .contracts/, tests/core/
- Agent: architect
- Dependencies: ["169-007", "169-008"]

### Description

Sprint 167 flip plan tamamlama: `dependency_pipeline_enabled: false → true` default. Wave scheduling go live (Sprint 139 T28 Kahn topological sort wire production default). 3-layer doc sync: DECKENT.md (ADR-045 reference + Sprint 169 flip anchor), CLAUDE.md (Wave scheduling default ON note + rollback path), `.contracts/api-surface.md` (Sprint Phases WAVE_BUILD step). Backout: `dependency_pipeline_enabled: false` rollback test gate. Plan Task 9 (Steps 9.1-9.8) detaylı runbook. Task 7 + 8 DONE öncesi başlatılmaz.

**Kanıt:** `grep "dependency_pipeline_enabled.*true" src/core/config.ts` 1+ match. 3 doc'ta Sprint 169 flip satır.

**Test:** 3 TDD test PASS (default true, override false, no-config default)

## GO/NO_GO Criteria

9/9 anchor task DONE veya GO_WTD ≤2 cosmetic (NO_GO = 0). Brain otonom finalize, manuel survival incident = 0. `tsc --noEmit` 0 hata. `vitest run` baseline: pass ≥16475 + fail ≤2 + skip ≤41. memory.db: `relations` row count > 0 (C1 kanıt), ADR count delta ≥0. `docs/adr/*.md` ≥43 file (H1 kanıt). `.github/workflows/secret-scan.yml` + `dashboard-build.yml` aktif (H3 + H4). `dependency_pipeline_enabled: true` default (H5 kanıt). Auditor `git diff --stat` boundary violation = 0. memory.db Sprint 169 entries (`sprint-log-169`, `retro-sprint-169`, `mem-sprint-169`) 3 row insert.

## Sprint 170 OSS GA Handoff

Sprint 169 GO (full pass) Sprint 170 OSS GA conditional açar: `VerhexIO/deckent-dev → VerhexIO/deckent` public flip, `npm publish v1.0.0-beta.2` (Alperen approval), Show HN launch hazırlığı. Sprint 169 GO_WTD (≤2 cosmetic) Sprint 170 conditional + 1 review cycle. Sprint 169 NO_GO Sprint 169 hotfix mikro-sprint (1-3 task), Sprint 170 ertelenir.
