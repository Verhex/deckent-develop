# Sprint 135 Design — Operational Hardening + Triple Dogfooding Completion

**Date:** 2026-04-10
**Author:** Brain (Claude Opus 4.6, 1M context)
**Previous Sprint:** Sprint 134 (GO_WITH_TECH_DEBT, 14/17 Layer 3 criteria, readiness 3.86/5)
**Reference:** `.claude/projects/-home-alperen-deckent-dev/memory/project_sprint135_preflight.md`, `.deckent/sprint-134-layer3-scorecard.md`, `docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md` Section 12+13

---

## 0. Pre-Flight Snapshot (2026-04-10)

| Kontrol | Sonuç |
|---------|-------|
| Git branch | master, head 6735d27 |
| Git status | Sadece runtime state (.brain/ERRORS.md, .deckent/*.json) — commit edilmeyecek |
| `tsc --noEmit` | 0 errors |
| `vitest run` baseline | 505 files, 12485 pass, 16 skipped, 0 fail (86s) |
| `.tasks/` | Temiz, sadece `decisions/` |
| Sprint 134 archive | `.brain/archive/DIRECTIVES-sprint-134.md` yok, `.brain/sprints/sprint-134.md` yok (coordinator crash) |
| Sprint 134 artifacts | `.deckent/sprint-134-gate.json`, `sprint-134-layer3-scorecard.md`, `docs/audits/sprint-134/load-test-report.md` tümü mevcut |
| Brain budget | 1179/600 over (canlı T-013 kanıtı — decay no-op 1179→1179) |
| Config drift | `.deckent/config.json` memory_budget=600 (DECKENT.md 900 der) |

---

## 1. Goal

Sprint 134'ün operasyonel kırılganlıklarını kapatmak ve 12 carry-over debt item'ın tamamını tüketmek (genişleyerek 13 task'a ulaştı). Triple dogfooding tezinin ikinci yarısını tamamlamak: Sprint 134 feature'ları (coordinator lifecycle, dep pipeline structured parse, T-014 self-audit gate, T-011 observability, T-010 askBrain extraction) Sprint 135'te canlı kullanılacak.

**Hedef metrikler:**
- Layer 3 17-criterion ≥15/17 PASS (Sprint 134 14/17 → +1)
- Kur-Çalıştır Readiness Score ≥3.95/5 (Sprint 134 3.86 → +0.09)
- 0 NO_GO task
- 0 manual recovery
- Sprint clean GO (GO_WITH_TECH_DEBT değil)

**Sprint Identity Statement:** Sprint 135 = Sprint 134'ün tamamlanması. Yeni feature yok, yeni ADR yok, yeni vizyon yok. Sadece Sprint 134'ün yazıp bitiremediği işler, Sprint 134'ün yeni yarattığı operasyonel borçlar, Sprint 134'ün yarım bıraktığı triple dogfooding.

---

## 2. Architecture

Sprint 135 **tek bir yeni özellik eklemiyor** — 134 sprintlik altyapının operasyonel yüzeyini sertleştiriyor. Mimari değişiklikler **yerinde güçlendirme** (in-place hardening):

1. **Orchestrator Resilience Layer** — yeni modül `sprint-pid-manager.ts`, sprint-controller.ts ve CLI start arasında ince katman (PID lifecycle + state snapshot + orphan detection)
2. **Auditor Reconciliation Logic** — in-place `auditor.ts`, stale detection karar ağacına `.result` existence kontrolü eklenir
3. **Docker Backend Graceful Shutdown** — in-place `spawn-backend-docker.ts`, container lifecycle'da `docker stop --time=10` + worker SIGTERM handler
4. **IPC Extraction Completion** — move `sprint-controller.ts` → `ipc-registry.ts`, re-export shim ile backward compat
5. **Structured Planner Parser Hardening** — in-place `planner.ts`, `task-builder.ts`, `- Priority:` + `- Dependencies:` parse
6. **Test Coverage Deepening** — yeni `self-audit-gate.test.ts`, `rubric-detail.test.ts`, worker verify loop tests
7. **Observability Secondary Instrument Points** — in-place 4 eksik point (loadConfig, claimTask, heartbeat_stale, honesty_check)

### Vision Lens Audit (4 Prensip)

13/13 task vizyon lensinden geçti. Hiçbir task SaaS/cloud/paywall/enterprise edition yönünde değil. Birkaç task (Docker HB, planner parsing, brain budget) doğrudan **"kur çalıştır kolay"** hedefini güçlendiriyor çünkü sessiz failure'ları kapatıyor.

| Prensip | Sprint 135 Uygunluk |
|---|---|
| Product not Service | Tüm task'lar local dosya I/O + local Docker, dış network çağrısı yok |
| Kur-Çalıştır Kolay | T-001 crash recovery + T-002/T-003 docker temizliği + T-005 planner fix + T-013 auto-decay hepsi kullanıcı deneyimini sadeleştirir |
| Açık Kaynak Ücretsiz | Tüm değişiklikler tek kod tabanında, feature flag veya premium segment yok |
| Herkes İçin Her Yerde | WSL2/Linux/Mac/Windows cross-platform korunur (PID liveness check posix + Windows compatible) |

---

## 3. Components — 13 Task Specification

Tüm task'lar performance mode, opus default. DIRECTIVES yazımında aynen kullanılacak.

### Wave 1 — P0 Critical (5 task)

#### T-001: Sprint Coordinator Resilience
- **Agent:** architect · **Effort:** high · **Skills:** typescript-expert, system-architect
- **Files:** `src/orchestra/sprint-pid-manager.ts` (new), `src/orchestra/sprint-controller.ts`, `src/cli/commands/start.ts`
- **Scope:** `src/orchestra/`, `src/cli/`
- **Description:** PID file + state snapshot + orphan detection. `sprint-pid-manager.ts` exports: `writePid(sprintId)`, `readPid(sprintId)`, `writeStateSnapshot(sprintId, state)`, `readStateSnapshot(sprintId)`, `detectOrphan(): OrphanInfo | null`, `clearPid(sprintId)`. sprint-controller hooks: sprint start'ta `writePid`, her 30s periodic `writeStateSnapshot` (taskId → status map, currentWave, metrics.jsonl size), `process.on('beforeExit')` → final snapshot + observability flush. start.ts: stale PID detect → prompt "Recover / Archive / Abort" (readline), `--auto-approve` default Archive. State format JSON, atomic write (temp + rename). Cross-platform posix + Windows PID liveness via `process.kill(pid, 0)`.
- **Kanıt:** `ls src/orchestra/sprint-pid-manager.ts && grep -n "writePid\|writeStateSnapshot\|detectOrphan\|orphan.*prompt" src/orchestra/sprint-pid-manager.ts src/orchestra/sprint-controller.ts src/cli/commands/start.ts`
- **Test:** 8+ — (1) writePid happy path + collision, (2) readPid missing → null, (3) writeStateSnapshot atomic rename, (4) detectOrphan no pid → null, (5) detectOrphan stale → OrphanInfo, (6) detectOrphan live → null, (7) beforeExit handler fires final snapshot, (8) start command stale PID → auto-approve Archive path

#### T-002: Auditor HB+Result Reconciliation (Docker bug defensive)
- **Agent:** bug-fixer · **Effort:** normal · **Skills:** typescript-expert, testing-expert
- **Files:** `src/monitor/auditor.ts`
- **Scope:** `src/monitor/`
- **Description:** Stale detection algoritmasına `.result` existence check eklenir. Yeni function `shouldReportStale(taskId, hbContent)`: eğer `.tasks/task-{id}.result` exists AND parse edilebilir JSON AND `selfAssessment in {DONE, GO_WITH_TECH_DEBT}` → false. Aksi halde mevcut mantık devam. Sprint 134'teki 47+ false positive'i auditor seviyesinde susturur.
- **Kanıt:** `grep -n "shouldReportStale\|reconcile.*result" src/monitor/auditor.ts`
- **Test:** 5+ — (1) HB stale + no result → alert, (2) HB stale + result DONE → no alert, (3) HB stale + result NO_GO → alert (honest), (4) malformed result JSON → alert (fail-safe), (5) HB FAILED exitCode 137 + result DONE → no alert (Sprint 134 exact case)

#### T-003: Docker Backend Graceful Shutdown (offensive root cause)
- **Agent:** bug-fixer · **Effort:** normal · **Skills:** docker-expert, typescript-expert
- **Files:** `src/orchestra/spawn-backend-docker.ts`, `src/agents/worker.ts`
- **Scope:** `src/orchestra/`, `src/agents/`
- **Description:** Container shutdown `docker stop --time=10` kullanır. Worker script'e SIGTERM handler: `.result` yazılmışsa HB'ye `{status: "DONE", exitCode: 0}` finalize et, `process.exit(0)`. SIGKILL fallback 10s sonrası. Root cause kapanır, dashboard "FAILED exitCode 137" spam'i biter.
- **Kanıt:** `grep -n "docker.*stop.*time=10\|SIGTERM\|finalizeHeartbeat" src/orchestra/spawn-backend-docker.ts src/agents/worker.ts`
- **Test:** 4+ — (1) worker SIGTERM + result → HB DONE exitCode 0, (2) worker SIGTERM + no result → HB FAILED (honest), (3) backend uses `--time=10`, (4) SIGKILL fallback still works after timeout

#### T-004: askBrain() Extraction Finish (Conservative)
- **Agent:** refactorer · **Effort:** high · **Skills:** system-architect, typescript-expert
- **Files:** `src/orchestra/ipc-registry.ts`, `src/orchestra/sprint-controller.ts`, `src/agents/worker-ipc.ts`
- **Scope:** `src/orchestra/`, `src/agents/`
- **Description:** `askBrain()` + `handleWorkerQuestion`, `routeAnswer`, `getIPCRegistry` `worker-ipc.ts:418-504`'ten `ipc-registry.ts`'ye move. sprint-controller.ts yeni konumdan import. `worker-ipc.ts` orijinal konumda re-export shim bırakır. ipc-registry.ts 37 LoC → ~250 LoC. sprint-controller.ts ~1820 → ~1750 (full slim Sprint 136'ya).
- **Kanıt:** `wc -l src/orchestra/ipc-registry.ts && grep -n "export.*askBrain\|handleWorkerQuestion" src/orchestra/ipc-registry.ts && grep -n "from.*ipc-registry" src/orchestra/sprint-controller.ts src/agents/worker-ipc.ts`
- **Test:** 6+ — (1) askBrain file-based path, (2) askBrain IPC socket path, (3) askBrain timeout fallback, (4) handleWorkerQuestion routing, (5) getIPCRegistry singleton, (6) re-export shim backward compat

#### T-005: Structured Planner Priority + Dependencies Parsing
- **Agent:** bug-fixer · **Effort:** normal · **Skills:** typescript-expert, testing-expert
- **Files:** `src/orchestra/planner.ts`, `src/orchestra/task-builder.ts`
- **Scope:** `src/orchestra/`
- **Description:** `parseStructuredDirectives()` şu an `- Priority:`, `- Dependencies:` satırlarını ignore ediyor. Fix: regex pattern ekle, parse değerleri `task.priority` + `task.dependencies` alanlarına set. Sprint 134 Gate 0.2 tespiti.
- **Meta-dogfood sınırı:** Sprint 135 DIRECTIVES **T-005 fix build edilmeden önce yazılır** (sprint spawn anında eski parser çalışır). Priority satırları DIRECTIVES'e gömülür ama ilk dry-run'da ignore edilir. Wave 1'de T-005 DONE olduktan sonra brain isteğe bağlı olarak `deckent plan --structured` rerun edebilir veya Sprint 135 execution legacy NORMAL priority ile devam edip fix'in etkisini Sprint 136'da görebilir. **Kabul edilen:** Sprint 135 execution'ı için priority/dependency değil, fix'in kendisinin build + test edilmesi kritik. Sprint 136 ilk "fix canlı çalışan" sprint olacak.
- **Kanıt:** `grep -n "Priority\|Dependencies" src/orchestra/planner.ts src/orchestra/task-builder.ts`
- **Test:** 6+ — (1) `- Priority: CRITICAL` → "CRITICAL", (2) `- Priority: HIGH` → "HIGH", (3) missing → NORMAL default, (4) `- Dependencies: 135-001, 135-003` → ["135-001","135-003"], (5) empty → [], (6) Sprint 135 DIRECTIVES self-parse 13 task

### Wave 2 — P1 High (4 task)

#### T-006: self-audit-gate.test.ts Dedicated Tests
- **Agent:** test-writer · **Effort:** normal · **Skills:** testing-expert, typescript-expert
- **Files:** `tests/orchestra/self-audit-gate.test.ts` (new)
- **Scope:** `tests/orchestra/`
- **Description:** Sprint 134 T-014 sadece 2 shallow test bıraktı. 5+ dedicated: (1) happy path all PASS, (2) tsc fail → GATE_FAILURE + errors, (3) vitest fail → GATE_FAILURE + delta, (4) honesty violation → GATE_FAILURE, (5) metrics.jsonl missing → WARNING not fail, (6) combined tsc+vitest fail → GATE_FAILURE.
- **Kanıt:** `wc -l tests/orchestra/self-audit-gate.test.ts` ≥100, `grep -c "^\s*it(" tests/orchestra/self-audit-gate.test.ts` ≥5
- **Test:** `npx vitest run tests/orchestra/self-audit-gate.test.ts` 0 fail

#### T-007: rubric-detail.test.ts Positive-Path Tests
- **Agent:** test-writer · **Effort:** low · **Skills:** testing-expert
- **Files:** `tests/orchestra/rubric-detail.test.ts` (new)
- **Scope:** `tests/orchestra/`
- **Description:** Sprint 134 T-013 sadece 2 negative-path test var. 3+ positive: (1) full rubric → doğru table format, (2) boş rubric → N/A sütunları, (3) avg math correctness.
- **Kanıt:** `wc -l tests/orchestra/rubric-detail.test.ts` ≥50, `grep -c "^\s*it(" tests/orchestra/rubric-detail.test.ts` ≥3
- **Test:** `npx vitest run tests/orchestra/rubric-detail.test.ts` 0 fail

#### T-008: GO_WITH_GATE_FAILURE Status Propagation Wire
- **Agent:** bug-fixer · **Effort:** low · **Skills:** typescript-expert
- **Files:** `src/orchestra/sprint-finalizer.ts`
- **Scope:** `src/orchestra/`
- **Description:** Constant `result-evaluator.ts:604`'te tanımlı ama sprint-finalizer import etmiyor. `runSelfAuditGate()` return'ü `overallGate === "GATE_FAILURE"` ise sprint result'ta `finalStatus = GO_WITH_GATE_FAILURE` set. Retro writer bunu "Gate Failure" section olarak yansıtsın.
- **Kanıt:** `grep -n "GO_WITH_GATE_FAILURE" src/orchestra/sprint-finalizer.ts`
- **Test:** 3+ — (1) gate PASS → unchanged, (2) GATE_FAILURE → finalStatus propagate, (3) WARNING (metrics missing) → unchanged

#### T-009: Worker Verify Loop Enforcement
- **Agent:** architect · **Effort:** normal · **Skills:** typescript-expert, testing-expert
- **Files:** `src/agents/worker.ts`, `src/orchestra/result-evaluator.ts`
- **Scope:** `src/agents/`, `src/orchestra/`
- **Description:** Sprint 134 Verifier 4 unused-import tsc break yakaladı — worker'lar `tsc --noEmit` koşmadan `.result` yazıyordu. Fix: worker `finalizeResult()` öncesi `tsc --noEmit` + `npx vitest run <scope>` zorunlu gate. Retry max 3, başarısız → NO_GO. Honesty checker marker `.tasks/{id}.verify-ran` kontrol eder; eksikse `HONESTY_VIOLATION` flag. Timeout 300s → NO_GO (retry yok). Meta-dogfood sınırı: Sprint 135'in kendi worker'ları bu fix öncesinde koşacak, fix Sprint 136'dan etkili.
- **Kanıt:** `grep -n "tsc.*noEmit\|verify.*ran\|enforceVerifyLoop" src/agents/worker.ts src/orchestra/result-evaluator.ts`
- **Test:** 5+ — (1) verify success → .result written, (2) tsc fail → retry, (3) max retries → NO_GO, (4) marker absent → honesty flag, (5) vitest scope-specific run

### Wave 3 — P2 Medium (4 task)

#### T-010: sprint-docs-updater.ts Refactor 864 → 600 LoC
- **Agent:** refactorer · **Effort:** normal · **Skills:** typescript-expert, code-simplifier
- **Files:** `src/orchestra/sprint-docs-updater.ts`, `src/orchestra/sprint-docs-helpers.ts` (new)
- **Scope:** `src/orchestra/`
- **Description:** Sprint 134 T-009 marginal debt. Helper extract: string template builders (managed-docs section, CHANGELOG entry, SPRINT-LOG block) ayrı dosyaya. Target updater ≤600, helpers ≤350. Public API değişmez.
- **Kanıt:** `wc -l src/orchestra/sprint-docs-updater.ts src/orchestra/sprint-docs-helpers.ts` → updater ≤600, helpers ≤350
- **Test:** Mevcut `tests/orchestra/sprint-docs-updater*.test.ts` 0 fail (regression)

#### T-011: T-011 Secondary Instrument Points
- **Agent:** architect · **Effort:** normal · **Skills:** typescript-expert, performance-optimizer
- **Files:** `src/core/config.ts`, `src/core/file-lock.ts`, `src/monitor/auditor.ts`, `src/orchestra/sprint-controller.ts`
- **Scope:** `src/core/`, `src/monitor/`, `src/orchestra/`
- **Description:** Sprint 134 T-011 primary instrument'ları aldı, eksik 4 secondary: (1) loadConfig cache hit/miss `metric("config.cache", 1, {result})`, (2) claimTask file lock wait `trace("lock.wait", ...)`, (3) auditor heartbeat_stale `metric("hb.stale", count)`, (4) honesty_check trigger `metric("honesty.check", delta)`. metrics.jsonl Sprint 135 boyunca canlı veri toplar.
- **Kanıt:** `grep -n 'metric.*config.cache\|lock.wait\|hb.stale\|honesty.check' src/core/ src/monitor/auditor.ts src/orchestra/sprint-controller.ts`
- **Test:** 6+ — (1-4) per instrument point positive case, (5) metrics.jsonl write verification, (6) generateLoadReport includes new metrics

#### T-012: Dashboard vs MCP State Divergence Fix
- **Agent:** bug-fixer · **Effort:** normal · **Skills:** typescript-expert
- **Files:** `src/cli/commands/status.ts`, `src/mcp/tools/status.ts`, `src/monitor/dashboard-writer.ts`
- **Scope:** `src/cli/`, `src/mcp/`, `src/monitor/`
- **Description:** Sprint 134 CLI/MCP state divergence. Root cause muhtemelen auditor scan refresh gap, `.dashboard` vs `.deckent/sprint-active.json` stale. Fix: tek source of truth (`.deckent/sprint-active.json`), hem CLI hem MCP oradan okusun. `.dashboard` sadece display.
- **Kanıt:** `grep -n "sprint-active.json\|readActiveSprint\|getCurrentSprint" src/cli/commands/status.ts src/mcp/tools/status.ts`
- **Test:** 4+ — (1) read from sprint-active.json, (2) CLI + MCP same sprintId, (3) missing → fall back to last completed, (4) stale .dashboard ignored

#### T-013: Brain Memory Budget Enforcement + Config Sync
- **Agent:** architect · **Effort:** normal · **Skills:** typescript-expert, system-architect
- **Files:** `src/orchestra/decay.ts`, `src/core/config.ts`, `.deckent/config.json`
- **Scope:** `src/orchestra/`, `src/core/`, `.deckent/`
- **Description:** Pre-flight canlı kanıtı: decay no-op (1179→1179) çünkü DECISIONS.md (702 permanent) budget içinde sayılıyor ama decay edilmiyor. Fix: (a) `DECAY_EXEMPT = ['DECISIONS.md','PROJECT-IDENTITY.md']`, budget accounting "decayable only", (b) config memory_budget 600→900 sync, (c) `finalizeSprint()` auto-trigger decay when over. Meta-dogfood canlı.
- **Kanıt:** `grep -n "DECAY_EXEMPT\|memory_budget" src/orchestra/decay.ts src/core/config.ts && grep "memory_budget" .deckent/config.json` → 900
- **Test:** 5+ — (1) decay excludes DECISIONS.md, (2) decay excludes PROJECT-IDENTITY.md, (3) decay reduces MEMORY.md when over, (4) config loads 900 default, (5) finalizeSprint auto-trigger when over

### Dependency Graph

```
Wave 1 (parallel 4 slot, T-005 tail)
  T-001 coordinator ────┐
  T-002 auditor        ─┤
  T-003 docker         ─┤
  T-004 askBrain       ─┤
  T-005 planner        ─┘
         │
         ▼
Wave 2 (parallel 4)
  T-006 test self-audit ┐
  T-007 test rubric    ─┤
  T-008 gate propagate ─┤
  T-009 verify loop   ──┘
         │
         ▼
Wave 3 (parallel 4)
  T-010 docs refactor   ┐
  T-011 obs points     ─┤
  T-012 state fix     ──┤
  T-013 brain budget  ──┘
```

max_workers=4 HARD LIMIT. Wave 1'de T-005 ilk 4 slot dolduğu için wave tail'ında spawn. Tüm task'lar scope-orthogonal (aynı dosya collision yok).

---

## 4. Data Flow

Sprint 135'in 13 task'ı 3 kritik data flow'u değiştiriyor.

### Flow 1 — Coordinator Lifecycle (T-001)

```
deckent start
  → sprint-controller.runSprint()
     → sprint-pid-manager.writePid(sprintId)     ── .deckent/sprint-135.pid
     → register beforeExit handler
     → start periodic snapshot 30s                ── .deckent/sprint-135.state.json (atomic)
  → spawn Wave 1 workers
  → execute tasks (metric emit → .deckent/metrics.jsonl)
  → Happy exit: finalizeSprint()
       → writeRubricDetail
       → runSelfAuditGate
       → archiveDirectives                         ── .brain/archive/ + .brain/sprints/
       → clearPid(sprintId)
       → delete state.json
  → Crash exit: beforeExit handler (MAY fire)
       → observability.flushSync
       → final state snapshot
       → .pid + state.json STAYS (forensic + recovery trail)

Next deckent start:
  → detectOrphan() reads .deckent/sprint-*.pid
  → pid exists AND process.kill(pid, 0) throws ESRCH:
      → prompt "Recover / Archive / Abort"
      → --auto-approve default: Archive
```

Sprint 134'te `.pid` yoktu, `state.json` yoktu, zombi state'ten otomatik çıkış yoktu. Sprint 135'te `deckent start` her invocation'da orphan taraması yapar. Atomic write: `fs.writeFileSync(temp)` + `fs.renameSync(temp, final)` → kısmi yazım korrupt dosya bırakmaz.

### Flow 2 — Docker Worker Shutdown (T-002 + T-003)

Sprint 134 bug:
```
task execute → .tasks/task-134-XXX.result yazıldı ✓
backend: docker kill (SIGKILL immediate)
worker trap EXIT → HB "FAILED" + exitCode 137 ✗
auditor scan → stale CRITICAL alert ✗ (47+ kez)
```

Sprint 135 fix:
```
task execute → .tasks/task-135-XXX.result yazıldı ✓
backend: docker stop --time=10 (SIGTERM, 10s grace)    ── T-003
worker SIGTERM handler:                                 ── T-003
  if (.result exists) { HB.status="DONE"; exit(0); }
auditor scan: shouldReportStale(taskId, hb):            ── T-002
  if (.result exists AND DONE) return false;
no alert (defensive B + offensive C double protection)
```

T-002 auditor filter Sprint 135 boyunca hemen etkili. T-003 graceful shutdown sadece T-003 build edildikten sonraki worker'larda etkili (meta-dogfood: Wave 1 T-003 DONE → Wave 2/3 worker'lar temiz shutdown deneyimi).

### Flow 3 — Brain Memory Budget + Auto Decay (T-013)

Bug:
```
runDecay(...)
currentLines = 1179 (DECISIONS 702 dahil)
if (currentLines > budget=900) → trim
  but DECISIONS.md permanent → cannot trim
result: 1179 → 1179 no-op, warning spam
```

Fix:
```
DECAY_EXEMPT = ['DECISIONS.md', 'PROJECT-IDENTITY.md']
decayableLines = sum(files \ DECAY_EXEMPT) = ~477
permanentLines = 702
if (decayableLines > budget) → decay only decayable files
report: "477/900 decayable + 702 permanent = 1179 total (OK)"

config .deckent/config.json memory_budget: 600 → 900 (sync with DECKENT.md)
finalizeSprint() auto-trigger if decayableLines > budget
```

Sprint 135 canlı dogfood: T-013 merge sonrası finalizeSprint() auto-decay'i tetikleyebilir.

### Data Locality Hard Contract

Üç flow da dış network çağrısı sıfır. Tüm dosyalar `.deckent/` veya `.brain/`. metrics.jsonl append-only line-delimited JSON, yerel makine. "Product not service" 4. prensip: kullanıcı verisi kullanıcı makinesinden ayrılmaz.

---

## 5. Error Handling

### Error 1 — Orphan Sprint Detection (T-001)

**Tespit:** `detectOrphan()` PID existence + process liveness check via `process.kill(pid, 0)`:
- PID yok → temiz start
- PID var, process alive → hata "Sprint NNN already running (pid X)", exit code 2
- PID var, process gone → orphan, recovery flow

**Recovery:** Interactive readline prompt, non-interactive `--auto-approve` default = Archive. TTY yoksa (CI) → auto-Archive + warning. State restore `.brain/archive/sprint-NNN-state.json` (forensic).

**Fail-safe:** Corrupted JSON parse → "corrupted snapshot" warning + Archive path.

### Error 2 — Gate Failure Propagation (T-008)

Sprint 134 bug: gate failure retro'ya yazıldı ama sprint status `GO_WITH_TECH_DEBT` kaldı. Fix:
```typescript
const gate = await runSelfAuditGate(sprintId);
let finalStatus: SprintStatus;
if (gate.overallGate === "GATE_FAILURE") {
  finalStatus = GO_WITH_GATE_FAILURE;
  retroWriter.addSection("Gate Failure", gate.errors);
} else if (gate.overallGate === "WARNING" && gate.metricsJsonlMissing) {
  finalStatus = decideByRubric(rubricAvg);
} else {
  finalStatus = decideByRubric(rubricAvg);
}
```

**Fail-safe:** Gate execution throws → status unchanged, retro'ya "gate execution failed" warning. Gate execution failure ≠ gate failure.

### Error 3 — Verify Loop Enforcement Failure (T-009)

```typescript
async function enforceVerifyLoop(taskId, scope): Promise<VerifyResult> {
  let attempt = 0;
  while (attempt < 3) {
    const tsc = await run('npx tsc --noEmit');
    const vitest = await run(`npx vitest run ${scope}`);
    if (tsc.ok && vitest.ok) {
      await writeMarker(`.tasks/${taskId}.verify-ran`);
      return { ok: true };
    }
    attempt++;
  }
  return { ok: false, reason: 'verify_loop_exhausted' };
}
```

Honesty marker `.tasks/{id}.verify-ran` yoksa → result-evaluator `HONESTY_VIOLATION` flag. Timeout 300s → NO_GO, retry yok (infrastructure failure).

### Error 4 — Decay Budget False Positive (T-013)

Pre-flight canlı kanıt: doctor "1179/900 OVER" ama decayable 477/900 OK. Fix: `DECAY_EXEMPT` set + `auditBrainBudget()` decayable-only accounting. Doctor output format değişir: `"OK Memory: 477/900 decayable (702 permanent records)"`.

**Fail-safe:** Config write fail → warning, loadConfig merge default 900.

### Error 5 — Auto-Archive Failure (Sprint 134 Repeat)

Sprint 134 criterion 9 FAIL: archiveDirectives hiç çalışmadı. Sprint 135 beklenti: T-001 sayesinde coordinator stable → finalizeSprint doğal çağrılır → archiveDirectives çalışır. **Criterion 9 Sprint 135'te redemption şansı.**

Fail-safe layer 1 (T-001): beforeExit handler forensic snapshot. Layer 2 (manuel): recovery template `melodic-launching-aurora.md` hâlâ geçerli.

### Hata Özeti Tablosu

| # | Error | Tespit | Kurtarma | Fail-safe |
|---|-------|--------|----------|-----------|
| 1 | Orphan sprint | PID+liveness | Recover/Archive/Abort prompt | Corrupted → Archive |
| 2 | Gate failure | runSelfAuditGate | GO_WITH_GATE_FAILURE propagate | Gate throws → warning, tech debt close |
| 3 | Verify loop fail | tsc/vitest | Retry 3x → NO_GO | 300s timeout → NO_GO no retry |
| 4 | Decay false positive | DECAY_EXEMPT accounting | "decayable only" budget | Config write fail → 900 default |
| 5 | Auto-archive miss | Layer 3 grep check | Manual recovery template | beforeExit snapshot forensic |

---

## 6. Testing Strategy

### Part A — Per-Task Test Requirements

| Task | Min Test | Type |
|---|---|---|
| T-001 Coordinator Resilience | 8+ | Unit + integration |
| T-002 Auditor Reconciliation | 5+ | Unit state matrix |
| T-003 Docker Graceful Shutdown | 4+ | Unit + smoke |
| T-004 askBrain Extraction | 6+ | Unit + backward-compat shim |
| T-005 Planner Priority/Dep | 6+ | Unit regex + integration |
| T-006 self-audit-gate.test.ts | 5+ | Dedicated |
| T-007 rubric-detail.test.ts | 3+ | Dedicated positive-path |
| T-008 Gate Propagation | 3+ | Unit status mapping |
| T-009 Verify Loop | 5+ | Unit retry + honesty marker |
| T-010 Docs Refactor | 0 new | Regression koruma |
| T-011 Secondary Instruments | 6+ | Unit + integration |
| T-012 Dashboard/MCP | 4+ | Unit single source |
| T-013 Brain Budget | 5+ | Unit + config drift |

**Toplam hedef:** 60+ yeni test. Baseline 12485 → target ≥12545. Sprint 134 benzeri overdeliver (43 spec → 113 gerçek) beklenebilir.

### Part B — Monitoring Agents During Execution

**Watchdog (Explore subagent_type):**
- 40 cycle, sleep 1.8s (~3-4dk subagent context)
- Job: `ls .tasks/*.hb`, `ls .tasks/*.result`, `cat .deckent/sprint-135.pid`, `deckent status` readonly
- Alert: task DONE ama .result yok, stale HB >2dk, pid disappear

**Verifier (ana session `run_in_background=true`):**
- `npx tsc --noEmit` her ~5dk, `npx vitest run --reporter=basic | tail -5` her ~8dk
- Ana session notification ile alerts
- 4 kritik tsc regression yakalama hedefi (Sprint 134 benchmark)

**Shell Watchdog (manuel periyodik):**
- Her 2-3dk: `deckent status`, `ls .deckent/sprint-135.pid`, `ls .deckent/sprint-135.state.json`, `ps aux | grep deckent`, `docker ps`
- PID missing veya process gone → meta-dogfood red flag (T-001 çalışmıyor)

### Part C — Layer 3 Verification Pipeline (17 Criterion)

**Layer 1 — Deckent Self-Evaluation (3)**
1. ≥11 task DONE (13 × 0.85)
2. HIGH effort tasks (T-001, T-004) not NO_GO
3. Brain rubric avg ≥75/100

**Layer 2 — Technical Verification (3)**
4. `tsc --noEmit` 0 errors
5. `vitest run` ≥12545 pass, 0 fail
6. Dashboard regression 0

**Layer 3 — Manual Verification (3)**
7. Per-task grep proof (13/13)
8. Scope compliance 0 boundary violation
9. **Auto-archive canlı** — `.brain/archive/DIRECTIVES-sprint-135.md` + `.brain/sprints/sprint-135.md` exist (Sprint 134 failed criterion redemption)

**Layer 4 — Triple Dogfooding (3)**
10. **metrics.jsonl canlı veri** — `.deckent/metrics.jsonl` ≥20 line
11. **load-test-report.md** — `docs/audits/sprint-135/load-test-report.md` full (stub değil)
12. **SelfAuditResult.overallGate === "PASS"** — `.deckent/sprint-135-gate.json`

**Layer 5 — Product Vision Regression (4)**
13. DECISIONS.md ADR-033 + ADR-034 değiştirilmedi (git diff since Sprint 134)
14. docs/vision/roadmap.md değiştirilmedi
15. `grep -i "saas\|cloud-hosted\|paywall\|enterprise edition" src/ docs/` forbidden terms only in rejection context
16. Sprint 135 new code vision violation yok

**Layer 6 — Kur-Çalıştır Readiness (1)**
17. Readiness ≥3.95/5 (Sprint 134 3.86 → +0.09)
   - Bugsuz axis +0.15 hedef (coordinator + docker + verify)
   - Gözlemlenebilirlik +0.1 (canlı metrics.jsonl)
   - Kurulum Basitliği +0.05 (auto-decay + graceful shutdown)

**Sprint 135 GO hedef ≥15/17 PASS.**

### Part D — Post-Sprint Verification Workflow

```
1. deckent finalize success → runSelfAuditGate() otomatik
2. Manual tsc --noEmit + vitest run → Layer 2 duplicate verify
3. 13 task Kanıt komutları → Layer 3 criterion 7
4. git diff --stat + scope map → Layer 3 criterion 8
5. ls .brain/archive/DIRECTIVES-sprint-135.md .brain/sprints/sprint-135.md → criterion 9
6. wc -l .deckent/metrics.jsonl + jq sample → criterion 10
7. ls docs/audits/sprint-135/load-test-report.md + wc -l → criterion 11
8. cat .deckent/sprint-135-gate.json → criterion 12
9. grep vision forbidden terms → criteria 13-16
10. Manual readiness judgment + rationale → criterion 17
11. Scorecard .deckent/sprint-135-layer3-scorecard.md
12. FINAL-EXECUTIVE-REPORT Section 1+5+6+8 inline update + 14+15 append
13. Commit ceremony (feat + docs + chore)
```

### Part E — Expected Outcomes

**Clean GO şartları:**
- Layer 3 ≥15/17 PASS
- 0 NO_GO
- Readiness ≥3.95
- Coordinator stable (crash yok, manual recovery yok)
- auto-archive canlı ✓
- metrics.jsonl ≥20 line ✓
- docker HB false positive = 0 ✓

**GATE_FAILURE / GO_WITH_TECH_DEBT fallback:**
- Honest label, Sprint 136'ya residual debt (≤4 item beklentisi)
- FINAL report Section 14 criterion breakdown
- Retro Section 15 8-subsection analysis

---

## 7. Execution Parameters

| Parameter | Value |
|---|---|
| max_workers | 4 (HARD LIMIT) |
| brain_planning | structured |
| mode | performance (opus default) |
| provider | claude (session auth) |
| spawn_backend | docker |
| verify_loop | active |
| telemetry_enabled | false (hard-coded) |
| auto_archive_directives | true |
| dependency_pipeline_enabled | bootstrap false → T-005 DONE sonrası true (two-phase) |
| Pre-sprint baseline | 12485 pass, 16 skipped, 0 fail (2026-04-10 19:03) |
| Critical path | T-001 → T-004 → T-008 → T-009 (~120dk minimum) |
| Timeout margin | 21600000 ms (6 saat) |

### Monitoring

- Watchdog (Explore, 40 cycle)
- Verifier (ana session run_in_background, tsc+vitest periodic)
- Shell Watchdog (ana session manuel her 2-3dk)

### Yasak

- `deckent start --no-confirm` (yanlış flag, `--auto-approve` doğru)
- Subagent içinde `npx vitest run` / `npx tsc --noEmit` (Explore spawn-process bloke olabilir)
- `run_in_background=true` Agent dispatch (framework öldürür)
- Birden fazla `deckent start` çakışması
- `git add .` / `git add -A` (explicit per-file)
- `commit --amend` (history net)
- FINAL report Section 14 ekleyip Section 1+5+6+8 atlamak (Sprint 134 hatası tekrarlanmamalı)

### Fallback

Coordinator crash olursa: recovery template `.claude/plans/melodic-launching-aurora.md` (Sprint 134'te kanıtlanmış) + manual Layer 3 scorecard.

---

## 8. Sprint 135 Success Definition

Sprint 135 şu koşullar altında **clean GO** sayılır:

1. ≥11 task DONE (13 × 0.85)
2. Layer 3 ≥15/17 PASS
3. Readiness ≥3.95
4. Coordinator crash yok
5. `.brain/archive/DIRECTIVES-sprint-135.md` + `.brain/sprints/sprint-135.md` otomatik üretildi (criterion 9 redemption)
6. `.deckent/metrics.jsonl` canlı veri ≥20 line (criterion 10 second attempt)
7. docker HB false positive count = 0 (metrics.jsonl'de kanıt)
8. `deckent cleanup --decay` etkili çalışır (1179'dan decayable lines düşer)
9. Hiç manual recovery gerekmez

**Sprint 135 "GO_WITH_TECH_DEBT" ise:**
- Sprint 134'ten +1 kriter ilerleme yeterli değil; honest label kabul
- Sprint 136'ya ≤4 residual item devir
- FINAL report Section 14'te kriter breakdown

**Sprint 135 "NO_GO" ise:**
- Coordinator tekrar çökmüş olmalı (meta-dogfood başarısız)
- Recovery template aynı 4-faz plan tekrar uygulanır
- Sprint 136 draft öncelik sırası: T-001 coordinator fix'in kendisi yeniden değerlendirilir

---

## 9. References

- `.claude/projects/-home-alperen-deckent-dev/memory/project_sprint135_preflight.md` — pre-flight checklist + 12 debt
- `.claude/projects/-home-alperen-deckent-dev/memory/project_sprint134_completed.md` — Sprint 134 closing snapshot
- `.claude/projects/-home-alperen-deckent-dev/memory/project_docker_hb_shutdown_bug.md` — T-002 + T-003 detay
- `.claude/projects/-home-alperen-deckent-dev/memory/feedback_subagent_bash_restrictions.md` — monitoring agent dispatch
- `.claude/projects/-home-alperen-deckent-dev/memory/feedback_living_record_sync.md` — FINAL report Section 1+5+6+8 update zorunluluğu
- `.claude/projects/-home-alperen-deckent-dev/memory/project_vision_product_not_service.md` — 4 prensip lens
- `.deckent/sprint-134-layer3-scorecard.md` — Sprint 134 17-criterion scoring + 12 debt log
- `docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md` Section 12 + 13 — Sprint 134 status + retro
- `.claude/plans/melodic-launching-aurora.md` — recovery template fallback
- Sprint 134 spec: `docs/superpowers/specs/2026-04-11-sprint-134-design.md`

---

**End of design spec. Next step: writing-plans skill for implementation plan.**
