# DIRECTIVES — Sprint 140: Deckent Self-Analysis Ayna Sprint

> Sprint 140 tamamen yeniden tasarlandı (Alperen direktifi 2026-04-15). Orijinal "Operasyonel Disiplin + Recovery Mechanisms" planı Sprint 141'e ertelendi. Sprint 140 = **Deckent kendi kendini her dosya olarak tam analiz eder, raporlar, brain tek kapsamlı final rapor üretir.**

## Referanslar
- Sprint 140 preflight memory: `project_sprint140_selfanalysis.md`
- Sprint 141 preflight memory (orijinal Sprint 140 plan): `project_sprint141_preflight.md`
- Sprint 139 manuel scorecard: `.deckent/sprint-139-layer3-scorecard.md`
- Kill approval kuralı (MUTLAK): `feedback_deckent_kill_approval_required.md`
- Brain memory limit artırımları: `src/core/constants.ts` (MEMORY 1500, budget 5000, decay 20)

## Goal

**Deckent kendi kendini tanısın.** Her TypeScript dosyası, her test, her doküman, her markdown, her config paralel worker'lar tarafından read-only analiz edilir. Her worker kendi rapor dosyasına yazar, birbirinin işine girmez. Brain finalize phase'de tüm raporları toplayıp **tek kapsamlı final rapor** üretir (`.deckent/sprint-140-analysis/FINAL-REPORT.md`). Hiçbir dosya okunmamış kalmayacak. Test çalıştırılmayacak, commit yapılmayacak. Hedef ~400 task, 12h hard cap, tam Deckent surface coverage.

## Kurallar (MUTLAK)

1. **READ-ONLY:** Worker'lar hiçbir kaynak dosya değiştirmez. Kaynak kod mutasyonu → NO_GO + alarm
2. **Test çalıştırma YASAK:** `tsc --noEmit` + `vitest run` worker verify loop'ta devre dışı (`VITEST_SKIP_E2E_SPRINT=1`, `DECKENT_SKIP_VERIFY=1`)
3. **Commit YASAK:** Worker'lar git commit yapmaz, sprint sonunda Alperen elle commit eder
4. **Cross-contamination YOK:** Her worker sadece kendi rapor dosyasına yazar, başka worker'ın raporuna bakmaz
5. **Sink dizin:** Tüm rapor dosyaları `.deckent/sprint-140-analysis/<category>/<name>.md` formatında
6. **TEK final rapor:** Brain finalize'de `.deckent/sprint-140-analysis/FINAL-REPORT.md` (Alperen şart koştu)
7. **Başarısız analiz → flag:** NO_GO worker'ların bıraktığı dosyalar final rapor Section 16'da ayrı listelenir

## Pre-flight Limit Artırımları (CC 2026-04-15, Sprint 140 başlangıcı öncesi manuel)

| Constant | Eski | Yeni |
|----------|------|------|
| `MEMORY_MAX_LINES` | 300 | **1500** (5x) |
| `PATTERNS_MAX_LINES` | 150 | **800** (5.3x) |
| `RETRO_MAX_LINES` | 120 | **400** (3.3x) |
| `SPRINT_LOG_MAX_LINES` | 100 | **500** (5x) |
| `ERRORS_MAX_LINES` | 200 | **600** (3x) |
| `DECISIONS_MAX_LINES` | yok | **1200** (explicit cap) |
| `BRAIN_TOTAL_LINE_BUDGET` | 900 | **5000** (5.5x) |
| `MEMORY_DECAY_SPRINTS` | 8 | **20** (2.5x) |
| `PATTERN_DECAY_SPRINTS` | 12 | **25** (2x) |
| `.deckent/config.json memory_budget` | 900 | **5000** |
| `.deckent/config.json decay_after_sprints` | 5 | **20** |

Bu değişiklikler Sprint 140 DIRECTIVES'ten önce CC tarafından manuel yapıldı, Deckent runtime üzerinden değil. Sprint 140 Task 1'den itibaren limit aktif.

## Worker Rapor Formatı (Per-File Task Template)

Her worker `.deckent/sprint-140-analysis/<category>/<file>.md` dosyasına şu template'i yazmalı:

```markdown
# Analysis: <file-path>

**Task ID:** 140-XXX
**Worker:** <worker-id>
**Analysis date:** 2026-04-XX
**File type:** TypeScript | Test | Markdown | JSON | ...
**LoC:** <number>

## 1. Amacı (1-2 cümle)
## 2. Public API (export'lar + type signatures)
## 3. Iç Bağımlılıklar (dosya içi import'lar)
## 4. Dış Bağımlılıklar (node_modules import'ları)
## 5. Complexity Metrics (fonksiyon sayısı, cyclomatic rough)
## 6. Type Safety Issues (any, @ts-ignore, non-null, as unknown)
## 7. ADR Compliance (ADR-006 spawnSync, ADR-008 brain import, ADR-010 deps, ADR-037 RBAC, ADR-039 self-modifying)
## 8. Test Coverage (src/X.ts → tests/X.test.ts var mı?)
## 9. TODO/FIXME/HACK Comments (inventory)
## 10. Documentation Coverage (JSDoc var mı?)
## 11. Dead Code Candidates (unused export?)
## 12. Security Findings (input validation, secret, OWASP)
## 13. Öneriler (Sprint 141+ iyileştirme input'ları)
## 14. Verdict: ANALYZED | PARTIAL | UNREADABLE
```

---

# TASK TANIMLARI

Sprint 140 task'ları **700+ adet**. Bu DIRECTIVES dosyası kategori başlıklarını ve örnek task şablonlarını tanımlar. Deckent planner (`deckent_plan`) dosya listesini okuyup per-file task'ları otomatik genişletir. Her kategori için aşağıda şablon + scope + skills + agent + model belirtilir.

---

## Kategori 1: src/ Module Analysis (~302 task)

Her `src/**/*.ts` dosyası 1 task. Planner dinamik olarak src/ dizinini tarayıp `find src -name "*.ts" ! -name "*.test.ts"` sonucunu task listesine genişletir.

### Task Şablonu (src/ per-file)
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert, code-reviewer
- Agent: code-reviewer
- Files: `src/<module>/<filename>.ts` (read-only)
- Scope: read-only, output `.deckent/sprint-140-analysis/src/<module>/<filename>.md`

### Sub-kategoriler

**Task Group 1.A: src/orchestra/ (82 task)**
- `src/orchestra/*.ts` tüm dosyalar
- Kritik odak: ADR-008 Brain Merkezi Import, ADR-035 Event Stream V1.0 kanal kullanımı, sprint lifecycle phase'leri
- Önemli dosyalar (extra focus, effort: normal): `sprint-controller.ts`, `sprint-phases.ts`, `sprint-spawner.ts`, `result-collector.ts`, `brain.ts`, `task-builder.ts`, `result-evaluator.ts`, `self-modifying-detector.ts` (ADR-039), `event-stream.ts`, `sprint-finalizer.ts`, `dependency-scheduler.ts`
- Scope constraint: `src/orchestra/` dizini read-only

**Task Group 1.B: src/core/ (67 task)**
- `src/core/*.ts` tüm dosyalar
- Kritik odak: types.ts + config.ts + routing-engine.ts + agent-pool.ts + skill-pool.ts + model-registry.ts + authority-enforcer.ts (Sprint 139 Task 35) + notification-dispatcher.ts (Sprint 139 Task 41)
- ADR-010 Minimal deps, ADR-004 3-Layer Config Merge
- Scope: `src/core/` read-only

**Task Group 1.C: src/cli/ (71 task)**
- `src/cli/commands/*.ts` 36+ komut + helpers
- Kritik odak: ADR-022 CLI/MCP parity (her CLI komutunun MCP karşılığı var mı?)
- CLI register pattern, commander.js kullanımı
- Scope: `src/cli/` read-only

**Task Group 1.D: src/mcp/ (36 task)**
- `src/mcp/tools/*.ts` 21 tool + `src/mcp/resources/*.ts` 8 resource + helpers
- Kritik odak: ADR-022 parity, MCP protocol uyumu, server.ts event loop analizi (Sprint 139 disconnect root cause)
- Sprint 141 Task 1 MCP Disconnect Fix input
- Scope: `src/mcp/` read-only

**Task Group 1.E: src/agents/ (16 task)**
- `src/agents/*.ts` worker + adaptive-agent
- Kritik odak: ADR-037 Worker Authority Matrix, ADR-039 Self-Modifying Detector hook, Docker HB Core Fix (Sprint 139 Task 13) analizi
- Scope: `src/agents/` read-only

**Task Group 1.F: src/providers/ (5 task)**
- `src/providers/*.ts` claude + codex + gemini adapters
- Kritik odak: ProviderAdapter interface uyumu, fallback chain, model equivalence
- Scope: `src/providers/` read-only

**Task Group 1.G: src/monitor/ (4 task)**
- `src/monitor/*.ts` auditor + sprint-state
- Kritik odak: Auditor 3-pipeline (Sprint 138 Task 3), scan cycle, stale detection
- Scope: `src/monitor/` read-only

**Task Group 1.H: src/api/ (4 task)**
- `src/api/*.ts` HTTP API + SSE + rate limiting + auth
- Kritik odak: Bearer token auth (Sprint 133), input validation, SSE contract
- Scope: `src/api/` read-only

**Task Group 1.I: src/extensions/ (1 task)**
- `src/extensions/*.ts`
- Scope: `src/extensions/` read-only

**Task Group 1.J: src/ Root Files (~16 task)**
- `src/*.ts` root-level (entry.ts, brain.ts, vb.)
- Kritik odak: Entry point analizi, re-export patterns
- Scope: `src/` root read-only

---

## Kategori 1b: src/dashboard/ Batch Analysis (15 task)

545 TypeScript dosyası — per-file impractical. **Batch analysis** ile her task 30-40 dosya inceler. Planner top-level component/page kategorilerine böler.

### Task Şablonu (dashboard batch)
- Model: sonnet
- Effort: normal
- Priority: NORMAL
- Skills: react-specialist, typescript-expert
- Agent: frontend-designer
- Scope: `src/dashboard/<category>/` read-only, output `.deckent/sprint-140-analysis/src/dashboard/<category>.md`

### Sub-kategoriler

- **140-D01:** src/dashboard/pages/ (tüm page'ler batch)
- **140-D02:** src/dashboard/components/common/ (shared components)
- **140-D03:** src/dashboard/components/charts/ (chart components — victory-vendor + recharts)
- **140-D04:** src/dashboard/components/sprint/ (sprint-specific UI)
- **140-D05:** src/dashboard/components/agent/ (agent/skill UI)
- **140-D06:** src/dashboard/hooks/ (custom hooks)
- **140-D07:** src/dashboard/utils/ (helpers)
- **140-D08:** src/dashboard/api/ (dashboard backend — Sprint 139 Task 41 Notification Dispatcher output-stream.ts)
- **140-D09:** src/dashboard/i18n/ (Dashboard TR/EN parity — ADR-032)
- **140-D10:** src/dashboard/types/ (type definitions)
- **140-D11:** src/dashboard/config/ (Vite + Tailwind config)
- **140-D12:** src/dashboard/styles/ (CSS + Tailwind classes)
- **140-D13:** src/dashboard/tests/ (dashboard tests — 12 test file)
- **140-D14:** src/dashboard/state/ (state management if exists)
- **140-D15:** src/dashboard/ root files (index.ts, main.tsx, App.tsx)

---

## Kategori 2: tests/ Per-Category Analysis (27 task)

Her test kategori klasörü 1 task. Batch okuma, kategori-level rapor.

### Task Şablonu (tests per-category)
- Model: sonnet
- Effort: normal
- Priority: NORMAL
- Skills: testing-expert, typescript-expert
- Agent: test-writer
- Files: `tests/<category>/**/*.test.ts` (read-only)
- Scope: `tests/<category>/` read-only, output `.deckent/sprint-140-analysis/tests/<category>.md`

### Task Listesi

- **140-T01:** tests/cli/ (126 test)
- **140-T02:** tests/orchestra/ (118 test)
- **140-T03:** tests/core/ (109 test)
- **140-T04:** tests/integration/ (29 test)
- **140-T05:** tests/mcp/ (27 test)
- **140-T06:** tests/docs/ (25 test)
- **140-T07:** tests/agents/ (25 test)
- **140-T08:** tests/dashboard/ (12 test)
- **140-T09:** tests/api/ (11 test)
- **140-T10:** tests/scripts/ (10 test)
- **140-T11:** tests/e2e/ (10 test)
- **140-T12:** tests/monitor/ (9 test)
- **140-T13:** tests/providers/ (7 test)
- **140-T14:** tests/unit/ (5 test)
- **140-T15:** tests/github/ (5 test)
- **140-T16:** tests/blueprint/ (4 test)
- **140-T17:** tests/analytics/ (4 test)
- **140-T18:** tests/security/ (3 test)
- **140-T19:** tests/helpers/ (2 test)
- **140-T20:** tests/workflows/ (1 test)
- **140-T21:** tests/smoke/ (1 test)
- **140-T22:** tests/skills/ (1 test)
- **140-T23:** tests/load/ (1 test)
- **140-T24:** tests/extensions/ (1 test)
- **140-T25:** tests/docker/ (1 test)
- **140-T26:** tests/config/ (1 test)
- **140-T27:** tests/brain/ + tests/audits/ birleşik (2 test)

**Analiz odak:** Mock pattern, test coverage, orphan test, duplication, flaky candidate, naming convention.

---

## Kategori 3: docs/ Per-Category Analysis (20 task)

258 markdown 5 üst kategori × 4 batch task = 20 task.

### Task Şablonu (docs per-category)
- Model: haiku
- Effort: low
- Priority: NORMAL
- Skills: documentation-writer
- Agent: doc-writer
- Files: `docs/<category>/**/*.md` read-only
- Scope: `docs/<category>/` read-only, output `.deckent/sprint-140-analysis/docs/<category>.md`

### Task Listesi

- **140-DC01:** docs/audits/sprint-132/ (Sprint 132 FINAL-EXECUTIVE-REPORT + wave raporları)
- **140-DC02:** docs/audits/sprint-139/ (Sprint 139 cascade-block + translator-role + dead code)
- **140-DC03:** docs/audits/ diğer sprint'ler (sprint-134..138)
- **140-DC04:** docs/audits/ (audit raporları kökü)
- **140-DC05:** docs/superpowers/specs/ (sprint spec'leri)
- **140-DC06:** docs/superpowers/plans/ (sprint plan'leri)
- **140-DC07:** docs/superpowers/retrospectives/ (retrospektif'ler)
- **140-DC08:** docs/superpowers/ kökü (general superpowers docs)
- **140-DC09:** docs/architecture/ (architecture docs + ADR notes)
- **140-DC10:** docs/vision/ (roadmap + product docs)
- **140-DC11:** docs/i18n/ veya i18n docs
- **140-DC12:** docs/CHANGELOG.md + SPRINT-LOG.md (cumulative)
- **140-DC13:** docs/competitive-analysis.md
- **140-DC14:** docs/api/ (API documentation)
- **140-DC15:** docs/guides/ (user guides)
- **140-DC16:** docs/internal/ (internal docs)
- **140-DC17:** docs/deployment/ veya hosting docs
- **140-DC18:** docs/security/ (security docs)
- **140-DC19:** docs/performance/ (performance docs)
- **140-DC20:** docs/ root dosyalar (diğer)

**Analiz odak:** Güncellik (stale docs), link kırıklığı, TR/EN parity, redundancy, Sprint 146 doc finalization sprint input.

---

## Kategori 4: .brain/ Per-File Analysis (15 task)

213 markdown → kategori bazlı + önemli dosyalar 1'e 1.

### Task Şablonu (.brain/ per-file)
- Model: opus (DECISIONS için)
- Effort: normal
- Priority: HIGH (DECISIONS, MEMORY)
- Skills: documentation-writer, system-architect
- Agent: architecture-planner
- Scope: `.brain/` read-only, output `.deckent/sprint-140-analysis/brain/<file>.md`

### Task Listesi

- **140-B01:** .brain/DECISIONS.md (37+ ADR tam analiz — opus, critical)
- **140-B02:** .brain/MEMORY.md (sprint learnings)
- **140-B03:** .brain/RETRO.md (Sprint 139 retro)
- **140-B04:** .brain/PROJECT-IDENTITY.md (identity file)
- **140-B05:** .brain/DEBT.md (tech debt table)
- **140-B06:** .brain/PATTERNS.md (pattern registry)
- **140-B07:** .brain/ERRORS.md (error registry)
- **140-B08:** .brain/sprints/ batch (Sprint 132-139 log dosyaları)
- **140-B09:** .brain/archive/retro-sprint-139.md (**Sprint 138 regression evidence** — Alperen flag)
- **140-B10:** .brain/archive/ diğer sprint archive'ları
- **140-B11:** .brain/archive/DIRECTIVES-sprint-NNN.md arşivlenen DIRECTIVES'ler
- **140-B12:** .brain/sprints/sprint-140.md (Sprint 140 Brain yazıyorsa — meta)
- **140-B13:** .brain/cache/ veya temp (varsa)
- **140-B14:** .brain/config/ (varsa)
- **140-B15:** .brain/ root file'lar diğer

**Analiz odak:** Decay pattern, budget usage, sprint-id context confusion (retro-sprint-139 lesson), archive consistency.

---

## Kategori 5: Root Config + Scripts + Util (5 task)

### Task Listesi

- **140-C01:** Root .md dosyalar (README, CLAUDE, DECKENT, DIRECTIVES, BETA-TRACKER, DECKENT-MASTER-BLUEPRINT, AGENTS, 18 dosya)
  - Agent: doc-writer, Model: haiku, Scope: root read-only
- **140-C02:** Root .json dosyalar (package.json, tsconfig.json, vitest.config.ts, prettier.config, .eslintrc, vb.)
  - Agent: devops-engineer, Model: sonnet, Scope: root read-only
  - Kritik: ADR-010 Minimal deps check, TypeScript strict config
- **140-C03:** scripts/ (13 util script)
  - Agent: devops-engineer, Model: sonnet, Scope: scripts/ read-only
- **140-C04:** .deckent/ kök config dosyaları (config.json, docs.json, project-stack.json, ci-baseline.json, safety-point.json)
  - Agent: architecture-planner, Model: sonnet, Scope: .deckent/ read-only (sadece config dosyaları, sprint-* runtime state hariç)
- **140-C05:** .claude/rules/ (brain.md + auditor.md + worker-default.md)
  - Agent: doc-writer, Model: haiku, Scope: .claude/rules/ read-only
  - Kritik: ADR-037 Authority Matrix uyumu

---

## Kategori 6: Meta-Analysis Cross-Cutting (15 task)

Bu task'lar **tüm codebase'i** analiz eden özel amaçlı task'lardır. Scope: genel read-only.

### Task 140-M01: Architecture Graph Reconstruction
- Model: opus, Effort: high, Priority: HIGH
- Agent: architect
- Skills: system-architect, typescript-expert
- Dependencies: Kategori 1 src/ analiz batch tamamlanmış olmalı (bağımlılık)
- Scope: `src/**/*.ts` read-only
- Output: `.deckent/sprint-140-analysis/meta/architecture-graph.md`

**Description:** src/ module bağımlılık grafiği (import chain çıkarımı). Kategorize et (Brain, Auditor, Worker, Core, CLI, MCP, Provider, Dashboard). Döngüsel bağımlılık tespiti (ADR-008 Brain Merkezi Import compliance). Graphviz DOT format çıkar.

### Task 140-M02: Dead Code Detection
- Model: opus, Effort: high, Priority: HIGH
- Agent: refactorer
- Skills: typescript-expert
- Scope: `src/**/*.ts` + `tests/**/*.test.ts` read-only
- Output: `.deckent/sprint-140-analysis/meta/dead-code-inventory.md`

**Description:** Unused export tespiti, unreferenced function listesi, Sprint 139'da kaldırılan 3 dead modul (combination-scorer + learning-migration + learning-decay) extended inventory, ts-prune benzeri static analysis.

### Task 140-M03: ADR Compliance Check
- Model: opus, Effort: high, Priority: CRITICAL
- Agent: architecture-planner
- Skills: system-architect
- Scope: `src/**/*.ts` + `.brain/DECISIONS.md` read-only
- Output: `.deckent/sprint-140-analysis/meta/adr-compliance-report.md`

**Description:** 37+ ADR'ın her biri için codebase ihlal taraması:
- ADR-001 TS+ESM: "type": "module" uyumu
- ADR-002 Node16 resolution: .js extension her import'ta
- ADR-006 spawnSync security: shell: true veya string concat
- ADR-008 Brain Merkezi Import: orchestra/tmux.ts + monitor/auditor.ts + agents/worker.ts brain import etmiyor mu
- ADR-010 Minimal deps: package.json commander dışında runtime dep var mı
- ADR-011 readline/promises: inquirer/prompts kaldırılmış mı
- ADR-022 CLI/MCP parity: her CLI komut MCP karşılığı var mı
- ADR-027 Hybrid Spawn reject: SpawnBackendFactory tek backend at a time
- ADR-033 Product Not Service: SaaS/paywall kod yok mu
- ADR-034 Multi-Project Isolation: symlink-aware scope check
- ADR-035 Event Stream V1.0: 15 kanal kod kullanımı
- ADR-037 RBAC Authority Matrix: role violation runtime check
- ADR-038 Dead Code Disposition: dead code inventory uyumu
- ADR-039 Self-Modifying Detection: meta-modifying pattern

### Task 140-M04: Security Audit
- Model: opus, Effort: high, Priority: CRITICAL
- Agent: security-auditor
- Skills: security-specialist
- Scope: `src/**/*.ts` + `tests/**/*.test.ts` + `package.json` read-only
- Output: `.deckent/sprint-140-analysis/meta/security-audit.md`

**Description:** OWASP Top 10 taraması + secret detection (.env, credentials, API key hard-coded) + dependency CVE check (npm audit benzeri) + input validation boundaries (HTTP API, MCP tools, CLI args, worker prompts). Sprint 132 Week 1 security audit follow-up.

### Task 140-M05: Test Coverage Mapping
- Model: sonnet, Effort: normal, Priority: HIGH
- Agent: test-writer
- Skills: testing-expert
- Scope: `src/**/*.ts` + `tests/**/*.test.ts` read-only
- Output: `.deckent/sprint-140-analysis/meta/test-coverage-mapping.md`

**Description:** src/file.ts → tests/file.test.ts matching. Orphan src (test yok) + orphan test (src yok) listesi. Coverage gap heatmap (modül başına). Sprint 139 coverage 8.5% baseline'dan ne durumda.

### Task 140-M06: TODO/FIXME/HACK Comment Inventory
- Model: haiku, Effort: low, Priority: NORMAL
- Agent: doc-writer
- Skills: code-simplifier
- Scope: `src/**/*.ts` + `tests/**/*.ts` + `docs/**/*.md` read-only
- Output: `.deckent/sprint-140-analysis/meta/todo-inventory.md`

**Description:** Tüm TODO/FIXME/HACK/XXX/NOTE/BUG comment'leri grep + kategorize (urgent/planned/archived). Sprint 146 doc finalization sprint input.

### Task 140-M07: Documentation Coverage Gap
- Model: sonnet, Effort: normal, Priority: NORMAL
- Agent: doc-writer
- Skills: documentation-writer
- Scope: `src/**/*.ts` + `docs/**/*.md` + `README.md` read-only
- Output: `.deckent/sprint-140-analysis/meta/doc-coverage-gap.md`

**Description:** Her exported function/class için JSDoc var mı? README güncelliği. API docs ile actual API mismatch. Sprint 136 docs updater regression tespiti.

### Task 140-M08: Type Safety Audit
- Model: sonnet, Effort: normal, Priority: HIGH
- Agent: code-reviewer
- Skills: typescript-expert
- Scope: `src/**/*.ts` read-only
- Output: `.deckent/sprint-140-analysis/meta/type-safety-audit.md`

**Description:** `any`, `@ts-ignore`, `@ts-expect-error`, `as unknown`, non-null assertion `!`, `Record<string, unknown>` kullanım inventory. tsconfig strict: true uyumu. Unsafe type cast'ler.

### Task 140-M09: Circular Dependency Detection
- Model: sonnet, Effort: normal, Priority: HIGH
- Agent: architect
- Skills: typescript-expert
- Scope: `src/**/*.ts` read-only
- Output: `.deckent/sprint-140-analysis/meta/circular-dependency.md`

**Description:** madge benzeri static analysis. Directed acyclic graph validation. ADR-008 Brain Merkezi Import ihlali kontrolü.

### Task 140-M10: i18n Coverage (TR/EN Parity)
- Model: sonnet, Effort: normal, Priority: NORMAL
- Agent: doc-writer
- Skills: accessibility-expert
- Scope: `src/dashboard/` + `src/cli/` + `src/mcp/` + `docs/` read-only
- Output: `.deckent/sprint-140-analysis/meta/i18n-coverage.md`

**Description:** Dashboard (Sprint 092 Dashboard i18n) + CLI command help + MCP tool descriptions + docs TR/EN parity. ADR-032 i18n Pattern System uyumu.

### Task 140-M11: CLI/MCP Parity (ADR-022 Compliance)
- Model: sonnet, Effort: normal, Priority: HIGH
- Agent: architect
- Skills: api-builder
- Scope: `src/cli/` + `src/mcp/` read-only
- Output: `.deckent/sprint-140-analysis/meta/cli-mcp-parity.md`

**Description:** 36+ CLI komut ↔ 21 MCP tool + 8 resource karşılık tablosu. ADR-022 parity tablosu. CLI-only (altyapı/UI) vs MCP-only (yok) ayrımı.

### Task 140-M12: Performance Hot Path (Sync I/O Update)
- Model: sonnet, Effort: normal, Priority: HIGH
- Agent: performance-analyzer
- Skills: performance-optimizer
- Scope: `src/**/*.ts` read-only
- Output: `.deckent/sprint-140-analysis/meta/performance-hotpath.md`

**Description:** Sprint 132 audit = 799 sync I/O finding. Sprint 136 "Async I/O İlk Kademe" NO_GO. Sprint 140 güncel sync I/O sayımı (`readFileSync`, `writeFileSync`, `existsSync`, `statSync`, `readdirSync`, `spawnSync`, `execSync`). Hot path classification (sprint lifecycle hot path vs rarely-called).

### Task 140-M13: Plugin Sandbox Audit
- Model: opus, Effort: normal, Priority: CRITICAL
- Agent: security-auditor
- Skills: security-specialist
- Scope: `src/core/plugin-loader.ts` + `src/core/skill-sandbox.ts` + `src/orchestra/managed-docs/plugin-loader.ts` + related tests read-only
- Output: `.deckent/sprint-140-analysis/meta/plugin-sandbox-audit.md`

**Description:** AST validation coverage, unsafe eval/Function/require(), JSON vs MJS format security. Sprint 131 ADR-030 plugin loader güvenliği. Sprint 132 Full 360° audit plugin sandbox finding follow-up.

### Task 140-M14: Config Schema Consistency
- Model: sonnet, Effort: low, Priority: NORMAL
- Agent: code-reviewer
- Skills: typescript-expert
- Scope: `src/core/config.ts` + `src/core/config-types.ts` + `.deckent/config.json` read-only
- Output: `.deckent/sprint-140-analysis/meta/config-schema-consistency.md`

**Description:** config.json ↔ config-types.ts ↔ config.ts validation ↔ ~/.deckent/config.json global 3-layer merge consistency. ADR-004 3-Layer Config Merge uyumu. Sprint 133 loadConfig cache.

### Task 140-M15: Error Handling Pattern Uniformity
- Model: sonnet, Effort: normal, Priority: NORMAL
- Agent: code-reviewer
- Skills: typescript-expert
- Scope: `src/**/*.ts` read-only
- Output: `.deckent/sprint-140-analysis/meta/error-handling-patterns.md`

**Description:** try/catch pattern uniformity. BrainError + worker error types. Error propagation (console vs throw vs result.NO_GO). Silent swallow anti-pattern detection. Sprint 138 Task 6 "silently swallowed error" finding.

---

## Kategori 7: Final Aggregation (1 task — KRİTİK)

### Task 140-F01: Final Analiz Raporu Toplama + Cross-Reference Meta-Analiz
- Model: opus
- Effort: high
- Priority: CRITICAL
- Dependencies: **TÜM diğer task'lar** (Kategori 1-6, yaklaşık 399 task)
- Skills: documentation-writer, system-architect
- Agent: architecture-planner
- Files: `.deckent/sprint-140-analysis/FINAL-REPORT.md` (YENİ, tek dosya)
- Scope: read-only `.deckent/sprint-140-analysis/**/*.md` + output `.deckent/sprint-140-analysis/FINAL-REPORT.md`

### Description

**Alperen direktifi (birebir):** *"1 adet sprint 140 tam analiz sonucu raporu istiyorum (tüm workerların çıktılarının analiz edip toplanmış hali) bu kesin."*

Bu task sprint sonunda **son task** olarak çalışır. `.deckent/sprint-140-analysis/` altındaki tüm worker raporlarını okur, kategori bazlı özetler, cross-reference meta-analiz yapar, Alperen için **tek kapsamlı FINAL-REPORT.md** üretir.

**Final Rapor Yapısı (~2000-3000 satır hedef):**

```markdown
# Deckent Sprint 140 — Self-Analysis Final Report
Date: 2026-04-XX
Sprint: sprint-140
Total files analyzed: ~1377
Total worker reports: ~400
Analysis duration: Xh Ym

## Section 1: Executive Summary (1-2 sayfa)
- Top 10 findings severity-sorted
- Health score (/100)
- Sprint 141+ kritik input'lar

## Section 2: src/ Module-by-Module Analysis
2.1 orchestra/ (82 file): top 5 finding + özet
2.2 core/ (67 file): top 5 finding + özet
2.3 cli/ (71 file): top 5 finding + özet
2.4 mcp/ (36 file): top 5 finding + özet
2.5 agents/ (16 file): top 5 finding + özet
2.6 providers/ (5 file)
2.7 monitor/ (4 file)
2.8 api/ (4 file)
2.9 dashboard/ (545 file batch): top 5 finding per kategori
2.10 extensions/ + root

## Section 3: Test Coverage Gap Heatmap
- Per-module coverage percent
- Orphan src (test yok) listesi
- Orphan test (src yok) listesi
- Sprint 141 test-fill priority task candidate'ları

## Section 4: Documentation Coverage Gap
- JSDoc missing listesi
- README güncelsizlik
- docs/ stale file listesi
- Sprint 146 Doc Finalization Sprint input

## Section 5: ADR Compliance Report (37+ ADR)
- Her ADR için: violation count + affected files + severity
- Critical: ADR-006, ADR-008, ADR-010, ADR-037, ADR-039
- Sprint 141 ADR enforcement task input

## Section 6: Dead Code Inventory
- Unused export listesi
- Unreferenced function listesi
- Sprint 141 cleanup task candidate

## Section 7: Security Findings
- OWASP Top 10 breakdown
- Secret detection findings
- Dependency CVE
- Sprint 141+ security sprint priority

## Section 8: Performance Hot Paths
- Sync I/O count (Sprint 132 = 799 baseline)
- Hot path classification
- Sprint 141+ async migration priority

## Section 9: Type Safety Issues
- any/@ts-ignore/non-null count
- Unsafe cast listesi

## Section 10: Circular Dependency Report
- ADR-008 compliance status
- Graphviz DOT attachment

## Section 11: i18n Coverage Gap
- Dashboard TR/EN parity
- CLI help message parity
- docs TR/EN parity

## Section 12: CLI/MCP Parity Gap
- ADR-022 uyumluluğu
- Missing MCP tool listesi (varsa)
- Missing CLI command listesi (varsa)

## Section 13: Plugin Sandbox Audit Summary
- AST validation coverage
- Unsafe eval findings

## Section 14: Config Schema Inconsistencies
- 3-layer merge issues
- Type mismatch

## Section 15: Error Handling Anti-Patterns
- Silent swallow listesi
- Non-uniform try/catch

## Section 16: Failed Analysis Flags (NO_GO Worker Raporları)
- Hangi dosyalar analiz edilemedi
- Sebepleri (unreadable, too large, worker timeout, vb.)
- Alperen için direct flag

## Section 17: Sprint 141-145 Debt Candidates (Prioritized)
- P0 critical debt (MUST fix Sprint 141)
- P1 high debt (SHOULD fix Sprint 141-142)
- P2 normal debt (Sprint 143+)
- P3 nice-to-have

## Section 18: Alperen Decision Points
- Strategic calls (SaaS yasağı yine uyumlu mu, Sprint 146 doc finalization hazır mı, vb.)
- Risk trade-offs
- Roadmap adjustments

## Section 19: Sprint 140 Self-Analysis Meta-Metrics
- Task throughput (400/N DONE)
- Worker agent/skill performance
- Analysis coverage (%100 hedef)
- Analysis quality (rubric scores)

## Section 20: References
- Worker reports map (.deckent/sprint-140-analysis/ altı file listesi)
- Cross-referenced memory files
- Linked ADRs
```

**Kanıt:**
- `.deckent/sprint-140-analysis/FINAL-REPORT.md` runtime mevcut
- Dosya satır sayısı ≥2000
- Section 1-20 tüm başlıklar mevcut
- Her section'da en az 1 concrete finding (empty section yok)
- Section 16 (failed analysis) başarısız worker task sayısı = Sprint 140 NO_GO count
- Section 17 Sprint 141+ debt candidates ≥30 item

**Test:** Yok (aggregation task, test çalıştırma yasağı kuralı devam)

---

## Wave Layout (Sprint 140 Plan-Time Recommendation)

Sprint 140 task dağılımı paralel worker'ları optimize etmek için:

**Wave 1 (Paralel Kategori 1 src/ per-file, max_workers × N wave iterasyonu):**
- src/orchestra/ 82 task + src/cli/ 71 task + src/core/ 67 task + src/mcp/ 36 task + src/agents/ 16 task + src/providers/ 5 task + src/monitor/ 4 task + src/api/ 4 task + src/extensions/ 1 task + src/ root ~16 task = 302 task
- max_workers = 3-5, iterasyon ~60-100 wave → kabaca 10-15 dakika per batch, total 2-3 saat
- Scope conflict yok (her dosya bağımsız)

**Wave 2 (Dashboard batch 15 task):**
- src/dashboard/ 15 batch task paralel, max_workers × 3-5 iterasyon
- Total ~30-45 dakika

**Wave 3 (Tests per-category 27 task):**
- tests/ 27 kategori paralel, ~20-30 dakika

**Wave 4 (Docs + .brain/ + root config 40 task):**
- Kategori 3 + 4 + 5 paralel, ~30 dakika

**Wave 5 (Meta-analysis 15 task):**
- Kategori 6 tüm meta task'lar paralel, ama bazıları Kategori 1 tamamlanmasına bağlı (140-M01 Architecture Graph)
- ~45-60 dakika

**Wave 6 (Final aggregation 1 task):**
- Kategori 7 Task 140-F01, tüm diğer task'lar bağımlı
- opus + high effort, 2-3 saat tahmin

**Toplam tahmini süre:** ~7-9 saat (12 saat hard cap altında)

**Wave transitioning rule:** Bir wave tamamen bittikten sonra sonraki wave başlar. Worker'lar dosya çakışması yaşamaz (her worker kendi rapor dosyasına yazar, read-only kaynak).

---

## Hedef Metrikleri (Sprint 140 Self-Analysis)

| Metrik | Hedef | Not |
|--------|-------|-----|
| Task sayısı | **~400** (303 src + 15 dashboard + 27 test + 20 doc + 15 brain + 5 config + 15 meta + 1 final) | Alperen 500-1000 aralığı, dashboard per-file bölünürse +545 ek |
| Task throughput | ≥%98 | Read-only analiz çok az NO_GO beklenir |
| Read-only violation | **0** | Worker kaynak kod değiştirirse NO_GO + alarm |
| Dosya coverage | **%100** | Hiçbir dosya okunmamış kalmamalı — Alperen şart |
| Final aggregated report | **1 adet** | `.deckent/sprint-140-analysis/FINAL-REPORT.md`, ≥2000 satır |
| Worker report files | **~400 adet** | Her task 1 rapor dosyası |
| Süre hard cap | **12 saat** | Pure analiz hızlı |
| Commit count | **0** | Alperen elle sprint sonrası commit |
| MCP stability | 2+ saat kopma yok | Sprint 139 disconnect risk devam (Sprint 141 Task 1 fix edilene kadar) |
| Zero manual recovery | ✅ | Panic kill tekrar YOK, observer disiplin MUTLAK |
| Brain memory budget | 5000 satır | constants.ts + config.json pre-flight artırıldı |

---

## Pre-flight Checklist (Sprint 140 execute öncesi)

1. ✅ Limit artırımları tamamlandı (constants.ts + config.ts + config.json, 5000 budget)
2. ✅ `project_sprint140_selfanalysis.md` memory yazıldı
3. ✅ `project_sprint141_preflight.md` memory yazıldı (orijinal plan ertelendi)
4. ✅ `feedback_deckent_kill_approval_required.md` memory MUTLAK
5. ✅ MEMORY.md index güncel (Sprint 140 + 141 hazır)
6. ✅ DIRECTIVES.md (bu dosya) Sprint 140 Self-Analysis template yazıldı
7. ⏳ Alperen onayı bekleniyor (brainstorming + deckent_plan dry-run + deckent_start)
8. ⏳ Sprint 140 başlamadan Sprint 139 orphan cleanup manuel (1 task JSON + 50 result + .dashboard stuck state temizle)
9. ⏳ `VITEST_SKIP_E2E_SPRINT=1` + `DECKENT_SKIP_VERIFY=1` env var'ları Sprint 140 worker spawn'a inject (Sprint 141 Task 6 henüz yok, manuel env)
10. ⏳ `.deckent/sprint-140-analysis/` dizin oluştur (worker write target ready)

---

## Koordinatör Commitment (Sprint 139 Lesson)

Sprint 139 ilk 3 dakikasındaki panic kill incident **Sprint 140'ta kesinlikle tekrar olmayacak**. Pre-flight ilk 10 dakika sadece gözlem, 2-3 task DONE beklenir, routing hipotezi yapılmaz. `deckent_kill/cleanup/docker stop/rm .tasks/*` onaysız YASAK, istisnasız. Sprint 140 read-only olduğu için kill'e ihtiyaç çok daha az olacak.

Sprint 140 bitiminde Alperen Sprint 141 brainstorming ile operasyonel guard rails + Sprint 140 self-analysis bulgularını entegre ederek `project_sprint141_preflight.md` planını finalize eder.
