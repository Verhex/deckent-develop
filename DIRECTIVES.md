# DIRECTIVES — Sprint 182: Test Fix + Wave Pipeline + Worker Prompt Quality + Beta Launch (Crisis Stabilization §8)

## Spec + Plan Referansları

- **Master spec:** `docs/superpowers/specs/2026-05-21-crisis-stabilization-initiative.md` §8 (Sprint 182: 17 task, son beta-blocker sprint)
- **Worker Prompt Quality sub-spec:** `docs/superpowers/specs/2026-05-21-worker-prompt-quality-fixes.md` (8 fix F1-F8, 314 satır)
- **Anchor memory (W3 felsefe):** `feedback_prompt_completeness_over_brevity.md` — token-tasarruf YASAK
- **Predecessor:** Sprint 181 closure (CI typecheck root cause çözüldü, kalan tech debt'ler Sprint 182 kapsamında). Sprint 181 sistem testi 3 bulgu: (a) mock hygiene CI fail, (b) wave pipeline ihlal, (c) worker prompt quality 8 issue.

## Goal

17 task ile **son beta-blocker sprint**: (W1) CI Tests pre-existing failure'ları kapat → CI 100% green; (W2) Wave pipeline aktivasyonu altyapısı → ADR-045 sprint runtime'ında çalışır hale getir; (W3) Worker Prompt Quality Fixes (8 fix sub-spec) → prompt kalitesi sıçraması; (W4) Beta launch ready v1.0.0-beta.1. June 1 OSS beta launch ~10 gün; Sprint 182 GO sonrası Alperen `npm publish` manuel.

## Brain Planning Instructions

Mode: **structured**. Self-modifying: ZORUNLU sequential (src/orchestra + src/core + tests/ hepsi self-modifying). Wave: 4 (W1 → W2 → W3 → W4). Max workers: 2. `dependency_pipeline_enabled: false` (deckent-dev policy — Sprint 182'de değiştirmiyoruz, sadece Sprint 183 için altyapı hazırlıyoruz) → Brain manuel wave gates (ADR-047). Provider: claude.

### Wave dispatch strategy (Sprint 181 bulgusu)

Sprint 181 W2-1 verify task'ı W1 LAND etmeden spawn olmuştu (`dependency_pipeline_enabled: false` + Dependencies field YOK → wave-order garanti yok). Sprint 182'de **bu yapıyı değiştirmiyoruz** (deliberate, Sprint 183'e ertelendi); ama:
- W4-1 (verify task) Sprint 181 deneyimi sonrası **W3 sonu** sequential dispatch — Brain manuel gate (Alperen W3 hepsi DONE/GWT olunca W4 başlatır)
- W3'teki PQ task'ları birbirinden bağımsız (sub-spec §5 risk analizi) → paralel max 2 worker

## Worker Contract

- **Kod YAZAR** (W1: test mock fix; W2: src/orchestra + src/core wave pipeline kod; W3: src/orchestra/prompt-god-template.ts + task-builder + agent loader + 15 PROMPT.md audit; W4: package.json + ADR docs).
- Scope DIŞINA yazma YASAK (advisory + worker rollback scope-bounded Sprint 181 W0 fix canlı).
- **TDD ZORUNLU:** RED → GREEN her task (sub-spec §4 task taslağı + W1/W2 tests breakdown).
- **ESM:** `.js` uzantısı zorunlu (Node16 resolution).
- **memory.db:** schema değişikliği YOK.
- **Felsefe anchor (W3 ZORUNLU):** `feedback_prompt_completeness_over_brevity.md` — skill/ADR/agent prompt **truncation YASAK**. Token cap kaldırılır, full content inject edilir. Worker prompt'larında "(content truncated)" gibi marker BULUNMAMALI.
- **Post-sprint commit ZORUNLU:** Sprint 182 sonrası 2 commit + push ([[feedback-post-sprint-commit-mandatory]]).
- `.tasks/task-<id>.result`: gerçek vitest + selfAssessment + filesChanged + coverage + notes.

## GO/NO_GO Criteria

- **GATE-1 (W1) ★ CI GREEN:** orphan-cleaner-ipc + archive-debt + cli/run.test.ts mock hygiene fix → tüm vitest sweep CI'da 0 fail (pre-existing 4 fail kapanır)
- **GATE-2 (W2):** Wave pipeline kod altyapısı + test'ler land — `dependency_pipeline_enabled: true` durumunda ADR-045 wave-based execution doğru çalışır (test seviyesinde doğrulanır, config flip Sprint 183)
- **GATE-3 (W3) ★ PROMPT QUALITY:** 7 PQ task DONE — F1 IDEMPOTENCY_KEY render edilir, F2+F3 truncation kalkar, F4 agent single source PROMPT.md, F5+F6 DIRECTIVES parser doğru, F7 ADR threshold 0.3, F8 override warning
- **GATE-4 (W4) ★ BETA LAUNCH:** validate:publish 6/6 gate green + v1.0.0-beta.1 + ADR-048 amendment + Sprint 183 stub

**Sprint verdict:**
- **GO** = 17/17 DONE (CI fully green + wave pipeline ready + prompt quality + beta launch ready)
- **GO_WITH_TECH_DEBT** = 14-16/17 DONE + ≤3 GWT; **şart:** W1 mock hygiene DONE + W3 PQ-1..PQ-6 ≥5/6 DONE + W4-1 validate:publish DONE
- **NO_GO** = W1 ≥2 NO_GO (CI hala fail) **veya** W3 PQ truncation/agent-source fail (worker davranışı bozulur) **veya** W4-1 fail

---

## Task 1: W1-1 — Mock hygiene: orphan-cleaner-ipc + archive-debt `renameSync` ekle
- Model: opus
- Effort: normal
- Skills: testing-expert, typescript-expert, ci-testing
- Agent: bug-fixer
- Files: tests/core/orphan-cleaner-ipc.test.ts, tests/cli/archive-debt.test.ts
- Scope: tests/core/, tests/cli/

### Description
Sprint 181 CI run 26212167619 forensik: `tests/core/orphan-cleaner-ipc.test.ts` 2 fail (line 181, 211) + `tests/cli/archive-debt.test.ts` 1 fail (line 113). Lokal'de PASS, CI'da FAIL → mock hygiene. Root cause: `[deckent] Config recovery failed: [vitest] No "renameSync" export is defined on the "node:fs" mock`. `vi.mock('node:fs', ...)` factory'sinde `renameSync` (ve olası diğer Sprint 178/179'da eklenmiş method'lar) eksik → CI'da Node 26 fs implementation farklı, exception swallow → cleanup atlanıyor. **Fix:** Mock factory'ye `renameSync` + sweep diğer eksikleri ekle (`writeSync`, `linkSync` vb. grep ile bul). **Kanıt:** lokal + `CI=true` env aynı 4 test PASS.
**Test:** Mevcut testler yeşil — mock surface tam.

---

## Task 2: W1-2 — cli/run.test.ts SpawnBackendFactory mock chain
- Model: opus
- Effort: normal
- Skills: typescript-expert, testing-expert
- Agent: bug-fixer
- Files: tests/cli/run.test.ts
- Scope: tests/cli/

### Description
Sprint 181 lokal+CI 2 fail: `spawns worker and reports DONE result` (spy not called) + `sets exit code 1 for NO_GO result` (10s timeout). Root cause: Sprint 178 spawn-backend refactor — production kod artık `SpawnBackendFactory` üzerinden çağırıyor (Docker default), test direkt `spawnWorker` mock'luyor. **Fix:** Test mock chain `SpawnBackendFactory` route'una güncelle (örn. `vi.mock('../../src/orchestra/spawn-backend.js', ...)` factory ile `SpawnBackendFactory.create()` mock'la, döndürdüğü backend instance'ında `spawnWorker` spy). Veya `dist/` davranışını referans alıp test'leri buna göre uyarla. **Kanıt:** vitest 2 test PASS lokal + CI parity.
**Test:** TDD — mock chain refactor.

---

## Task 3: W1-3 — Full vitest sweep CI=true parity verify
- Model: sonnet
- Effort: low
- Skills: ci-testing
- Agent: ci-guardian
- Files: (no source — verification only)
- Scope: (read-only)

### Description
W1-1 + W1-2 LAND ettikten sonra: `CI=true npx vitest run` lokal'de çalıştır, **0 failure** olduğunu doğrula. Sprint 181 baseline 16785 PASS + 5 fail (pre-existing) → 16790 PASS hedef. Karşılaştırma: yerel `npx vitest run` ile `CI=true npx vitest run` aynı sonuç vermeli. **Kanıt:** vitest CI=true exit 0 + lokal exit 0; diff yok.
**Test:** Smoke verification only.

---

## Task 4: W2-1 — `dependency_pipeline_enabled: true` ADR-045 wire verify
- Model: opus
- Effort: normal
- Skills: typescript-expert, system-architect, testing-expert
- Agent: architect
- Files: src/orchestra/sprint-planner.ts (Kahn TopSort), src/orchestra/sprint-controller.ts (wave dispatch), tests/orchestra/wave-pipeline-activation.test.ts (NEW)
- Scope: src/orchestra/, tests/orchestra/

### Description
Sprint 181 W3 verify (181-003 W2-1 ci-guardian) sistem bulgusu: "Wave gate manuel orchestration ŞÜPHELİ — W1 tamamlanmadan W2 spawn izlenimi". Root cause: `dependency_pipeline_enabled: false` + Dependencies field YOK → ADR-045 wave-based execution **inactive**. **Sprint 182'de config flip ETMİYORUZ** (deckent-dev policy ADR-047 + Sprint 183 hazırlık); ama altyapı çalışıyor mu test seviyesinde doğrula. Test: fake DIRECTIVES + Dependencies field + `dependency_pipeline_enabled: true` ile Brain Kahn TopSort wave inşa eder, W1 hepsi DONE olmadan W2 dispatch ETMEZ. **Kanıt:** vitest 3 test PASS (wave inşa + sequential dispatch + collision-aware wave merge).
**Test:** TDD — 3 wave activation case.

---

## Task 5: W2-2 — Auto-debt prepend offset drift fix (Dependencies title-prefix resolver)
- Model: opus
- Effort: high
- Skills: typescript-expert, testing-expert
- Agent: architect
- Files: src/orchestra/task-builder.ts (parseDependenciesDirective + resolveDependencyRef), tests/orchestra/dependencies-title-prefix-resolver.test.ts (NEW)
- Scope: src/orchestra/, tests/orchestra/

### Description
Sprint 176/178 drift bug: DIRECTIVES'te `Dependencies: ["178-002"]` plan-slot ID, Brain auto-debt prepend ettiğinde task ID'leri shift olur → yanlış disk task'a işaret. Sprint 179'da Dependencies field'ı KALDIRDIK ama bu wave-order garantisini bozdu. **Fix:** Dependencies field'ı geri getir + **title-prefix resolver** ekle. DIRECTIVES'te `Dependencies: ["W1-1"]` yazılırsa Brain title'da "W1-1" geçen task'a resolve eder. Plan-slot ID'leri ile geri uyumlu (eski format hala çalışır). **Kanıt:** vitest 5 test PASS (title-prefix + plan-slot + mixed + missing reference + auto-debt prepend scenario).
**Test:** TDD — 5 case.

---

## Task 6: W2-3 — Verify task pattern redesign
- Model: opus
- Effort: normal
- Skills: typescript-expert, system-architect
- Agent: architect
- Files: src/orchestra/sprint-reporter.ts veya src/cli/commands/review.ts (post-sprint smoke runner), tests/orchestra/verify-task-pattern.test.ts (NEW)
- Scope: src/orchestra/, src/cli/, tests/orchestra/

### Description
Sprint 181 181-003 W2-1 verify task spec'inde W1 LAND etmeden çalıştı (boş verify) → GO_WITH_TECH_DEBT. Pattern problemi: verify task'lar sprint içinde diğer task'lara bağımlı olduğunda race. **Çözüm:** Verify task'larını sprint dışına çıkar veya wave-aware sıralama. Önerim: `deckent_review` veya post-sprint smoke script'i — sprint COMPLETE phase'inde otomatik tetiklenir, tüm task'lar DONE/GWT olduktan sonra çalışır. **Kanıt:** vitest 2 test PASS (post-sprint smoke trigger + W1 deliverable görünür).
**Test:** TDD — 2 case.

---

## Task 7: W3-PQ-1 — F1 `${IDEMPOTENCY_KEY}` injection fix
- Model: opus
- Effort: low
- Skills: typescript-expert, testing-expert
- Agent: bug-fixer
- Files: src/orchestra/prompt-god-template.ts (line 455, renderTemplate), tests/orchestra/prompt-god-template-idempotency.test.ts (NEW)
- Scope: src/orchestra/, tests/orchestra/

### Description
Sub-spec F1 (`docs/superpowers/specs/2026-05-21-worker-prompt-quality-fixes.md#f1`). Mevcut: `\${IDEMPOTENCY_KEY}` template literal'de escape edilmiş → worker'a literal string gidiyor. **Fix:** `RenderInput`'a `idempotencyKey: string` field ekle, `buildTaskPrompt` `${task.sprintId}-${task.id}-${task.retryCount ?? 0}` compute eder (**locked decision: `${sprintId}-${taskId}-${retryCount}`** — retry safety). `renderTemplate` line 455'i `${input.idempotencyKey}` interpolasyonuna çevir. **Kanıt:** vitest 4 test PASS — literal placeholder yok, deterministic key, farklı taskId → farklı key.
**Test:** TDD — 4 case (literal yok + key formatı + determinism + collision yok).

---

## Task 8: W3-PQ-2 — F2 + F3 truncation kaldır (skill + ADR full content)
- Model: opus
- Effort: normal
- Skills: typescript-expert, testing-expert
- Agent: refactorer
- Files: src/orchestra/prompt-god-template.ts (skill section + ADR section), tests/orchestra/prompt-god-template-skill-completeness.test.ts (NEW), tests/orchestra/prompt-god-template-adr-completeness.test.ts (NEW)
- Scope: src/orchestra/, tests/orchestra/

### Description
Sub-spec F2 + F3. Felsefe anchor [[feedback-prompt-completeness-over-brevity]] — token-tasarruf YASAK. **F2:** `EFFORT_TOKEN_MAP`, `perItemMax`, `sectionMax`, `truncateAtParagraph`, `if (... > sectionMax) break` — hepsi SİL (line 131-157). Her atanmış skill full SKILL.md inject. **F3:** `ADR_SECTION_MAX = 6000` cap SİL (line 184-187). `"(ADR content truncated for prompt size)"` marker'ı çıkar. Full ADR content. **Kanıt:** vitest 4 skill + 3 ADR test PASS — full content, truncation marker yok, skip yok.
**Test:** TDD — 7 test.

---

## Task 9: W3-PQ-3 — F4 Agent prompt single source (PROMPT.md kanonik)
- Model: opus
- Effort: high
- Skills: typescript-expert, system-architect
- Agent: refactorer
- Files: src/core/agent-pool.ts (getAgentPrompt), src/orchestra/task-router.ts veya agent loader, tests/orchestra/agent-prompt-single-source.test.ts (NEW), .deckent/agents/*/PROMPT.md audit
- Scope: src/core/, src/orchestra/, tests/orchestra/, .deckent/agents/

### Description
Sub-spec F4. **Fix:** `getAgentPrompt(id)` → öncelik `PROMPT.md`, fallback `systemPrompt` (**locked: degraded warning + systemPrompt fallback**, hard fail YOK). Concatenation kalkar (systemPrompt + PROMPT.md birleştirilmez). `agent.json::systemPrompt` schema korunur (routing scoring + UI display) ama prompt injection'a girmez. **Pre-task audit:** 15 built-in agent için `PROMPT.md` varlığını sweep et (eksik varsa task scope'a ekle). **Kanıt:** vitest 4 test PASS + 15 agent sweep.
**Test:** TDD — 4 test (PROMPT.md kanonik + systemPrompt yok + fallback + 15 agent loop).

---

## Task 10: W3-PQ-4 — F5 + F6 DIRECTIVES parser fix (Files + title/desc)
- Model: opus
- Effort: normal
- Skills: typescript-expert, testing-expert
- Agent: bug-fixer
- Files: src/orchestra/task-builder.ts (parseDirectives), src/orchestra/prompt-god-template.ts (line 450 render), tests/orchestra/directives-files-to-scope.test.ts (NEW), tests/orchestra/directives-title-description-split.test.ts (NEW)
- Scope: src/orchestra/, tests/orchestra/

### Description
Sub-spec F5 + F6. **F5:** DIRECTIVES `Files: a.ts, b.ts` → `task.scope.filesWrite = ['a.ts', 'b.ts']` parse. Boş kalırsa Scope dizinlerinden inferred listing. Fallback string'i (`"(determined by your task scope)"`) açık formulation. **F6:** `## Task N: <title>` parse'tan title; `### Description` heading'den sonrası description. Render template'te title kendi satırında, description ayrı paragrafta — markdown korunur. Duplicate `title — description` kalkar. **Kanıt:** vitest 3 Files + 3 title test PASS.
**Test:** TDD — 6 test.

---

## Task 11: W3-PQ-5 — F7 ADR relevance threshold (default 0.3)
- Model: opus
- Effort: normal
- Skills: typescript-expert, testing-expert
- Agent: refactorer
- Files: src/orchestra/prompt-god-template.ts (selectRelevantAdrs + buildAdrBlock), src/core/config-types.ts, src/core/config.ts, tests/orchestra/prompt-god-template-adr-relevance.test.ts (NEW)
- Scope: src/orchestra/, src/core/, tests/orchestra/

### Description
Sub-spec F7. **Fix:** `selectRelevantAdrs(task, allAdrs, maxCount, minScore)` signature genişlet. Threshold altı ADR atlanır. 0 ADR kalırsa blok render edilmez (boş `=== Mandatory Architecture Rules (ADR) ===` header da basılmaz). **Locked decision: default 0.3** lenient, configurable `.deckent/config.json::prompt.adr_min_relevance`. `core/config-types.ts`'e field ekle, `core/config.ts` default 0.3. **Kanıt:** vitest 3 test PASS (threshold filter + 0 ADR blok kaldır + config override).
**Test:** TDD — 3 test.

---

## Task 12: W3-PQ-6 — F8 Agent override semantic warning
- Model: opus
- Effort: normal
- Skills: typescript-expert, testing-expert
- Agent: architect
- Files: src/orchestra/task-router.ts veya planner.ts (forceAgent path), src/core/types.ts (routingMeta.overrideWarnings), tests/orchestra/agent-override-semantic-check.test.ts (NEW)
- Scope: src/orchestra/, src/core/, tests/orchestra/

### Description
Sub-spec F8. **Fix:** forceAgent atandığında: (1) activation rules taskDNA üzerinde çalıştır, (2) min score (örn. 0.3) altıysa **warning emit** (**locked: severity=warn**, PLAN devam eder, override honored), (3) `Task.routingMeta.overrideWarnings: string[]` field. **Kanıt:** vitest 4 test PASS (low score warning + high score no warning + override honored + routingMeta field).
**Test:** TDD — 4 test.

---

## Task 13: W3-PQ-7 — Integration smoke: Sprint 181-001/002 prompt regression
- Model: sonnet
- Effort: low
- Skills: testing-expert
- Agent: ci-guardian
- Files: tests/integration/prompt-quality-regression.test.ts (NEW), snapshot fixture
- Scope: tests/integration/

### Description
Sub-spec PQ-7. Sprint 181-001 (devops-engineer CI workflow) + 181-002 (refactorer package.json) prompt'larını snapshot al, PQ-1..PQ-6 fix sonrası yeniden render et, diff'i assert. **Kanıt:** Snapshot diff'te: (a) `${IDEMPOTENCY_KEY}` literal YOK + deterministik key VAR, (b) `(content truncated)` marker YOK, (c) PROMPT.md var, systemPrompt yok, (d) title kendi satırında description ayrı, (e) ADR threshold uygulandı (eski 3 yerine 0-2 ADR), (f) filesWrite listesi explicit. **2 test:** before/after diff.
**Test:** Integration snapshot regression.

---

## Task 14: W4-1 — Beta launch smoke: validate:publish 6/6 gate green
- Model: opus
- Effort: high
- Skills: devops-engineer, ci-testing
- Agent: devops-engineer
- Files: package.json (version), scripts/validate-publish.mjs verify
- Scope: ./, scripts/

### Description
`npm run validate:publish` 6/6 gate green: (1) `npm pack --dry-run` ≤2MB + 899 files target, (2) engines.node>=24, (3) main/types entry points, (4) no internal state leak, (5) ADR validation clean, (6) lint:link clean. Version `1.0.0-beta.1` (Sprint 178'de set edildi, intact verify). **Publish KOŞMAZ** — Alperen manuel ([[feedback-build-requires-user-approval]]). **Kanıt:** validate:publish exit 0 + 6/6 gate PASS.
**Test:** Gate verification.

---

## Task 15: W4-2 — package.json final + lint:adr + lint:link
- Model: sonnet
- Effort: low
- Skills: documentation-writer
- Agent: doc-writer
- Files: package.json verify, lint check
- Scope: ./

### Description
`package.json` version `1.0.0-beta.1` final + dependency list audit (Sprint 178 better-sqlite3 12.10 intact) + `npm run lint:adr` exit 0 + `npm run lint:link` exit 0. **Kanıt:** 3 komut exit 0.
**Test:** Lint smoke.

---

## Task 16: W4-3 — ADR-048 Prompt Lifecycle Contract amendment
- Model: opus
- Effort: normal
- Skills: documentation-writer, system-architect
- Agent: architecture-planner
- Files: docs/adr/048-prompt-lifecycle-contract.md (modify) veya memory.db ADR-048 entry update + .brain/exports/decisions.md regen
- Scope: docs/adr/, .brain/

### Description
W3 PQ fix'leri ADR-048'i somut hâle getirir. Amendment text (Crisis Stab §8d): "Worker prompt truncation YASAK; agent prompt single source = PROMPT.md; DIRECTIVES Files→filesWrite; title/description ayrı; ADR threshold-based (default 0.3); agent override semantic warning". memory.db update (additive, no DROP) + `.brain/exports/decisions.md` regen. **Kanıt:** ADR-048 amendment text dahil + lint:adr exit 0 + memory.db query'de ADR-048 status='accepted' + amendment_history field güncel.
**Test:** Doc + ADR validation.

---

## Task 17: W4-4 — Sprint 182 retro + Sprint 183 post-beta stub
- Model: sonnet
- Effort: normal
- Skills: documentation-writer
- Agent: doc-writer
- Files: .brain/exports/memory.md (Sprint 182 retro entries), docs/superpowers/specs/2026-05-27-sprint-183-post-beta-stub.md (NEW)
- Scope: .brain/, docs/superpowers/specs/

### Description
Sprint 182 retro: 17 task verdict + W1 CI green + W2 wave pipeline test ready + W3 PQ fixes + W4 beta launch. Sprint 183 post-beta stub: nervous Faz 2 pilot + sub-project #3 (multi-tenant + mTLS) + sub-project #4 (enterprise SSO/SIEM) + AEGIS realization (ADR-061) + `dependency_pipeline_enabled: true` config flip + post-beta feature backlog. **Kanıt:** memory.md updated + Sprint 183 stub ≥150 satır.
**Test:** Doc smoke.
