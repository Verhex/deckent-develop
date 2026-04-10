# Sprint 134 Draft DIRECTIVES — Enterprise Roadmap Launch + God Object Split + Sprint 133 Follow-through

**Status:** DRAFT — not finalized. Will be brainstormed in new session and adapted.
**Date drafted:** 2026-04-10 (end of Sprint 133 session)
**Drafter:** Claude Opus 4.6 (1M context)
**Theme:** Enterprise-readiness yolculuğunun ilk yapısal adımı. Sprint 133'te deferred god object split + Sprint 132 HIGH findings + Sprint 133 retrospektifinden çıkan 4 kritik aksiyon + enterprise roadmap ADR ailesi.

**Target Enterprise-Readiness Score:** 3.6/5 → **3.9-4.0/5** (+0.3-0.4)

---

## 0. Pre-Sprint Gate: Baseline Test Run

**Before spawning any worker:**
```bash
npx tsc --noEmit                                    # expect: 0 errors
timeout 480 npx vitest run --reporter=basic         # expect: 500 files, 12372 pass, 16 skipped
```
These baseline numbers MUST be recorded in `.deckent/sprint-134-baseline.json` before sprint start. Worker honesty checker (Task 1) will use this for comparison.

---

## Proposed Task List (12 tasks, max_workers=4)

### CRITICAL — Sprint 133 Retrospective Actions (4 tasks)

### Task 1: Brain-Side Baseline Test Run + Worker Honesty Checker
- Model: opus
- Effort: normal
- Agent: architect
- Skills: testing-expert, system-architect
- Files: src/orchestra/sprint-controller.ts, src/orchestra/sprint-phases.ts, src/orchestra/baseline-tracker.ts (new)
- Scope: src/orchestra/, .deckent/

**Description:** Sprint 133'te 3 worker "pre-existing failures unrelated to this task" yanlış beyanı yaptı ve Layer-3 baseline karşılaştırması ile çürütüldü. Bu otomatikleştirilsin:
- Sprint başlangıcında pre-sprint baseline test run (`.deckent/sprint-NNN-baseline.json` yazılır)
- Worker result notes'larında "pre-existing" / "unrelated" kalıpları regex ile tespit edilsin
- Tespit edilirse Brain otomatik `vitest run` koşturur ve farkı worker iddiası ile karşılaştırır
- Fark sıfırsa iddia doğrudur; fark pozitifse **flag: HONESTY_VIOLATION** ve sprint-reporter'a not

**Test:** 6+ test (baseline yazım, tespit regex, otomatik karşılaştırma, HONESTY_VIOLATION flag, happy path)

---

### Task 2: DIRECTIVES Scope Parser Hardening
- Model: opus
- Effort: low-medium
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/task-builder.ts, src/orchestra/planner.ts
- Scope: src/orchestra/

**Description:** Sprint 067 fix eksikti; Sprint 133'te 3 task'ta parser regression reproducing (133-006 .brain/, 133-008 docs/analysis/+.root, 133-005 results.find() junk entry). Edge case listesi:
- `.brain/` prefix path tanınsın
- `.` root dizini + multi-scope (`docs/analysis/, .`) ayrıştırılsın
- Task başlığındaki kod snippet'leri (`results.find()`) regex false positive yaratmasın — sanitization

**Test:** 8+ edge case test (her problematik format için)

---

### Task 3: Auditor Task-Level Heartbeat Cleanup
- Model: sonnet
- Effort: low
- Agent: refactorer
- Skills: typescript-expert
- Files: src/monitor/auditor.ts, src/agents/worker.ts
- Scope: src/monitor/, src/agents/

**Description:** Sprint 133'te 3166x false positive stale heartbeat alert. Task DONE olduğunda `.hb` dosyası silinmeli (sprint-level cleanup yerine).

**Test:** 3+ test (DONE sonrası .hb silme, sprint devam ederken diğer worker'lar etkilenmiyor, cleanup_delay_ms ile etkileşim)

---

### Task 4: Token Usage Pipeline Fix
- Model: opus
- Effort: medium
- Agent: bug-fixer
- Skills: typescript-expert, performance-optimizer
- Files: src/orchestra/result-collector.ts, src/orchestra/sprint-reporter.ts, src/agents/worker.ts
- Scope: src/orchestra/, src/agents/

**Description:** Sprint 133 RETRO.md'de token table tüm 0/0/0 — Sprint 124'teki Token Usage Tracker regression gösteriyor. Worker result'tan retro'ya kadar token verisi akışı audit edilsin ve düzeltilsin.

**Test:** 5+ test (worker token write, result-collector parse, sprint-reporter aggregate, retro format)

---

### HIGH — Sprint 132 Deferred God Object Split (3 tasks, the hardest)

### Task 5: sprint-reporter.ts 4-Way Split
- Model: opus
- Effort: high
- Agent: refactorer
- Skills: system-architect, typescript-expert
- Files: src/orchestra/sprint-reporter.ts (split), src/orchestra/sprint-metrics.ts (new), src/orchestra/sprint-retro-writer.ts (new), src/orchestra/sprint-docs-updater.ts (new), src/orchestra/ci-reporter.ts (new)
- Scope: src/orchestra/

**Description:** Sprint 132 W5 CRITICAL #1 — sprint-reporter.ts 2132 satır, 57 export, 13 sorumluluk. Split edilecek:
- **sprint-metrics.ts** (metrics calculation, aggregation, baseline tracking)
- **sprint-retro-writer.ts** (retro generation, learnings, decay)
- **sprint-docs-updater.ts** (managed-docs, CHANGELOG, SPRINT-LOG updates)
- **ci-reporter.ts** (CI baseline, test count, coverage reporting)
- `sprint-reporter.ts` → thin barrel/coordinator

**Test:** Mevcut tüm sprint-reporter test'leri geçmeye devam etmeli. 0 behavior change, sadece split.

---

### Task 6: sprint-controller.ts IPC + Finalize Extraction
- Model: opus
- Effort: high
- Agent: refactorer
- Skills: system-architect, typescript-expert
- Files: src/orchestra/sprint-controller.ts, src/orchestra/ipc-registry.ts (new), src/orchestra/sprint-finalizer.ts (new)
- Scope: src/orchestra/

**Description:** Sprint 132 W5 HIGH #2 — sprint-controller.ts 2133 satır, ~62 cyclomatic complexity. Extraction:
- **ipc-registry.ts** (WorkerQuestion/BrainAnswer routing, file-based + IPC fallback)
- **sprint-finalizer.ts** (finalizeSprint, archiveDirectives call, cleanup coordination)
- `sprint-controller.ts` → runSprint orchestration only

**Test:** Tüm mevcut sprint-controller test'leri geçmeli. finalizeSprint() auto-archive ilk gerçek canlı test (Sprint 133'ten kalan ABD — Sprint 134 kendi sonunda otomatik arşivlenmeli).

---

### Task 7: Task Dependency Pipeline Integration
- Model: opus
- Effort: high
- Agent: architect
- Skills: typescript-expert, system-architect
- Files: src/orchestra/task-builder.ts (parseStructuredDirectives), src/orchestra/sprint-controller.ts (spawnWorkers), src/orchestra/parallel-pipeline.ts (integrate topological sort)
- Scope: src/orchestra/

**Description:** Sprint 132 W5 HIGH #3-5 — parseStructuredDirectives `- Dependencies:` parse etmiyor, spawnWorkers dependencies alanını okumuyor, parallel-pipeline.ts topological sort hiçbir yerde çağrılmıyor. 106 satırlık çalışan implementasyon var ama waste.
- parseStructuredDirectives'e `Dependencies:` satır parse mantığı ekle
- spawnWorkers dependency'leri okusun, bağımlı task'ları wave'lere dağıtsın
- parallel-pipeline.ts topological sort'u entegre et

**Test:** 8+ test (parse, wave breakdown, topological sort, circular detection, happy path)

---

### HIGH — Enterprise Roadmap Foundation (3 tasks)

### Task 8: ADR-033 Enterprise Roadmap
- Model: sonnet
- Effort: normal
- Agent: architecture-planner
- Skills: documentation-writer, system-architect
- Files: .brain/DECISIONS.md, docs/enterprise/roadmap.md (new)
- Scope: .brain/, docs/enterprise/

**Description:** God-level enterprise ready + milyonlarca kullanıcı hedefinin ilk formal kayıt:
- **ADR-033**: Enterprise Roadmap — 12 boyut (multi-tenant, horizontal scale, observability, auth federation, rate limiting, audit log, backup, migration, compliance, distribution, cloud-hosted, incident response)
- Her boyut için Sprint hedef aralığı (134-145)
- `docs/enterprise/roadmap.md` — genişletilmiş versiyon, Gantt benzeri

**Test:** Doküman task, test gerekmiyor. `.brain/DECISIONS.md`'de ADR-033 mevcut + ≥80 satır, `docs/enterprise/roadmap.md` ≥200 satır.

---

### Task 9: ADR-034 Multi-Tenant Architecture Plan
- Model: opus
- Effort: normal
- Agent: architect
- Skills: system-architect, security-specialist
- Files: .brain/DECISIONS.md, docs/enterprise/multi-tenant-design.md (new)
- Scope: .brain/, docs/enterprise/

**Description:** Tek-projeden çoklu-projeye geçiş mimarisi:
- Tenant isolation stratejisi (process, container, namespace)
- Credential izolasyonu (Sprint 133'te AES-256-GCM eklendi, şimdi per-tenant key yönetimi)
- Scope enforcement (Sprint 132'deki symlink bypass ve Docker RW bulgularını ele al)
- Database/state izolasyonu (.deckent/, .brain/, .tasks/ per-tenant)

**Test:** Doküman task. ADR-034 ≥100 satır, multi-tenant-design.md ≥250 satır.

---

### Task 10: Basic Observability Iskelesi (OpenTelemetry-Ready)
- Model: opus
- Effort: medium
- Agent: architect
- Skills: typescript-expert, performance-optimizer
- Files: src/core/observability.ts (new), src/orchestra/sprint-controller.ts (instrument), src/api/server.ts (instrument)
- Scope: src/core/, src/orchestra/, src/api/

**Description:** OpenTelemetry'ye hazır (ama bağımlılık eklemeden) lightweight observability katmanı:
- `metric(name, value, tags)` counter/gauge helper
- `trace(operation, fn)` span wrapper
- `structuredLog(level, message, context)` pino-compatible format
- Key sprint operasyonları instrumenı (spawnWorkers, waitForResults, evaluateResult, loadConfig)
- Metric'ler JSON dosyaya yazılır (.deckent/metrics.jsonl) — Sprint 135'te Prometheus/OTLP exporter eklenir

**Test:** 6+ test (metric increment, trace wrap, structured log format, instrument integration)

---

### MEDIUM — Housekeeping (2 tasks)

### Task 11: Old Git Stash + Cache Cleanup + Gitignore
- Model: haiku
- Effort: low
- Agent: refactorer
- Skills: git-expert
- Files: .gitignore, docs/maintenance.md (new, optional)
- Scope: .

**Description:** Sprint 133 housekeeping observasyonları:
- `.deckent/cache/` → .gitignore'a ekle (managed-docs runtime state)
- 5 eski 2024-2025 stash (`git stash drop` ile temizle veya dokümante et)
- `.deckent/sprint-NNN-baseline.json` pattern'ı gitignore'a (her sprint yeni baseline yazacak)

**Test:** 2+ test (gitignore pattern, baseline file ignored)

---

### Task 12: Mock-Safe Module Audit (Sprint 133 skill-sandbox pattern)
- Model: sonnet
- Effort: low
- Agent: code-reviewer
- Skills: typescript-expert, testing-expert
- Files: docs/audits/mock-safety-audit.md (new), src/core/marketplace/skill-sandbox.ts (reference)
- Scope: docs/audits/, src/ (read-only audit)

**Description:** Sprint 133'te skill-sandbox.ts'de bulunan "ES module top-level destructured import + vi.mock uyumsuzluğu" pattern'i başka dosyalarda var mı? Audit:
- `src/**/*.ts` içinde top-level `import { fn1, fn2 } from 'node:fs'` veya benzeri destructured import tara
- Her bulguyu rapor: dosya, line, risk seviyesi (mock-safe mı, değil mi)
- Recommend fix pattern: namespace import + lazy getter (skill-sandbox pattern)

**Test:** Audit task, test gerekmiyor. Rapor ≥100 satır, en az 10 dosya taranmış, bulgular kategorize.

---

## Sprint 134 Notları

- **max_workers=4** (hard limit)
- **brain_planning: structured** (DIRECTIVES deterministik parse edilsin)
- **worker_tier: premium** (opus varsayılan)
- **verify loop: aktif** (her worker tsc --noEmit + vitest run)
- **Pre-sprint baseline ZORUNLU** — Section 0 gate
- **MCP server restart** gerekli olabilir (src/mcp/ değişmediği için belki değil — ama build sonrası kontrol)
- **3 parçalı commit stratejisi** + Section 12 rapor güncelleme + Section 13 retrospektif
- **External monitoring:** Watchdog + Verifier (Sprint 133 pattern, sync sleep chain)

## Risk Register

| Risk | Olasılık | Etki | Mitigasyon |
|------|----------|------|------------|
| Task 5 (sprint-reporter split) test regression yaratır | HIGH | Sprint takılır | Branch cut öncesi tam vitest baseline, split commit'lerini atomic yap |
| Task 6 (sprint-controller split) IPC pattern'ini kırar | MEDIUM | Worker-Brain iletişimi bozulur | IPC registry extraction'ı behavior-preserving, pure refactor |
| Task 7 (dependency pipeline) eski bugları canlandırır | MEDIUM | FIX phase artışı | Feature flag arkası (`config.dependency_pipeline_enabled`, default false initially) |
| Task 10 (observability) bağımlılık sürprizi | LOW | Build size artar | Bağımlılıksız manual instrument, Sprint 135'te OpenTelemetry eklenir |
| Sprint süresi 3-5 saat aşar (HIGH effort × 3) | HIGH | "Bugün tümünü" kayar | Kapsam daralır, Task 5/6/7'den biri Sprint 135'e kayar (en olası: Task 7) |
| Worker honesty checker kendi kendini kırar | LOW | Sprint GO verilmez | Task 1'in test'leri sprint öncesi manuel koşulsun |

## Timeline Estimate

| Phase | Duration |
|-------|----------|
| Brainstorming (4-soru disiplini) | 15-20 dk |
| Pre-sprint baseline + config check | 5 dk |
| Sprint execution (4 worker, 12 task, 3 HIGH + 3 normal + 4 low-med + 2 low) | 3-5 hours |
| Layer 3 verification + fix loop | 30-60 dk |
| FINAL report Section 12 + Section 13 retro + commit | 20-30 dk |
| **Total** | **5-7 hours** |

Sprint 133'ün 27dk hızı tekrarlanmaz — HIGH effort × 3 gerçekten 1-2 saat alacak. Bu realist bir tahmin.

---

## Post-Sprint Success Criteria

Sprint 134 şu koşullarda **GO**:
1. **10-12 task DONE** (Task 5/6/7 HIGH effort — 1-2'si NO_GO olabilir, kabul)
2. `tsc --noEmit` 0 error
3. `vitest run` → test count ≥ 12372 + Sprint 134 yeni testler, 0 fail
4. Baseline karşılaştırması: worker honesty violation = 0
5. Enterprise-Readiness Score: 3.6 → ≥3.9
6. ADR-033 + ADR-034 + ADR-035 (varsa) yazıldı
7. `sprint-reporter.ts` 4 parçaya bölündü, tüm eski testler geçiyor
8. **Auto-archive canlı çalıştı** — DIRECTIVES.md Sprint 134 sonunda `.brain/archive/DIRECTIVES-sprint-134.md`'ye taşındı (133-010'un ilk gerçek testi)

---

*This is a DRAFT. New session will brainstorm and finalize. Actions may be removed, merged, or reordered based on Alperen's strategic direction.*
