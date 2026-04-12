# DIRECTIVES — Sprint 136: Test Regression Opener + Async I/O İlk Kademe + Evaluation Reconciliation

> **DRAFT for Sprint 136** — hazırlık Sprint 135 closing'inden hemen sonra (2026-04-12) yazıldı.
> **Yarın (2026-04-13+) yeni session'da zorunlu akış:**
> 1. Pre-flight checklist (`project_sprint136_preflight.md` 10 adım)
> 2. `use brainstorm` — 4-soru disiplini (kapsam/worker/monitoring/doğrulama)
> 3. `use writing-plans` — spec (Section 1-5) + plan (bite-sized TDD)
> 4. Bu DIRECTIVES taslağını brainstorming kararlarına göre revize et
> 5. `deckent plan --structured --dry-run` (Gate 0.2)
> 6. `deckent start --auto-approve --timeout 21600000`

## Goal: Sprint 135'in kod-complete bıraktığı 10 carry-over debt item'ı kapatmak + Async I/O migration'ı 3 sprint erteleme sonrası ilk kademede başlatmak + Sprint 135 meta-dogfood chicken-egg'leri (T-005 dep pipeline, T-009 verify loop, T-011 observability secondary instruments) canlı çalıştırmak. Sprint 135 **kırılgan→crash-resistant** geçişini yaptı, Sprint 136 **test hygiene + artifact generation + async foundation** katmanını ekler. Hedef: Kur-Çalıştır Readiness 3.93 → ≥4.00, Layer 3 17-criterion ≥14/17 PASS, **clean GO** (Sprint 135'in GO_WITH_TECH_DEBT'inden ilk sayısal temiz sprint), 0 coordinator crash, 0 manual recovery, 5 test regression **zero**. Referans: `docs/superpowers/specs/2026-04-10-sprint-135-design.md` + `docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md` Section 14/15 (Sprint 135 retro) + `.deckent/sprint-135-layer3-scorecard.md` (11/17 breakdown + 10 debt).

**DOKUNULAMAZ VİZYON:** Deckent bir üründür, SaaS değildir. OpenClaw gibi "kur çalıştır". Açık kaynak, ücretsiz, herkese her yerde. Sprint 136'nın 10 task'ı vizyon lensinden geçmelidir — özellikle **test regression fix + async I/O + distribution** ilk kademesi doğrudan "kur çalıştır kolay + bugsuz çalışır" prensibini güçlendirir. Ref: `.claude/projects/-home-alperen-deckent-dev/memory/project_vision_product_not_service.md`.

---

## Task 1: 5 Test Regression Fix (Sprint 136 Opener)
- Model: opus
- Priority: CRITICAL
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: tests/cli/start-sandbox.test.ts, tests/cli/commands/start.test.ts, tests/cli/commands/i18n-integration.test.ts, tests/e2e/docker-backend.test.ts, tests/core/error-handling-unification.test.ts, src/orchestra/ (error handling rule fix)
- Scope: tests/cli/, tests/e2e/, tests/core/, src/orchestra/

### Description
Sprint 135'in bıraktığı 5 vitest regression'ını sıfıra indir. Sprint 136 opener — diğer bütün task'lardan önce bu fix'lenmelidir çünkü baseline'ı kirli bıraktığında tüm sprint honesty checker'ı tetikler.

**5 failing test root cause breakdown:**
1. `tests/cli/start-sandbox.test.ts` — T-001 orphan detection prompt start.ts'e eklendi, mevcut sandbox test assertion'ı kırıldı. Test'i güncel start flow'a göre update et (orphan prompt path mockla, `--auto-approve` default Archive doğrula).
2. `tests/cli/commands/start.test.ts` — T-001 main start command regression. Muhtemelen `detectOrphan` import'u mock'lanmamış; `beforeEach`'e `vi.mock('../../../src/orchestra/sprint-pid-manager.js')` ekle.
3. `tests/cli/commands/i18n-integration.test.ts` — T-001 i18n path regression. Start.ts'in yeni eklenen orphan prompt mesajı i18n mesajları arasında olabilir veya olmayabilir (eğer eksikse i18n dosyasına ekle, değilse test assertion güncelle).
4. `tests/e2e/docker-backend.test.ts > kill() deregisters taskId from list()` — T-003 worker `kill()` method signature veya davranışı değişti (docker kill → docker stop --time=10); mevcut e2e deregister assertion'ı eski imzayı bekliyor. Test'i yeni graceful shutdown path'ine göre update et (stop → kill fallback chain).
5. `tests/core/error-handling-unification.test.ts > no generic throw new Error in src/orchestra/` — Sprint 135'te eklenen yeni kod (muhtemelen `sprint-pid-manager.ts`, `ipc-registry.ts`, `sprint-docs-helpers.ts`, `sprint-state.ts` içinden biri) `throw new Error(...)` kullandı, ErrorRegistry rule violation. Fix: yeni `DECKENT_E0XX` error code ErrorRegistry'ye ekle + throw site'lerini `throw new DeckentError(...)` pattern'ına çevir. **Not:** Sprint 134 observability.ts'de aynı kural ihlali çıkmıştı, Sprint 134 T-011 recovery'de fix edilmişti — yani pattern tekrarlayan. Sprint 136 N7 ErrorRegistry lint rule (Task 7 bu sprint'te) bu tekrarı engellemek için.

**Sıra:** Test regression'ları tek task'ta çöz çünkü bazıları birbirine bağlı (error-handling-unification source fix gerekli, bu fix diğer T-001 test'lerini de tetikleyebilir). Aynı worker tüm 5'i ele alsın.

**Kanıt:** `timeout 480 npx vitest run --reporter=basic | tail -5` → 0 fail, `wc -l src/orchestra/` yeni Sprint 135 dosyalarında `grep -c "throw new Error"` → 0 (ErrorRegistry kullanımı).

**Test:** Regression'ların kendisi bu task'ın test kanıtı. Target: `npx vitest run` 512 files, 12478+ pass, **0 fail**, 16 skipped. Baseline restored.

---

## Task 2: Async I/O İlk Kademe (Hot Path fs.promises Migration)
- Model: opus
- Priority: CRITICAL
- Effort: high
- Agent: refactorer
- Skills: typescript-expert, performance-optimizer, system-architect
- Files: src/orchestra/sprint-controller.ts (spawnWorkers, waitForResults, evaluateResult), src/orchestra/result-collector.ts, src/orchestra/task-builder.ts, src/orchestra/result-evaluator.ts
- Scope: src/orchestra/

### Description
Sprint 132 W2 CRITICAL #1 — 799 sync I/O çağrısı (`readFileSync` 388, `writeFileSync` 282, `spawnSync/execSync` 129). 3 sprint üst üste ertelendi (Sprint 133, 134, 135). Sprint 136 **hot path**'leri ilk kademede migrate eder — hepsi değil, sadece en kritik 50-100 çağrı.

**Hot path öncelik sırası:**
1. `spawnWorkers()` içindeki `writeFileSync` (task json yazımı, .deckent/state write) → `fs.promises.writeFile` + `await`
2. `waitForResults()` polling loop'undaki `readFileSync` (heartbeat oku, .result oku) → `fs.promises.readFile`
3. `evaluateResult()` / `result-collector.ts` içindeki `readFileSync` → async
4. `task-builder.ts` `parseStructuredDirectives` için `readFileSync('DIRECTIVES.md')` → async wrapper

**Yaklaşım:**
- Mevcut fonksiyonları `async function` yap (signature update)
- Call site'leri `await` ekle
- Test mock'ları `vi.mock('node:fs/promises', ...)` kullanacak şekilde update
- **Backward compat:** hiçbir public CLI/MCP API davranış değişikliği yok, sadece internal async

**Önemli:** Bu task Sprint 134 coordinator crash hipotezinin (OOM) de gerçek çözümü. Sync I/O event loop bloke → memory pressure → kill. Async migration hem performance hem stability kazandırır.

**Kanıt:** `grep -c "readFileSync\|writeFileSync" src/orchestra/sprint-controller.ts src/orchestra/result-collector.ts src/orchestra/task-builder.ts src/orchestra/result-evaluator.ts` — hedef: Sprint 135 baseline'a göre en az 50 azalma, **hot path'lerin hiçbiri sync değil**. `grep -c "fs.promises\|from.*node:fs/promises\|await.*readFile\|await.*writeFile" src/orchestra/` → hedef yüksek artış.

**Test:** 8+ test — (1) spawnWorkers async path happy, (2) waitForResults async poll, (3) evaluateResult async read, (4) parseStructuredDirectives async wrapper, (5) concurrent writes no race, (6) error propagation on EACCES, (7) mock migration vi.mock('node:fs/promises'), (8) regression: existing sprint-controller tests 0 fail.

---

## Task 3: Brain Spurious NO_GO Evaluation Reconciliation (Sprint 135 N9)
- Model: opus
- Priority: CRITICAL
- Effort: normal
- Agent: architect
- Skills: typescript-expert, system-architect
- Files: src/orchestra/sprint-finalizer.ts, src/orchestra/result-evaluator.ts
- Scope: src/orchestra/

### Description
Sprint 135'te 135-001, 135-004, 135-012 worker'ları **kodu yazdı** ama `.result` dosyası yazmadan docker container'da öldü → Brain auto-generated "NO_GO: Docker worker exited without writing result file" etiketi verdi. Brain FIX phase 4 fix worker spawn etti, 3'ü "kod zaten yerinde, doğrulandı, DONE" dedi. Ama 135-004-fix **yine** NO_GO aldı (Brain evaluation spurious döngüsü devam etti). Bu task Brain'in evaluation layer'ını **code-aware** yapar.

**Gereksinimler:**
- `sprint-finalizer.ts` veya `result-evaluator.ts` içinde yeni helper: `tryCodeVerifiedDone(taskId, projectRoot): boolean`
- Mantık: eğer `.tasks/task-{id}.result` dosyası MISSING veya selfAssessment NO_GO VE Brain "worker exited without writing result" auto-generate etti ise:
  1. Task JSON'dan `filesWrite` / `scope.filesWrite` oku
  2. Her dosya için `git status --porcelain {file}` çalıştır (yeni/modified mi?)
  3. Task'ın "Kanıt" satırındaki grep komutunu (varsa) çalıştır
  4. Eğer dosya var + kanıt grep hit varsa → `CODE_VERIFIED_DONE` flag + result rewrite (`selfAssessment: "DONE", notes: "Code physically verified despite missing .result (Sprint 135 docker HB shutdown bug pattern)"`)
  5. Aksi halde NO_GO olarak kalır (gerçek failure)
- Retro'da "code-verified DONE" task'ları ayrı section altında listelenir
- Meta-dogfood: Sprint 136'nın kendi 135-004-fix benzeri edge case'lerine karşı Brain artık akıllı

**Önemli not:** Bu fix yazıldıktan sonra **Sprint 135 post-hoc re-evaluate** edilmeli mi? İdeal olarak yapılmalı ama scope'tan çıkar. Sprint 136 retro'da not olarak düş: "Sprint 135 brain label 10 DONE + 4 TD + 3 NO_GO; code-aware evaluation sonrası muhtemelen 13 DONE + 0 NO_GO." Resmi skor değişmez, tarih muhafaza edilir.

**Kanıt:** `grep -n "tryCodeVerifiedDone\|CODE_VERIFIED_DONE" src/orchestra/sprint-finalizer.ts src/orchestra/result-evaluator.ts` → hit.

**Test:** 5+ test — (1) result missing + kod + kanıt grep hit → code-verified DONE, (2) result NO_GO + kod yok → honest NO_GO, (3) result missing + kod var + kanıt grep miss → honest NO_GO (kod yetersiz), (4) result DONE zaten → helper çağrılmaz, (5) git status parse hatası → fail-safe honest NO_GO.

---

## Task 4: `.deckent/sprint-NNN-gate.json` Output Wiring (Sprint 135 N5)
- Model: sonnet
- Priority: HIGH
- Effort: low
- Agent: bug-fixer
- Skills: typescript-expert
- Files: src/orchestra/sprint-finalizer.ts
- Scope: src/orchestra/

### Description
Sprint 135'te `runSelfAuditGate()` çağrıldı ve return etti, ama `.deckent/sprint-135-gate.json` output dosyası yazılmadı — Layer 4 criterion 12 FAIL. Sprint 134'te bu dosya manuel `.deckent/run-self-audit.mjs` script ile yazılmıştı; Sprint 135'te otomasyon eksik kaldı. Bu task wiring'i tamamlar.

**Gereksinimler:**
- `finalizeSprint(sprintId)` içinde `runSelfAuditGate(sprintId)` sonrası:
  ```typescript
  const gateResult = await runSelfAuditGate(projectRoot, sprintId);
  const gatePath = join(projectRoot, '.deckent', `${sprintId}-gate.json`);
  await fs.promises.writeFile(gatePath, JSON.stringify(gateResult, null, 2));
  ```
- Fail-safe: gate.json write fail → structuredLog warning, sprint status etkilenmez
- Sprint 136 kendisi canlı test — execution bitince `.deckent/sprint-136-gate.json` otomatik oluşmalı

**Kanıt:** `grep -n "sprint-.*-gate.json\|writeFile.*gate" src/orchestra/sprint-finalizer.ts` → hit. Sprint 136 finalize sonrası: `ls .deckent/sprint-136-gate.json && cat .deckent/sprint-136-gate.json | jq '.overallGate'` → "PASS" veya "WARNING".

**Test:** 3+ test — (1) finalize → gate.json written with valid JSON + all fields, (2) overallGate field roundtrip, (3) write fail (permission denied) → warning logged, sprint status unchanged.

---

## Task 5: `load-test-report.md` Auto-Generation (Sprint 135 N6)
- Model: sonnet
- Priority: HIGH
- Effort: low
- Agent: bug-fixer
- Skills: typescript-expert
- Files: src/core/observability.ts, src/orchestra/sprint-finalizer.ts
- Scope: src/core/, src/orchestra/

### Description
Sprint 134 T-011'de `generateLoadReport()` function yazılmıştı (observability.ts içinde), Sprint 135'te canlı çağrılması gerekiyordu ama finalizeSprint içinde hook eksikti → `docs/audits/sprint-135/load-test-report.md` oluşmadı, Layer 4 criterion 11 FAIL. Bu task hook'u tamamlar.

**Gereksinimler:**
- `finalizeSprint(sprintId)` içinde, gate.json yazımından sonra:
  ```typescript
  try {
    const reportDir = join(projectRoot, 'docs', 'audits', sprintId);
    await fs.promises.mkdir(reportDir, { recursive: true });
    const reportPath = join(reportDir, 'load-test-report.md');
    const report = await generateLoadReport(projectRoot);
    await fs.promises.writeFile(reportPath, report);
  } catch (e) {
    structuredLog('warn', 'load_report_generation_failed', { error: e });
  }
  ```
- `generateLoadReport()` zaten wave timeline + p50/p95/p99 + file lock histogram + critical path analysis üretiyor (Sprint 134 spec Section 3.5). Yeni iş yok, sadece wiring.
- Sprint 136 canlı test: finalize sonrası `docs/audits/sprint-136/load-test-report.md` otomatik oluşmalı, full format (not stub).

**Kanıt:** `grep -n "generateLoadReport\|load-test-report.md" src/orchestra/sprint-finalizer.ts` → hit. Sprint 136 finalize sonrası: `wc -l docs/audits/sprint-136/load-test-report.md` → ≥50 (full format, not stub).

**Test:** 3+ test — (1) finalize → load-test-report.md written, content includes wave timeline, (2) empty metrics.jsonl → empty report or warning, (3) generateLoadReport throws → warning logged, sprint unchanged.

---

## Task 6: T-005 Dep Pipeline Canlı Dogfood Rerun (Sprint 135 Chicken-Egg)
- Model: sonnet
- Priority: HIGH
- Effort: low
- Agent: test-writer
- Skills: typescript-expert, testing-expert
- Files: tests/orchestra/task-builder.test.ts, src/orchestra/task-builder.ts
- Scope: tests/orchestra/, src/orchestra/

### Description
Sprint 135'te T-005 parser fix'i yazıldı ama Sprint 135 DIRECTIVES'i **eski parser** ile parse edildi → self-parse test fail (2 tests). Sprint 136'da Sprint 136 DIRECTIVES (bu dosya) **yeni parser** ile parse edilir → Priority CRITICAL/HIGH/NORMAL karışımı + Dependencies array doğru görünür. Canlı dogfood ilk kez bu sprint'te.

**Gereksinimler:**
- `tests/orchestra/task-builder.test.ts` Sprint 135'ten kalan 2 self-parse test'i **Sprint 136 DIRECTIVES'ine göre güncelle**:
  - Test #1: Sprint 136 DIRECTIVES 10 task'ı parse edildiğinde priority dağılımı (3 CRITICAL + 3 HIGH + 4 NORMAL gibi Sprint 136'nın kendi dağılımı — yarın brainstorming'de karar)
  - Test #2: Sprint 136 DIRECTIVES'in dependencies array'leri doğru parse (örnek: 136-003 depends on 136-001, 136-002)
- Canlı run: `deckent plan --structured --dry-run` çıktısında Priority sütunu **NORMAL-only değil** — gerçek CRITICAL/HIGH/NORMAL karışımı göstermeli
- Meta-dogfood: Sprint 136 brainstorming sırasında DIRECTIVES'teki Priority satırlarının parser tarafından canlı okunduğunu gözlemle

**Kanıt:** `npx deckent plan --structured --dry-run | grep -E "CRITICAL|HIGH"` → en az 3 CRITICAL + 3 HIGH hit (Sprint 135'te tümü NORMAL idi). `tests/orchestra/task-builder.test.ts` Sprint 136 self-parse 0 fail.

**Test:** 4+ test — (1) Sprint 136 DIRECTIVES priority dağılımı doğru, (2) Dependencies array doğru, (3) parser edge case (- Priority: yorgun satır whitespace), (4) backward compat (Priority field olmayan eski task → NORMAL default).

---

## Task 7: ErrorRegistry Lint Rule Enforcement
- Model: sonnet
- Priority: HIGH
- Effort: normal
- Agent: refactorer
- Skills: typescript-expert, system-architect
- Files: scripts/check-error-handling.mjs (yeni) veya .eslintrc config, src/orchestra/ (fix existing)
- Scope: scripts/, src/orchestra/

### Description
Sprint 134 observability.ts + Sprint 135 yeni kod (Task 1 ile fix edilecek) ikisi de `throw new Error` ErrorRegistry rule'unu ihlal etti. Tekrarlayan pattern, **lint-time prevention** gerekli.

**Gereksinimler:**
- Yeni custom lint script `scripts/check-error-handling.mjs`:
  - `src/orchestra/**/*.ts` dosyalarında `throw new Error(` pattern'i tara
  - Her hit için: satır numarası + dosya yolu + suggested fix (`throw new DeckentError(ErrorCode.DECKENT_EXXX, ...)`)
  - Exit code 1 varsa fail (CI gate)
- `package.json` `scripts.lint:errors` entry ekle
- `tests/core/error-handling-unification.test.ts` test bu script'in çalıştırdığını doğrular
- Mevcut yeni kodu temizle (Task 1 ile koordineli)
- **Alternatif:** ESLint custom rule — daha sağlam ama daha karmaşık. Custom script MVP, ileride eslint rule'a promote edilebilir.

**Kanıt:** `ls scripts/check-error-handling.mjs && npm run lint:errors` → exit 0.

**Test:** 4+ test — (1) throw new Error in src/orchestra/ → script fail, (2) throw new DeckentError → pass, (3) throw new Error in tests/ → pass (test dosyaları muaf), (4) script exit code 0 when clean.

---

## Task 8: sprint-controller.ts Full Slim (Sprint 134 T-010 Final)
- Model: opus
- Priority: HIGH
- Effort: high
- Agent: refactorer
- Skills: system-architect, typescript-expert
- Files: src/orchestra/sprint-controller.ts, src/orchestra/sprint-finalizer.ts, src/orchestra/ipc-registry.ts
- Scope: src/orchestra/

### Description
Sprint 134 T-010 yarım bıraktı, Sprint 135 T-004 askBrain extraction'ı yaptı (1820→~1750 LoC). Sprint 136 final slim: **sprint-controller.ts hedef ~300 LoC** — sadece `runSprint()` orchestration, diğer her şey sprint-finalizer/ipc-registry/sprint-pid-manager/sprint-phases'e delegate.

**Gereksinimler:**
- `finalizeSprint()` body tamamı sprint-finalizer.ts'e taşı (Sprint 134 partial move'u bitir)
- `spawnWorkers()` body sprint-phases.ts veya yeni `sprint-spawner.ts`'e
- `waitForResults()` body result-collector.ts'e
- `evaluateResult()` / `runFixPhase()` result-evaluator.ts'e delegate
- `sprint-controller.ts` barrel re-export pattern — mevcut public export'lar korunur (backward compat)
- Target: **sprint-controller.ts ≤400 LoC** (ideal 300, tolerans 400)
- Regression riski yüksek: `tests/orchestra/sprint-controller*.test.ts` 0 fail zorunlu
- Sprint 134 recovery'de zaten 814 LoC sprint-finalizer.ts yazıldı — bu task onun üstüne `runFixPhase`, `spawnWorkers` orchestration kısımları da eklenir

**Kanıt:** `wc -l src/orchestra/sprint-controller.ts` → ≤400. `grep -c "^export" src/orchestra/sprint-controller.ts` → ≤15 (çoğu re-export).

**Test:** Mevcut `tests/orchestra/sprint-controller*.test.ts` 0 fail (regression koruma) + `tests/orchestra/sprint-finalizer.test.ts` yeni delegated fonksiyonlar için +3 test.

---

## Task 9: Rubric Field Null Fix for Test-Writer Tasks (Sprint 135 N7)
- Model: haiku
- Priority: NORMAL
- Effort: low
- Agent: refactorer
- Skills: typescript-expert
- Files: .deckent/agents/test-writer/agent.json, src/orchestra/task-builder.ts (prompt building)
- Scope: .deckent/agents/, src/orchestra/

### Description
Sprint 135'te test-writer agent'ı (T-006, T-007) `.result` JSON'a `rubricScores` field'ı yazmadı → Brain evaluation null aldı, rubric avg hesaplanamadı, cosmetic ama scorecard etkiledi. Fix: agent prompt template'ine rubric format zorunluluğu ekle.

**Gereksinimler:**
- `.deckent/agents/test-writer/agent.json` veya `systemPrompt` içine:
  ```
  Result JSON MUST include rubricScores field with 4 integer keys
  (0-100): correctness, test_coverage, scope_compliance, documentation.
  Example: "rubricScores": { "correctness": 95, "test_coverage": 90,
  "scope_compliance": 100, "documentation": 85 }
  ```
- `task-builder.ts` worker prompt building'de tüm agent'lar için rubric requirement zorunluluğu (test-writer özel değil, genel fix)
- Sprint 136 test-writer task'ları (varsa) rubric doldurmalı

**Kanıt:** `grep -n "rubricScores" .deckent/agents/test-writer/agent.json src/orchestra/task-builder.ts` → hit. Sprint 136 finalize sonrası test-writer task result'ları `rubricScores` field'ı dolu.

**Test:** 2+ test — (1) worker prompt includes rubric requirement, (2) agent.json manifest valid.

---

## Task 10: sprint-docs-helpers.ts Test Coverage (Sprint 135 T-010 Debt)
- Model: haiku
- Priority: NORMAL
- Effort: low
- Agent: test-writer
- Skills: testing-expert
- Files: tests/orchestra/sprint-docs-helpers.test.ts (new)
- Scope: tests/orchestra/

### Description
Sprint 135 T-010 `sprint-docs-helpers.ts` (346 LoC) extract etti ama yeni test dosyası yazmadı. Mevcut `sprint-docs-updater*.test.ts` dosyaları dolaylı olarak koruyor ama **direct unit test yok**. Bu task 5+ dedicated test yazar.

**Gereksinimler:**
- Yeni dosya `tests/orchestra/sprint-docs-helpers.test.ts`
- Test scenarios:
  1. `formatManagedDocsSection(sprintId, tasks)` → doğru markdown section format
  2. `buildChangelogEntry(sprintId, version, changes)` → changelog entry format
  3. `formatSprintLogBlock(sprintId, metadata)` → sprint log block format
  4. Empty tasks array → empty/minimal output
  5. Special chars in sprintId → escaped correctly

**Kanıt:** `wc -l tests/orchestra/sprint-docs-helpers.test.ts` → ≥80, `grep -c "^\s*it(" tests/orchestra/sprint-docs-helpers.test.ts` → ≥5.

**Test:** `npx vitest run tests/orchestra/sprint-docs-helpers.test.ts` → 0 fail.

---

## Sprint 136 Notları

- **max_workers=4** HARD LIMIT (`feedback_max_workers.md`)
- **brain_planning=structured** (T-005 canlı dogfood — DIRECTIVES Priority/Dependencies yeni parser ile okunmalı)
- **mode=performance** (opus default, test-writer task'ları haiku override)
- **spawn_backend=docker**
- **verify_loop=active** (T-009 Sprint 135'te build edildi, Sprint 136 worker'larında CANLI ilk kez)
- **telemetry_enabled=false** (hard-coded)
- **auto_archive_directives=true** (Sprint 135'te canlı çalıştı, Sprint 136 devam)
- **dependency_pipeline_enabled:** two-phase (Sprint 135'ten aynı pattern) — bootstrap false, T-005 equivalent (Task 6 self-parse doğrulaması) sonrası flag canlı
- **metrics.jsonl hedef:** ≥50 satır (Sprint 135: 37 → Sprint 136 +13, T-011 secondary instruments canlı ilk kez)
- **Layer 3 target:** ≥14/17 (Sprint 135: 11/17, Sprint 134: 14/17 — Sprint 134 paritesine dönüş + 3 criterion iyileşme)
- **Kur-Çalıştır Readiness target:** ≥4.00/5 (Sprint 135: 3.93 → +0.07)
- **Critical path:** Task 1 → Task 2 → Task 3 (~180-240dk minimum, Task 2 Async I/O HIGH effort)
- **Scope kesme sırası** (if needed): Task 10 → Task 9 → Task 7 (P2 cosmetic)
- **ASLA kesilmez:** Task 1 (opener, baseline restore), Task 2 (3 sprint erteleme sonu), Task 3 (Brain evaluation reconciliation — Sprint 135 spurious pattern'ı fix)
- **External monitoring:** 3-layer pattern (Sprint 135 proven) — Watchdog (Explore subagent, 40 cycle) + Verifier (ana session `run_in_background=true` tsc + vitest) + Shell Watchdog (manuel periyodik)
- **Acceptance:** Layer 3 17-criterion scoring + rubric avg + physical grep kanıt + readiness judgment
- **Design spec:** yarın brainstorming + writing-plans skill ile üretilecek → `docs/superpowers/specs/2026-04-13-sprint-136-design.md` (tahmini)
- **Fallback plan:** yarın writing-plans skill ile üretilecek → `docs/superpowers/plans/2026-04-13-sprint-136-plan.md`
- **Recovery template** (if coordinator crash): `.claude/plans/melodic-launching-aurora.md` (Sprint 134/135 referans)
- **Pre-flight reference:** `~/.claude/projects/-home-alperen-deckent-dev/memory/project_sprint136_preflight.md` (10 adım + kickoff prompt)
- **Sprint 135 closing reference:** `~/.claude/projects/-home-alperen-deckent-dev/memory/project_sprint135_completed.md`
- **FINAL report living record:** Sprint 136 sonu Section 1+5+6+8 inline update + Section 16+17 append (aynı commit, feedback_living_record_sync.md discipline)

## Yarınki İlk Eylemler (Brainstorming Öncesi Hazırlık)

1. **Pre-flight (10 adım)** — `project_sprint136_preflight.md` Bölüm I-III takip: git log, git status, tsc, vitest baseline (5 fail hâlâ mı duruyor?), deckent doctor, brain budget (T-013 auto-decay çalıştı mı?)
2. **`use brainstorm`** — 4-soru disiplini:
   - Kapsam: A (4 P0) / B (8 P0+P1 ÖNERIM) / C (10 tüm debt)
   - Worker sayısı: 4 (HARD LIMIT)
   - Monitoring: 3-layer (Sprint 135 proven)
   - Doğrulama: Layer 1+2+3+4+5+6 (17 criterion full replica)
3. **`use writing-plans`** — spec (2026-04-13-sprint-136-design.md) + plan (2026-04-13-sprint-136-plan.md)
4. **Bu DIRECTIVES taslağını revize et** — brainstorming kararlarına göre task listesi + priority + effort + critical path update
5. **`deckent plan --structured --dry-run`** — Gate 0.2, Sprint 136 DIRECTIVES Priority satırları doğru görünmeli (T-005 canlı dogfood ilk kanıt)
6. **`deckent start --auto-approve --timeout 21600000`** — execution başla
7. **3-Layer Monitoring** başlat — Verifier `run_in_background=true` loop, Watchdog Explore subagent dispatch, Shell Watchdog manuel periyodik
8. **Execution bitişinde** — Layer 3 verification + `.deckent/sprint-136-layer3-scorecard.md` yaz + FINAL report Section 1+5+6+8 inline update + Section 16+17 append + memory sync + commit ceremony (feat + docs, Sprint 135 pattern)

## Sprint 135 Meta-Dogfood Beklentileri (Sprint 136'da Canlı)

| Fix (build edilen sprint) | Canlı ilk çalışma (bu sprint) | Beklenen gözlem |
|---|---|---|
| T-001 Coordinator Resilience (Sprint 135) | Sprint 136 | `.deckent/sprint-136.pid` oluşur, 30s snapshot yazılır, beforeExit flush çalışır; eğer Sprint 135.pid lingering varsa start.ts orphan prompt test fırsatı |
| T-002 Auditor HB+Result Reconciliation (S135) | Sprint 136 | Eğer Sprint 136 worker'ı spurious NO_GO yaşarsa auditor artık sessiz kalır |
| T-003 Docker Graceful Shutdown (S135) | Sprint 136 | `docker stop --time=10` path canlı, SIGTERM handler HB'yi DONE finalize eder, spurious NO_GO azalır |
| T-004 askBrain Extraction (S135) | Sprint 136 | worker→brain IPC ipc-registry.ts'den çalışır, re-export shim test dışı |
| T-005 Planner Priority/Deps (S135) | Sprint 136 (Task 6) | `deckent plan --structured --dry-run` Sprint 136 DIRECTIVES Priority sütunu CRITICAL/HIGH/NORMAL karışımı gösterir (Sprint 135'te tümü NORMAL idi) |
| T-008 Gate Propagation (S135) | Sprint 136 (Task 4) | `.deckent/sprint-136-gate.json` otomatik yazılır, Layer 4 criterion 12 LIVE PASS |
| T-009 Verify Loop Enforcement (S135) | Sprint 136 | Worker'lar `tsc --noEmit` koşmadan `.result` yazamaz → 5 test regression bu sprint'te spontane fix olma ihtimali |
| T-011 Secondary Instruments (S135) | Sprint 136 | metrics.jsonl config.cache + lock.wait + hb.stale + honesty.check entries görünür |
| T-013 Brain Budget Decay (S135) | Sprint 136 (zaten Sprint 135 finalize'da kısmen çalıştı) | finalizeSprint auto-trigger decay çağrır, decayable lines ≤900 kalır |

**9 fix canlı hale gelecek.** Sprint 135'in 0 canlı dogfood (chicken-egg nedeniyle) Sprint 136'da 9 canlı dogfood'a dönüşür. Bu Sprint 136'nın en büyük soft win'i.

## Sprint 136 GO Koşulları

Sprint 136 **clean GO** sayılır (Sprint 135 GO_WITH_TECH_DEBT'ten temiz GO'ya geçiş):
1. 5 test regression **zero** (Task 1 başarılı)
2. Async I/O ilk kademe migration (Task 2) hot path 50-100 çağrı → async
3. ≥8/10 task DONE (10 × 0.8)
4. Layer 3 ≥14/17 PASS
5. Readiness ≥4.00/5
6. Coordinator crash: 0 (Sprint 135 pattern devam)
7. `.deckent/sprint-136-gate.json` auto-produced (Task 4)
8. `docs/audits/sprint-136/load-test-report.md` auto-produced full (Task 5)
9. metrics.jsonl ≥50 lines (Sprint 135: 37)
10. 0 manual recovery
11. **T-005 canlı dogfood first time:** DIRECTIVES priority parse karışık görünmeli
12. Brain spurious NO_GO reconciliation çalışmalı (Task 3)

**Sprint 136 GO_WITH_TECH_DEBT fallback:**
- Honest label, Sprint 137'ye ≤4 residual item
- Async I/O ikinci kademe Sprint 137'ye devir
- Wizard + distribution Sprint 137-138'e

**Sprint 136 NO_GO (red flag):**
- Coordinator crash tekrar (T-001 fix yetersiz)
- Recovery template `melodic-launching-aurora.md` tekrar devreye
- Sprint 137 P0 birincil: coordinator root cause derin investigation
