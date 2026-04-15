# DIRECTIVES — Sprint 140: Operasyonel Disiplin + Recovery Mechanisms

> Sprint 140 odak: Sprint 139 catastrophic lesson'ları guard rail'lere çevir. 5 P0 (MCP disconnect fix + auto-archive live-sprint guard + Layer 4 runtime wire 4-sprint streak kırma + task file restoration + panic kill runtime guard) + Sprint 139 debt liquidation + crown jewel runtime deploy. Zero manual recovery streak yeniden başla.

## Referanslar
- Sprint 139 manuel scorecard: `.deckent/sprint-139-layer3-scorecard.md` (8 bölüm, disk-evidence based)
- Sprint 139 kapanış memory: `project_sprint139_completed.md`
- Sprint 140 preflight memory: `project_sprint140_preflight.md`
- MCP disconnect investigation: `project_mcp_disconnect_investigation.md`
- Kill approval rule (MUTLAK): `feedback_deckent_kill_approval_required.md`
- Brain memory: `.brain/MEMORY.md` + `.brain/DECISIONS.md` (ADR-037 RBAC + ADR-038 Dead Code + ADR-039 Self-Modifying Sprint 139 canlı)

## Goal: Sprint 139'un delivered +5462 LoC crown jewel kodunu runtime'a deploy et, 4-sprint Layer 4 wire streak'ini kır, MCP disconnect bug'ını çöz, auto-archive catastrophic regression'ı guard rail'e çevir, task file restoration mekanizması kur, panic kill runtime guard ekle. Hedef: Layer 3 ≥13/17, readiness ≥4.10, vitest 0 fail, clean GO, zero manual recovery yeniden başla.

## Pre-flight Notları (Sprint 140 session başlangıcında doldurulacak)
- vitest baseline: TBD (Sprint 139 orphan cleanup sonrası)
- `.brain/DECISIONS.md` ADR count: 39 (Sprint 139 ADR-037 RBAC + ADR-038 Dead Code + ADR-039 Self-Modifying 3 yeni ADR)
- `.tasks/` orphan: 1 JSON + 50 result (Sprint 139 artığı — Task 140-015 cleanup)
- `.dashboard` stuck state "EVALUATE/EVALUATING" (Sprint 139 stuck kalıntısı)
- `src/core/notification-dispatcher.ts` untracked YENİ (Sprint 139 Task 41)
- `src/orchestra/self-modifying-detector.ts` untracked YENİ (Sprint 139 Task 52)
- `src/cli/commands/output.ts` untracked YENİ (Sprint 139 Task 47)
- Git status 46 modified + 21 untracked (Sprint 139 + Sprint 140 Phase 9 commit candidate)

---

## Task 1: MCP Disconnect Fix — Background Sprint Runner Separation
- Model: opus
- Effort: high
- Priority: CRITICAL
- Dependencies: yok
- Skills: typescript-expert, system-architect
- Files: src/orchestra/sprint-runner-entry.ts (YENİ), src/mcp/tools/start.ts, src/mcp/tools/status.ts, src/mcp/server.ts, tests/mcp/start-detached.test.ts (YENİ)
- Scope: src/orchestra/, src/mcp/, tests/mcp/

### Description

Sprint 139 t+~80dk Deckent MCP server Claude Code istemcisinden disconnect oldu canlı kanıt. Root cause: `src/mcp/tools/start.ts:111` fire-and-forget `runSprint(...).then(...)` aynı stdio MCP server process içinde kalıyor. 2-3 saat boyunca heavy sync I/O (Sprint 132 auditi 799 sync I/O), Docker subprocess stdio pipe buffer'lar, GC duraklamaları event loop'u starvation'a sokuyor. Claude Code istemcisi heartbeat timeout ile bağlantıyı kesiyor.

**Alt-iş A: Sprint Runner Entry Point (`src/orchestra/sprint-runner-entry.ts` YENİ ~150 LoC)**
```typescript
#!/usr/bin/env node
// Entry point for detached sprint runner process.
// Usage: node dist/orchestra/sprint-runner-entry.js <projectRoot> <jobId>
import { runSprint } from './brain.js';
import { loadConfig } from '../core/config.js';
import { bootstrapProviders } from '../core/provider.js';
import { writeJobState, buildTaskSummaries } from '../mcp/tools/job-runner.js';

async function main() {
  const [root, jobId] = process.argv.slice(2);
  const config = await loadConfig(root);
  const bootstrap = await bootstrapProviders(config, root);
  const startedAt = new Date().toISOString();
  try {
    const sprint = await runSprint(root, config, { autoApprove: true, connector: bootstrap?.connector });
    // Write COMPLETE jobState
    const tasks = buildTaskSummaries(root, sprint.tasks);
    writeJobState(root, { jobId, status: 'COMPLETE', startedAt, completedAt: new Date().toISOString(), sprintId: sprint.id, tasks });
    process.exit(0);
  } catch (err) {
    writeJobState(root, { jobId, status: 'FAILED', startedAt, completedAt: new Date().toISOString(), error: err.message });
    process.exit(1);
  }
}
main();
```

**Alt-iş B: `src/mcp/tools/start.ts` Fire-and-forget → Detached Spawn**
- Line 111 `runSprint(...).then(...)` → `child_process.spawn('node', [path.join(root, 'dist/orchestra/sprint-runner-entry.js'), root, jobId], { detached: true, stdio: 'ignore' })` + `.unref()`
- MCP tool jobId döner <2s, sprint runner ayrı process'te bağımsız yaşar

**Alt-iş C: `src/mcp/tools/status.ts` Process Liveness Check**
- jobState okuma + `ps -p <pid>` kontrolü (opsiyonel, jobState status alanı zaten yeterli)
- Sprint 138 Task 9 `sprint-checkpoint.ts` infrastructure compat

**Alt-iş D: MCP Server Heartbeat (Opsiyonel Bonus)**
- `src/mcp/server.ts`'ye periodic 30s no-op notification ekle (detached runner'la iletişim değil, client keepalive sinyali)

**Kanıt:**
- `ls src/orchestra/sprint-runner-entry.ts` → YENİ
- `grep "spawn\|detached" src/mcp/tools/start.ts` → hit
- Sprint 140 execute 2+ saat MCP bağlantısı kopmadan tamamlanmalı
- `ps aux | grep sprint-runner-entry` → background process canlı Sprint 140 execute sırasında
- `deckent_start` çağrısı wall-clock <2s döner

**Test:** 5+ test (spawn integration, detach unref, jobState write roundtrip, MCP server survive under load, Sprint 138 checkpoint compat)

---

## Task 2: Auto-Archive Live-Sprint Guard (ADR-039 Self-Modifying Detector Entegre — Sprint 139 Lesson)
- Model: opus
- Effort: normal
- Priority: CRITICAL
- Dependencies: yok
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/sprint-finalizer.ts, src/agents/worker.ts, src/orchestra/self-modifying-detector.ts, tests/orchestra/auto-archive-guard.test.ts (YENİ)
- Scope: src/orchestra/, src/agents/, tests/orchestra/

### Description

Sprint 139 Task 3 Auto-Archive Regression Fix worker dogfood'unda **canlı sprint sırasında** archive çalıştırdı, 51 task JSON sildi, sprint stuck oldu. Task 3 worker sonnet 2h+ EXECUTING, spec'teki 3-adım archive mantığını canlı sprint context'inde çalıştırdı.

**3-katman guard:**

**Alt-iş A: `sprint-finalizer.ts` Archive Gate**
```typescript
export async function archiveSprint(projectRoot, sprintId) {
  const state = readSprintState(projectRoot);
  if (state.phase !== 'RETRO' && state.phase !== 'CLEANUP') {
    throw new ArchiveGateError(`Archive rejected: sprint phase is ${state.phase}, expected RETRO or CLEANUP`);
  }
  // ... actual archive
}
```

**Alt-iş B: `worker.ts` Dogfood Guard**
```typescript
// worker file write hook
if (isLiveSprint(projectRoot) && isArchiveFilesystemOp(filesChanged)) {
  writeResult({ selfAssessment: 'NO_GO', notes: 'Dogfood guard: archive filesystem op during live sprint' });
  process.exit(1);
}
```

**Alt-iş C: `self-modifying-detector.ts` Runtime Enforce (Sprint 139 Task 52 canlı)**
Sprint 139 Task 52 `src/orchestra/self-modifying-detector.ts` YENİ dosya canlı. Sprint 140'ta runtime enforcement pipeline deploy: task-in-progress dogfood auto-archive pattern detection, Brain alarm + alert, worker graceful abort.

**Kanıt:**
- `grep "archiveGate\|ArchiveGateError" src/orchestra/sprint-finalizer.ts` → hit
- `grep "isLiveSprint\|dogfood guard" src/agents/worker.ts` → hit
- Sprint 140 Task 2 dogfood test: canlı sprint'te archive denemesi → NO_GO + alarm
- `.brain/archive/retro-sprint-140.md` içerik doğru Sprint 140 retrosu (Sprint 139 regression fix)

**Test:** 4+ test (live-sprint archive reject, dogfood guard NO_GO, finalize gate pass correct phase, ADR-039 detector trigger)

---

## Task 3: Layer 4 Runtime Wire Deploy (4-Sprint Streak Kırma)
- Model: opus
- Effort: normal
- Priority: CRITICAL
- Dependencies: yok
- Skills: typescript-expert
- Files: src/orchestra/sprint-finalizer.ts, src/core/observability.ts, tests/orchestra/sprint-finalizer.test.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/

### Description

Sprint 136-139 = **4 sprint boyunca** Layer 4 runtime wire fail (gate.json + metrics.jsonl + load-test-report.md hiçbiri yazılmadı). Kod seviyesinde DONE, runtime seviyesinde dead code.

Sprint 138 Task 6 forensic analiz breadcrumb logging ekledi ama deploy olmadı veya runtime'da silently swallowed. Sprint 139'da task-139-001.json silinmesiyle Task 1 cascade fail oldu.

**Fix yaklaşımı:**
1. `finalizeSprint()` call path'inde her hook çağrısı öncesi/sonrası `console.log('[BREADCRUMB] step-X')` (permanent)
2. Sprint 140 dry-run ile runtime'da hangi adım eksikse canlı gözlem
3. Doğru hipotez bulun, fix uygulanır
4. Event stream write integration: `AUDITOR→BRAIN:GATE_COMPUTED`, `AUDITOR→BRAIN:LOAD_REPORT_WRITTEN`, `BRAIN→*:METRIC_EMITTED`

**Kanıt (Sprint 140 finalize sonrası):**
- `.deckent/sprint-140-gate.json` runtime mevcut, `overallGate === "PASS" or "WARNING"`
- `.deckent/sprint-140-metrics.jsonl` ≥30 satır canlı veri
- `docs/audits/sprint-140/load-test-report.md` runtime mevcut
- Event stream'de 3 event: `GATE_COMPUTED`, `LOAD_REPORT_WRITTEN`, `METRIC_EMITTED`

**Test:** 5+ test (runtime gate write, runtime metrics write, runtime load-report, event emit, fail-safe error swallow)

---

## Task 4: Task File Restoration Mechanism (Git-Snapshot Journal + `.tasks/backup/`)
- Model: sonnet
- Effort: normal
- Priority: CRITICAL
- Dependencies: yok
- Skills: typescript-expert
- Files: src/orchestra/task-journal.ts (YENİ), src/orchestra/sprint-spawner.ts, src/cli/commands/recover.ts (YENİ), tests/orchestra/task-journal.test.ts (YENİ)
- Scope: src/orchestra/, src/cli/, tests/orchestra/

### Description

Sprint 139 Task 3 catastrophic regression 51 task JSON sildi. Brain EVALUATE phase task file not found → fatal exception → stuck. Manuel recovery (Seçenek C) gerekti.

**Fix: Task Journal + Restoration CLI**

**Alt-iş A: `src/orchestra/task-journal.ts` (YENİ ~150 LoC)**
```typescript
export function journalTaskWrite(projectRoot, taskId, beforeContent): void {
  const backupDir = join(projectRoot, '.tasks/backup', sprintId);
  mkdirSync(backupDir, { recursive: true });
  const snapshotPath = join(backupDir, `task-${taskId}-${Date.now()}.json`);
  writeFileSync(snapshotPath, beforeContent);
}
export function restoreTasks(projectRoot, sprintId): number {
  // Restore all .tasks/task-*.json from .tasks/backup/sprint-NNN/
}
```

**Alt-iş B: `sprint-spawner.ts` Journal Hook**
Her task JSON write öncesi `journalTaskWrite()` çağır.

**Alt-iş C: `src/cli/commands/recover.ts` (YENİ)**
```bash
deckent recover sprint-140  # Restore all task JSON from backup
```

**Kanıt:**
- `ls .tasks/backup/sprint-140/` runtime dolu
- Sprint 140'ta yapay destruction test: 10 task JSON sil, `deckent recover sprint-140` → %100 restore
- `grep journalTaskWrite src/orchestra/sprint-spawner.ts` → hit

**Test:** 4+ test (journal write, restore full, restore partial, malformed journal skip)

---

## Task 5: Panic Kill Runtime Guard (CLI/MCP Layer Confirmation Token)
- Model: sonnet
- Effort: normal
- Priority: CRITICAL
- Dependencies: yok
- Skills: typescript-expert, security-specialist
- Files: src/mcp/tools/kill.ts, src/mcp/tools/cleanup.ts, src/cli/commands/kill.ts, src/cli/commands/cleanup.ts, tests/mcp/kill-guard.test.ts (YENİ)
- Scope: src/mcp/, src/cli/, tests/mcp/

### Description

Sprint 139 t+3dk koordinatör panic kill incident canlı kanıt. Memory rule `feedback_deckent_kill_approval_required.md` yazıldı ama runtime enforcement yok — sadece disiplin bazlı.

**Fix: Runtime confirmation token**

**Alt-iş A: MCP kill/cleanup Guard**
```typescript
// src/mcp/tools/kill.ts
inputSchema: z.object({
  target: z.enum(['all', 'worker']),
  confirm: z.string().describe('Confirmation token: "yes-destroy-<sprintId>" or empty to reject'),
  ...
}),
async ({ target, confirm }) => {
  const expected = `yes-destroy-${currentSprintId}`;
  if (confirm !== expected) {
    return { error: `Confirmation token required. Pass confirm: "${expected}" to proceed.` };
  }
  // ... kill
}
```

**Alt-iş B: CLI kill/cleanup Guard**
`--confirm yes-destroy-sprint-NNN` flag zorunlu. Yoksa reject.

**Alt-iş C: Live Sprint Cleanup Guard**
`deckent_cleanup` canlı sprint phase !== CLEANUP/DONE ise reddet (sprint-state.json check).

**Kanıt:**
- `deckent_kill --all` onaysız çağrılırsa "Confirmation token required" hatası
- `deckent_kill --all --confirm yes-destroy-sprint-140` geçer
- Sprint 140 pre-flight test: yanlış token ile kill denemesi reddedilir

**Test:** 4+ test (no token reject, wrong token reject, correct token accept, live-sprint cleanup guard)

---

## Task 6: Docker HB Shutdown Bug Runtime Deploy (Task 13 Sprint 139 Cascade Fix)
- Model: opus
- Effort: normal
- Priority: HIGH
- Dependencies: 140-003
- Skills: typescript-expert, testing-expert
- Files: src/agents/worker.ts (verify deploy), src/orchestra/spawn-backend-docker.ts (verify deploy), tests/e2e/docker-hb-shutdown.test.ts
- Scope: src/agents/, src/orchestra/, tests/e2e/

### Description

Sprint 139 Task 13 Docker HB Core Fix kod canlı (`grep atomicWriteFileSync src/agents/worker.ts` → 10 hit, SIGTERM fsync handler, 15s grace period). Ama Task 1 cascade wire eksik olduğu için runtime deploy olmadı → Sprint 139'da 5 NO_GO organic Docker HB shutdown.

**Fix:**
- Runtime deploy doğrulama (manual E2E)
- Sprint 140 Task 6 E2E regression test: docker worker SIGTERM → `.result` atomic write → `.hb` DONE status → parent Brain evaluate success
- Sprint 140 execute sırasında **0 organic Docker HB bug NO_GO** hedefi

**Kanıt:**
- `tests/e2e/docker-hb-shutdown.test.ts` 5+ test canlı
- Sprint 140 execute 0 "Docker worker exited without writing result file" NO_GO

**Test:** 5+ E2E (SIGTERM fsync, 15s grace, atomic rename, parent HB read, reject unclean shutdown)

---

## Task 7: Event Stream Runtime Emit Enforce
- Model: sonnet
- Effort: normal
- Priority: HIGH
- Dependencies: 140-003
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/event-stream.ts, src/agents/worker.ts, src/monitor/auditor.ts, tests/orchestra/event-stream.test.ts
- Scope: src/orchestra/, src/agents/, src/monitor/, tests/orchestra/

### Description

Sprint 139 events.jsonl 35 satır (beklenen 200+). Task 41 hook kod canlı (`src/core/notification-dispatcher.ts` + `src/core/notify-adapters/`) ama runtime emit Task 1 cascade'e bağımlıydı.

**Fix:**
- Sprint 140 Task 7: 15 ADR-035 V1.0 kanalının runtime emit wiring
- `worker.ts` 5 kanal (HEARTBEAT, RESULT, QUESTION, CODE_VERIFY_REQUEST, FILE_LOCK_ACQUIRED)
- `auditor.ts` 5 kanal (VERIFICATION_RESULT, SCOPE_COLLISION, ADR_VIOLATION, GATE_COMPUTED, LOAD_REPORT_WRITTEN)
- `brain` 5 kanal (TASK_ASSIGN, ANSWER, FIX_REQUEST, METRIC_EMITTED, SPRINT_PHASE_CHANGE)

**Kanıt:**
- Sprint 140 finalize'de events.jsonl ≥200 satır
- 15 kanalın tamamı en az 1 kez emit olmalı
- `grep -c "channel" .deckent/sprint-140-events.jsonl` ≥200

**Test:** 3+ test (worker emit, auditor emit, brain emit, roundtrip)

---

## Task 8: ADR-037 Runtime Authority Enforcement Deploy
- Model: opus
- Effort: normal
- Priority: HIGH
- Dependencies: 140-003
- Skills: typescript-expert
- Files: src/core/authority-matrix.ts, src/agents/worker.ts, src/monitor/auditor.ts, tests/core/authority-matrix.test.ts
- Scope: src/core/, src/agents/, src/monitor/, tests/core/

### Description

Sprint 139 Task 35 +1050 LoC ADR-037 Runtime Authority Enforcement kod canlı. Sprint 140'ta runtime pipeline deploy + scope check integration + test coverage + dogfood.

**Kanıt:**
- Sprint 140'ta bir worker scope dışı dosyaya yazma denemesi → Brain `SCOPE_VIOLATION` alert + NO_GO
- `grep checkAuthority src/core/authority-matrix.ts` → hit

**Test:** 6+ test (brain authority, auditor read-only, worker scope, violation alert, event emit, per-role matrix)

---

## Task 9: Sprint-State.json Lifecycle Update Gap Fix
- Model: sonnet
- Effort: low
- Priority: HIGH
- Dependencies: yok
- Skills: typescript-expert
- Files: src/orchestra/sprint-controller.ts, src/orchestra/sprint-phases.ts, src/core/sprint-state.ts, tests/orchestra/sprint-state.test.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/

### Description

Sprint 139 sprint-state.json 06:17'den beri hiç güncellenmedi (EXECUTE → EVALUATE transition yazmadı). Brain phase transition write guarantee eksik. Her phase transition sonrası `writeSprintState()` atomic write + fsync ekle.

**Fix:**
- `sprint-phases.ts` her faz başlangıcında + sonunda `writeSprintState({ phase, status, updatedAt })` çağır
- Atomic write pattern (temp → fsync → rename)
- Event stream emit: `BRAIN→*:SPRINT_PHASE_CHANGE`

**Kanıt:**
- Sprint 140 execute sırasında `.deckent/sprint-state.json` updatedAt her 1-5 dk güncellenmeli
- Phase geçişleri event stream'de izlenebilir

**Test:** 4+ test (phase transition write, atomic, fsync, event emit)

---

## Task 10: Retro Sprint-ID Regression Fix
- Model: sonnet
- Effort: low
- Priority: HIGH
- Dependencies: yok
- Skills: typescript-expert
- Files: src/orchestra/sprint-reporter.ts, tests/orchestra/sprint-reporter.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description

Sprint 139 `.brain/archive/retro-sprint-139.md` içeriği **Sprint 138 retrosu** (sprint-id context confusion). `sprint-reporter.ts` retro writer sprint-id param propagation bug.

**Fix:**
- `writeRetroMarkdown()` sprint-id param explicit, template interpolation doğru scope'ta
- Test coverage: farklı sprint-id'lerle retro yazımı ve içerik doğrulama

**Kanıt:**
- Sprint 140 retro `.brain/archive/retro-sprint-140.md` içeriği Sprint 140 metrikleri + Sprint 140 task'ları + Sprint 140 learnings

**Test:** 3+ test (sprint-id interpolation, full retro roundtrip, no cross-contamination)

---

## Task 11: Notification Dispatcher Runtime Deploy
- Model: sonnet
- Effort: normal
- Priority: HIGH
- Dependencies: 140-007
- Skills: typescript-expert
- Files: src/core/notification-dispatcher.ts (verify), src/core/notify-adapters/mcp-adapter.ts (verify), src/core/notify-adapters/cli-adapter.ts (verify), src/mcp/server.ts, src/cli/commands/start.ts, tests/core/notification-dispatcher.test.ts
- Scope: src/core/, src/mcp/, src/cli/, tests/core/

### Description

Sprint 139 Task 41 Notification Dispatcher kod canlı untracked YENİ dosyalar (`src/core/notification-dispatcher.ts` + `src/core/notify-adapters/`). Sprint 140'ta runtime deploy: MCP channel `notifications/message` + CLI channel parent-tty + Event Stream `DECKENT→USER:NOTIFY` emit.

**Kanıt:**
- Sprint 140 execute sırasında en az 5 user notification olay gerçekleşir
- MCP server'da `notifications/message` emit edilir (gözlenebilir)
- CLI parent-tty'de notification satırı yazılır

**Test:** 5+ test (dispatcher core, MCP adapter, CLI adapter, event emit, filter/throttle)

---

## Task 12: Rich Output CLI Command Wire-Up
- Model: sonnet
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: typescript-expert
- Files: src/cli/index.ts, src/cli/commands/output.ts (verify), tests/cli/commands/output.test.ts (verify)
- Scope: src/cli/, tests/cli/

### Description

Sprint 139 Task 47 Rich Output CLI (output.ts, output-collector.ts, output-formatter.ts) untracked YENİ. Sprint 140'ta `src/cli/index.ts` register + dogfood.

**Kanıt:** `npx deckent output <taskId> --tail 50` canlı çalışır

**Test:** 3+ test (register, --tail flag, --follow flag, --json output)

---

## Task 13: Sprint 139 Orphan Cleanup (Manuel Finalize Artifacts)
- Model: haiku
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: devops-engineer
- Files: .tasks/, .dashboard, .deckent/sprint-state.json
- Scope: .tasks/, .deckent/

### Description

Sprint 139'dan kalıntılar:
- 1 task-139-*.json (diğer 51 silinmiş) — archive veya delete
- 50 task-139-*.result — archive
- `.dashboard` stuck state "EVALUATE/EVALUATING" — reset
- `.deckent/sprint-state.json` stale EXECUTE/06:17 — reset to Sprint 140 INIT

**Alt-iş A: `.brain/archive/sprint-139-tasks/` dizinine taşı**
**Alt-iş B: `.dashboard` Sprint 140 template (empty EVALUATE durumunu temizle)**
**Alt-iş C: `.deckent/sprint-state.json` Sprint 140 INIT**

**Kanıt:** `.tasks/` boş (Sprint 139 artığı yok), `.dashboard` Sprint 140 template

**Test:** Yok (cleanup ops)

---

## Task 14: ADR-039 Self-Modifying Detector Runtime Validation
- Model: opus
- Effort: normal
- Priority: HIGH
- Dependencies: 140-002
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/self-modifying-detector.ts, tests/orchestra/self-modifying-detector.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description

**NOT:** ADR numara düzeltmesi — Sprint 139 Task 51 ADR-038 değil **ADR-039** olarak yazıldı (ADR-038 = Dead Code Disposition, Task 36-39 quartet). Self-Modifying Task Detection **ADR-039**'dur.

Sprint 139 Task 51 + 52 ADR-039 Self-Modifying Task Detection kod canlı (`src/orchestra/self-modifying-detector.ts` 163 LoC YENİ). Sprint 140 Task 2 Auto-Archive Guard ile entegre + runtime detector deploy + canlı dogfood test.

**Wave rescheduling:** Bu task önceden Wave 5'teydi ama Task 2 (Auto-Archive Guard) ile sequential bağımlılık nedeniyle **Wave 2'ye taşındı** (Task 2 ile paralel çalışır).

**Kanıt:**
- Sprint 140 dogfood test: meta-modify task (DIRECTIVES.md veya sprint-finalizer.ts modify) → detector trigger → Brain alert
- ADR numara tutarlılığı: `.brain/DECISIONS.md` ADR-038 Dead Code + ADR-039 Self-Modifying ayrı başlık
- Integration test: Task 2 Auto-Archive Guard Task 14 detector'ını import ederek canlı dogfood test'i çalıştırır

**Test:** 5+ test (detector pattern match, live-sprint dogfood trigger, alert event emit, false positive filter, Task 2 entegrasyon)

---

## Task 15: Pre-flight Memory Sync Verification (Observer Discipline)
- Model: haiku
- Effort: low
- Priority: NORMAL
- Dependencies: yok
- Skills: documentation-writer
- Files: scripts/preflight-memory-check.mjs (YENİ), tests/scripts/preflight-memory-check.test.ts
- Scope: scripts/, tests/scripts/

### Description

Sprint 139'un ilk 3 dakikasında koordinatör `feedback_deckent_kill_approval_required.md` okumadı ve panic kill yaptı. Sprint 140'ta pre-flight memory check script'i: koordinatör session başlangıcında 5 zorunlu memory dosyasını okuduğunu kanıtlar.

**Script:**
```javascript
// scripts/preflight-memory-check.mjs
const REQUIRED = [
  'feedback_deckent_kill_approval_required.md',
  'feedback_deckent_native_execution_rule.md',
  'feedback_living_record_sync.md',
  'project_sprint<N-1>_completed.md',
  'project_sprint<N>_preflight.md',
];
// Check stat access time, log to .deckent/preflight-log.jsonl
```

**Kanıt:** Sprint 140 pre-flight'ta script çalışır, log yazılır

**Test:** 3+ test (all read pass, missing file warn, log format)

---

## Task 16: E2E Test Harness Worker-Spawn Guard (YENİ — Alperen Direktifi 2026-04-15)
- Model: opus
- Effort: normal
- Priority: CRITICAL
- Dependencies: yok
- Skills: typescript-expert, testing-expert
- Files: tests/e2e/sprint-lifecycle.test.ts, vitest.config.ts, src/orchestra/sprint-spawner.ts, tests/e2e/helpers/workspace-isolation.ts (YENİ), tests/e2e/.gitignore (YENİ)
- Scope: tests/e2e/, src/orchestra/, vitest.config.ts

### Description

**Alperen direktifi (Sprint 139 commit öncesi tespit, 2026-04-15):** E2E test `.test-e2e-sprint-*` pattern'ı sprint execution sırasında çalıştığında worker kilitleme riski, gereksiz yük ve orphan dizin birikmesi. Sprint 139'dan sonra `.test-e2e-sprint-{pid}` formatında **10 boş dizin birikmiş** — kanıt: `ls /home/alperen/deckent-dev/.test-e2e-sprint-*`.

**Root cause:** `tests/e2e/sprint-lifecycle.test.ts:17` `const TEST_ROOT = path.join(process.cwd(), '.test-e2e-sprint-' + process.pid);` her test run'ı yeni pid ile geçici workspace yaratıyor, temizlenmeyenler birikmiş. Worker'lar sprint execute sırasında bu test'leri `vitest run` çağrısıyla çalıştırıyor → worker-in-worker stress.

**3-katman fix:**

**Alt-iş A: Vitest Config Environment Guard**
`vitest.config.ts`'ye `VITEST_SKIP_E2E_SPRINT` env var check ekle. Sprint execution sırasında env var set edilir → e2e/sprint-*.test.ts dosyaları skip edilir. Sprint 140'tan itibaren `sprint-spawner.ts` worker spawn öncesi `VITEST_SKIP_E2E_SPRINT=1` process.env'e inject eder.

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    exclude: [
      ...(process.env.VITEST_SKIP_E2E_SPRINT ? ['tests/e2e/sprint-lifecycle.test.ts'] : []),
    ],
  },
});
```

**Alt-iş B: Workspace Isolation + Auto-Cleanup**
`tests/e2e/helpers/workspace-isolation.ts` (YENİ) — `createTestWorkspace()` + `cleanupTestWorkspace()` helper. `os.tmpdir()` içinde yaratır (proje root'a değil), afterEach/afterAll hook'larda zorunlu cleanup. `tests/e2e/sprint-lifecycle.test.ts:17` helper kullanacak şekilde güncellenir.

**Alt-iş C: `.gitignore` Safety Net**
`tests/e2e/.gitignore` ve proje root `.gitignore` `.test-e2e-sprint-*` pattern eklenir. Mevcut orphan dizinler Task 13 cleanup ile silinir.

**Alt-iş D: Sprint-spawner worker env injection**
`src/orchestra/sprint-spawner.ts` worker spawn için `env: { ...process.env, VITEST_SKIP_E2E_SPRINT: '1' }` — worker'lar sprint execute sırasında E2E sprint test'lerini çalıştıramaz.

**Kanıt:**
- `ls .test-e2e-sprint-*` Sprint 140 sonunda boş (orphan yok, yeni yaratılmıyor)
- `VITEST_SKIP_E2E_SPRINT=1 npx vitest run tests/e2e/sprint-lifecycle.test.ts` → 0 test run
- `grep VITEST_SKIP_E2E_SPRINT src/orchestra/sprint-spawner.ts` → hit (worker env injection)
- `os.tmpdir()` içinde workspace yaratılıyor (proje root'a değil)

**Test:** 4+ test (env var skip, workspace isolation tmp dir, auto-cleanup afterAll, sprint-spawner env injection)

---

## Task 17: `.prompt` Cleanup Discipline + Worker-Fix Naming (YENİ — Alperen Direktifi 2026-04-15)
- Model: sonnet
- Effort: normal
- Priority: HIGH
- Dependencies: yok
- Skills: typescript-expert
- Files: src/orchestra/spawn-backend-docker.ts, src/orchestra/sprint-docs-updater.ts, src/orchestra/sprint-finalizer.ts, tests/orchestra/prompt-cleanup.test.ts (YENİ)
- Scope: src/orchestra/, tests/orchestra/

### Description

**Alperen direktifi (2026-04-15):** `.prompt-*` dosyaları sprint cleanup'ında **silinmemeli, sprint sonuna kadar kalmalı**. Worker-fix vs initial worker ayrımı prompt dosya başlığında açıklamayla eşlemeli ama UUID format devam etmeli.

**Mevcut durum (Sprint 138 Task 7 `sprint-docs-updater.ts:606-607` + `spawn-backend-docker.ts:81-85`):**
- Hash-based naming: `.prompt-{taskId}-{hash}.txt` (initial), `.prompt-{taskId}-{hash}-fix.txt` (fix retry — `isPriorityFix` flag) ✅
- Sprint 138 archive logic var: `sprint-docs-updater.ts:607 filter(f => f.startsWith('.prompt-'))` ✅
- **Ama Sprint 139'da canlı kanıt:** `.tasks/.prompt-test-docker-816479-adc6973fcb27a168.txt` **tek dosya kaldı** — archive çalışmamış, Sprint 139 cascade'inden etkilenmiş

**Alt-iş A: Cleanup Gate — Sprint Finalize'da Archive, Mid-Sprint Korunur**
`sprint-finalizer.ts`'ye archive trigger. Canlı sprint sırasında (phase !== CLEANUP) `.prompt-*` dosyaları **asla silinmez**. Sadece sprint CLEANUP phase'inde `.tasks/archive/sprint-{sprintId}/` dizinine taşınır (mevcut sprint-docs-updater.ts logic'i audit + wire edilir).

**Alt-iş B: Worker-Fix Naming Genişletme**
Mevcut `fixSuffix` (`-fix` sabit) → daha zengin suffix şeması:
- `.prompt-{taskId}-{hash}.txt` — initial worker
- `.prompt-{taskId}-{hash}-fix1.txt` — ilk fix retry
- `.prompt-{taskId}-{hash}-fix2.txt` — ikinci fix retry
- `.prompt-{taskId}-{hash}-dep-{dep-taskId}.txt` — cross-dependency fix (Sprint 136 T-006 canlı senaryo)
UUID/hash format korundu, sadece semantic suffix genişletildi.

**Alt-iş C: Prompt Manifest**
`.tasks/.prompt-manifest-{sprintId}.jsonl` (YENİ) — her spawn yazma işleminde append satır: `{taskId, promptFile, purpose: 'initial'|'fix1'|'dep-fix', timestamp, agent, skills}`. Post-mortem analiz için traceability.

**Kanıt:**
- Sprint 140 execute sırasında `.tasks/.prompt-*.txt` dosyaları korundu (mid-sprint cleanup yok)
- Sprint 140 CLEANUP phase'inde `.tasks/archive/sprint-140/.prompt-*.txt` dosyaları taşındı
- `ls .tasks/.prompt-*` Sprint 140 finalize sonrası boş
- `.tasks/.prompt-manifest-sprint-140.jsonl` runtime yazılmış
- `grep fix1\|fix2 src/orchestra/spawn-backend-docker.ts` → hit

**Test:** 4+ test (mid-sprint persistence, finalize archive, fix suffix naming, prompt manifest append)

---

## Task 18: `.deckent/` Directory Groupby + Archive Strategy (YENİ — Alperen Direktifi 2026-04-15)
- Model: opus
- Effort: normal
- Priority: HIGH
- Dependencies: yok
- Skills: typescript-expert, devops-engineer
- Files: src/core/deckent-workspace-rules.ts (YENİ), src/orchestra/sprint-finalizer.ts, scripts/deckent-cleanup.mjs (YENİ), .deckent/README.md (YENİ), tests/core/workspace-rules.test.ts (YENİ)
- Scope: src/core/, src/orchestra/, scripts/, .deckent/, tests/core/

### Description

**Alperen direktifi (2026-04-15):** `.deckent/` dizini çöplüğe dönüyor, her sprint dosyalar birikiyor. JSON/mjs/jsonl dosyaların ne işe yaradığı gruplanabilir, arşivlenebilir. Hem manuel hem otomatik cleanup kurallar.

**Mevcut durum (disk audit 2026-04-15 `.deckent/` kök):**

| Kategori | Dosya | Amaç | Tavsiye |
|----------|-------|------|---------|
| **Config (kalıcı)** | config.json, project-stack.json, docs.json, ci-baseline.json | Runtime config | `.deckent/config/` |
| **Config backup** | config.json.bak × 4 | Eski config state | `.deckent/config/backups/` + otomatik rotation (keep last 5) |
| **Runtime state** | sprint-state.json, safety-point.json, provider-cache.json, features-manifest.json | Live sprint runtime | `.deckent/runtime/` |
| **Event stream** | sprint-139-events.jsonl, sprint-139-seq | Per-sprint events | `.deckent/sprints/sprint-NNN/events.jsonl` |
| **Metrics** | metrics.jsonl (140K) | Cumulative metrics | `.deckent/metrics/metrics-YYYY-MM.jsonl` (monthly rotation) |
| **Sprint gate** | sprint-134-gate.json | Per-sprint finalize | `.deckent/sprints/sprint-134/gate.json` |
| **Sprint scorecard** | sprint-134..139-layer3-scorecard.md (×6, 116K) | Per-sprint audit | `.deckent/sprints/sprint-NNN/scorecard.md` |
| **Session starter** | sprint-139-session-starter.md | Per-sprint doc | `.deckent/sprints/sprint-NNN/session-starter.md` |
| **Ad-hoc scripts** | generate-load-report.mjs, run-self-audit.mjs | Manuel util | `scripts/` (dışına taşı, bunlar runtime değil tool) |
| **Orphan** | sprint-137-verifier-log.md | Tek sprint debug | archive edilmeli |

**4 alt-iş:**

**Alt-iş A: Workspace Rules Modülü (`src/core/deckent-workspace-rules.ts` YENİ ~200 LoC)**
```typescript
export interface WorkspaceRule {
  pattern: RegExp;          // dosya adı eşleşme
  category: 'config' | 'runtime' | 'sprint' | 'metrics' | 'scripts' | 'orphan';
  targetDir: string;         // taşınacak hedef
  retentionPolicy?: 'keep-last-N' | 'monthly' | 'per-sprint' | 'forever';
  maxCount?: number;         // keep-last-N için
}
export const DECKENT_WORKSPACE_RULES: WorkspaceRule[] = [
  { pattern: /^config\.json\.bak/, category: 'config', targetDir: 'config/backups', retentionPolicy: 'keep-last-N', maxCount: 5 },
  { pattern: /^sprint-\d+-events\.jsonl$/, category: 'sprint', targetDir: 'sprints/sprint-NNN', retentionPolicy: 'per-sprint' },
  // ... 12+ rule
];
export function applyWorkspaceRules(deckentRoot: string, dryRun: boolean): MoveOp[];
```

**Alt-iş B: Sprint Finalize Auto-Groupby**
`sprint-finalizer.ts` CLEANUP phase'inde `applyWorkspaceRules(deckentRoot, false)` çağır. Per-sprint dosyalar otomatik `.deckent/sprints/sprint-NNN/` altına taşınır. Config backup rotation otomatik keep-last-5.

**Alt-iş C: Manuel Cleanup Script (`scripts/deckent-cleanup.mjs` YENİ ~150 LoC)**
```bash
node scripts/deckent-cleanup.mjs --dry-run   # preview moves
node scripts/deckent-cleanup.mjs --execute   # apply
node scripts/deckent-cleanup.mjs --archive sprint-138  # archive specific sprint
```
Sprint 140 pre-flight'ta bir kez manuel çalıştırılır: mevcut Sprint 134-139 scorecard'lar + gate.json'lar + events.jsonl dosyalar retroaktif olarak `.deckent/sprints/sprint-NNN/` altına taşınır.

**Alt-iş D: `.deckent/README.md` (YENİ)**
Dizin yapısı + retention policy + cleanup rules dokümantasyonu. Alperen'in sonraki sprint'te bakmak istediğinde net referans. Sprint 140 Task 12 Rich Output ile uyumlu.

**Hedef `.deckent/` dizin yapısı (post-Task 18):**
```
.deckent/
├── README.md                    # Dizin yapısı + rules
├── config/
│   ├── config.json              # runtime config
│   ├── project-stack.json
│   ├── docs.json
│   └── backups/                 # keep-last-5
│       └── config.json.bak.*
├── runtime/
│   ├── sprint-state.json
│   ├── safety-point.json
│   └── provider-cache.json
├── metrics/
│   └── metrics-2026-04.jsonl    # monthly rotation
├── sprints/
│   ├── sprint-134/
│   │   ├── scorecard.md
│   │   └── gate.json
│   ├── sprint-139/
│   │   ├── scorecard.md
│   │   ├── events.jsonl
│   │   ├── session-starter.md
│   │   └── layer3-scorecard.md
│   └── sprint-140/              # gelecek
├── archive/                     # Task 13 cleanup target
└── agents/ skills/ plugins/ cache/ jobs/ usage/ decisions/ pids/ workspace/ i18n/ routing/
```

**Kanıt:**
- `ls .deckent/ 2>&1 | wc -l` Sprint 140 sonrası ≤15 (şu an 33+)
- `.deckent/README.md` mevcut
- `.deckent/sprints/sprint-140/scorecard.md` Sprint 140 finalize sonrası oraya yazılı
- `ls .deckent/config/backups/ | wc -l` ≤5 (rotation çalışıyor)
- `node scripts/deckent-cleanup.mjs --dry-run` → çıktı "N moves pending"

**Test:** 6+ test (workspace rules parse, apply rules dry-run, keep-last-N rotation, per-sprint groupby, manual cleanup script, README render)

---

## Wave Layout (Sprint 140 Plan-Time Recommendation — 18 task)

**Wave 1 (Paralel P0 Foundation, 4 worker):** Task 1 (MCP), Task 3 (Layer 4), Task 4 (Task Restoration), Task 16 (E2E Harness Guard)
**Wave 2 (P0 Completion + Detector Validation, 3 worker):** Task 2 (Auto-Archive Guard), Task 5 (Kill Guard), Task 14 (ADR-039 Detector Validation — Wave 5'ten taşındı, Task 2 ile paralel)
**Wave 3 (Runtime Deploy, 3 worker):** Task 6 (Docker HB), Task 7 (Event Stream), Task 8 (Authority Runtime)
**Wave 4 (Quality Debt + Workspace Hygiene, 4 worker):** Task 9 (Sprint State), Task 10 (Retro), Task 11 (Notification), Task 17 (.prompt Discipline)
**Wave 5 (Finalize + Groupby, 4 worker):** Task 12 (Rich Output), Task 13 (Orphan Cleanup), Task 15 (Pre-flight), Task 18 (.deckent/ Groupby)

**Toplam: 18 task, tahmini 10-11 saat hard cap**

**Wave rescheduling notları:**
- Task 14 (ADR-039 Detector Validation) Wave 5 → Wave 2 taşındı — Task 2 (Auto-Archive Guard) ile Task 14 sequential bağımlılık, aynı wave paralel çalışır
- Task 16 (E2E Harness Guard) Wave 1'e eklendi — P0 foundation kategori, MCP/Layer 4/Task Restoration ile bağımsız paralel
- Task 17 (.prompt Discipline) Wave 4'e eklendi — Sprint-state + Retro + Notification ile quality debt kategori
- Task 18 (.deckent/ Groupby) Wave 5'e eklendi — Rich Output + Orphan Cleanup + Pre-flight ile finalize kategori

---

## Hedef Metrikleri (Sprint 140 — 18 task)

| Metrik | Sprint 139 | Sprint 140 Hedef |
|--------|-----------|------------------|
| Task sayısı | 52 | **18** (keskin düşüş, guard rail + hygiene odaklı) |
| Task throughput | %96 | ≥%95 |
| NO_GO rate | %18 | ≤%5 |
| Layer 3 skor | 9/17 | ≥13/17 |
| Readiness | ~4.03 | ≥4.10 |
| Zero manual recovery | ❌ | ✅ (yeniden başla) |
| Layer 4 runtime wire | ❌ | ✅ (4-sprint streak kır) |
| MCP stability | ❌ | ✅ (2+ saat kopma yok) |
| Crown jewels | 13 | ≥8 (guard rail odaklı) |
| Süre | ~3h (stuck) | ≤11h hard cap |
| `.test-e2e-sprint-*` orphan | 10 birikmiş | 0 (Task 16 guard) |
| `.prompt-*` cleanup discipline | partial | full (Task 17 mid-sprint korunur, finalize'da archive) |
| `.deckent/` kök dosya | 33+ | ≤15 (Task 18 groupby) |
