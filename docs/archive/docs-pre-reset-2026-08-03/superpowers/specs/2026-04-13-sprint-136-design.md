# Sprint 136 Design Spec — Test Hygiene + Async I/O İlk Kademe + Artifact Wiring

**Tarih:** 2026-04-13
**Durum:** DESIGN — brainstorming onaylı, plan yazımı bekliyor
**Sprint ID:** sprint-136
**Önceki sprint:** sprint-135 (GO_WITH_TECH_DEBT, 11/17 Layer 3, readiness 3.93, zero crash)
**Referans:** `DIRECTIVES.md` (387 satır, Sprint 135 closing'inde yazılan 10-task taslak) + `.deckent/sprint-135-layer3-scorecard.md` + `~/.claude/projects/-home-alperen-deckent-dev/memory/project_sprint136_preflight.md`

---

## Section 1 — Context

### 1.1 Sprint 135 Closing Özeti

Sprint 135 **1 saat 0 dakika** doğal tamamlanışla kapandı (Sprint 134'ün 33dk execute + 2h manual recovery = 2h 33m'sine göre **-60% wall clock**). Sıfır coordinator crash, sıfır manuel müdahale, auto-archive criterion 9 **REDEMPTION** (Sprint 134 FAIL → Sprint 135 PASS). metrics.jsonl canlı ilk kez 37 satır veri yazdı (Sprint 134: 0). Brain FIX phase auto-recovery pattern'ı kanıtlandı — Sprint 134'te manuel yapılan düzeltme artık otomatik çalışıyor.

Ama numerical Layer 3 scorecard **14/17 → 11/17** düştü (Sprint 134 paritesinden 3 puan aşağı). Root cause'lar:
- **Layer 2 criterion 5 FAIL:** 5 vitest test regression (6 files failed, 5 tests failed — DIRECTIVES "5 test" ifadesi 6 dosyada 5 test olarak anlaşılmalı)
- **Layer 4 criterion 11 FAIL:** `docs/audits/sprint-135/load-test-report.md` oluşturulmadı (generateLoadReport hook eksik)
- **Layer 4 criterion 12 FAIL:** `.deckent/sprint-135-gate.json` oluşturulmadı (runSelfAuditGate çağrıldı ama dosya yazılmadı)
- **Layer 6 FAIL:** readiness 3.93 < 3.95 target (marjinal 0.02 altında, +0.07 honest improvement)

Bu eksikler + 3 spurious NO_GO (135-001, 135-004, 135-012 docker worker HB shutdown bug pattern) + 7 diğer temizlik işi Sprint 136'ya **10 carry-over debt item** olarak nakledildi.

### 1.2 Sprint 136 Hedefi

**Operasyonel:** Sprint 135'in zero-crash pattern'ını tekrarla (coordinator resilience + FIX phase auto-recovery).
**Numerical:** Layer 3 ≥14/17 (Sprint 134 paritesine dönüş + 3 criterion iyileşme).
**Readiness:** ≥4.00/5 (Sprint 135 3.93 → +0.07).
**Label:** Clean GO (Sprint 135 GO_WITH_TECH_DEBT'ten temiz GO'ya geçiş) — koşullar Section 4'te.

### 1.3 Baseline Durum (2026-04-13 pre-flight doğrulaması)

Plan mode Faz 1 pre-flight çıktıları:
- `git status`: master `b673be5`, working tree sadece runtime state (25 modified `.deckent/*.json`, commit dışı)
- `npx tsc --noEmit`: 0 hata
- `npx vitest run`: **6 files failed, 5 tests failed, 12478 passed, 16 skipped** (beklenen debt)
- `.brain/` total 815/900 satır (MEMORY 24, RETRO 80, PATTERNS 8, DEBT 1, DECISIONS 702)
- `.deckent/sprint-135-gate.json`: **YOK** (doğrulandı, Task 4 varlık nedeni)
- `docs/audits/sprint-135/load-test-report.md`: **YOK** (doğrulandı, Task 5 varlık nedeni)
- `.deckent/sprint-135-layer3-scorecard.md`: var
- `.tasks/`: 3 timeout dosyası lingering (`task-135-001/002/004.timeout`) — Sprint 136 prefix farklı, çakışma yok
- `.deckent/sprint-state.json`: yok (Sprint 135 temiz kapandı)

### 1.4 Keşifte Ortaya Çıkan Kritik Bulgular (DIRECTIVES'te eksik)

**Bulgu #1 — `sprint-finalizer.ts` single bottleneck:**
Sprint 136'nın 10 task'ından **5 tanesi** (Task 2, 3, 4, 5, 8) `src/orchestra/sprint-finalizer.ts` dosyasını değiştirmek zorunda. Bu:
- Task 2: async I/O migration (finalizeSprint içindeki readFileSync/writeFileSync → fs.promises)
- Task 3: tryCodeVerifiedDone helper ekle (result-evaluator.ts veya sprint-finalizer.ts)
- Task 4: gate.json write hook (finalizeSprint sonrası)
- Task 5: load-report.md write hook (finalizeSprint sonrası, gate.json'dan sonra)
- Task 8: sprint-controller.ts delegation body'sini sprint-finalizer.ts'e taşı (full slim hedefi)

DIRECTIVES taslağı bu çakışmayı **wave sıralamasıyla çözmemiş** — sadece Critical Path diyor. Bu design spec wave topology ile bottleneck'i yönetir (Section 3).

**Bulgu #2 — 5 test regression'ın gerçek root cause'u DIRECTIVES'te yanlış tanımlanmış:**
DIRECTIVES Task 1 `tests/cli/commands/start.test.ts` regression için "detectOrphan import mock'lanmamış; `vi.mock('../../../src/orchestra/sprint-pid-manager.js')` ekle" diyor. Gerçek root cause farklı:

```
Error: [vitest] No "DECKENT_DIR" export is defined on the "../../../src/core/constants.js" mock.
 ❯ src/orchestra/sprint-pid-manager.ts:36:22
     34| // ─── Constants ────────────────────────────────────────────────────
     35|
     36| const PID_DIR = join(DECKENT_DIR, 'pids');
```

3 CLI test dosyası (`tests/cli/start-sandbox.test.ts`, `tests/cli/commands/start.test.ts`, `tests/cli/commands/i18n-integration.test.ts`) `src/core/constants.js`'i partial mock'luyor. Sprint 135'te `sprint-pid-manager.ts` yeni `DECKENT_DIR` import'u ekledi, mock'a reflekte edilmedi → module-level error, test case'lere hiç ulaşılamıyor. Fix: partial mock'lara `DECKENT_DIR: '.deckent'` eklemek **veya** `vi.importActual` pattern'ına çevirmek (daha sağlam).

**Bu 3 dosya DIRECTIVES'te "5 testin" 3'ü sayılıyor ama vitest çıktısında "Tests: 5 failed" sayısına katılmıyor** çünkü module-level fail olduğu için test case'lere girilemedi (vitest "Test Files: 6 failed" sayar ama "Tests" sayısı düşüktür). Task 1 opener scope'u gerçekte:
- 3 CLI test dosyası: `constants.js` partial mock fix (1 pattern, 3 copy)
- 1 `tests/core/error-handling-unification.test.ts`: `src/orchestra/sprint-pid-manager.ts:69` ErrorRegistry ihlali (`throw new Error` → `throw new DeckentError`)
- 1 `tests/e2e/docker-backend.test.ts`: 2 test fail (kill() signature Sprint 135 T-003 değişimi)
- 1 `tests/orchestra/task-builder.test.ts`: 2 self-parse test Sprint 135 DIRECTIVES 13 task beklerken 10 parse ediyor (Task 6 kapsamı — Sprint 136 DIRECTIVES'e göre update)

**Toplam:** 6 dosya fail, 5 gerçek assertion fail, 3 module-level crash. İş bölümü:
- **Task 1 (bug-fixer, 5 dosya):** 3 CLI module-level fix (`constants.js` partial mock) + 1 `error-handling-unification` (ErrorRegistry source fix) + 1 `docker-backend.test.ts` (kill signature güncelle)
- **Task 6 (test-writer, 1 dosya):** `task-builder.test.ts` 2 self-parse testini Sprint 136 DIRECTIVES'e göre update et

**Bulgu #3 — Wall clock tahmini DIRECTIVES'ten farklı:**
DIRECTIVES "Critical Path 180-240dk" diyor; bu aslında **serial CP**, wall clock değil. Exploration raporu 3 worker paralel + 4 wave = **~365 dk (~6.1 saat)**. `--timeout 21600000` (6 saat = 360 dk) ile **marjsiz**. Kapsam kesme seçeneği Task 10 → 9 → 7 sırasında, ilk warning'de Task 10 kesilir.

---

## Section 2 — Requirements (Kapsam + Brainstorming Kararları)

### 2.1 Kapsam (C — Tüm 10 Debt)

Kullanıcı brainstorming'de **kapsam C (10 task)** seçti — Sprint 135 carry-over'ın tamamı kapatılır.

| # | Task | Priority | Effort | Agent | Model | Files Primary |
|---|------|----------|--------|-------|-------|---------------|
| 1 | 5 test regression fix (3 CLI constants mock + error-handling + docker e2e) | CRITICAL | normal | bug-fixer | opus | 4 test files + `src/orchestra/sprint-pid-manager.ts` |
| 2 | Async I/O hot path migration (50-100 çağrı) | CRITICAL | high | refactorer | opus | `src/orchestra/sprint-controller.ts`, `result-collector.ts`, `task-builder.ts`, `result-evaluator.ts` |
| 3 | Brain spurious NO_GO reconciliation (tryCodeVerifiedDone) | CRITICAL | normal | architect | opus | `src/orchestra/sprint-finalizer.ts`, `result-evaluator.ts` |
| 4 | `.deckent/sprint-NNN-gate.json` output wiring | HIGH | low | bug-fixer | sonnet | `src/orchestra/sprint-finalizer.ts` |
| 5 | `docs/audits/sprint-NNN/load-test-report.md` auto-generation | HIGH | low | bug-fixer | sonnet | `src/core/observability.ts`, `src/orchestra/sprint-finalizer.ts` |
| 6 | T-005 DIRECTIVES self-parse dogfood (Sprint 136 DIRECTIVES'e göre) | HIGH | low | test-writer | sonnet | `tests/orchestra/task-builder.test.ts`, `src/orchestra/task-builder.ts` |
| 7 | ErrorRegistry lint rule enforcement | HIGH | normal | refactorer | sonnet | `scripts/check-error-handling.mjs` (yeni), `package.json` |
| 8 | sprint-controller.ts full slim (1820→≤400 LoC) | HIGH | high | refactorer | opus | `src/orchestra/sprint-controller.ts`, `sprint-finalizer.ts`, `ipc-registry.ts` |
| 9 | Rubric field null fix for test-writer agent | NORMAL | low | refactorer | haiku | `.deckent/agents/test-writer/agent.json`, `src/orchestra/task-builder.ts` |
| 10 | sprint-docs-helpers.ts test coverage | NORMAL | low | test-writer | haiku | `tests/orchestra/sprint-docs-helpers.test.ts` (yeni) |

### 2.2 Execution Parameters

| Parametre | Değer | Not |
|---|---|---|
| max_workers | **3** (config'de 4, Sprint 136 için override) | Muhafazakar seçim — Task 2 async I/O HIGH effort sırasında paralel yük sınırlı |
| brain_planning | `structured` | T-005 canlı dogfood ilk kez |
| mode | `performance` | opus default, haiku override task 9+10 |
| spawn_backend | `docker` | Sprint 135'te graceful shutdown fix edildi |
| timeout | `21600000` (6 saat) | Kapsam C için TIGHT — marj ~5dk |
| verify_loop | `active` | T-009 canlı ilk kez — worker `tsc --noEmit` geçmeden `.result` yazamaz |
| telemetry_enabled | `false` | Hard-coded, vision: product not service |
| auto_archive_directives | `true` | Sprint 135'te kanıtlandı |

### 2.3 Monitoring (3-Layer Proven)

1. **Verifier:** Ana session `run_in_background=true` — `npx tsc --noEmit` + `npx vitest run` sürekli loop
2. **Watchdog:** `Explore` subagent dispatch — 40 cycle polling, `deckent_status` + `git status --short` + worker alert detection
3. **Shell Watchdog:** Ana session manuel periyodik `deckent status` + `ls .tasks/ | head` kontrolü

Override: `~/.claude/projects/-home-alperen-deckent-dev/memory/feedback_subagent_bash_restrictions.md` — subagent içinde `sleep ≥2s` ve `npx` komutları bloke, spawn-process komutları ana session'da.

### 2.4 Doğrulama (L1-L6 Full Replica — 17 Criterion)

| Layer | Criteria Count | Notes |
|---|---|---|
| L1 — Brain self-eval | 3 | ≥8/10 DONE + HIGH effort not NO_GO + rubric avg ≥75 |
| L2 — Technical | 3 | tsc 0 + vitest 0 fail + dashboard regresyonu 0 |
| L3 — Manual verify | 3 | Per-task grep proof 10/10 + scope compliance + auto-archive canlı |
| L4 — Artifact dogfood | 3 | metrics.jsonl ≥50 + load-report.md full + gate.json PASS |
| L5 — Vision regression | 4 | ADR-033/034 + roadmap.md + forbidden terms + per-task vision lens |
| L6 — Readiness | 1 | ≥4.00/5 weighted (bugsuz + kurulum + gözlemlenebilirlik ağırlıklı) |

**Hedef:** ≥14/17 PASS (Sprint 135 11/17'den +3), clean GO.

---

## Section 3 — Architecture (Wave Topology + Bottleneck Yönetimi)

### 3.1 Wave Topology (10 task / 3 worker / paralel + Deckent .locks/)

```
╔══════════════════════════════════════════════════════════════════╗
║ Wave 1 [3 paralel, ~120 dk]                                      ║
║  → CRITICAL PATH başlangıcı, Task 2 en uzun (async I/O HIGH)    ║
╠══════════════════════════════════════════════════════════════════╣
║  ├─ Task 2: Async I/O Hot Path                                   ║
║  │   refactorer · opus · HIGH · ~120 dk                          ║
║  │   Files: sprint-controller.ts, result-collector.ts,           ║
║  │          task-builder.ts, result-evaluator.ts                 ║
║  │                                                                ║
║  ├─ Task 1: Test Regression Fix                                  ║
║  │   bug-fixer · opus · normal · ~60 dk                          ║
║  │   Files: 5 test files + sprint-pid-manager.ts (err fix)      ║
║  │                                                                ║
║  └─ Task 6: T-005 Self-Parse Dogfood                             ║
║      test-writer · sonnet · low · ~30 dk                         ║
║      Files: tests/orchestra/task-builder.test.ts                 ║
╠══════════════════════════════════════════════════════════════════╣
║ INTEGRATION CHECKPOINT (~10 dk)                                  ║
║  • Task 2 async foundation commit edildi mi?                     ║
║  • Task 1 error-handling-unification test PASS mi?               ║
║  • Task 6 Sprint 136 DIRECTIVES self-parse yeşil mi?             ║
║  • sprint-finalizer.ts durumu temiz mi (Task 2 dokundu)?        ║
╚══════════════════════════════════════════════════════════════════╝

╔══════════════════════════════════════════════════════════════════╗
║ Wave 2 [3 paralel, ~60 dk]                                       ║
║  → sprint-finalizer.ts triple-writer wave (file-lock yönetir)   ║
╠══════════════════════════════════════════════════════════════════╣
║  ├─ Task 3: Brain Spurious NO_GO Fix                             ║
║  │   architect · opus · normal · ~60 dk                          ║
║  │   Files: sprint-finalizer.ts, result-evaluator.ts             ║
║  │   Region: tryCodeVerifiedDone helper ekleme                   ║
║  │                                                                ║
║  ├─ Task 4: gate.json Wiring                                     ║
║  │   bug-fixer · sonnet · low · ~30 dk                           ║
║  │   Files: sprint-finalizer.ts                                  ║
║  │   Region: finalizeSprint() sonrası write hook                 ║
║  │                                                                ║
║  └─ Task 5: load-report.md Wiring                                ║
║      bug-fixer · sonnet · low · ~30 dk                           ║
║      Files: observability.ts, sprint-finalizer.ts                ║
║      Region: finalizeSprint() generateLoadReport hook            ║
║                                                                   ║
║  ⚠ LOCK RISK: 3 task sprint-finalizer.ts'ye dokunuyor.           ║
║     Deckent .locks/ acquire/release serileştirir.                ║
║     Lock retry metric (T-011 canlı) metrics.jsonl'a lock.wait   ║
║     event yazar — bu Sprint 136 dogfood kanıtı olacak.          ║
╠══════════════════════════════════════════════════════════════════╣
║ INTEGRATION CHECKPOINT (~10 dk)                                  ║
║  • sprint-finalizer.ts 3 edit git merge temiz mi?                ║
║  • metrics.jsonl lock.wait events var mı (T-011 dogfood kanıt)?  ║
║  • Task 3 result-evaluator.ts async pattern uyumlu mu?          ║
╚══════════════════════════════════════════════════════════════════╝

╔══════════════════════════════════════════════════════════════════╗
║ Wave 3 [3 paralel, ~90 dk]                                       ║
║  → Refactor + lint rule + rubric fix                             ║
╠══════════════════════════════════════════════════════════════════╣
║  ├─ Task 8: sprint-controller.ts Full Slim                       ║
║  │   refactorer · opus · HIGH · ~90 dk                           ║
║  │   Files: sprint-controller.ts, sprint-finalizer.ts,           ║
║  │          ipc-registry.ts                                      ║
║  │   Target: sprint-controller.ts ≤400 LoC                       ║
║  │                                                                ║
║  ├─ Task 7: ErrorRegistry Lint Rule                              ║
║  │   refactorer · sonnet · normal · ~45 dk                       ║
║  │   Files: scripts/check-error-handling.mjs (yeni),             ║
║  │          package.json                                         ║
║  │   Not: Task 1'in error-handling fix'i sonrası net pass        ║
║  │                                                                ║
║  └─ Task 9: Rubric Field Null Fix                                ║
║      refactorer · haiku · low · ~20 dk                           ║
║      Files: .deckent/agents/test-writer/agent.json,              ║
║             src/orchestra/task-builder.ts                        ║
╠══════════════════════════════════════════════════════════════════╣
║ INTEGRATION CHECKPOINT (~10 dk)                                  ║
║  • sprint-controller.ts ≤400 LoC doğrulama                       ║
║  • tests/orchestra/sprint-controller*.test.ts 0 fail             ║
╚══════════════════════════════════════════════════════════════════╝

╔══════════════════════════════════════════════════════════════════╗
║ Wave 4 [1 solo, ~25 dk]                                          ║
║  → Final cosmetic test                                           ║
╠══════════════════════════════════════════════════════════════════╣
║  └─ Task 10: sprint-docs-helpers.ts Test Coverage                ║
║      test-writer · haiku · low · ~25 dk                          ║
║      Files: tests/orchestra/sprint-docs-helpers.test.ts (yeni)   ║
║      Target: ≥80 LoC, ≥5 it() blocks                             ║
╠══════════════════════════════════════════════════════════════════╣
║ FINAL VERIFICATION (~30 dk)                                      ║
║  • npx tsc --noEmit → 0 hata                                     ║
║  • npx vitest run → 0 fail (6 regression sıfırlanmalı)          ║
║  • Layer 3 17-criterion scorecard yaz                            ║
║    (.deckent/sprint-136-layer3-scorecard.md)                     ║
║  • .deckent/sprint-136-gate.json auto-generate kanıt (Task 4)    ║
║  • docs/audits/sprint-136/load-test-report.md kanıt (Task 5)    ║
║  • metrics.jsonl ≥50 lines (lock.wait dogfood kanıt)             ║
║  • FINAL-EXECUTIVE-REPORT.md Section 1+5+6+8 inline              ║
║  • FINAL-EXECUTIVE-REPORT.md Section 16+17 append                ║
║  • Commit ceremony: feat + docs (Sprint 135 pattern)             ║
╚══════════════════════════════════════════════════════════════════╝

Toplam wall clock: 120 + 60 + 90 + 25 + 40 (4 checkpoints) + 30 (final) = ~365 dk ≈ 6.1 saat
  🟡 TIGHT MARGIN: --timeout 21600000 (6 saat = 360 dk) ile ~5 dk üstünde
  ⚠ Kapsam kesme sırası: Task 10 → Task 9 → Task 7 (DIRECTIVES'te belirtildi)
     İlk warning'de Task 10 kesilir → ~340 dk (5.7 saat), ~20 dk marj kazanılır
```

### 3.2 Bottleneck Çözümü: sprint-finalizer.ts Triple-Writer Wave 2

**Problem:** Task 3, 4, 5 aynı dosyaya paralel yazım.

**Çözüm:** Deckent'in `.locks/{file-path}.lock` acquire/release mekanizması (ADR-008, `api-surface.md`). Worker prosedürü:
1. Worker `acquireLock(filePath, workerId, taskId)` çağırır
2. Lock yoksa hemen alır, varsa **FILE_LOCK_WAIT** metric event'i yazıp retry
3. Timeout 5 dk, stale lock auditor tarafından tespit edilir
4. Yazı bitince `releaseLock(filePath)` çağırır

**Bölge ayrımı:** Task 3+4+5 farklı fonksiyon bölgelerine yazıyor:
- **Task 3:** `tryCodeVerifiedDone` yeni helper (dosya sonu veya `finalizeSprint` öncesi)
- **Task 4:** `finalizeSprint` gövdesinde yeni `writeFile(sprint-NNN-gate.json)` bloğu
- **Task 5:** `finalizeSprint` gövdesinde Task 4'ten sonra `generateLoadReport` + `writeFile(load-test-report.md)` bloğu

Git merge sıralı uygulandığında çakışma olmamalı ama yarışta ilk alan kazanır, diğerleri kuyrukta bekler. Pratikte Wave 2 wall clock etkilenmez (Task 3 en uzun 60 dk, Task 4+5 low 30 dk'da iş görür, sprint-finalizer.ts ikincil).

**Dogfood kanıtı:** Sprint 135 T-011 `lock.wait` secondary instrument'ı Sprint 136'da **canlı ilk kez** metrics.jsonl'a veri yazar. Sprint 135'te 0 lock.wait event vardı (çünkü worker'lar çakışmadı). Sprint 136 Wave 2'de 1-3 `lock.wait` event beklenen.

### 3.3 Async I/O Hot Path (Task 2) Detay

DIRECTIVES'teki Task 2 tanımı net ama hot path sırasının **Task 2 öncesi baseline sayım** gerektiriyor. Pre-flight'ta ölçülmeli:

```bash
grep -c "readFileSync\|writeFileSync" \
  src/orchestra/sprint-controller.ts \
  src/orchestra/result-collector.ts \
  src/orchestra/task-builder.ts \
  src/orchestra/result-evaluator.ts
```

Hedef: en az 50 sync çağrı async'e geçmeli. Öncelik sırası:
1. `spawnWorkers()` task JSON writeFileSync → async (en kritik, event loop bloke)
2. `waitForResults()` heartbeat/result readFileSync polling loop → async
3. `evaluateResult()` + result-collector.ts → async
4. `parseStructuredDirectives` DIRECTIVES.md readFileSync → async wrapper

**Worker pipeline zorunlulukları:**
- Public CLI/MCP API signature değişmez (backward compat)
- Test mock'ları `vi.mock('node:fs/promises', ...)` pattern'ına geçer
- Concurrent write race koruması (Task 2 test 5'te)
- EACCES error propagation sağlam (Task 2 test 6)

### 3.4 Task 1 Test Fix Gerçek Strategy (DIRECTIVES revize ile)

DIRECTIVES'te yanlış tanımlanan root cause:
- **Yanlış:** "detectOrphan import mock'lanmamış, `vi.mock('../../../src/orchestra/sprint-pid-manager.js')` ekle"
- **Doğru:** 3 CLI test dosyası (`start-sandbox.test.ts`, `commands/start.test.ts`, `commands/i18n-integration.test.ts`) `src/core/constants.js` partial mock'unda `DECKENT_DIR` export'u eksik. Fix: her 3 dosyanın `vi.mock('../../../src/core/constants.js')` bloğuna `DECKENT_DIR: '.deckent'` eklemek **VEYA** `importOriginal` pattern'ına çevirmek.

Önerilen pattern (daha sağlam — gelecekte constants.ts'ye yeni export eklenirse otomatik çalışır):
```typescript
vi.mock('../../../src/core/constants.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/core/constants.js')>();
  return {
    ...actual,
    // test-specific overrides if any
  };
});
```

Task 1 worker'ı bu pattern'ı uygulamalı, yoksa fix yanlış yere yazar.

### 3.5 Sprint 135 Meta-Dogfood Canlılık Tablosu (Sprint 136'da İlk Kez)

| Fix (built in) | Canlı ilk (bu sprint) | Beklenen kanıt |
|---|---|---|
| T-001 Coordinator Resilience (S135) | S136 | `.deckent/sprint-136.pid` oluşur, 30s snapshot, beforeExit flush |
| T-002 Auditor HB+Result Reconcile (S135) | S136 | Task 3 live check — spurious NO_GO auditör tarafından sessiz |
| T-003 Docker Graceful Shutdown (S135) | S136 | `docker stop --time=10` + SIGTERM handler HB DONE finalize |
| T-004 askBrain Extraction (S135) | S136 | ipc-registry.ts üzerinden IPC, re-export shim shadow test |
| T-005 Planner Priority/Deps (S135) | S136 (Task 6) | `deckent plan --structured --dry-run` Priority karışımı gösterir |
| T-008 Gate Propagation (S135) | S136 (Task 4) | `.deckent/sprint-136-gate.json` otomatik oluşur — Layer 4 LIVE PASS |
| T-009 Verify Loop Enforcement (S135) | S136 | Worker `tsc --noEmit` koşmadan `.result` yazamaz |
| T-011 Secondary Instruments (S135) | S136 (Wave 2) | metrics.jsonl lock.wait events — sprint-finalizer.ts triple write |
| T-013 Brain Budget Decay (S135) | S136 | finalizeSprint auto-trigger decay çağrır |

**9 fix canlı hale gelecek.** Sprint 135'in 0 canlı dogfood'u Sprint 136'da 9'a çıkar. Bu Sprint 136'nın en büyük soft win'i.

---

## Section 4 — Success Criteria (17-Criterion Scorecard)

### 4.1 Layer 1 — Deckent Brain Self-Evaluation (3)

| # | Kriter | Hedef | Not |
|---|---|---|---|
| 1 | ≥8/10 task DONE | 8+ | 10 × 0.8 |
| 2 | HIGH effort (Task 2, 8) DONE veya TECH_DEBT, NO_GO değil | HIGH not NO_GO | Sprint 135'te T-001/T-004 HIGH spurious NO_GO'ydu — Task 3 fix bunu bu sprint'te spontane düzeltmeli |
| 3 | Brain rubric avg ≥75/100 | 75+ | Task 9 (rubric field fix) bu sprint'te canlı olduğu için test-writer task'ları rubric doldurmalı |

### 4.2 Layer 2 — Technical Verification (3)

| # | Kriter | Hedef |
|---|---|---|
| 4 | `npx tsc --noEmit` → 0 errors | PASS |
| 5 | `npx vitest run` → 0 fail, ≥12478 pass | PASS (Task 1 + Task 6 6 regression sıfır) |
| 6 | Dashboard regresyon = 0 | Dashboard test suite separate run |

### 4.3 Layer 3 — Manual Verification (3)

| # | Kriter | Hedef |
|---|---|---|
| 7 | Per-task grep proof 10/10 | 10 task canlı kod kanıtı |
| 8 | Scope compliance — 0 boundary violation | git diff stat audit |
| 9 | Auto-archive canlı (Sprint 136.md ilk kez Sprint 136'da) | `.brain/archive/DIRECTIVES-sprint-136.md` + `.brain/sprints/sprint-136.md` |

### 4.4 Layer 4 — Artifact Dogfood (3)

| # | Kriter | Hedef |
|---|---|---|
| 10 | metrics.jsonl canlı veri ≥50 lines | Sprint 135 37 → Sprint 136 +13 (lock.wait + finalize hooks) |
| 11 | `docs/audits/sprint-136/load-test-report.md` full | Task 5 canlı kanıt |
| 12 | `.deckent/sprint-136-gate.json` overallGate === "PASS" veya "WARNING" | Task 4 canlı kanıt |

### 4.5 Layer 5 — Product Vision Regression (4)

| # | Kriter | Hedef |
|---|---|---|
| 13 | ADR-033 + ADR-034 immutable | `.brain/DECISIONS.md` grep |
| 14 | docs/vision/roadmap.md immutable | modifled files list |
| 15 | Forbidden terms audit (saas/cloud-hosted/paywall/enterprise edition) | 0 new occurrence |
| 16 | Per-task vision lens (10/10 task vision-audited) | design spec Section 2 cross-ref |

### 4.6 Layer 6 — Kur-Çalıştır Readiness (1)

| # | Kriter | Hedef | Weighted |
|---|---|---|---|
| 17 | Readiness ≥4.00/5 | 4.00 | Axis: bugsuz (+0.2 test fix), gözlemlenebilirlik (+0.1 metrics+artifacts), kurulum (+0.05 async), diğerleri sabit |

### 4.7 Sprint 136 Clean GO Koşulları

Sprint 136 **clean GO** sayılır (Sprint 135 GO_WITH_TECH_DEBT'ten temiz GO'ya geçiş):
1. 6 test regression **sıfır** (Task 1 + Task 6)
2. Async I/O ilk kademe (Task 2) 50+ sync → async
3. ≥8/10 task DONE
4. Layer 3 ≥14/17 PASS
5. Readiness ≥4.00/5
6. Coordinator crash: 0
7. Manual recovery: 0
8. `.deckent/sprint-136-gate.json` auto-produced
9. `docs/audits/sprint-136/load-test-report.md` auto-produced full
10. metrics.jsonl ≥50 lines
11. T-005 canlı dogfood (DIRECTIVES priority parse karışık)
12. Brain spurious NO_GO reconciliation çalışır (Task 3)

---

## Section 5 — Risks & Mitigations

### R1 — Wall Clock Marjsızlığı (YÜKSEK)

**Risk:** 6.1 saat tahmini, 6 saat timeout ile ~5 dk üstünde. Herhangi bir task overrun olursa Wave 4 Task 10 timeout'u yiyebilir.

**Mitigation:**
- Wave 1 completion'da kümülatif elapsed time kontrol — 120 dk'yı ≥10% aşarsa Task 10 pre-emptive drop edilir
- Kesme sırası Task 10 → Task 9 → Task 7 (DIRECTIVES)
- Kritik path'te Task 2 overrun en büyük risk — 120 dk hedef, 150 dk hard cap
- Task 10 drop edilirse wall clock ~340 dk, ~20 dk marj

### R2 — sprint-finalizer.ts Triple-Write Lock Yarışı (ORTA)

**Risk:** Wave 2'de Task 3+4+5 sprint-finalizer.ts'ye yazmak için lock bekliyor, retry loop'u patlar, worker timeout olur.

**Mitigation:**
- Deckent `.locks/` retry interval 500ms, max 600 retry (5 dk total) — yeterli
- Wave 2 total 60 dk olduğu için 5 dk lock gecikmesi %8 wall clock etkisi, tolerable
- Lock metric (T-011) metrics.jsonl'a yazıldığı için post-sprint analiz kanıtı olacak
- Plan B: Wave 2 başarısız olursa Task 4 + Task 5'i seri yap (Task 3 → Task 4 → Task 5), +20 dk overrun

### R3 — Async I/O Migration Regression (YÜKSEK)

**Risk:** Task 2 sprint-controller.ts hot path async'e geçerken signature değişir, downstream caller'lar güncellenmezse test regresyonu.

**Mitigation:**
- Task 2 worker public API signature'ları korumalı (backward compat — DIRECTIVES'te explicit)
- Test mock'ları `vi.mock('node:fs/promises', ...)` güncellenmeli (DIRECTIVES test 7)
- tests/orchestra/sprint-controller*.test.ts 0 fail ZORUNLU (Task 8 ile aynı kriter)
- T-009 verify loop canlı — worker tsc fail → NO_GO, testler geçmeden `.result` yazamaz

### R4 — Task 1 Yanlış Fix Yeri (ORTA)

**Risk:** DIRECTIVES Task 1 "detectOrphan mock'la" diyor ama gerçek fix `constants.js` mock'una `DECKENT_DIR` eklemek. Worker DIRECTIVES'i lafzen takip ederse yanlış yere yazar.

**Mitigation:**
- DIRECTIVES revize (Faz 5) Task 1 description'ı düzelt — net root cause + önerilen `importOriginal` pattern
- Fix validation: `npx vitest run tests/cli/commands/start.test.ts` isolate koşum → module-level error gitmiş olmalı

### R5 — Coordinator Crash Relapse (DÜŞÜK ama KATASTROFİK)

**Risk:** Sprint 135'te sıfır crash'ti, ama Sprint 136 async I/O büyük refactor. Event loop pattern'ı değiştiği için beklenmeyen yan etki.

**Mitigation:**
- T-001 Coordinator Resilience Sprint 135'te build edildi, Sprint 136'da canlı — orphan detection start.ts prompt'u devreye girer
- Recovery template hazır: `.claude/plans/melodic-launching-aurora.md` (Sprint 134'te kullanıldı)
- 3-layer monitoring pattern (brainstorming kararı) zero crash kanıtladı
- Task 2 worker: signature değişimi koordineli, tek commit
- Plan C: Task 2 NO_GO alırsa Sprint 137'ye deferred, Sprint 136 kapsam 9 task'a düşer

### R6 — DIRECTIVES Task 1 Test Sayısı Karışıklığı (DÜŞÜK)

**Risk:** "5 test" ifadesi DIRECTIVES'te vitest "5 tests failed" sayısıyla karışıyor ama gerçekte 6 files failed, 5 tests failed + 3 module-level (test count 0).

**Mitigation:**
- Bu design spec Section 1.4'te net tanımlandı
- DIRECTIVES revize Task 1 description'ı "3 CLI module-level + 1 error-handling + 1 docker e2e + 1 task-builder self-parse (Task 6 kapsam)" olarak güncellenir
- Task 1 worker acceptance criteria: **6 files failing → 0 files failing** (test count değil file count)

### R7 — Sprint 135.pid Lingering (ÇOK DÜŞÜK)

**Risk:** Sprint 135 closing sırasında `.deckent/sprint-135.pid` silinmediyse Sprint 136 start.ts orphan detection prompt'u tetiklenir.

**Mitigation:**
- Pre-flight'ta kontrol edildi: `.deckent/` listesinde `.pid` dosyası yok, fresh
- Olursa T-001 canlı test fırsatı — worker prompt'u `--auto-approve` mode'da Archive path'ini otomatik seçer

---

## Section 6 — Definition of Done

Sprint 136 kapatılmadan önce:

- [ ] 10 task'ın 10'u code written (physical grep proof)
- [ ] `npx tsc --noEmit` → 0
- [ ] `npx vitest run` → 0 fail (6 regression sıfır + Task 10 yeni test 5+ geçer)
- [ ] `.deckent/sprint-136-layer3-scorecard.md` yazıldı (17 criterion breakdown)
- [ ] `.deckent/sprint-136-gate.json` auto-produced (Task 4 canlı kanıt)
- [ ] `docs/audits/sprint-136/load-test-report.md` auto-produced full format (Task 5 canlı kanıt)
- [ ] `.deckent/metrics.jsonl` ≥50 lines (Sprint 135: 37)
- [ ] `.brain/archive/DIRECTIVES-sprint-136.md` auto-archive edildi
- [ ] `.brain/sprints/sprint-136.md` sprint log yazıldı
- [ ] `.brain/MEMORY.md` Sprint 136 Learnings bölümü eklendi
- [ ] FINAL-EXECUTIVE-REPORT.md Section 1+5+6+8 inline update + Section 16+17 append (tek commit)
- [ ] Commit ceremony: feat + docs (Sprint 135 pattern)
- [ ] Coordinator crash: 0
- [ ] Manual recovery: 0

---

## Section 7 — References

- **DIRECTIVES.md** (387 satır, Sprint 136 taslak — 2026-04-12 yazıldı)
- **`.deckent/sprint-135-layer3-scorecard.md`** (11/17 breakdown + 10 debt)
- **`~/.claude/projects/-home-alperen-deckent-dev/memory/project_sprint136_preflight.md`** (10 adım pre-flight)
- **`~/.claude/projects/-home-alperen-deckent-dev/memory/project_sprint135_completed.md`** (Sprint 135 closing)
- **`~/.claude/projects/-home-alperen-deckent-dev/memory/project_docker_hb_shutdown_bug.md`** (Task 3 bağlam)
- **`~/.claude/projects/-home-alperen-deckent-dev/memory/feedback_max_workers.md`** (max_workers HARD LIMIT 4, Sprint 136 override 3)
- **`~/.claude/projects/-home-alperen-deckent-dev/memory/feedback_subagent_bash_restrictions.md`** (3-layer monitoring)
- **`~/.claude/projects/-home-alperen-deckent-dev/memory/feedback_living_record_sync.md`** (FINAL report disiplin)
- **`~/.claude/projects/-home-alperen-deckent-dev/memory/project_vision_product_not_service.md`** (vision lens)
- **`.contracts/api-surface.md`** (ADR-008 module import rules, .locks/ protocol)
- **`docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md`** Section 14+15 (Sprint 135 status+retro)
- **`docs/superpowers/specs/2026-04-10-sprint-135-design.md`** (Sprint 135 reference pattern)
- **`docs/superpowers/plans/2026-04-11-sprint-135-plan.md`** (Sprint 135 plan reference)
- **`.claude/plans/staged-jingling-babbage.md`** (bu session plan file, plan mode çıkışı)

---

**DESIGN READY FOR PLAN.** Sonraki adım: `writing-plans` skill çağrısı, `docs/superpowers/plans/2026-04-13-sprint-136-plan.md` yazımı.
