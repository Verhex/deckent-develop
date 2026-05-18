# Analysis: src/agents/worker.ts
**Task ID:** 141-005-fix | **LoC:** 1670

## 1. Amacı
Worker süreçlerinin temel altyapısını sağlayan merkezi modül. Task claim, heartbeat yazma, result yazma, kilit yönetimi, verify loop, SIGTERM handler ve Worker state machine gibi tüm lifecycle operasyonlarını barındırır.

## 2. Public API (export listesi)
- Sınıflar: `TaskClaimError`, `ScopeViolationError`, `WorkerStateMachine`, `InvalidStateTransitionError`
- Fonksiyonlar: `getVerifyCommands`, `calculateProgress`, `readTask`, `claimTask`, `writeTaskPlan`, `acquireLock`, `releaseLock`, `checkLock`, `createHeartbeat`, `writeHeartbeat`, `atomicWriteFileSync`, `writeResult`, `finalizeHeartbeat`, `writeFinishedHeartbeat`, `updateTaskStatus`, `releaseAllLocks`, `readWorkerLog`, `verifyTests`, `runTestVerifyLoop`, `isDocOnlyScope`, `verifyCompilation`, `runCompilationLoop`, `isWithinScope`, `checkWorkerAuthority`, `emitWorkerQuestion`, `enforceVerifyLoop`, `writeVerifyDeltaBaseline`, `readVerifyDeltaBaseline`, `computeVerifyDelta`, `getWorkerStateMachine`, `createWorkerStateMachine`, `removeWorkerStateMachine`, `isWorkerStoppable`, `getAllWorkerStates`, `clearWorkerStateRegistry`, `fsyncResultFile`, `finalizeHeartbeatOnShutdown`, `createFeedbackLoop`, `recordTscAttempt`, `recordTestAttempt`, `calculateSelfHealingRate`, `aggregateFeedbackLoops`, `formatWorkerLog`, `formatScopeLog`, `formatTestLog`, `formatVerifyLog`, `formatDoneLog`, `appendWorkerLog`
- Re-export: `LockError` from core/file-lock.ts
- Constants: `MAX_TEST_RETRIES`, `MAX_COMPILATION_RETRIES`, `VERIFY_DELTA_DONE_THRESHOLD`, `VERIFY_DELTA_NO_GO_THRESHOLD`, `VALID_TRANSITIONS`, `STOPPABLE_STATES`, `TERMINAL_STATES`
- Types: `WorkerLogAction`, `WorkerLifecycleState`, `CompilationResult`, `CompilationLoopResult`, `VerifyLoopResult`, `VerifyDeltaBaseline`, `VerifyDeltaResult`

## 3. İç + Dış Bağımlılıklar
**İç (core):**
- `core/types.js` — TaskStatus, AgentStatus, Task, TaskPlan, TaskResult, Heartbeat, LockInfo, TaskScope, FeedbackLoop, VerifyTestsResult
- `core/constants.js` — TASKS_DIR
- `core/errors.js` — ErrorRegistry
- `core/file-lock.js` — acquireLock, releaseLock, checkLock, releaseAllLocks (re-export)
- `core/stack-detector.js` — detectFullStack, STACK_COMMANDS

**İç (orchestra):**
- `orchestra/authority-enforcer.js` — checkAuthority, emitAuthorityViolation
- `orchestra/event-stream.js` — writeEvent, getCurrentSprintId, CHANNELS

**İç (cli):**
- `cli/helpers/output.js` — redactSensitive

**Dış:**
- `node:fs`, `node:child_process`, `node:path`, `node:util` — tüm dosya operasyonları

## 4. Complexity
- 60+ fonksiyon, 3 sınıf (WorkerStateMachine, InvalidStateTransitionError, FeedbackLoop helpers)
- Cyclomatic complexity orta-yüksek: özellikle `runTestVerifyLoop`, `enforceVerifyLoop`, `computeVerifyDelta`, `isWithinScope`
- İlginç: `VALID_TRANSITIONS` immutable finite-state-machine tablosu — temiz tasarım

## 5. Type Safety
- `any` kullanımı: 0 doğrudan `any`
- `@ts-ignore`: 0
- Non-null assertion: `match[1]!` → 5 satırda; `result as TaskResult & { planWarning?: string }` — zorunda cast
- `as Task`, `as Heartbeat` gibi JSON parse sonrası castler — kaçınılmaz pattern (JSON.parse'ın sonucu unknown)
- `(err as { stdout: unknown }).stdout` — doğru pattern (unknown narrowing)

## 6. ADR Compliance
- **ADR-006 (spawnSync security):** `execSync` kullanılıyor verify loop'ta (shell üzerinden değil, string olarak) — `shell: true` yok. UYUMLU.
- **ADR-008 (Brain merkezi import):** Worker, brain'e import etmiyor. orchestra/authority-enforcer ve event-stream üzerinden iletişim. UYUMLU.
- **ADR-010 (minimal deps):** Sadece node:* built-ins. UYUMLU.
- **ADR-037 (RBAC):** `checkWorkerAuthority` mevcut, soft enforcement. UYUMLU (soft mode).
- **ADR-039 (self-modifying):** Doğrudan referans yok — `isSelfModifyingSprint` parametresi var checkWorkerAuthority'de. UYUMLU.
- **Sprint 139 Docker HB core fix:** `atomicWriteFileSync` + `registerSigtermHandler` mevcut. UYUMLU.

## 7. Test Coverage
- `tests/agents/worker.test.ts` eşleşmesi bekleniyor — dosya var mı? Büyük modül, kapsamlı test beklenir.
- `WorkerStateMachine` state transitions test edilebilir → birim test açısından iyi.

## 8. TODO/FIXME/HACK inventory
- Yorum: "Sprint 138: Lock logic migrated to core for plan-time collision detection" — enforced.
- `registerSigtermHandler` auto-register — module side effect, test isolation'da dikkat gerektirir.
- `@deprecated writeFinishedHeartbeat` — geriye dönük uyumluluk shim; temizlenebilir.
- `@deprecated acquireLock, releaseLock, checkLock, releaseAllLocks` re-exportlar — geriye dönük compat.

## 9. Dead Code Candidates
- `writeFinishedHeartbeat` — deprecated, sadece finalizeHeartbeat'e delege ediyor. Silinebilir.
- `WorkerLogAction.Scope` ile `ACTION_INDICATORS['Scope']` — emoji kullanımı, test ortamında noColor variant gerekiyor.
- `ScopeViolationError` — export var ama worker.ts içinde hiç throw edilmiyor. External kullanım olabilir.

## 10. Security Findings
- `execSync` timeout=120s — timeout var, shell=false ile çağrılıyor ✓
- `realpathSync` symlink traversal koruması ADR-034 için implementasyonu var `isWithinScope`'da ✓
- `parseEvidenceCommand` → `sh -c cmd` üzerinden arbitrary komut çalıştırma riski — ancak `grep/wc/ls/cat/test` ile kısıtlı. Düşük risk.
- SIGTERM handler `process.on` global — module import edilirse otomatik tetiklenir; test isolation için dikkat.

## 11. Memory V2 Uyumu
- Doğrudan brain memory okuma yok — sadece task file I/O. DB-first kural worker için geçerli değil.
- ADR'ler prompt'tan enjekte edilir (worker-default.md kuralı) — worker dosya okumaz. UYUMLU.

## 12. Öneriler (Sprint 142+ input)
1. `writeFinishedHeartbeat` ve deprecated re-export fonksiyonları temizle
2. `ScopeViolationError` ya kullanılsın ya silinsin
3. `registerSigtermHandler` auto-run yerine explicit init fonksiyonu olsun (test isolation)
4. `parseEvidenceCommand` whitelist'i güçlendir — path traversal gibi girişimler için extra sanitize

## 13. Verdict: ANALYZED
RAPPORT: En kritik ve kapsamlı agent dosyası. Sprint 139 Docker HB fix, state machine, RBAC entegrasyonu, ADR-035 event stream — hepsi doğru implement edilmiş. Tek endişe: module side effect (SIGTERM) ve deprecated re-exportlar.
