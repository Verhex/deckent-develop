# Analysis: src/monitor/auditor.ts
**Task ID:** 141-005-fix | **LoC:** 2017

## 1. Amacı
Sprint boyunca aktif izleme yapan denetçi. Heartbeat taraması, boundary violation tespiti, lock kontrolü, deadlock algılama, ADR compliance, orphan HB temizleme, 3-pipeline verification sistemi (NO_GO reconciliation, functional test, tech debt validation). En büyük ve kritik monitor modülü.

## 2. Public API (export listesi)
Heartbeat: `readHeartbeatCached`, `clearHeartbeatCache`, `getHeartbeatCacheSize`, `isWorkerProcessAlive`, `isWorkerStale`, `shouldReportStale`, `scanHeartbeats`
Authority: `runAuthorityChecks`
Boundary: `checkBoundaryViolations`, `checkStaleLocks`, `detectDeadlocks`
Dashboard: `resetDashboard`, `updateDashboard`, `writeScanToDashboard`, `deduplicateAlerts`
Scan: `runScanCycle`, `startScanLoop`, `scanResultFiles`, `buildWorkerScopeMap`, `detectDependencyViolations`
ADR: `parseADRs`, `checkADRCompliance`, `emitVerificationEvent`, `emitADRViolationEvent`
Verification: `tryCodeVerifiedDone`, `writeCodeVerifiedResult`, `verifyFunctional`, `validateTechDebt`, `verifyWorkerResult`
Orphan: `detectOrphans`, `cleanupOrphanHBs`
Constants: `DONE_SET`, `CODE_VERIFIED_DONE`
Types: `HeartbeatCacheEntry`, `ScanOptions`, `ScanResult`, `CodeVerifyOptions`, `CodeVerifyResult`, `VerificationVerdict`, `VerificationResult`, `ParsedADR`, `ADREnforcementRule`, `ADRViolation`, `OrphanHBResult`, `DependencyViolation`

## 3. İç + Dış Bağımlılıklar
**İç:**
- `core/types.js` — AgentStatus, AlertLevel, SprintPhase, SprintStatus, TaskStatus, Heartbeat, LockInfo, Task, TaskResult, TaskScope, BoundaryViolation, Alert, DashboardState, PatternEntry
- `core/constants.js` — TASKS_DIR, LOCKS_DIR, BRAIN_DIR, DASHBOARD_FILE, PATTERNS_FILE, PATTERNS_MAX_LINES, ARCHIVE_DIR, **MEMORY_DB_FILE**
- `core/utils.js` — readJsonSafe, debugLog
- `core/observability.js` — metric
- `core/file-lock.js` — clearOrphanLocks
- `core/memory-store.js` — **MemoryStore** (Memory V2 DB-first!)
- `orchestra/event-stream.js` — writeEvent, CHANNELS
- `orchestra/authority-enforcer.js` — checkAuthority, emitAuthorityViolation

**Dış:**
- `node:fs` — readFileSync, readdirSync, existsSync, writeFileSync, unlinkSync, statSync, mkdirSync, renameSync
- `node:fs/promises` — readFile, stat, writeFile
- `node:path` — join, normalize
- `node:child_process` — spawnSync

## 4. Complexity
- **ÇOK YÜKSEK** — 2017 LoC, 50+ fonksiyon
- Kahn's algorithm deadlock detection ✓
- Multi-signal stale detection ✓
- 3-pipeline verification ✓
- tryCodeVerifiedDone dependency injection pattern ✓

## 5. Type Safety
- `any` yok
- JSON parse: `as { selfAssessment?: string }` — typed cast, kabul edilebilir
- `as DashboardState['sprint']` — cast with comment `// caller provides correct shape`
- Non-null: `match[1]` → `match[1] ?? ''` ✓

## 6. ADR Compliance
- **ADR-006:** `spawnSync('git', ['diff', '--stat'], ...)` — array args ✓. `spawnSync('docker', [...], ...)` — array args ✓. `spawnSync('npx', ['vitest', ...], ...)` — array args ✓. UYUMLU.
- **ADR-008:** Brain'e import yok. Auditor brain'den bağımsız ✓.
- **ADR-037 (RBAC):** `runAuthorityChecks` mevcut, soft enforcement ✓.
- **Memory V2 DB-first (ADR-040):** `checkADRCompliance` → MemoryStore.getByType('adr') kullanıyor! DB-first ✓. V1 fallback temizlenmiş.

## 7. Test Coverage
- `tests/monitor/auditor.test.ts` bekleniyor — 2017 LoC'lık dosya kapsamlı test gerektirir.

## 8. TODO/FIXME/HACK inventory
- `// Sprint 138 fallback (require+appendFileSync) replaced with writeEvent()` — V1 kaldırıldı ✓
- `// Sprint 139: Multi-signal stale detection` — implemented ✓
- `DOCKER_NO_RESULT_PATTERN = 'Docker worker exited without writing result file'` — hardcoded string, spawn-backend-docker ile senkronize kalmalı.

## 9. Dead Code Candidates
- `PILOT_ADR_RULES` sadece ADR-006, ADR-008, ADR-010 enforcement var — 40 ADR var ama çoğu enforce edilmiyor. Bu intended: "pilot" rules.
- `parseADRs` fonksiyonu: markdown parse ediyor ama `checkADRCompliance` DB kullanıyor → `parseADRs` artık hiç çağrılıyor mu?

## 10. Security Findings
- `defaultRunGrepEvidence`: `spawnSync('sh', ['-c', cmd], ...)` — `cmd` string'i `parseEvidenceCommand` tarafından kısıtlanmış (grep/wc/ls/cat/test prefix) ✓. **Ancak:** `grep -n "pattern" src/file` gibi komutlarda `pattern` task description'dan geliyor. Kasıtlı regex injection mümkün mü? Task description brain tarafından oluşturuluyor → düşük risk.
- `spawnSync('git', ['status', '--porcelain', filePath], ...)` — filePath task JSON'dan geliyor. Scope doğrulaması yapılmış mı? `filePath = task.scope?.filesWrite ?? []` — task JSON scope içindeyse güvenli ✓.
- Dashboard: `readFileSync` ile `writeFileSync` — sabit path, injection riski yok ✓.

## 11. Memory V2 Uyumu
- **UYUMLU:** `checkADRCompliance` artık MemoryStore üzerinden ADR okuyordu — V1 fallback kaldırılmış.
- `detectPatterns`: JSON dosyasına yazıyor (`.brain/PATTERNS.md` değil, PATTERNS_FILE JSON) — bu V2 dışında, kabul edilebilir.
- PATTERNS_FILE ne? Constants'tan gelen sabit. Audit bölümde incelenmeli.

## 12. Öneriler
1. `parseADRs` fonksiyonu dead code olabilir — kullanım tespiti yapılmalı.
2. `DOCKER_NO_RESULT_PATTERN` string'i paylaşılan constant'a taşı.
3. `PILOT_ADR_RULES` genişlet — sprint 142+ için daha fazla ADR enforcement.
4. 2017 LoC — split candidate: verification pipeline ayrı bir dosyaya taşınabilir.

## 13. Verdict: ANALYZED
En kritik monitor dosyası. Memory V2 DB-first uyumlu. ADR-035 event stream entegrasyonu tamamlanmış. Sprint 139 multi-signal stale detection ve orphan cleanup doğru implement edilmiş. Tek endişe: `parseADRs` dead code ve yüksek LoC sayısı.
