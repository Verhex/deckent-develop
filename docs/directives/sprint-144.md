# DIRECTIVES — Sprint 144: God Split + ADR-008 Cycle 2 + Performans + Operasyonel HIGH

## Goal

Mimari temizlik sprint. 4 god object (init.ts 1552→<400, doctor.ts 1069→<500, retro.ts 453→<200, worker.ts 1669→<500) bölünür. ADR-008 Cycle 2 çözülür (core/session-interface.ts çıkar, Provider↔Connector↔tmux 7-node cycle kırılır). Auditor async scan (52 sync I/O elimine, latency 30s→<5s). 29 ölü dosya silinir (audit ile doğrulama, Karar 1-B+A hibrit). i18n temel (5 CLI komut TR/EN). 6 operasyonel HIGH canlı. Test A baseline (Memory V2 CLI + heartbeat-daemon + mid-sprint-adapter + ci-reporter +64 test).

**Spec:** `docs/superpowers/specs/2026-04-17-sprint-143-144-145-zincir-reform-design.md` § 3
**Plan:** `docs/superpowers/plans/2026-04-17-sprint-144-implementation-plan.md`

**Süre hard cap:** 5h | **Cost budget:** $100 (subs mode, gate threshold) | **Opus task:** 16/21, **Sonnet task:** 5/21 (P2).

---

## Cross-Cutting Rules

1. **Opus-only P0/P1:** 16 task opus zorunlu. 5 P2 task'ta sonnet OK (T-144-009 docker, T-144-010 i18n temel, T-144-011 Türkçe locale, T-144-012 redact taşı, T-144-018 rich output).
2. **MVP yasak** + **Core bozulamaz** + **Chain safety gate** (Sprint 143 ile aynı).
3. **God split regresyon koruması:** Her split task'ta mevcut test dosyaları yeni modüllere dağıtılır + eski test'ler PASS kalır.

---

## Task 1: init.ts Split (1552 → 4 dosya)
- Model: opus | Effort: high | Agent: refactorer | Skills: typescript-expert, system-architect
- Files: src/cli/commands/init.ts (thin), init-steps.ts (yeni), init-templates.ts (yeni), init-wizard.ts (yeni), tests/cli/init*.test.ts split
- Scope: src/cli/commands/, tests/cli/

### Description
init.ts 620 satır monolit handler → 4 modül (her biri ≤400 LoC). Router (argument + flow), steps (DB preload T-143-009 dahil, git init, config write, rule gen T-143-011 çağrısı), templates (CLAUDE/DECKENT/AGENTS/DIRECTIVES/BOOT), wizard (interactive prompts). tests/cli/init.test.ts (2270 LoC) 4 dosyaya bölünür.

**Kanıt:** `wc -l src/cli/commands/init*.ts` → her biri <400. `deckent init /tmp/test-144` PASS.
**Test:** Mevcut 2270 LoC split + 10+ yeni unit test per modül.

---

## Task 2: doctor.ts Split (1069 → 3 dosya)
- Model: opus | Effort: high | Agent: refactorer | Skills: typescript-expert
- Files: src/cli/commands/doctor.ts (thin), doctor-checks.ts (yeni), doctor-format.ts (yeni), tests/
- Scope: src/cli/commands/, tests/cli/

### Description
Router + checks (memoryDb, adrs, gitignore T-143-003, fts5Integrity T-143-006, brainHealth, workers, docker, tsc, vitest, cost) + format (table/JSON/plain). DEBT.md V1 parse kaldırılır (Memory V2 migration). Her check typed `CheckResult`.

**Kanıt:** `wc -l src/cli/commands/doctor*.ts` her biri <500. `grep -n "readFileSync.*DEBT.md" src/cli/commands/doctor*.ts` → 0.
**Test:** Split + 20+ yeni (her check için).

---

## Task 3: retro.ts Split (453 → 3 dosya)
- Model: opus | Effort: normal | Agent: refactorer | Skills: typescript-expert
- Files: src/cli/commands/retro.ts (thin), retro-parser.ts (yeni), retro-formatter.ts (yeni), tests/
- Scope: src/cli/commands/, tests/cli/

### Description
RETRO.md V1 parse kaldırılır → `store.getByType('retro')`. Parser (sprint range query, cross-reference via relations T-143-007). Formatter (plain/JSON/markdown).

**Kanıt:** `wc -l retro*.ts` her biri <200. V1 parse 0.
**Test:** Split + 8 yeni.

---

## Task 3b: worker.ts Split (1669 → 4 dosya)
- Model: opus | Effort: high | Agent: refactorer | Skills: typescript-expert
- Files: src/agents/worker.ts (thin), worker-verify.ts (yeni), worker-lifecycle.ts (yeni), worker-log.ts (yeni), tests/ (8→8+ split)
- Scope: src/agents/, tests/agents/

### Description
worker.ts God Object → 4 modül (router<500, verify = tsc+vitest loop, lifecycle = claim/heartbeat/lock/result, log = structured debugLog). 5 @deprecated delege fonksiyonu **tamamen silinir**. T-144-012 sonrası redactSensitive core'dan import.

**Kanıt:** `wc -l src/agents/worker.ts` <500. @deprecated fonksiyon 0. `grep -n "from.*cli.*helpers" src/agents/` → 0.
**Test:** Split + 15+ modül-specific.

---

## Task 4: ADR-008 Cycle 2 Fix — core/session-interface.ts
- Model: opus | Effort: high | Agent: architect | Skills: typescript-expert, system-architect
- Files: src/core/session-interface.ts (yeni), src/providers/claude.ts, codex.ts, gemini.ts, src/orchestra/connector.ts, tmux.ts, tests/
- Scope: src/core/, src/providers/, src/orchestra/, tests/

### Description
`SessionInterface` core/'a çıkarılır. Provider'lar sadece interface'e bağımlı (tmux implementation bilmiyor). connector.ts `tmuxSessionAdapter: SessionInterface` impl. 7-node cycle (Provider↔Connector↔tmux↔claude/codex/gemini) kırılır.

**Kanıt:** `madge --circular src/` → Cycle 2 **YOK**. `grep -l "from.*orchestra/tmux" src/providers/*.ts` → 0.
**Test:** 12+ test (interface contract, 3 provider, connector impl).

---

## Task 5: Auditor Async Scan Loop (52 Sync I/O Elimine)
- Model: opus | Effort: high | Agent: performance-analyzer | Skills: performance-optimizer, typescript-expert
- Files: src/agents/auditor.ts, src/orchestra/heartbeat-daemon.ts, tests/
- Scope: src/agents/, src/orchestra/, tests/

### Description
Tüm sync I/O async → `fs.promises.*`, `spawn` (stream-based). Parallel `Promise.all([...])`. 30s→<5s latency target (100 worker scenario).

**Kanıt:** `npm run bench:auditor` <5s.
**Test:** 15+ test (async path, benchmark, concurrent).

---

## Task 6: Ölü Kod Silme Wave A (Agent + V1 Routing, 17 dosya, 2780 LoC)
- Model: opus | Effort: high | Agent: refactorer | Skills: code-simplifier
- Files: 13 agent dosyası + 4 V1 routing (decision-engine, decision-replay, agent-step, scope-step) + testler
- Scope: src/agents/, src/orchestra/, tests/

### Description
Her dosya için pre-silme audit: `grep -rn "<filename>" src/ tests/ scripts/` → 0. Retro'ya audit trail (purpose, successor, why died). Git batch delete. Barrel exports temizlenir.

**Kanıt:** `git diff --stat` ≥17 dosya delete. Build + tests PASS.
**Test:** Build + regresyon suite.

---

## Task 7: Ölü Kod Silme Wave B (Orchestra Sahipsiz + Feature Flag, 12 dosya, 2139 LoC)
- Model: opus | Effort: high | Agent: refactorer | Skills: code-simplifier
- Files: multi-agent.ts, handoff-protocol.ts, batch-stats.ts, metrics-updater.ts, learning-decay.ts, learning-migration.ts, combination-scorer.ts, brain-context.ts + feature flag dead (adaptiveAgentEnabled, sharedMemoryEnabled, PreloadConfig)
- Scope: src/orchestra/, src/core/, tests/

### Description
Karar 1-B+A hibrit (Direktif 15 "detaylı çalışma"). Her dosya için: git log ile purpose, V2 successor varsa reference, hâlâ kullanılıyor mu grep. Retro'da 12 dosya audit trail. Feature flag type'ları silinir.

**Kanıt:** `git diff --stat` ≥12 delete. `grep -rn "adaptiveAgentEnabled\|sharedMemoryEnabled\|PreloadConfig" src/` → 0.
**Test:** Build + regresyon.

---

## Task 8: file-lock + deck-file + credentials (Security + Perf)
- Model: opus | Effort: normal | Agent: security-auditor | Skills: security-specialist, performance-optimizer
- Files: src/core/file-lock.ts, deck-file.ts, credentials.ts, tests/core/
- Scope: src/core/, tests/core/

### Description
file-lock.ts path traversal sanitize (`.. → _`). deck-file.ts `0o644 → 0o600`. credentials.ts `getMasterKey` cache (5min TTL + invalidate on rotation).

**Kanıt:** file-lock path traversal test PASS. `ls -la .deck/*` `-rw-------`. Cache hit rate ≥99%.
**Test:** 10+ test.

---

## Task 9: Dockerfile Hardening
- Model: sonnet | Effort: normal | Agent: devops-engineer | Skills: docker-expert, devops-engineer
- Files: Dockerfile, .dockerignore, tests/docker/
- Scope: ., tests/docker/

### Description
Multi-stage build (builder + runtime). `USER deckent` (UID 10001). HEALTHCHECK. Image size <400MB.

**Kanıt:** `docker run deckent:144 whoami` → `deckent`. Image size <400MB.
**Test:** 5+ Docker integration test.

---

## Task 10: i18n Temel CLI (5 komut TR/EN)
- Model: sonnet | Effort: normal | Agent: refactorer | Skills: typescript-expert
- Files: src/cli/helpers/messages.ts, i18n.ts (yeni), init.ts, start.ts, status.ts, help.ts, doctor.ts, tests/
- Scope: src/cli/, tests/cli/

### Description
Dashboard i18n pattern CLI'ya port. `LANG=tr` → TR, default EN fallback. 5 komut × her mesaj TR/EN parity.

**Kanıt:** `LANG=tr deckent init` → TR. `LANG=en deckent init` → EN.
**Test:** 12+ test.

---

## Task 11: Türkçe Locale Fix
- Model: sonnet | Effort: low | Agent: bug-fixer | Skills: typescript-expert
- Files: src/orchestra/managed-docs/content-generators.ts, section-updater.ts, baseline-tracker.ts, tests/
- Scope: src/orchestra/, tests/orchestra/

### Description
3 dosyada `.toLowerCase()` → `.toLocaleLowerCase('tr-TR')`. İ/ı doğru dönüşüm.

**Kanıt:** `grep -n "\.toLowerCase()" src/orchestra/` ilgili 3 dosyada 0.
**Test:** 6 test (İ/ı/I/i kombinasyonları).

---

## Task 12: redactSensitive CLI → core taşı
- Model: sonnet | Effort: low | Agent: refactorer | Skills: typescript-expert
- Files: src/core/redact-sensitive.ts (yeni), src/cli/helpers/output.ts, src/agents/worker.ts, tests/
- Scope: src/core/, src/cli/helpers/, src/agents/, tests/

### Description
Fonksiyonu CLI→core taşı. worker.ts ADR-008 ihlali düzeltilir.

**Kanıt:** `grep -rn "from.*cli.*helpers" src/agents/` → 0.
**Test:** Mevcut + 2 regression.

---

## Task 13: Docker HB Deploy Wire (Sprint 139 Fix Canlı)
- Model: opus | Effort: normal | Agent: devops-engineer | Skills: docker-expert
- Files: src/orchestra/spawn-backend-docker.ts, heartbeat-daemon.ts, tests/docker/
- Scope: src/orchestra/, tests/docker/

### Description
Sprint 139 T-013 runtime wire: atomicWriteFileSync + SIGTERM 15s grace + fsync hook. Docker 10-e2e suite.

**Kanıt:** Docker E2E 10/10 PASS. HB gap <5s.
**Test:** 10 E2E.

---

## Task 14: Event Stream Emit Wire
- Model: opus | Effort: normal | Agent: architect | Skills: typescript-expert
- Files: src/orchestra/event-stream.ts, sprint-controller.ts, src/agents/worker.ts, auditor.ts, tests/
- Scope: src/orchestra/, src/agents/, tests/

### Description
Sprint 138 foundation wire: Brain (PHASE_TRANSITION, SPRINT_START/END, FIX_CYCLE), Worker (TASK_CLAIM, HEARTBEAT, RESULT_WRITE, VERIFY_FAIL), Auditor (ADR_VIOLATION, BOUNDARY_VIOLATION, STALE_HEARTBEAT). T-143-016 notification dispatcher tetikleyici.

**Kanıt:** `.deckent/sprint-144-events.jsonl` ≥200 event.
**Test:** 10+ test.

---

## Task 15: Sprint-State Lifecycle (pid manager)
- Model: opus | Effort: normal | Agent: bug-fixer | Skills: typescript-expert
- Files: src/orchestra/sprint-pid-manager.ts, sprint-finalizer.ts, tests/
- Scope: src/orchestra/, tests/orchestra/

### Description
`.deckent/pids/` sadece canlı sprint. Sprint bitimi → önceki sprint pid sil. Stale pid detection (`kill -0` fail).

**Kanıt:** Sprint 144 biterken `.deckent/pids/*sprint-143*` → 0.
**Test:** 6 test.

---

## Task 16: Retro sprint-id Normalize
- Model: opus | Effort: low | Agent: bug-fixer | Skills: typescript-expert
- Files: src/orchestra/sprint-retro-writer.ts, src/core/memory-store.ts, tests/
- Scope: src/orchestra/, src/core/, tests/

### Description
Canonical `retro-sprint-NNN` id, alias `retro-latest` view query. `retro-latest` entry migrate edilir, sonra silinir.

**Kanıt:** `sqlite3 .brain/memory.db "SELECT id FROM entries WHERE type='retro'"` → sprint-specific.
**Test:** 6 test.

---

## Task 17: Orphan Cleanup (.tasks + locks) + Pre-flight
- Model: opus | Effort: normal | Agent: bug-fixer | Skills: typescript-expert
- Files: src/orchestra/sprint-finalizer.ts, src/orchestra/sprint-controller.ts, src/core/orphan-cleaner.ts (yeni), tests/
- Scope: src/orchestra/, src/core/, tests/

### Description
**İki mod:** post-finalize (mevcut tasarım) + **pre-flight** (yeni, Sprint 143 lesson learned 2026-04-17).

**Post-finalize:** Sprint bitiminde `.tasks/task-*.json` DONE/NO_GO archive. PENDING/EXECUTING korunur (T-143-013 uyumlu). `.locks/` stale (>5min) detection.

**Pre-flight (yeni):** `deckent_start` → `runSprint()` PLAN phase ÖNCESİ `preflightOrphanCleanup(root, currentSprintId)` çağrısı. Current sprintId dışı tüm task dosyaları `archive/sprint-<N>/` altına grup halinde taşınır. Başka canlı sprint pid varsa SKIP (safety).

**Sprint 143 kanıtı:** Sprint 142 manuel finalize sonrası 255 task dosyası `.tasks/` altında kaldı → Sprint 143 start ederken Alperen elle `mv` ile temizledi. Bu fix Sprint 145 start ederken canlı olacak (Sprint 144 biterken T-144-017 wire edilmiş olur).

**Kanıt:**
- Sprint 144 sonrası `.tasks/` arşiv manifest + `.locks/` boş
- Sprint 145 start ederken pre-flight otomatik çalışıyor, Sprint 144 task'ları archive/sprint-144/'e taşınıyor
- Başka canlı sprint pid active → pre-flight SKIP

**Test:** 12 test (4 post-finalize: PENDING preserved, DONE archive, lock stale, happy + 4 pre-flight: orphan detect, archive move, safety skip, multi-orphan group + 4 integration).

---

## Task 18: Rich Sprint Output (7-section summary)
- Model: sonnet | Effort: normal | Agent: doc-writer | Skills: documentation-writer
- Files: src/cli/helpers/sprint-summary-rich.ts, src/cli/commands/retro.ts, tests/
- Scope: src/cli/, tests/cli/

### Description
ADR-020 7-section: overview, task results, agent/skill perf, dependency map DOT, cost breakdown, ADR compliance score, recommendations.

**Kanıt:** `deckent retro --sprint=144 --rich` 7-section output.
**Test:** 8 test.

---

## Task 19: Test — Memory V2 CLI (+40 test)
- Model: opus | Effort: normal | Agent: test-writer | Skills: testing-expert
- Files: tests/cli/recall.test.ts, remember.test.ts, memory.test.ts, tests/mcp/memory-query.test.ts
- Scope: tests/cli/, tests/mcp/

### Description
4 kritik dosya 0 test → ≥10 test/dosya. Happy, edge, error, integration with MemoryStore + T-143-006 mode + T-143-007 relations.

**Kanıt:** vitest +40 test PASS. Coverage ≥90%.
**Test:** 40+ test.

---

## Task 20: Test — heartbeat-daemon + mid-sprint-adapter + ci-reporter (+24 test)
- Model: opus | Effort: normal | Agent: test-writer | Skills: testing-expert
- Files: tests/orchestra/heartbeat-daemon.test.ts, mid-sprint-adapter.test.ts, ci-reporter.test.ts
- Scope: tests/orchestra/

### Description
3 kritik orchestra dosya 0 test → ≥8 test/dosya. heartbeat execSync whitelist (T-143-020), stale, respawn. mid-sprint rerouting. ci-reporter DB upsert (T-143-008).

**Kanıt:** vitest +24 test PASS. Coverage ≥85%.
**Test:** 24+ test.

---

## Sprint 144 Sonu — Chain Safety Gate

Otomatik 5-check + özel Sprint 144 validation:
- `madge --circular src/` → Cycle 2 **YOK**
- `wc -l` init/doctor/retro/worker her biri <500
- `git diff --stat` ≥29 dosya delete (ölü kod)

PASS → Sprint 145 auto-trigger. FAIL → ABORT + Alperen push.
