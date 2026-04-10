# DIRECTIVES — Sprint 134: Triple Dogfooding + Max Load + Product Vision Launch

## Goal: Sprint 133'ten devralınan 4 retrospektif aksiyonu çözmek (worker honesty, scope parser, stale heartbeat, token pipeline), Sprint 132'den 2 sprint ertelenmiş god object split'leri kapatmak (sprint-reporter.ts + sprint-controller.ts), task dependency pipeline'ı entegre edip sprint'in kendi task grafiğini yöneten ilk canlı testini yapmak (triple dogfooding), local observability iskelesini kurup Sprint 134'ün kendi yük metriklerini toplamak, Brain self-audit gate'i ekleyip her sprint'in kapanışında otomatik tsc+vitest doğrulamasını zorunlu kılmak, Product Vision ADR-033 ve Multi-Project Isolation ADR-034 yazarak Deckent'in "product not service" felsefesini resmi olarak kayıt altına almak. Referans: `docs/superpowers/specs/2026-04-11-sprint-134-design.md` (finalized design, 452 satır).

**DOKUNULAMAZ VİZYON:** Deckent bir üründür, SaaS değildir. OpenClaw gibi "kur çalıştır". Açık kaynak, ücretsiz, herkese her yerde. Her task bu lensten geçti. Ref: `.claude/projects/-home-alperen-deckent-dev/memory/project_vision_product_not_service.md`.

---

## Task 1: Task Dependency Pipeline + Feature Flag ON
- Model: opus
- Effort: high
- Agent: architect
- Skills: typescript-expert, system-architect
- Files: src/orchestra/task-builder.ts, src/orchestra/sprint-controller.ts, src/orchestra/parallel-pipeline.ts
- Scope: src/orchestra/

### Description
Sprint 132 W5 HIGH #3-5 bulgusu ve Sprint 134 kritik enabler. `parseStructuredDirectives` `- Dependencies:` satırını okumuyor, `spawnWorkers` dependencies alanını görmüyor, `parallel-pipeline.ts` topological sort hiçbir yerden çağrılmıyor. Bu task üç parçayı birleştirir VE Sprint 134'ün kendisinde canlı kullanılır (triple dogfooding #1).

**Gereksinimler:**
- `parseStructuredDirectives`: `- Dependencies: 134-005, 134-007` satırını `task.dependencies: string[]` olarak parse et
- `spawnWorkers`: `config.dependency_pipeline_enabled` true ise yalnızca bağımlılıkları DONE olan task'ları spawn et
- `respawnEligibleTasks()`: `finalizeTaskResult` sonrası çağrılır, bekleyen task'ları yeniden değerlendirir
- `parallel-pipeline.ts` topological sort entegre
- Circular dependency → `DependencyCycleError`
- **Two-phase spawn bootstrap:** Sprint start anında `dependency_pipeline_enabled=false`, yalnızca `priority=CRITICAL && dependencies=[]` task'lar spawn → sadece bu task spawn olur. DONE olunca brain flag'i `true` yapar, `respawnEligibleTasks()` çağırır.
- **Fallback:** 30 dakika içinde bu task DONE olmazsa brain `dependency_pipeline_enabled=false` zorla kalır, kalan task'lar sequential priority ordering ile spawn.
- Her respawn event'i `metric("wave.transition", duration_ms, { from_wave, to_wave })` emit eder (T-010 observability için).

**Kanıt:** `grep -n "respawnEligibleTasks\|dependency_pipeline_enabled\|DependencyCycleError" src/orchestra/task-builder.ts src/orchestra/sprint-controller.ts src/orchestra/parallel-pipeline.ts` → her üç isim de hit

**Test:** 6+ test — (1) parse: `- Dependencies: 134-005` → `task.dependencies: ["134-005"]`, (2) spawn guard: T1.deps=[T2], T2 PENDING → T1 not spawned, (3) respawn trigger: T2 DONE → respawnEligibleTasks spawns T1, (4) circular: T1↔T2 → DependencyCycleError, (5) fallback: flag=false → legacy behavior, (6) wave.transition metric emit

---

## Task 2: DIRECTIVES Scope Parser Hardening
- Model: opus
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/task-builder.ts, src/orchestra/planner.ts
- Scope: src/orchestra/

### Description
Sprint 067 fix eksikti, Sprint 133'te 3 task'ta parser regression reproduce oldu (133-006 `.brain/`, 133-008 `docs/analysis/` + `.` root, 133-005 `results.find()` junk entry). Edge case'leri düzelt:

- `.brain/` prefix path tanınmalı
- `.` root dizini + multi-scope (`docs/analysis/, .`) ayrı ayrı parse edilmeli
- Task başlığındaki kod snippet'leri (`results.find()`) scope regex false positive yaratmamalı — sanitization: scope parse'dan önce başlık kod snippet'lerini strip et
- Sprint 134 DIRECTIVES'indeki tüm scope satırlarını doğru tanımalı (self-test)

**Kanıt:** `grep -n "sanitize\|scope.*regex\|\\.brain" src/orchestra/task-builder.ts` → sanitization mantığı eklenmeli

**Test:** 8+ edge case test — (1) `.brain/` scope, (2) `.` root scope, (3) multi-scope tek satırda, (4) başlık kod snippet'i yanlış tetiklemiyor, (5) `.deckent/` scope, (6) absolute path scope reject, (7) boş scope → error, (8) Sprint 134 DIRECTIVES self-parse doğrulaması

---

## Task 3: Auditor Task-Level Heartbeat Cleanup
- Model: sonnet
- Effort: low
- Agent: refactorer
- Skills: typescript-expert
- Files: src/monitor/auditor.ts, src/agents/worker.ts
- Scope: src/monitor/, src/agents/

### Description
Sprint 133'te auditor 3166x false positive stale heartbeat alert üretti. Task DONE olduğunda worker `.hb` dosyasını silmeli (sprint-level cleanup yerine task-level). Mevcut durumda `.hb` sprint sonuna kadar kalıyor ve stale detection sürekli alert atıyor.

**Gereksinimler:**
- Worker `finalizeResult` çağrısında `.tasks/task-XXX.hb` dosyasını sil
- Auditor stale detection yalnızca aktif (DONE olmayan) task'ları kontrol etsin
- `cleanup_delay_ms` config option ile etkileşim: DONE sonrası X ms bekle, sonra sil

**Kanıt:** `grep -n "unlink.*\\.hb\|heartbeat.*cleanup" src/agents/worker.ts src/monitor/auditor.ts` → hit

**Test:** 3+ test — (1) DONE sonrası .hb silindi, (2) diğer aktif worker'ların .hb'si etkilenmiyor, (3) cleanup_delay_ms ile etkileşim (0, 100ms, 5000ms)

---

## Task 4: Gitignore + Cache + Stash Cleanup
- Model: haiku
- Effort: low
- Agent: refactorer
- Skills: git-expert
- Files: .gitignore
- Scope: .

### Description
Sprint 133 housekeeping observasyonu:
- `.deckent/cache/` → .gitignore'a ekle (managed-docs runtime state)
- `.deckent/sprint-*-baseline.json` pattern → .gitignore'a (her sprint yeni baseline yazacak, T-005'te kullanılır)
- `.deckent/metrics.jsonl` → .gitignore'a (T-010 Sprint 134 canlı metric data'sı)

**Kanıt:** `grep -E "cache/|sprint-.*-baseline|metrics\\.jsonl" .gitignore` → 3 hit

**Test:** 2+ test — (1) .gitignore pattern'ları mevcut, (2) git status temiz kalır (baseline/metrics dosyaları tracked değil)

---

## Task 5: Brain-Side Baseline Test Run + Worker Honesty Checker
- Model: opus
- Effort: normal
- Agent: architect
- Skills: testing-expert, system-architect
- Files: src/orchestra/sprint-controller.ts, src/orchestra/baseline-tracker.ts, src/orchestra/result-evaluator.ts
- Scope: src/orchestra/
- Dependencies: 134-001

### Description
Sprint 133'te 3 worker "pre-existing failures unrelated to this task" yanlış beyan etti ve Layer-3 baseline karşılaştırması ile çürütüldü. Bu otomatikleştir:

- **Sprint başlangıcında:** Brain pre-sprint `npx vitest run` koşturur, sonuç `.deckent/sprint-NNN-baseline.json` olarak yazılır (format: `{ files, pass, fail, skipped, timestamp }`)
- **Worker result evaluation:** Worker notes'unda `/pre-existing|unrelated|already failing/i` regex'i tetiklenirse brain otomatik `npx vitest run` koşturur ve delta'yı hesaplar
- **Delta > 0** ise `HONESTY_VIOLATION` flag'i sprint-reporter'a iletilir
- **Delta == 0** ise iddia doğrudur
- `baseline-tracker.ts` yeni dosya: `writeBaseline()`, `readBaseline()`, `compareBaseline()` functions

**Kanıt:** `ls src/orchestra/baseline-tracker.ts` → exists. `grep -n "HONESTY_VIOLATION\|compareBaseline" src/orchestra/sprint-controller.ts src/orchestra/result-evaluator.ts` → hit

**Test:** 6+ test — (1) baseline writeBaseline happy path, (2) regex tetikleme: "pre-existing failures" → compareBaseline çağrıldı, (3) delta 0 → flag yok, (4) delta > 0 → HONESTY_VIOLATION, (5) false positive: "pre-existing" worker notes dışında başka context → tetiklenmemeli, (6) regex case insensitivity

---

## Task 6: Token Usage Pipeline Fix
- Model: opus
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert, performance-optimizer
- Files: src/orchestra/result-collector.ts, src/orchestra/sprint-reporter.ts, src/agents/worker.ts
- Scope: src/orchestra/, src/agents/
- Dependencies: 134-001

### Description
Sprint 133 RETRO.md'de token table tüm 0/0/0. Sprint 124'teki Token Usage Tracker regression. Worker result'tan retro'ya kadar token verisi akışı kırık. Audit edip düzelt:

- Worker result yazarken `tokenUsage` alanını `.result` JSON'a eklesin mi kontrol et (API surface kontratı)
- result-collector.ts `tokenUsage` alanını parse ediyor mu?
- sprint-reporter.ts RETRO.md yazarken `tokenUsage` aggregate ediyor mu?
- Hangi adımda sıfırlanıyor? O adımı düzelt.

**Kanıt:** `grep -n "tokenUsage" src/orchestra/result-collector.ts src/orchestra/sprint-reporter.ts src/agents/worker.ts` → data flow görünmeli

**Test:** 5+ test — (1) worker result yazar + tokenUsage dolu, (2) result-collector parse edip aggregate ediyor, (3) sprint-reporter RETRO formatına yazıyor, (4) 12 task için toplam > 0, (5) provider field (claude/codex/gemini) korunuyor

---

## Task 7: ADR-033 Product Vision + Kur-Çalıştır Roadmap
- Model: sonnet
- Effort: normal
- Agent: architecture-planner
- Skills: documentation-writer, system-architect
- Files: .brain/DECISIONS.md, docs/vision/roadmap.md
- Scope: .brain/, docs/vision/

### Description
"Product, not service" felsefesini formal ADR olarak kayda geçir + kur-çalıştır yolculuk haritası yaz:

- **ADR-033 Product Vision** — `.brain/DECISIONS.md`'ye ekle, ADR-032'den sonra:
  - Title, Status: ACCEPTED, Date: 2026-04-11, Context, Decision, Consequences (+/-), Alternatives, References
  - 4 dokunulamaz prensip explicit listed: (1) product not service, (2) kur-çalıştır kolay, (3) açık kaynak ücretsiz, (4) herkese her yerde
  - Kaldırılan/yasak boyutlar: SaaS, cloud-hosted, paywall, enterprise edition, SOC2, oncall
  - Korunan/güçlendirilen boyutlar: observability (local), god object split, task dependency, distribution, wizard, local model, i18n, cross-platform
  - ≥100 satır
- **docs/vision/roadmap.md** — yeni dosya, halka açık pazarlama dili:
  - Sprint 134-145 yol haritası tablosu
  - Rakip karşılaştırma: Devin KARŞI, OpenHands MÜTTEFİK, OpenClaw REFERANS, Cursor KARŞI, Copilot KARŞI, Aider MÜTTEFİK
  - "Kur çalıştır" kullanıcı deneyimi hedefi: `npx deckent init && deckent start` iki-komut
  - ≥200 satır

**Kanıt:** `grep -c "^## ADR-033" .brain/DECISIONS.md` → 1. `wc -l docs/vision/roadmap.md` → ≥200. `grep -i "saas\|cloud-hosted\|paywall" docs/vision/roadmap.md` → 0 pozitif önerme (sadece "yasak" bağlamında)

**Test:** Doküman task, test gerekmiyor. Dosya existence + satır count + prensip enumeration yeterli

---

## Task 8: Mock-Safe Module Audit
- Model: sonnet
- Effort: low
- Agent: code-reviewer
- Skills: typescript-expert, testing-expert
- Files: docs/audits/mock-safety-audit.md
- Scope: docs/audits/

### Description
Sprint 133 fix commit'te bulunan skill-sandbox.ts pattern'i: "ES module top-level destructured import + vi.mock uyumsuzluğu" — 33 test tek dosya değişikliği ile kırıldı. Benzer pattern başka dosyalarda var mı? Audit et:

- `src/**/*.ts` içinde top-level destructured import tara (`import { x, y } from 'node:...'`)
- Her bulguyu rapor et: dosya, line number, destructured functions, risk level (mock-safe? değil?)
- Recommended fix pattern: namespace import + lazy getter (skill-sandbox pattern)
- En az 20 dosya tara (read-only, hiçbir src dosyasını değiştirme)

**Kanıt:** `ls docs/audits/mock-safety-audit.md` → exists. `wc -l docs/audits/mock-safety-audit.md` → ≥100

**Test:** Audit task, test gerekmiyor. Rapor en az 20 dosyayı listelemeli, her biri kategorize

---

## Task 9: sprint-reporter.ts 4-Way Split
- Model: opus
- Effort: high
- Agent: refactorer
- Skills: system-architect, typescript-expert
- Files: src/orchestra/sprint-reporter.ts, src/orchestra/sprint-metrics.ts, src/orchestra/sprint-retro-writer.ts, src/orchestra/sprint-docs-updater.ts, src/orchestra/ci-reporter.ts
- Scope: src/orchestra/
- Dependencies: 134-001

### Description
Sprint 132 W5 CRITICAL #1 — sprint-reporter.ts 2132 satır, 57 export, 13 sorumluluk. Pure refactor, davranış değişmez. 4'e böl:

- **sprint-metrics.ts** — metric calculation, aggregation, baseline tracking, coverage %
- **sprint-retro-writer.ts** — retro generation, learnings collection, decay logic
- **sprint-docs-updater.ts** — managed-docs, CHANGELOG, SPRINT-LOG updates
- **ci-reporter.ts** — CI baseline, test count, coverage reporting

`sprint-reporter.ts` → **thin barrel/coordinator**: tüm public export'lar `export * from './sprint-metrics.js'` gibi re-export. **Barrel re-export pattern zorunlu** — Task 10 (sprint-controller split) ve diğer consumer'lar mevcut import path'lerini değiştirmeden çalışmalı.

**Gereksinimler:**
- Mevcut tüm public export'lar aynı isimle barrel'dan erişilebilir kalmalı
- Mevcut test dosyaları (tests/orchestra/sprint-reporter*) 0 fail
- 4 yeni dosyanın her biri <600 satır (2132/4 = 533 target)

**Kanıt:** `wc -l src/orchestra/sprint-reporter.ts src/orchestra/sprint-metrics.ts src/orchestra/sprint-retro-writer.ts src/orchestra/sprint-docs-updater.ts src/orchestra/ci-reporter.ts` → her yeni dosya 300-700 satır, sprint-reporter.ts <200 satır (thin barrel)

**Test:** Mevcut `tests/orchestra/sprint-reporter*` test'leri 0 fail (regression koruma). Yeni test gerekmez, split pure refactor

---

## Task 10: sprint-controller.ts IPC + Finalize Extraction
- Model: opus
- Effort: high
- Agent: refactorer
- Skills: system-architect, typescript-expert
- Files: src/orchestra/sprint-controller.ts, src/orchestra/ipc-registry.ts, src/orchestra/sprint-finalizer.ts
- Scope: src/orchestra/
- Dependencies: 134-009

### Description
Sprint 132 W5 HIGH #2 — sprint-controller.ts 2133 satır, ~62 cyclomatic complexity. Pure refactor. Extract:

- **ipc-registry.ts** — WorkerQuestion/BrainAnswer routing, file-based + IPC fallback, `askBrain()` helper
- **sprint-finalizer.ts** — `finalizeSprint()`, `archiveDirectives()` çağrısı, cleanup coordination, **Task 13 ve Task 15'in üstüne inşa edeceği hook'lar exposed**: `runHonestyCheck()`, `writeRubricDetail()`, `runSelfAuditGate()` placeholder fonksiyonları (bu sprintte boş stub, Task 13/15 dolduracak)
- `sprint-controller.ts` → `runSprint()` orchestration only, diğer her şey re-export veya delegate

**Gereksinimler:**
- Mevcut `askBrain()` happy path + file-based fallback çalışmaya devam etmeli
- `finalizeSprint()` mevcut davranışı korumalı + Task 15 gate çağrısı hook'u hazır
- **Auto-archive canlı testi:** Sprint 134 sonunda `archiveDirectives('sprint-134')` gerçek koşulda ilk kez çalışacak → `.brain/archive/DIRECTIVES-sprint-134.md` oluşmalı, `DIRECTIVES.md` placeholder olmalı
- Mevcut `tests/orchestra/sprint-controller*` test'leri 0 fail

**Kanıt:** `ls src/orchestra/ipc-registry.ts src/orchestra/sprint-finalizer.ts` → exists. `grep -n "runSelfAuditGate\|runHonestyCheck\|writeRubricDetail" src/orchestra/sprint-finalizer.ts` → 3 stub exported

**Test:** Mevcut sprint-controller test'leri + yeni test: (1) ipc-registry `askBrain()` happy path, (2) file-based fallback, (3) sprint-finalizer stub exports call-safe

---

## Task 11: Local Observability Seviye 2 + Sprint 134 Canlı Ölçüm
- Model: opus
- Effort: high
- Agent: architect
- Skills: typescript-expert, performance-optimizer
- Files: src/core/observability.ts, src/orchestra/sprint-controller.ts, src/orchestra/result-collector.ts
- Scope: src/core/, src/orchestra/
- Dependencies: 134-001

### Description
Kullanıcının kendi gözlemi için lightweight local observability. **Data locality zorunlu** — her şey kullanıcı makinesinde, dış telemetri YOK.

**src/core/observability.ts (yeni dosya):**
- `metric(name: string, value: number, tags?: Record<string, string>): void` — counter/gauge, `.deckent/metrics.jsonl` append
- `trace<T>(operation: string, fn: () => Promise<T>): Promise<T>` — span wrapper, hrtime.bigint() kullan
- `structuredLog(level, message, context): void` — pino-compatible JSON format
- `generateLoadReport(): Promise<string>` — `.deckent/metrics.jsonl` → markdown report üretimi

**Data locality hard contract:**
- ZERO network calls — testlerde `net.connect` mock throws
- `telemetry_enabled: false` hard-coded
- Tüm çıktı `.deckent/metrics.jsonl` (append-only, line-delimited JSON)

**Instrument points (sprint-controller.ts ve result-collector.ts):**
- `spawnWorkers` — `metric("wave.start", 0, { wave, count })`
- `waitForResults` — `trace("wait_results", ...)`
- `evaluateResult` — per-task `metric("eval.duration_ms", ms, { taskId })`
- `loadConfig` — cache hit/miss
- `claimTask` — file lock wait time
- `heartbeat_stale` — T-003 validation
- `honesty_check` — T-005 integration
- `wave_transition` — T-001 dep pipeline dogfood

**Report contract:**
- Sprint finalize sonrası `generateLoadReport()` → `docs/audits/sprint-134/load-test-report.md`
- Format: wave timeline, p50/p95/p99 per operation, file lock histogram, kritik path analizi

**Kanıt:** `ls src/core/observability.ts docs/audits/sprint-134/load-test-report.md` → ikisi de exists (rapor sprint sonrası üretilir). `grep -n "metric\\|trace\\|structuredLog" src/orchestra/sprint-controller.ts` → hit

**Test:** 10+ test — (1) metric roundtrip, (2) trace span start/end + exception capture, (3) structuredLog JSON format, (4) `.deckent/metrics.jsonl` append-only line-delimited, (5) data locality: net.connect mock → no calls, (6) generateLoadReport happy path, (7) spawnWorkers instrument integration, (8) wave.transition metric T-001 dogfood, (9) p50/p95/p99 hesaplama 100 sample, (10) file lock histogram bucket distribution

---

## Task 12: ADR-034 Multi-Project Isolation + Symlink Scope Fix
- Model: opus
- Effort: normal
- Agent: architect
- Skills: system-architect, security-specialist
- Files: .brain/DECISIONS.md, docs/design/multi-project-isolation.md, src/agents/worker.ts
- Scope: .brain/, docs/design/, src/agents/

### Description
**KRİTİK AYIRIM:** Bu task SaaS multi-tenant **DEĞİL**. "Tek kullanıcının aynı makinede birden fazla projesi arasında güvenlik" anlamına gelir.

**ADR-034 Multi-Project Isolation (.brain/DECISIONS.md):**
- Format ADR-029..033 ile aynı (Title, Status ACCEPTED, Date 2026-04-11, Context, Decision, Consequences, Alternatives, References)
- Explicit ayırım: "multi-project ≠ SaaS multi-tenant" — 10.000 tenant'ın paylaştığı sunucu senaryosu yasak
- Per-project credential isolation (Sprint 133 AES-256-GCM per-project key)
- `.deckent/`, `.brain/`, `.tasks/` per-project isolation (zaten var, formalize)
- Global state sharing denetimi: hangi config paylaşılır, hangi proje-özgü
- ≥100 satır

**docs/design/multi-project-isolation.md (yeni):**
- Design doc, ≥250 satır
- Threat model: sibling project scope bypass, credential leakage, global state pollution
- Mitigation patterns
- Test strategy

**Symlink Scope Bypass Fix (Sprint 132 W1 MEDIUM #10):**
- `src/agents/worker.ts` scope check: symlink takip edilirse target path scope içinde mi kontrol et
- `fs.realpath()` ile resolve + scope matcher
- Minimum kod değişikliği — doküman task'ın küçük bir practical mitigation'ı

**Kanıt:** `grep -c "^## ADR-034" .brain/DECISIONS.md` → 1. `ls docs/design/multi-project-isolation.md` → exists. `grep -n "realpath" src/agents/worker.ts` → hit

**Test:** 3+ test — (1) symlink scope içinde target → allow, (2) symlink scope dışında target → deny, (3) recursive symlink detection (cycle)

---

## Task 13: RETRO Rubric Detail Injection
- Model: sonnet
- Effort: low
- Agent: doc-writer
- Skills: typescript-expert, documentation-writer
- Files: src/orchestra/sprint-retro-writer.ts, src/orchestra/sprint-finalizer.ts
- Scope: src/orchestra/
- Dependencies: 134-010

### Description
Sprint 133 retro #5: `evaluateWithRubric()` sonuçları RETRO.md'ye yansımıyor. "12 done" yazılıyor ama rubric scores (correctness, test_coverage, scope_compliance, documentation) görünmüyor. `sprint-retro-writer.ts` içindeki retro formatter'ı güncelle:

**Gereksinimler:**
- RETRO.md'ye yeni section: "### Rubric Scores (Sprint 134)" — her task için table row
- Columns: `| Task | Correctness | Coverage | Scope | Docs | Avg |`
- Overall sprint avg hesaplanmalı ve gösterilmeli
- `sprint-finalizer.ts`'in `writeRubricDetail()` stub'ını bu task dolduruyor (Task 10'dan hook)

**Kanıt:** `grep -n "Rubric Scores\|writeRubricDetail" src/orchestra/sprint-retro-writer.ts src/orchestra/sprint-finalizer.ts` → hit

**Test:** 3+ test — (1) writeRubricDetail mock taskResults → doğru table format, (2) boş rubric → N/A sütunları, (3) avg hesaplama

---

## Task 14: Brain Self-Audit Gate (P3)
- Model: opus
- Effort: normal
- Agent: architect
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/sprint-finalizer.ts, src/orchestra/result-evaluator.ts
- Scope: src/orchestra/
- Dependencies: 134-010

### Description
`finalizeSprint()` son aşaması — brain kendi sprint'ini denetler. Task 10'un `runSelfAuditGate()` stub'ını dolduruyor.

**Gate kontratı:**
```typescript
interface SelfAuditResult {
  tsc: { status: "PASS" | "FAIL"; errors: string[] };
  vitest: { status: "PASS" | "FAIL"; delta: { files: number; pass: number; fail: number; skipped: number } };
  honesty: { violations: number; flaggedTasks: string[] };
  observability: { metricsJsonlExists: boolean; lineCount: number };
  overallGate: "PASS" | "GATE_FAILURE";
}

async function runSelfAuditGate(sprintId: string): Promise<SelfAuditResult>
```

**Gate steps:**
1. `npx tsc --noEmit` (timeout 90s)
2. `npx vitest run --reporter=basic` (timeout 300s) + baseline delta hesaplama
3. Honesty violation count (Task 5 baseline'dan)
4. `.deckent/metrics.jsonl` existence + line count (Task 11 validation)

**Status propagation:**
- Gate FAIL → sprint status = `GO_WITH_GATE_FAILURE` (yeni status, result-evaluator.ts'ye ekle)
- Retro'ya gate failure detay yazılır
- metrics.jsonl missing → WARNING, gate FAIL değil (Task 11 NO_GO olsa bile sprint devam etmeli)

**Kanıt:** `grep -n "runSelfAuditGate\|GO_WITH_GATE_FAILURE\|SelfAuditResult" src/orchestra/sprint-finalizer.ts src/orchestra/result-evaluator.ts` → hit

**Test:** 5+ test — (1) happy path (all PASS), (2) tsc fail → GATE_FAILURE + errors, (3) vitest fail → GATE_FAILURE + delta, (4) honesty violation → GATE_FAILURE, (5) metrics.jsonl missing → WARNING (not fail)

---

## Task 15: Competitive Analysis Refresh + Sprint 134 Post-Sprint Updates
- Model: haiku
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/analysis/competitive-analysis.md
- Scope: docs/analysis/

### Description
Sprint 133'te competitive analysis Nisan 2026'ya güncellenmişti. Sprint 134'ün **product-not-service vision launch** olayını rakip tablosuna yansıt:

- "Deckent 2026-04-11 itibariyle product-not-service manifesto'sunu resmileştirdi" notu ekle
- ADR-033 ve ADR-034 referansları
- Rakip kategorileri: Devin (SaaS KARŞI), OpenHands (open-source MÜTTEFİK), Cursor (IDE KARŞI), Copilot (Microsoft KARŞI), OpenClaw (Docker REFERANS), Aider (CLI MÜTTEFİK)
- Deckent pozisyonu: OpenClaw'un kur-çalıştır kolaylığı + OpenHands open-source ruhu + Deckent sprint orchestration benzersizliği

**Kanıt:** `grep -i "product-not-service\|ADR-033\|ADR-034" docs/analysis/competitive-analysis.md` → hit

**Test:** Doküman task, test gerekmiyor

---

## Sprint 134 Notları

- **max_workers=4** (hard limit per `feedback_max_workers.md`)
- **brain_planning: structured** (deterministic DIRECTIVES parse)
- **worker_tier: premium** (opus default, task başı override ile sonnet/haiku)
- **dependency_pipeline_enabled:** Sprint start'ta false, Task 1 DONE sonrası brain true'ya çeker (two-phase spawn)
- **verify_loop:** active (her worker tsc + vitest)
- **telemetry_enabled:** false (hard-coded, data locality)
- **auto_archive_directives:** true (Sprint 134 sonunda canlı ilk test)
- **Pre-sprint gate:** baseline vitest 2026-04-11 13:26 → 500 files, 12372 pass, 16 skipped, 91.6s
- **Critical path:** Task 1 → Task 9 → Task 10 → Task 14 (~190dk minimum)
- **Scope kesme eşiği:** 5 saat Deckent execution → Task 8 + Task 12 (symlink parçası) defer hakkı
- **External monitoring:** Watchdog 15s + Verifier 45s + Shell Watchdog 60s (3 agent, sync sleep chain)
- **Acceptance:** Layer 3 tam doğrulama (tsc + vitest + grep + 17-kriter scoring)
- **Design spec:** `docs/superpowers/specs/2026-04-11-sprint-134-design.md` (final design, 452 satır)
- **Fallback plan:** `docs/superpowers/plans/2026-04-11-sprint-134-plan.md` (bite-sized TDD manuel rescue)
