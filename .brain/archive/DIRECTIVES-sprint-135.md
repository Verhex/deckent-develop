# DIRECTIVES — Sprint 135: Operational Hardening + Triple Dogfooding Completion

## Goal: Sprint 134'ün operasyonel kırılganlıklarını kapatmak ve 12 carry-over debt item'ın tamamını tüketmek (genişleyerek 13 task'a ulaştı). Triple dogfooding tezinin ikinci yarısını tamamlamak: Sprint 134 feature'ları (coordinator lifecycle, dep pipeline structured parse, T-014 self-audit gate, T-011 observability, T-010 askBrain extraction) Sprint 135'te canlı kullanılacak. Hedef: Kur-Çalıştır Readiness 3.86 → ≥3.95, Layer 3 17-criterion ≥15/17 PASS (Sprint 134 14/17 → +1), clean GO (GO_WITH_TECH_DEBT değil), 0 NO_GO, 0 manual recovery. Referans: `docs/superpowers/specs/2026-04-10-sprint-135-design.md` (approved 2026-04-10, 563 satır, 9 section) ve `docs/superpowers/plans/2026-04-11-sprint-135-plan.md` (fallback TDD plan, 1806 satır).

**DOKUNULAMAZ VİZYON:** Deckent bir üründür, SaaS değildir. OpenClaw gibi "kur çalıştır". Açık kaynak, ücretsiz, herkese her yerde. Sprint 135'in 13 task'ı vizyon lensinden geçti — hiçbiri SaaS/cloud/paywall yönünde değil. Birkaç task (T-002/T-003 docker HB, T-005 planner, T-013 brain budget) doğrudan "kur çalıştır kolay" hedefini güçlendiriyor (sessiz failure kapatma). Ref: `.claude/projects/-home-alperen-deckent-dev/memory/project_vision_product_not_service.md`.

---

## Task 1: Sprint Coordinator Resilience — PID + State Snapshot + Orphan Detection
- Model: opus
- Priority: CRITICAL
- Effort: high
- Agent: architect
- Skills: typescript-expert, system-architect
- Files: src/orchestra/sprint-pid-manager.ts, src/orchestra/sprint-controller.ts, src/cli/commands/start.ts
- Scope: src/orchestra/, src/cli/

### Description
Sprint 134'teki tek en büyük operasyonel risk: parent coordinator process silently disappeared, sprint zombi state'e düştü, MCP dashboard stale kaldı, 2 saat manual recovery gerektirdi. Bu task coordinator'u bulletproof yapar.

**Gereksinimler:**
- Yeni modül `src/orchestra/sprint-pid-manager.ts` — exports: `writePid(root, sprintId)`, `readPid(root, sprintId)`, `clearPid(root, sprintId)`, `writeStateSnapshot(root, sprintId, snap)`, `readStateSnapshot(root, sprintId)`, `detectOrphan(root, sprintId): OrphanInfo | null`
- `SprintStateSnapshot` interface: `{ sprintId, pid, startedAt, currentWave, taskStatuses: Record<string,string>, metricsJsonlSize, lastHeartbeat }`
- sprint-controller.ts hook'ları: `runSprint()` başında `writePid(projectRoot, sprintId)`, her 30s `setInterval` ile `writeStateSnapshot`, `process.on('beforeExit')` handler observability flush + final snapshot, finally bloğunda `clearPid`
- Atomic write: `writeFileSync(temp)` + `renameSync(temp, final)` → kısmi yazım korrupte dosya bırakmaz
- start.ts: `deckent start` invocation'da `cfg.last_sprint_id` için `detectOrphan` çağır, stale PID varsa: `--auto-approve` → Archive (`.brain/archive/`'e move), aksi halde `print` + exit code 2
- PID liveness check: `process.kill(pid, 0)` (cross-platform POSIX + Windows), `EPERM` = alive, `ESRCH` = dead

**Kanıt:** `ls src/orchestra/sprint-pid-manager.ts && grep -n "writePid\|writeStateSnapshot\|detectOrphan" src/orchestra/sprint-pid-manager.ts src/orchestra/sprint-controller.ts src/cli/commands/start.ts` → her üç isim de hit, sprint-pid-manager.ts exists

**Test:** 8+ test — (1) writePid happy path + collision handling, (2) readPid missing file → null, (3) writeStateSnapshot atomic rename verification, (4) detectOrphan no pid → null, (5) detectOrphan live process → null, (6) detectOrphan dead pid (fake 99999999) → OrphanInfo, (7) beforeExit handler fires final snapshot, (8) start command stale PID → --auto-approve Archive path moves files to .brain/archive/

---

## Task 2: Auditor HB+Result Reconciliation (Docker Bug Defensive Fix)
- Model: opus
- Priority: CRITICAL
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: src/monitor/auditor.ts
- Scope: src/monitor/

### Description
Sprint 134'te Docker backend worker'lar task'ı başarıyla tamamlayıp `.result` yazdı ama container SIGKILL sonrası HB'ye "FAILED" + exitCode 137 yazıldı, auditor bunu stale CRITICAL alert olarak **47 kez** raporladı. Defensive fix: auditor stale detection'a `.result` existence + DONE kontrolü ekle.

**Gereksinimler:**
- Yeni export `shouldReportStale(projectRoot, taskId, hbContent): boolean` function auditor.ts'de
- Mantık: eğer `.tasks/task-{id}.result` exists AND parse edilebilir JSON AND `selfAssessment in {DONE, GO_WITH_TECH_DEBT}` → return false (alert tetikleme); aksi halde existing stale logic devam
- Fail-safe: malformed JSON parse fail → return true (honest alert)
- Wire: stale detection loop'unda alert emit noktasından ÖNCE `shouldReportStale` çağır, false ise `continue`
- `DONE_SET = new Set(['DONE', 'GO_WITH_TECH_DEBT'])` constant

**Kanıt:** `grep -n "shouldReportStale\|DONE_SET\|reconcile.*result" src/monitor/auditor.ts` → hit

**Test:** 5+ test — (1) HB FAILED exitCode 137 + result DONE → shouldReportStale false (Sprint 134 exact case), (2) HB stale + no result → true (normal stale), (3) HB stale + result NO_GO → true (honest failure), (4) HB stale + malformed JSON → true (fail-safe), (5) HB stale + result GO_WITH_TECH_DEBT → false

---

## Task 3: Docker Backend Graceful Shutdown (Docker Bug Offensive Root Cause Fix)
- Model: opus
- Priority: CRITICAL
- Effort: normal
- Agent: bug-fixer
- Skills: docker-expert, typescript-expert
- Files: src/orchestra/spawn-backend-docker.ts, src/agents/worker.ts
- Scope: src/orchestra/, src/agents/

### Description
T-002 defensive, T-003 offensive. Container shutdown path'ini `docker kill` yerine `docker stop --time=10` (10s grace period) yap; worker script'e SIGTERM handler ekle — eğer `.result` zaten yazılmışsa HB'yi "DONE" olarak finalize et. Root cause kapanır, dashboard "FAILED exitCode 137" spam'i biter.

**Gereksinimler:**
- `src/orchestra/spawn-backend-docker.ts`: container shutdown function (`stopDockerWorker(containerName)` veya mevcut inline call site) `docker stop --time=10 ${containerName}` kullanır, 10s timeout sonrası fallback `docker kill`
- `src/agents/worker.ts`: yeni export `finalizeHeartbeatOnShutdown(projectRoot, taskId)` — `.result` exists AND DONE/GO_WITH_TECH_DEBT ise HB'ye `{status:"DONE", exitCode:0, timestamp}` yaz
- Worker main entry point'te `process.on('SIGTERM', handler)` — `DECKENT_TASK_ID` + `DECKENT_PROJECT_ROOT` env'den oku, `finalizeHeartbeatOnShutdown` çağır, `process.exit(0)`
- Fail-safe: JSON parse hatası → HB'yi dokunma, existing state kalsın (honest FAILED)

**Kanıt:** `grep -n "docker.*stop.*--time=10\|SIGTERM\|finalizeHeartbeatOnShutdown" src/orchestra/spawn-backend-docker.ts src/agents/worker.ts` → hit

**Test:** 4+ test — (1) worker SIGTERM + result DONE → HB status="DONE" exitCode=0, (2) worker SIGTERM + no result → HB unchanged (honest), (3) backend shutdown command uses `--time=10`, (4) SIGKILL fallback still works after 10s timeout

---

## Task 4: askBrain() Extraction Finish — Conservative Move + Re-Export Shim
- Model: opus
- Priority: CRITICAL
- Effort: high
- Agent: refactorer
- Skills: system-architect, typescript-expert
- Files: src/orchestra/ipc-registry.ts, src/orchestra/sprint-controller.ts, src/agents/worker-ipc.ts
- Scope: src/orchestra/, src/agents/

### Description
Sprint 134 T-010 yarım kaldı: `ipc-registry.ts` sadece 37 LoC (channel registry plumbing), `askBrain()` hâlâ `worker-ipc.ts:432` civarında. sprint-controller.ts hâlâ 1820 LoC (full slim Sprint 136'ya). Bu task `askBrain()` + yardımcı IPC fonksiyonları `worker-ipc.ts`'den `ipc-registry.ts`'ye move eder, backward compat için re-export shim bırakır.

**Gereksinimler:**
- `askBrain` function body + `handleWorkerQuestion`, `routeAnswer`, `getIPCRegistry` (varsa) yardımcıları `src/agents/worker-ipc.ts:432-...` satırlarından `src/orchestra/ipc-registry.ts` sonuna move
- Required imports ipc-registry.ts'e eklenir (node:fs, node:path, vb.)
- `src/agents/worker-ipc.ts` orijinal konumda `export { askBrain } from '../orchestra/ipc-registry.js'` re-export shim bırakır — mevcut `worker-ipc`'den import eden hiçbir çağrı kırılmaz
- `src/orchestra/sprint-controller.ts` mevcut `askBrain` import'unu güncelle: `from '../agents/worker-ipc.js'` → `from './ipc-registry.js'`
- ipc-registry.ts 37 LoC → ~250 LoC hedef
- sprint-controller.ts 1820 → ~1750 LoC (marginal slim; full slim Sprint 136)

**Kanıt:** `wc -l src/orchestra/ipc-registry.ts && grep -n "export.*askBrain\|handleWorkerQuestion" src/orchestra/ipc-registry.ts && grep -n "from.*ipc-registry" src/orchestra/sprint-controller.ts src/agents/worker-ipc.ts` → ipc-registry ≥200 LoC, askBrain + helpers hit, sprint-controller ipc-registry import'u hit

**Test:** 6+ test — (1) askBrain file-based happy path, (2) askBrain IPC socket path, (3) askBrain timeout fallback returns null, (4) handleWorkerQuestion routing correct handler, (5) getIPCRegistry singleton consistency, (6) worker-ipc re-export shim backward compat (`import { askBrain } from '../agents/worker-ipc.js'` hâlâ çalışıyor)

---

## Task 5: Structured Planner Priority + Dependencies Parsing
- Model: opus
- Priority: CRITICAL
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/task-builder.ts
- Scope: src/orchestra/

### Description
Sprint 134 Gate 0.2'de tespit edildi: `parseStructuredDirectives()` `- Priority:` ve `- Dependencies:` satırlarını ignore ediyor → tüm task'lar NORMAL priority + empty dependencies atanıyor. T-001 dep pipeline canlı çalışmadı, Sprint 135 kendi DIRECTIVES'inde bu fix'in ilk beneficiary'si olacak (Sprint 136 ilk canlı sprint).

**Meta-dogfood sınırı:** Bu task Sprint 135 DIRECTIVES **yazıldıktan sonra** build edilir. Sprint 135 execution'ı eski parser ile başlar (Priority/Dependencies ignore). Wave 1'de T-005 DONE olduktan sonra brain opsiyonel rerun yapabilir veya Sprint 135 legacy ile devam eder. Kabul edilen trade-off: fix'in BUILD + TEST edilmesi Sprint 135 için yeterli, canlı kullanım Sprint 136.

**Gereksinimler:**
- `parseStructuredDirectives` içinde task block loop'unda iki yeni regex:
  - `/^- Priority:\s*(CRITICAL|HIGH|NORMAL|LOW)$/m` → `task.priority` (default "NORMAL" if missing)
  - `/^- Dependencies:\s*(.+)$/m` → `task.dependencies: string[]` (split by comma, trim, filter empty)
- Sprint 135 DIRECTIVES'indeki 13 task için self-parse test: `parseStructuredDirectives(readFileSync('DIRECTIVES.md'))` → her task doğru priority + dep array

**Kanıt:** `grep -n "Priority\|Dependencies" src/orchestra/task-builder.ts` → regex hit

**Test:** 6+ test — (1) `- Priority: CRITICAL` → "CRITICAL", (2) `- Priority: HIGH` → "HIGH", (3) missing Priority → "NORMAL" default, (4) `- Dependencies: 135-001, 135-003` → ["135-001","135-003"], (5) empty Dependencies line → [], (6) Sprint 135 DIRECTIVES self-parse: 13 task doğru priority dağılımı (5 CRITICAL + 4 HIGH + 4 NORMAL)

---

## Task 6: Self-Audit Gate Dedicated Tests
- Model: sonnet
- Priority: HIGH
- Effort: normal
- Agent: test-writer
- Skills: testing-expert, typescript-expert
- Files: tests/orchestra/self-audit-gate.test.ts
- Scope: tests/orchestra/
- Dependencies: 135-001

### Description
Sprint 134 T-014 sadece 2 shallow test `sprint-finalizer.test.ts` içinde bıraktı. Bu task 5+ dedicated test yazar — `runSelfAuditGate()` function'ının tüm davranış matrisini kapsar.

**Gereksinimler:**
- Yeni dosya `tests/orchestra/self-audit-gate.test.ts` ≥100 satır, ≥5 `it(...)` bloğu
- Test scenarios:
  1. Happy path — tsc PASS + vitest PASS + honesty clean + metrics.jsonl exists → `overallGate === "PASS"`
  2. tsc fail → `overallGate === "GATE_FAILURE"`, `tsc.status === "FAIL"`, `tsc.errors.length > 0`
  3. vitest fail → `overallGate === "GATE_FAILURE"`, `vitest.status === "FAIL"`
  4. Honesty violation present → `overallGate === "GATE_FAILURE"`, `honesty.violations > 0`
  5. metrics.jsonl missing → `overallGate === "WARNING"` (NOT "GATE_FAILURE" — metrics missing is warning)
- Mock strategy: `vi.doMock('node:child_process', ...)` için exec, baseline file write helper
- Setup: `mkdtempSync(tmpdir)` + `.deckent/` dir + baseline JSON + metrics.jsonl per test

**Kanıt:** `wc -l tests/orchestra/self-audit-gate.test.ts` ≥100, `grep -c "^\s*it(" tests/orchestra/self-audit-gate.test.ts` ≥5

**Test:** `npx vitest run tests/orchestra/self-audit-gate.test.ts` → 5+ pass, 0 fail

---

## Task 7: Rubric Detail Positive-Path Tests
- Model: haiku
- Priority: HIGH
- Effort: low
- Agent: test-writer
- Skills: testing-expert
- Files: tests/orchestra/rubric-detail.test.ts
- Scope: tests/orchestra/

### Description
Sprint 134 T-013 sadece 2 negative-path test var (`sprint-finalizer.test.ts` içinde). Bu task 3+ positive-path dedicated test yazar — `formatRubricScoresSection()` function'ının happy path + avg math + N/A column davranışını kapsar.

**Gereksinimler:**
- Yeni dosya `tests/orchestra/rubric-detail.test.ts` ≥50 satır, ≥3 `it(...)` bloğu
- Test scenarios:
  1. Full rubric (4 criteria × 2 task) → markdown table: header `| Task | Correctness | Coverage | Scope | Docs | Avg |`, row'lar doğru, avg doğru hesaplanmış
  2. Boş/null rubric → "N/A" sütunları render edilmiş, task row hâlâ listelenmiş
  3. Avg math correctness — 4 task × 4 criteria → sprint overall avg doğru (örnek: 100+0+50+50 per criteria → avg 50)
- Function import: `formatRubricScoresSection` from `src/orchestra/sprint-retro-writer.ts` (Sprint 134 scorecard bu isim)

**Kanıt:** `wc -l tests/orchestra/rubric-detail.test.ts` ≥50, `grep -c "^\s*it(" tests/orchestra/rubric-detail.test.ts` ≥3

**Test:** `npx vitest run tests/orchestra/rubric-detail.test.ts` → 3+ pass, 0 fail

---

## Task 8: GO_WITH_GATE_FAILURE Status Propagation Wire
- Model: sonnet
- Priority: HIGH
- Effort: low
- Agent: bug-fixer
- Skills: typescript-expert
- Files: src/orchestra/sprint-finalizer.ts
- Scope: src/orchestra/

### Description
`GO_WITH_GATE_FAILURE` constant `src/orchestra/result-evaluator.ts:604`'te tanımlı ama `sprint-finalizer.ts`'e import edilmedi. `runSelfAuditGate()` GATE_FAILURE return ediyor ama `finalizeSprint()` sprint-level status'e propagate etmiyor — gate failure retro'ya yazıldı ama sprint `GO_WITH_TECH_DEBT` kaldı.

**Gereksinimler:**
- `src/orchestra/sprint-finalizer.ts` içine `import { GO_WITH_GATE_FAILURE } from './result-evaluator.js'` ekle
- Yeni export `applyGateStatus(currentStatus, gate): string` helper: gate.overallGate === "GATE_FAILURE" → return GO_WITH_GATE_FAILURE, else return currentStatus
- `finalizeSprint` flow'una wire: `runSelfAuditGate` return'ü sonra `finalStatus = applyGateStatus(finalStatus, gateResult)`
- Retro writer `Gate Failure` section'ı gate.errors içeriğiyle yazar (eğer mevcut değilse)

**Kanıt:** `grep -n "GO_WITH_GATE_FAILURE\|applyGateStatus" src/orchestra/sprint-finalizer.ts` → import + helper + usage hit

**Test:** 3+ test — (1) gate `{overallGate: "GATE_FAILURE"}` → `applyGateStatus("DONE", gate) === "GO_WITH_GATE_FAILURE"`, (2) gate `{overallGate: "PASS"}` → status unchanged, (3) gate `{overallGate: "WARNING"}` → status unchanged (metrics missing warning is not fail)

---

## Task 9: Worker Verify Loop Enforcement
- Model: opus
- Priority: HIGH
- Effort: normal
- Agent: architect
- Skills: typescript-expert, testing-expert
- Files: src/agents/worker.ts, src/orchestra/result-evaluator.ts
- Scope: src/agents/, src/orchestra/

### Description
Sprint 134 Verifier 4 unused-import tsc break yakaladı — worker'lar `tsc --noEmit` koşmadan `.result` yazıyordu. Bu task worker `finalizeResult()` öncesi zorunlu verify loop gate ekler: `tsc --noEmit` + `npx vitest run <scope>` başarısız olursa retry (max 3), son deneme de başarısızsa NO_GO result yaz.

**Meta-dogfood sınırı:** Bu task Sprint 135 worker'larında CANLI değil (fix build edilmeden önceki worker'lar çalışır). Sprint 136'dan itibaren tüm worker'lar bu gate'e takılır.

**Gereksinimler:**
- `src/agents/worker.ts` yeni export `enforceVerifyLoop(projectRoot, taskId, scope): Promise<VerifyResult>`
- `VerifyResult` interface: `{ ok: boolean; reason?: string; attempts: number }`
- Loop: max 3 attempt, her attempt `execAsync('npx tsc --noEmit')` + `execAsync('npx vitest run <scope>')`, ikisi de başarılı → `.tasks/{taskId}.verify-ran` marker yaz, return `{ok:true, attempts}`; başarısız → retry; max attempts → return `{ok:false, reason, attempts:3}`
- Timeout 300s per command, timeout → NO_GO immediate (retry yok, infrastructure failure)
- `worker.ts` finalizeResult/writeResult öncesi `enforceVerifyLoop` çağrısı; `!ok` ise `.result`'e NO_GO yaz
- `src/orchestra/result-evaluator.ts` honesty check: eğer `result.notes` `/pre-existing|unrelated/i` match AND `.tasks/{taskId}.verify-ran` marker yok → `HONESTY_VIOLATION_NO_VERIFY_MARKER` flag ekle

**Kanıt:** `grep -n "enforceVerifyLoop\|verify-ran\|HONESTY_VIOLATION_NO_VERIFY_MARKER" src/agents/worker.ts src/orchestra/result-evaluator.ts` → 3 hit

**Test:** 5+ test — (1) verify success → `.verify-ran` marker yazıldı, ok=true, (2) tsc fail attempt 1-2 pass 3 → ok=true attempts=3, (3) tsc fail 3x → ok=false attempts=3, (4) marker absent + honesty phrase → result-evaluator flag HONESTY_VIOLATION_NO_VERIFY_MARKER, (5) vitest scope-specific command doğru çağrıldı

---

## Task 10: sprint-docs-updater.ts Refactor 864 → 600 LoC
- Model: sonnet
- Priority: NORMAL
- Effort: normal
- Agent: refactorer
- Skills: typescript-expert, code-simplifier
- Files: src/orchestra/sprint-docs-updater.ts, src/orchestra/sprint-docs-helpers.ts
- Scope: src/orchestra/

### Description
Sprint 134 T-009 marginal debt: sprint-docs-updater.ts 864 LoC (target <600'u aşıyor). Pure refactor, davranış değişmez, mevcut test'ler 0 fail kalır.

**Gereksinimler:**
- Yeni dosya `src/orchestra/sprint-docs-helpers.ts` — pure string template builder fonksiyonları (managed-docs section formatter, CHANGELOG entry builder, SPRINT-LOG block formatter) extract
- `sprint-docs-updater.ts` → import helpers, mevcut function body'leri kaldır, referansları update
- Target: `sprint-docs-updater.ts ≤600 LoC`, `sprint-docs-helpers.ts ≤350 LoC`
- Public API aynı — mevcut consumer'lar değişiklik görmez
- `tests/orchestra/sprint-docs-updater*.test.ts` mevcut test'leri 0 fail (regression koruma)

**Kanıt:** `wc -l src/orchestra/sprint-docs-updater.ts src/orchestra/sprint-docs-helpers.ts` → updater ≤600, helpers ≤350

**Test:** Mevcut `tests/orchestra/sprint-docs-updater*.test.ts` test'leri regression koruma. Yeni test gerekmez (pure refactor).

---

## Task 11: Secondary Observability Instrument Points
- Model: sonnet
- Priority: NORMAL
- Effort: normal
- Agent: architect
- Skills: typescript-expert, performance-optimizer
- Files: src/core/config.ts, src/core/file-lock.ts, src/monitor/auditor.ts, src/orchestra/sprint-controller.ts
- Scope: src/core/, src/monitor/, src/orchestra/
- Dependencies: 135-001

### Description
Sprint 134 T-011 primary observability instrument'larını aldı (spawnWorkers, waitForResults, evaluateResult). Eksik 4 secondary instrument point Sprint 135'te eklenir — metrics.jsonl Sprint 135 boyunca canlı daha zengin veri toplar, load-test-report.md Sprint 134'ten daha anlamlı olur.

**Gereksinimler:**
- `src/core/config.ts` `loadConfig` içinde cache hit/miss: `metric('config.cache', 1, { result: 'hit' | 'miss' })`
- `src/core/file-lock.ts` `claimTask` wrapper: `trace('lock.wait', async () => { ... })`
- `src/monitor/auditor.ts` stale alert emission: `metric('hb.stale', 1, { taskId })`
- `src/orchestra/sprint-controller.ts` honesty checker trigger: `metric('honesty.check', delta, { taskId })`
- Tüm metric call'lar `import { metric, trace } from './observability.js'` (path task dosyasına göre ayarla)
- metrics.jsonl Sprint 135 sonunda ≥20 satır (Layer 4 criterion 10)

**Kanıt:** `grep -n 'metric.*config.cache\|lock.wait\|hb.stale\|honesty.check' src/core/config.ts src/core/file-lock.ts src/monitor/auditor.ts src/orchestra/sprint-controller.ts` → 4 hit (farklı dosyalarda)

**Test:** 6+ test — (1) loadConfig miss → metrics.jsonl config.cache line, (2) loadConfig hit → same, (3) claimTask lock.wait trace, (4) auditor stale → hb.stale metric, (5) honesty check → honesty.check metric, (6) generateLoadReport includes new metric names in output

---

## Task 12: Dashboard vs MCP State Divergence Fix
- Model: sonnet
- Priority: NORMAL
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert
- Files: src/cli/commands/status.ts, src/mcp/tools/status.ts, src/monitor/sprint-state.ts
- Scope: src/cli/, src/mcp/, src/monitor/

### Description
Sprint 134 boyunca CLI `deckent status` Sprint 133 COMPLETE gösterirken MCP Sprint 134 ACTIVE gösterdi — state divergence. Root cause: `.dashboard` file stale vs `.deckent/sprint-active.json` stale. Fix: tek source of truth — `.deckent/sprint-active.json`, hem CLI hem MCP oradan okusun. `.dashboard` display-only rol.

**Gereksinimler:**
- Yeni shared module `src/monitor/sprint-state.ts` — export `getCurrentSprintId(projectRoot): string | null`: `.deckent/sprint-active.json` → parse → return sprintId, missing/parse fail → null (veya last completed fallback)
- `src/cli/commands/status.ts` ve `src/mcp/tools/status.ts` her ikisi de `getCurrentSprintId` helper'ını import edip kullanır — direct `.dashboard` okuma kaldırılır
- `.dashboard` file rolü: sadece dashboard display için, source of truth değil

**Kanıt:** `grep -n "sprint-active.json\|getCurrentSprintId" src/cli/commands/status.ts src/mcp/tools/status.ts src/monitor/sprint-state.ts` → 3 dosyada hit

**Test:** 4+ test — (1) sprint-active.json var → CLI ve MCP aynı sprintId, (2) missing → null (veya last completed), (3) stale .dashboard ignored (sprint-active.json truth), (4) parse fail → null

---

## Task 13: Brain Memory Budget Enforcement + Config Sync
- Model: opus
- Priority: NORMAL
- Effort: normal
- Agent: architect
- Skills: typescript-expert, system-architect
- Files: src/orchestra/debt-manager.ts, src/core/config.ts, .deckent/config.json, src/orchestra/sprint-finalizer.ts
- Scope: src/orchestra/, src/core/, .deckent/

### Description
Sprint 135 pre-flight canlı kanıt: `deckent cleanup --decay` no-op oldu (1179 → 1179) çünkü DECISIONS.md (702 satır permanent ADR) budget hesabına dahil ama decay edilemez. Config drift: `.deckent/config.json` memory_budget=600 eski değer, DECKENT.md 900 der.

**Gereksinimler:**
- `src/orchestra/debt-manager.ts` (runDecay lives here) yeni constant: `DECAY_EXEMPT = new Set(['DECISIONS.md', 'PROJECT-IDENTITY.md'])`
- Yeni export `auditBrainBudget(projectRoot, budget): BrainBudgetAudit` — decayable/permanent/total line accounting, status OK/OVER
- `runDecay` body'si decayable-only files üzerinde çalışır (filter `DECAY_EXEMPT`)
- `src/core/config.ts` DEFAULT_CONFIG.memory_budget: 600 → 900
- `.deckent/config.json` memory_budget: 600 → 900 (config drift fix)
- `src/orchestra/sprint-finalizer.ts` `finalizeSprint` sonunda auto-trigger: `auditBrainBudget` → `status === "OVER"` ise `runDecay(force:true)` çağır
- Pre-flight'taki decay no-op bug'ı Sprint 135 sonu doctor check'te düzelmiş olmalı

**Kanıt:** `grep -n "DECAY_EXEMPT\|auditBrainBudget\|memory_budget" src/orchestra/debt-manager.ts src/core/config.ts src/orchestra/sprint-finalizer.ts && grep "memory_budget" .deckent/config.json` → 900 value

**Test:** 5+ test — (1) DECISIONS.md exclude from decayable count, (2) PROJECT-IDENTITY.md exclude, (3) decay reduces MEMORY.md when decayable > budget, (4) loadConfig defaults memory_budget=900, (5) finalizeSprint auto-trigger when decayable > budget

---

## Sprint 135 Notları

- **max_workers=4** HARD LIMIT (feedback_max_workers.md reaffirmed)
- **brain_planning=structured** (deterministic DIRECTIVES parse)
- **mode=performance** (opus default, task başı override ile sonnet/haiku)
- **spawn_backend=docker** (Sprint 134 same)
- **verify_loop=active** (T-009 fix Sprint 136'dan etkili)
- **telemetry_enabled=false** (hard-coded, data locality)
- **auto_archive_directives=true** (Sprint 134 başarısız, Sprint 135 criterion 9 redemption)
- **dependency_pipeline_enabled** bootstrap=false → T-005 DONE sonrası true (two-phase, Sprint 136'dan canlı)
- **Pre-sprint baseline** (2026-04-10 19:03): 505 files, 12485 pass, 16 skipped, 0 fail
- **Target metrics**: Layer 3 ≥15/17 PASS, readiness ≥3.95, 60+ new tests (target 12545+)
- **Critical path**: T-001 → T-004 → T-008 → T-009 (~120dk minimum)
- **Scope kesme sırası** (if needed): T-010 → T-011 → T-012 → T-013 (P2), ASLA kesilmez: T-001, T-002, T-003, T-005
- **External monitoring**: Watchdog (Explore subagent, 40 cycle) + Verifier (ana session run_in_background tsc+vitest periodic) + Shell Watchdog (manuel periyodik, her 2-3dk)
- **Acceptance**: Layer 3 tam doğrulama (tsc + vitest + 13 grep kanıtı + scope compliance + 17-criterion scoring)
- **Design spec**: `docs/superpowers/specs/2026-04-10-sprint-135-design.md` (approved, 563 satır)
- **Fallback plan**: `docs/superpowers/plans/2026-04-11-sprint-135-plan.md` (bite-sized TDD manual rescue, 1806 satır)
- **Recovery template** (if coordinator crash): `.claude/plans/melodic-launching-aurora.md` (Sprint 134 template reuse)
