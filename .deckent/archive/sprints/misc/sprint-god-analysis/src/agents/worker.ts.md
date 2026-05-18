# Analysis: src/agents/worker.ts
**Task ID:** 142-027 | **Model:** opus | **LoC:** 1670 | **Effort:** max

## 1. Amacı
Worker modülü, Deckent sprint sisteminin çalışan birim yaşam döngüsünü yönetir. Task okuma/claim, heartbeat yazma, result yazma, dosya kilitleme (core/file-lock.ts'ye delege), scope doğrulama, test/compile verify loop, Docker SIGTERM graceful shutdown, worker lifecycle state machine ve IPC event emitter fonksiyonlarını sağlar. Brain tarafından spawn edilen her worker bu modüldeki fonksiyonları kullanır.

## 2. Public API
- `readTask(projectRoot, taskId): Task` — Task JSON dosyasını okur
- `claimTask(projectRoot, taskId, workerId): Task` — PENDING task'ı CLAIMED yapar
- `writeTaskPlan(projectRoot, plan): void` — .plan dosyası yazar
- `acquireLock/releaseLock/checkLock/releaseAllLocks` — @deprecated, core/file-lock.ts'ye delege
- `createHeartbeat/writeHeartbeat` — HB oluşturma + disk yazma + ADR-035 event emit
- `atomicWriteFileSync(filePath, data)` — temp+fsync+rename pattern (Docker fix)
- `writeResult(projectRoot, result, sprintId?)` — Atomic result yazma + task status güncelleme
- `finalizeHeartbeat/writeFinishedHeartbeat` — HB cleanup
- `updateTaskStatus` — Task status değiştirme
- `verifyTests/runTestVerifyLoop` — Test doğrulama döngüsü
- `verifyCompilation/runCompilationLoop` — tsc --noEmit doğrulama
- `isWithinScope(filePath, scope, projectRoot?)` — Scope kontrolü (symlink-safe)
- `checkWorkerAuthority` — ADR-037 soft enforcement
- `emitWorkerQuestion` — ADR-035 QUESTION event
- `enforceVerifyLoop` — Async verify gate
- `computeVerifyDelta/writeVerifyDeltaBaseline` — Honest assessment calibration
- `WorkerStateMachine` class — Lifecycle state machine
- `getWorkerStateMachine/createWorkerStateMachine/removeWorkerStateMachine/isWorkerStoppable/getAllWorkerStates/clearWorkerStateRegistry` — Global registry
- Format helpers: `formatWorkerLog/formatScopeLog/formatTestLog/formatVerifyLog/formatDoneLog/appendWorkerLog`
- Feedback loop: `createFeedbackLoop/recordTscAttempt/recordTestAttempt/calculateSelfHealingRate/aggregateFeedbackLoops`
- JSDoc: Çoğu fonksiyon JSDoc'a sahip. EKSIK: `calculateProgress`, `readTask`, `updateTaskStatus` — minimal JSDoc.

## 3. İç Bağımlılıklar
- `../core/types.js` (TaskStatus, AgentStatus, Task, Heartbeat, etc.)
- `../core/constants.js` (TASKS_DIR)
- `../core/errors.js` (ErrorRegistry)
- `../cli/helpers/output.js` (redactSensitive) — **ADR-008 uyarısı: worker → cli import**
- `../core/stack-detector.js` (detectFullStack, STACK_COMMANDS)
- `../orchestra/authority-enforcer.js` (checkAuthority, emitAuthorityViolation)
- `../orchestra/event-stream.js` (writeEvent, getCurrentSprintId, CHANNELS)
- `../core/file-lock.js` (lock operations)
- Döngüsel bağımlılık riski: worker.ts → orchestra/authority-enforcer → ? → brain? Potansiyel dolaylı zincir.

## 4. Dış Bağımlılıklar
- `node:fs`, `node:child_process` (execSync, exec), `node:util`, `node:path` — hepsi built-in
- ADR-010 uyumlu: Sıfır runtime dependency.

## 5. Complexity
- Fonksiyon sayısı: ~45+ export
- En karmaşık fonksiyon: `computeVerifyDelta` (satır 1411-1472) — 60 LoC, çoklu ratio hesaplama
- `enforceVerifyLoop` (satır 1252-1314) — async, 3 retry loop, 2 shell command
- `isWithinScope` (satır 704-749) — symlink resolution + scope check
- Max cyclomatic: ~8 (enforceVerifyLoop)

## 6. Type Safety
- `any` sayısı: 0
- `@ts-ignore/@ts-expect-error`: 0
- `as` cast'ler:
  - Satır 131: `JSON.parse(content) as Task` — güvenli, try/catch ile korunuyor
  - Satır 299: `(result as TaskResult & { planWarning?: string })` — soft extension
  - Satır 494-496: `(err as { stdout: unknown }).stdout` — execSync error typing
  - Satır 1057: `JSON.parse(raw) as { selfAssessment?: string }` — güvenli
- Non-null `!`: 0
- Genel: İyi type safety.

## 7. ADR Compliance
- **ADR-006 (spawnSync):** execSync kullanılıyor (satır 477, 635) — spawnSync değil! `execSync` ADR-006'nın "spawnSync array args" kuralını ihlal ETMEZ (ayrı kural), ama shell injection riski var. `verifyTests` ve `verifyCompilation` fonksiyonlarında command string concatenation kullanılıyor — scopeArgs user-controlled olabilir.
- **ADR-008 (brain import):** worker.ts brain'den import ETMEZ — uyumlu. AMA `../cli/helpers/output.js` import ediyor — bu ADR-008'in ruhuna aykırı olabilir (worker → cli coupling).
- **ADR-010:** Uyumlu — sıfır runtime dep.
- **ADR-033:** Uyumlu — product code, service endpoint yok.
- **ADR-037:** `checkWorkerAuthority` soft enforcement — uyumlu.
- **ADR-039:** Kullanmıyor — uyumlu (worker self-modifying detection Brain'de).
- **Memory V2:** worker.ts doğrudan DB okumuyor — uyumlu (ADR'ler prompt'tan gelir).

## 8. Test Coverage
- `tests/agents/worker.test.ts` mevcut, kapsamlı (500+ satır test)
- Mock kalitesi: vi.mock pattern'ları düzgün
- Edge case: atomicWriteFileSync, SIGTERM handler, state machine transitions test edilmiş
- Memory V2 mock: Gerekli değil (worker DB kullanmıyor)

## 9. TODO/FIXME/HACK inventory
- Yok — temiz.

## 10. Dead Code
- `writeFinishedHeartbeat` (satır 371) — @deprecated, finalizeHeartbeat'e delege
- `acquireLock/releaseLock/checkLock/releaseAllLocks` — @deprecated, core/file-lock.ts'ye delege
- Bu deprecated fonksiyonlar `src/agents/index.ts`'de hala re-export ediliyor — tüketiciler var mı kontrol edilmeli.

## 11. Security
- **Shell injection riski:** `verifyTests` (satır 472-474) — `scopeArgs` scope dizin isimlerinden geliyor, `execSync` ile shell'e gönderiliyor. Eğer scope dizin adında `;` veya `$(...)` varsa injection olur. AMA scope task JSON'dan geliyor (Brain kontrollü), dış kullanıcı girdisi değil — düşük risk.
- **Command injection in enforceVerifyLoop:** (satır 1266, 1282) — `execAsync('npx tsc --noEmit')` sabit string, injection yok. `scopeArg` değişken ama yine task scope'dan geliyor.
- `atomicWriteFileSync` — güvenli pattern (temp+fsync+rename).
- SIGTERM handler — fsync güvenliği sağlanmış.
- `redactSensitive` import — log'larda secret maskeleme.

## 12. Memory V2 Uyumu
- worker.ts DB'ye doğrudan erişmez — DOĞRU davranış.
- ADR'ler prompt'tan enjekte edilir (worker-default.md kuralı: "ADRs are injected into your prompt automatically from .brain/memory.db").
- Eski .md parse kodu: YOK — uyumlu.

## 13. i18n
- Action indicator emoji'ler sabit (satır 849-873) — locale-agnostic
- Log mesajları İngilizce — i18n framework yok ama CLI çıktısı olduğu için kabul edilebilir
- turkishNormalize: Kullanılmıyor (gerekli değil)

## 14. Doküman Tutarlılığı
- JSDoc ↔ gerçek davranış: Tutarlı
- `@deprecated` etiketleri doğru kullanılmış
- writeResult JSDoc'ta "Verify Loop Gate" uyarısı — doğru

## 15. Performance
- Sync I/O: readFileSync (satır 129, 404), writeFileSync (satır 164, 172, 241, 385), existsSync çoklu kullanım — hepsi task dosyaları için, hot path değil
- execSync (satır 477, 635) — test/build verification, uzun sürebilir ama timeout var (120s)
- `realpathSync` (satır 712) — scope check'te, her dosya yazımında çağrılabilir
- Genel: Kabul edilebilir — worker senkron çalışır, async olması gerekmez

## 16. Öneriler
- **P1:** `src/cli/helpers/output.js` import'unu kaldırıp `redactSensitive`'i core/ altına taşı — worker→cli coupling ADR-008 ruhuna aykırı
- **P2:** Deprecated lock fonksiyonları (acquireLock, releaseLock, etc.) src/agents/index.ts'den kaldır, tüketicileri core/file-lock.ts'ye yönlendir
- **P2:** `execSync` kullanımlarını `spawnSync` ile değiştir — scope args'ı array olarak geçir (injection hardening)
- **P3:** `writeFinishedHeartbeat` deprecated fonksiyonunu tamamen kaldır

## Verdict: ANALYZED
