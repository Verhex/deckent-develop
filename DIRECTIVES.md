# DIRECTIVES — Sprint 168.5: Audit Remediation + Brain Pipeline Closure

## Spec + Plan Referansları

- **Spec:** `docs/superpowers/specs/2026-05-15-sprint-168.5-design.md` (3a84f29, brainstorming output 266 satır)
- **Plan:** `docs/superpowers/plans/2026-05-15-sprint-168.5-plan.md` (a528d16, TDD runbook 1638 satır)
- **Predecessor:** Sprint 168 GO_WITH_TECH_DEBT (`b5a0acb`, 13 commit origin/main'de)
- **Sprint 168 archive:** `.brain/archive/DIRECTIVES-sprint-168.md`
- **Audit input:** `.audit/sprint-167/T7-cross-cutting-synthesis.md` + `consolidated-inventory.md`

## Goal

Sprint 167 T7 audit'in açık 7 task'ını (C1 Memory Relations, C2 Bug Z3 Rebuild Safety,
H1 ADR DB→FS Export, H2 Stub Backfill, H3 Secret Scan Baseline, H4 Dashboard CI Gate,
H5 dep_pipeline_enabled Flip) + Sprint 168 smoke test'in ortaya çıkardığı 2 brain
pipeline quirk'ünü (W3.1 C0c collision live trigger + W3.2 dep parser fix) closure.

Sprint 169 OSS GA (`VerhexIO/deckent` public flip + `npm publish v1.0.0-beta.2` +
Show HN) için anchor sprint.

## Brain Planning Instructions

- **Mode:** Brain tam otonom (`deckent plan + start` — Sprint 168 smoke kanıtladı)
- **Planning mode:** `mode: 'ai'` (DIRECTIVES yorumlu, 9 task → wave breakdown)
- **Dependency format:** JSON array (`["168.5-003"]`) — W3.2 parser fix öncesi bypass
- **Wave structure:** 3 wave (W1: 6 paralel → W2: 2 paralel depends C1 → W3: H5 final)
- **Max workers:** 6 (Wave 1 paralelizm)
- **Alperen review:** Sprint başlangıç + finalize sonrası 2 checkpoint (per-wave checkpoint yok)

## Wave Structure (dependency_pipeline_enabled: true)

- **Wave 1 (6 paralel):** W3.1, W3.2, C1, H2, H3, H4
- **Wave 2 (2 paralel, depends C1=168.5-003):** C2, H1
- **Wave 3 (final):** H5

## 9 Anchor Tasks

### Task 1: W3.1 — C0c Collision Detection Live Trigger Investigation + Fix

- Model: opus
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert
- Files: src/orchestra/sprint-spawner.ts, src/orchestra/decision-engine.ts, tests/orchestra/c0c-collision-live-fire.test.ts, .audit/sprint-168.5/W3.1-root-cause.md
- Scope: src/orchestra/, tests/orchestra/, .audit/sprint-168.5/
- Dependencies: []

#### Description

Sprint 168 smoke evidence: `detectScopeCollisions` wire layer var (Sprint 168 W2.5
integration) AMA runtime `BRAIN→SPAWN:BLOCKED` event tetiklenmiyor. Forensic
investigation: `.deckent/events.jsonl` trace + subscriber path + scope normalization.

RC olasılıkları (rank):
- RC-A: subscriber registration timing race (spawn ÖNCESİ değil sonrası registered)
- RC-B: event channel name string mismatch
- RC-C: scope normalization eksik (`./src/foo` vs `src/foo`)

Plan Task 2 (Steps 2.1-2.8) detaylı runbook. RC'ye göre fix + live-fire test.

**Kanıt:**
- `grep "detectScopeCollisions\|normalizeScopeFiles" src/orchestra/sprint-spawner.ts` → 2+ match
- `.audit/sprint-168.5/W3.1-root-cause.md` mevcut (RC + fix proposal)
- TDD test 3/3 PASS

**Test:** 3 TDD test (2 paralel collision detect, scope normalize, double-slash handling)

### Task 2: W3.2 — Smoke Directive Dependency Parser Fix

- Model: opus
- Effort: low
- Agent: bug-fixer
- Skills: typescript-expert
- Files: src/orchestra/task-builder.ts, tests/orchestra/dep-parser-string-to-array.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: []

#### Description

Sprint 168 smoke test T3 NO_GO RC: DIRECTIVES.md `- Dependencies: foo` bare string
parse edilmiyor, task.json'a literal kalıyor. `parseDependencyField` helper
3 format kabul eder: bare string, comma-separated list, JSON array (idempotent).

Plan Task 1 (Steps 1.1-1.6) detaylı runbook.

**Kanıt:**
- `grep "parseDependencyField" src/orchestra/task-builder.ts` → 2+ match (export + use)
- TDD test 6/6 PASS

**Test:** 6 TDD test (bare string, comma list, JSON array, multi-element, empty, whitespace)

### Task 3: C1 — Memory Relations Migration

- Model: opus
- Effort: high
- Agent: data-engineer
- Skills: database-migration, typescript-expert
- Files: src/core/memory-store.ts, src/core/memory-types.ts, scripts/memory/migrate-relations.mjs, tests/core/memory-relations-migration.test.ts
- Scope: src/core/, scripts/memory/, tests/core/
- Dependencies: []

#### Description

memory.db `relations` tablosu Sprint 159 Memory V2'de schema'da var ama backfill eksik.
`.brain/archive/pre-v2/DECISIONS.md` regex parse ile 6 MADR v3 relation tipi extract +
insert. Idempotent (INSERT OR IGNORE), FK validation (orphan skip + log).

`insertRelation` + `getRelations` API memory-store.ts'e eklenir.

Plan Task 3 (Steps 3.1-3.9) detaylı runbook.

**Kanıt:**
- `grep "insertRelation\|getRelations" src/core/memory-store.ts` → 2+ match
- `node -e "...COUNT FROM relations"` > 0 (sıfır olmayan row)
- Idempotent re-run aynı count
- TDD test 4/4 PASS (insert, dedupe, FK validation, 6 MADR types)

**Test:** 4 TDD test

### Task 4: H2 — Stub Memory Entries Backfill

- Model: opus
- Effort: normal
- Agent: data-engineer
- Skills: database-migration
- Files: scripts/memory/backfill-stub-entries.mjs, src/core/memory-store.ts (getById + update API yoksa), tests/core/memory-stub-backfill.test.ts
- Scope: src/core/, scripts/memory/, tests/core/
- Dependencies: []

#### Description

Sprint 159-161 memory entries stub flag (Sprint 168 backfill stub eklendi, gerçek içerik eksik).
`.brain/archive/sprints/sprint-{159,160,161}.md` retrieve + content swap.
`stub_flag: true → false`. Idempotent: zaten dolu entries dokunulmaz.

Plan Task 4 (Steps 4.1-4.7) detaylı runbook.

**Kanıt:**
- `node -e "...length(content) FROM entries WHERE id IN ('mem-sprint-159',...)"` → all > 100
- `json_extract(metadata, '$.stub_flag')` → 0 (false) for sprint-159/160/161
- TDD test 2/2 PASS

**Test:** 2 TDD test (backfill replaces, idempotent skip)

### Task 5: H3 — OSS Pre-Flip Secret Scan Baseline

- Model: opus
- Effort: normal
- Agent: security-auditor
- Skills: security-specialist, devops-engineer
- Files: .github/workflows/secret-scan.yml, scripts/security/secret-baseline.mjs, .secrets-baseline
- Scope: .github/workflows/, scripts/security/, root
- Dependencies: []

#### Description

OSS public flip öncesi secret scan baseline. 10 regex pattern (AWS, GitHub PAT,
OpenAI, Anthropic, Google, Discord, Telegram, Private keys, env vars). Tüm tracked
dosyalarda scan (`git ls-files`). `.secrets-baseline` allowlist (bilinen test
fixture'lar). GitHub Actions: PR + push main/master gate.

Plan Task 5 (Steps 5.1-5.5) detaylı runbook.

**Kanıt:**
- `ls .github/workflows/secret-scan.yml` mevcut
- `ls .secrets-baseline` mevcut JSON
- `node scripts/security/secret-baseline.mjs` exit 0 (0 unallowlisted hit)

**Test:** 1 functional smoke (script run + exit code)

### Task 6: H4 — Dashboard Build CI Gate

- Model: opus
- Effort: normal
- Agent: devops-engineer
- Skills: react-specialist, devops-engineer, ci-testing
- Files: .github/workflows/dashboard-build.yml, package.json, tests/dashboard/dashboard-build-smoke.test.ts
- Scope: .github/workflows/, tests/dashboard/, root
- Dependencies: []

#### Description

Sprint 167 retro: React+Vite+Tailwind dashboard build CI'da yoktu (sadece local).
Node 18/20/22 matrix + artifact size threshold (5MB max) + smoke test (vite build +
dist artifact + mount sanity).

`npm run build:dashboard` + `npm run build:all` scripts package.json'a eklenir
(yoksa).

Plan Task 6 (Steps 6.1-6.6) detaylı runbook.

**Kanıt:**
- `ls .github/workflows/dashboard-build.yml` mevcut
- `grep "build:dashboard\|build:all" package.json` → 2+ match
- TDD test 3/3 PASS (2 local + 1 CI-only)

**Test:** 3 TDD test (scripts defined, vite config exists, build produces dist)

### Task 7: C2 — Bug Z3 Memory Rebuild Safety

- Model: opus
- Effort: normal
- Agent: data-engineer
- Skills: database-migration, typescript-expert
- Files: src/core/memory-import.ts, tests/core/memory-rebuild-safety.test.ts
- Scope: src/core/, tests/core/
- Dependencies: ["168.5-003"]

#### Description

Sprint 167 audit Bug Z3: `deckent memory rebuild` relations tablosunu DROP edip
re-insert ediyor AMA re-insert eksik (relations export tarafından regenerated
değil). Rebuild: relations backup → import → verify → rollback contract.
strict mode: relation count düşerse throw + rollback.

Plan Task 7 (Steps 7.1-7.5) detaylı runbook.

**Kanıt:**
- TDD test 2/2 PASS (preserve + verify-fail rollback)

**Test:** 2 TDD test

### Task 8: H1 — ADR DB→FS Export Pipeline + ADR-046 Reverse Hook

- Model: opus
- Effort: high
- Agent: data-engineer
- Skills: database-migration, documentation-writer
- Files: src/core/memory-export.ts, scripts/memory/export-adr-fs.mjs, docs/adr/046-brain-self-update-hook.md (amendment), docs/adr/*.md (43 generate), tests/core/adr-fs-export.test.ts
- Scope: src/core/, scripts/memory/, docs/adr/, tests/core/
- Dependencies: ["168.5-003"]

#### Description

Sprint 167 audit Bug R: 43 ADR memory.db'de accepted ama `docs/adr/*.md` eksik
(Sprint 166 hook tek yön: FS→DB). DB→FS export pipeline + MADR v3 format +
idempotent (existing .md mtime > DB updated_at → skip, manuel edit korunur) +
eksik field placeholder (`_To be backfilled_`).

ADR-046 amendment: bi-directional hook contract (FS ↔ DB her iki yön sync).

Plan Task 8 (Steps 8.1-8.8) detaylı runbook.

**Kanıt:**
- `ls docs/adr/*.md | wc -l` ≥43
- `grep "Amendment 2026-05-15" docs/adr/046-*.md` → 1+ match
- TDD test 3/3 PASS

**Test:** 3 TDD test (complete export, partial placeholder, idempotent)

### Task 9: H5 — dep_pipeline_enabled Flip + 3-Layer Doc Fix

- Model: opus
- Effort: low
- Agent: architect
- Skills: typescript-expert, documentation-writer
- Files: src/core/config.ts, DECKENT.md, CLAUDE.md, .contracts/api-surface.md, tests/core/config-dep-pipeline-default.test.ts
- Scope: src/core/, root .md docs, .contracts/, tests/core/
- Dependencies: ["168.5-007", "168.5-008"]

#### Description

Sprint 167 flip plan tamamlama: `dependency_pipeline_enabled: false → true` default.
Wave scheduling go live (Sprint 139 T28 Kahn topological sort wire production
default). 3-layer doc sync:
- DECKENT.md ADR-045 reference + Sprint 168.5 flip anchor
- CLAUDE.md "Wave scheduling default ON" note + rollback path
- `.contracts/api-surface.md` "Sprint Phases" WAVE_BUILD step eklendi

Backout: `dependency_pipeline_enabled: false` rollback test PASS gate.

Plan Task 9 (Steps 9.1-9.8) detaylı runbook.

**Kanıt:**
- `grep "dependency_pipeline_enabled.*true" src/core/config.ts` → 1+ match
- 3 doc'ta Sprint 168.5 flip satır mevcut
- TDD test 3/3 PASS (default + override + no-config)

**Test:** 3 TDD test

## Anchor Constraints (Worker zorunlu okur)

1. **TDD ZORUNLU:** failing test → fix → pass + integration test
2. **Yeni test'lerde skip kullanma** (baseline 41 korunur, Sprint 168.5 ≤41)
3. **Test PASS olmadan commit YASAK** + atomic commits per step
4. **Plan dosyasını mutlaka oku** (`docs/superpowers/plans/2026-05-15-sprint-168.5-plan.md` ilgili Task section)
5. **ADR-046 invariant korunur** (C1 + C2 + H1 her üçü relations preserve)
6. **ADR-047 manuel dispatch ile çelişme:** Sprint 168.5 Brain otonom dispatch, manuel survival incident = 0 hedef
7. **ADR-048 prompt lifecycle:** worker `.prompt-*.txt` selective cleanup (Sprint 168 C0e contract)
8. **Worker .result yaz:** `.tasks/task-<id>.result` (status + commits + tests + files)
9. **Scope enforcement:** `scope.filesWrite` STRICT (Auditor `git diff --stat` izler)
10. **Dependency JSON array format:** task.json dependencies `["168.5-003"]` array (W3.2 bypass)

## GO/NO_GO Criteria (Strict)

- ✅ 9/9 anchor task DONE veya GO_WTD ≤2 cosmetic (NO_GO = 0)
- ✅ Brain otonom finalize (manuel survival incident = 0)
- ✅ `tsc --noEmit` 0 hata
- ✅ `vitest run` baseline: pass ≥16475 + fail ≤2 + skip ≤41
- ✅ memory.db: `relations` row count > 0 (C1 kanıt), ADR count delta ≥0
- ✅ `docs/adr/*.md` ≥43 file (H1 kanıt)
- ✅ `.github/workflows/secret-scan.yml` + `dashboard-build.yml` aktif (H3 + H4)
- ✅ `dependency_pipeline_enabled: true` default (H5 kanıt)
- ✅ Auditor `git diff --stat` boundary violation = 0
- ✅ memory.db Sprint 168.5 entries: `sprint-log-168.5`, `retro-sprint-168.5`, `mem-sprint-168.5` 3 row

## Sprint 169 OSS GA Handoff

- **168.5 GO (full pass):** Sprint 169 OSS GA conditional açılır
  - `VerhexIO/deckent-dev` → `VerhexIO/deckent` public flip
  - `npm publish v1.0.0-beta.2` (Alperen approval)
  - Show HN launch hazırlığı
- **168.5 GO_WTD (≤2 cosmetic):** Sprint 169 conditional, 1 review cycle Alperen ile
- **168.5 NO_GO:** Sprint 168.6 gap closure mikro-sprint (1-3 task). Sprint 169 Sprint 170+'a kayar.
