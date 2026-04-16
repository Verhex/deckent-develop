# Analysis: src/core/monitoring-types.ts
**Task ID:** 142-002 | **Model:** opus | **LoC:** 123 | **Effort:** max

## 1. Amaci
Agent, monitoring, dashboard, ve lock sistemi tip tanımları. `Heartbeat` (worker sağlık sinyali), `AgentInfo` (çalışan agent bilgisi), `Alert` (uyarı sistemi), `BoundaryViolation` (scope ihlali), `DashboardState` (gerçek zamanlı dashboard verisi), `LockInfo` (dosya kilidi), `SkillMeta` (plugin metadata) tanımlar. Auditor, dashboard, worker, ve sprint-controller tarafından kullanılır.

## 2. Public API
### Types (2):
- `AgentRole` — 'brain' | 'auditor' | 'worker'
- `BoundaryViolationType` — 5 literal union

### Enums (2):
- `AgentStatus` — 12 durum (IDLE→PAUSED)
- `AlertLevel` — INFO, WARNING, CRITICAL

### Interfaces (7):
- `Heartbeat` — workerId, taskId, status, currentAction, currentFile?, timestamp, filesChangedCount, sequence, progress, agentId?, backend?
- `AgentInfo` — id, role, status, model, tmuxWindow, taskId?, currentAction?, spawnedAt?, lastHeartbeat?, assignedAgent?
- `Alert` — level, message, source?, timestamp, acknowledged?, count?
- `BoundaryViolation` — type, agentId, detail, timestamp
- `DashboardState` — sprint, agents[], progress, alerts[], updatedAt, auditorLastScan?, violations?
- `LockInfo` — filePath, ownerWorkerId, acquiredAt, taskId
- `SkillMeta` — name, description, version, author, triggers, model

JSDoc: Enum'larda yok, interface field'larında kısmen var. YETERLI.

## 3. Ic Bagimliliklar
- `./task-types.js` → ModelType (type import)
- `./sprint-types.js` → SprintPhase, SprintStatus (type import)

Döngüsel bağımlılık riski: **YOK** — task-types ve sprint-types'a tek yönlü bağımlılık. sprint-types, monitoring-types'ı import ETMİYOR.

## 4. Dis Bagimliliklar
Hiçbir dış bağımlılık yok. ADR-010 uyumlu.

## 5. Complexity
Fonksiyon sayısı: 0. Sadece tip tanımları. Cyclomatic: 0.

## 6. Type Safety
- `any`: 0
- `@ts-ignore`: 0
- `@ts-expect-error`: 0
- `as unknown`: 0
- Non-null `!`: 0

Tamamen temiz.

**Gözlem:** `Heartbeat.status: AgentStatus` — AgentStatus enum'unda 12 durum var. Heartbeat'te gerçekçi olanlar muhtemelen EXECUTING, TESTING, VERIFYING, DONE, ERROR. Tüm 12 durum heartbeat bağlamında mantıklı mı? PLANNING, SCANNING gibi brain/auditor-only durumlar worker heartbeat'inde görünmemeli. Type narrowing eksik ama pratikte sorun oluşmuyor.

## 7. ADR Compliance
- **ADR-006 (spawnSync):** N/A
- **ADR-008 (brain import):** N/A — type-only
- **ADR-010 (tek runtime dep):** Uyumlu
- **ADR-027 (Hybrid Spawn Backend):** `Heartbeat.backend?: 'docker' | 'tmux' | 'subprocess'` — ADR-027 uyumlu, 3 backend tipi belirtilmiş.
- **ADR-037 (RBAC):** `AgentRole: 'brain' | 'auditor' | 'worker'` — ADR-037 authority matrix'in temel tipi. Uyumlu.
- **Memory V2:** N/A — monitoring domain

## 8. Test Coverage
- Doğrudan `monitoring-types.test.ts` MEVCUT DEĞİL
- `tests/core/types.test.ts` barrel üzerinden dolaylı test edebilir
- **EKSİK:** AgentStatus enum, AlertLevel enum, BoundaryViolationType literal union için dedicated test yok

## 9. TODO/FIXME/HACK inventory
Hiçbir TODO/FIXME/HACK bulunmadı.

## 10. Dead Code
- `SkillMeta` (satır 115-122): Plugin sistemi (Blueprint 11) kapsamında tanımlanmış. plugin.ts modülünde kullanılıyor mu? Kontrol gerekli. Plugin sistemi aktif olmayabilir (future feature). **P3 — potansiyel dead code.**
- `AgentInfo.tmuxWindow: string` — subprocess/Docker backend'de tmux window yok. Bu field her backend için dolu MU? Boş string olabilir. Field adı yanıltıcı. **P3.**
- Geri kalanlar aktif kullanımda.

## 11. Security
- `LockInfo` — dosya kilidi bilgisi. Stale lock detection auditor tarafından yapılır. Lock dosyaları `.locks/` dizininde — path traversal riski? file-lock.ts'de kontrol edilmeli.
- `Alert.message: string` — log/dashboard'a yazılır, XSS riski dashboard render'da (React auto-escape yapar).

## 12. Memory V2 Uyumu
N/A — monitoring domain, memory ile doğrudan ilişki yok.

## 13. i18n
- `AlertLevel`, `AgentStatus` enum değerleri İngilizce — dashboard'da gösterilir
- Dashboard i18n'de enum değerleri çevrilmiş olabilir (en.ts/tr.ts) — doğrulanmalı ama bu dosyanın sorunu değil
- turkishNormalize kullanımı yok — N/A

## 14. Dokumantasyon Tutarliligi
- `DashboardState.sprint.phase: SprintPhase` — SprintPhase 10 üyeli ama lifecycle 8 faz (bkz. sprint-types.ts analizi). Aynı tutarsızlık burada da yansıyor.
- `Heartbeat` interface `api-surface.md`'deki tanımla karşılaştırıldığında: api-surface.md'de heartbeat formatı basitçe "workerId, taskId, status" olarak tanımlı — monitoring-types.ts'deki detaylı interface daha güncel.
- `AgentInfo.tmuxWindow: string` — tmux-olmayan backend'ler için yanıltıcı ad. **P3.**

## 15. Performance
Sıfır runtime maliyeti — tamamen tip tanımı.

## 16. Oneriler
| # | Severity | Öneri |
|---|----------|-------|
| 1 | P3 | `monitoring-types.test.ts` oluştur — enum/type doğrulaması |
| 2 | P3 | `SkillMeta` aktif kullanımını doğrula — dead code ise kaldır |
| 3 | P3 | `AgentInfo.tmuxWindow` → `spawnTarget` veya `backendHandle` olarak yeniden adlandır (backend-agnostic) |
| 4 | P3 | `Heartbeat.status` için worker-only AgentStatus alt kümesi tanımla (WorkerStatus type) |

## Verdict: ANALYZED
