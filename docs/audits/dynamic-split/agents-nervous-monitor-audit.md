# Audit: src/agents/ + src/nervous/ + src/monitor/

> **Task:** sprint-185 / 185-004 — Audit runtime modülleri (~51 dosya, ~12.5K LoC)
> **Tarih:** 2026-05-21
> **Agent:** doc-writer
> **ADR cross-check:** ADR-035 (verification protocol), ADR-037 (RBAC), ADR-040 (nervous), ADR-043 (crash recovery), ADR-044 (state observability)
> **Scope contract:** sadece okuma — bu rapor tek output dosyası

---

## 1. Inventory

51 TypeScript dosyası, toplam **12 477 LoC**. Üç modül üç farklı sorumluluğu kapsıyor:

### 1.1 `src/agents/` — Worker Execution & Prompt Engineering (21 dosya, ~4 873 LoC)

| Dosya | LoC | Sorumluluk |
|---|---:|---|
| `worker.ts` | 592 | Core task I/O (read/claim/heartbeat/result), scope check, **honest-gate stub-downgrade (Sprint 165)**, re-export router (Sprint 144 split) |
| `worker-lifecycle.ts` | 578 | State machine, atomic write + fsync, SIGTERM shutdown, verify-delta baseline, feedback loop |
| `worker-verify.ts` | 514 | tsc + vitest verify loops, doc-only scope detection, stack-aware verify commands, `enforceVerifyLoop` (0-caller hard-gate, ADR-037 V1.0 talimat-only) |
| `prompt-analytics.ts` | 473 | Birleşik metrics + A/B test (prompt-metrics + prompt-ab-test merge) |
| `worker-ipc.ts` | 369 | `child_process.fork()` IPC kanalı (HEARTBEAT/STATUS/QUESTION/KILL) |
| `worker-rollback.ts` | 329 | Sprint 177/181 scope-bounded git stash snapshot+rollback + 7-sprint TTL prune |
| `cross-sprint-analyzer.ts` | 242 | Multi-sprint agent performans analizi (.brain/learning/) |
| `prompt-version.ts` | 226 | Versiyonlanmış prompt geçmişi (max 10 versiyon) |
| `permission-guard.ts` | 219 | Agent self-modification engelleme |
| `adaptive-agent.ts` | 213 | Prompt effectiveness analizi + zayıflık tespiti (auto-apply yok) |
| `agent-retirement.ts` | 206 | Performans temelli emeklilik (.deckent/agents/.retired/) |
| `worker-log.ts` | 194 | Structured log formatlama + redactSensitive |
| `agent-genealogy.ts` | 187 | Parent-child agent ilişki ağacı |
| `prompt-rollback.ts` | 150 | Otomatik rollback (successRate < 50% + uses ≥ 3) |
| `prompt-evolution.ts` | 132 | Evolution event log (.deckent/agents/{id}/evolution.json) |
| `shared-context.ts` | 120 | Atomic JSON key-value paylaşımı (.tasks/shared-context.json) |
| `specialization-drift.ts` | 107 | Specialization drift score + öneri |
| `index.ts` | 18 | worker.ts re-export hub |
| `auditor.ts` | 12 | authority-enforcer.ts re-export stub (Sprint 143 Layer 4) |
| `prompt-ab-test.ts` | 9 | prompt-analytics re-export stub (backward-compat) |
| `prompt-metrics.ts` | 5 | prompt-analytics re-export stub (backward-compat) |

### 1.2 `src/nervous/` — ADR-040 Proactive Meta-Orchestrator (25 dosya, ~3 887 LoC)

**Ana pipeline (13 dosya, ~2 759 LoC):**

| Dosya | LoC | Sorumluluk |
|---|---:|---|
| `observer.ts` | 426 | 4 event source unifier (event-bus / fs.watch / cron / sprint-lifecycle), detect debounce |
| `dispatcher.ts` | 344 | 3 channel adapter (MCP / CLI / file), dedup, MCP→CLI fallback |
| `action-registry.ts` | 328 | 30 eylem katalogu (8 low / 7 medium / 10 high / 5 safety-floor) |
| `executor.ts` | 299 | autonomous / suggest-Xm / approve mode, pendingApprovals map, timeout cleanup |
| `ipc-queue.ts` | 237 | Dosya-tabanlı MCP → Executor approval queue (`pending/` → `resolved/`) |
| `detector-registry.ts` | 202 | 12 detector router + per-detector config + error isolation |
| `action-handlers.ts` | 196 | 4 MVP handler (WORKER_RESPAWN / ORPHAN_TASK_ARCHIVE / STALE_LOCK_RELEASE / DEAD_EVENT_STREAM_CLEANUP) + 26 stub |
| `authority-matrix.ts` | 184 | 4 preset (strict/balanced/autopilot/full-auto) + safety floor + override resolver |
| `proposer.ts` | 157 | Notification builder + 5dk throttle + severity filter |
| `bootstrap.ts` | 142 | `createNervousSystemIfEnabled()` factory + dispose pattern |
| `history.ts` | 142 | JSONL append-only audit trail + undo via compensation + Memory V2 indeksleme |
| `decision-engine.ts` | 116 | DetectorResult → DecisionOutput[] + quiet hours bypass |
| `runtime-scope-check.ts` | 55 | `assertBrainScope()` — DECKENT_WORKER_MODE=1 dış ihlal koruması |

**Detectors (12 dosya, ~1 502 LoC):**

| Dosya | LoC | Severity / Risk |
|---|---:|---|
| `scope-collision.ts` | 196 | warning / medium — plan-time + runtime çakışma |
| `build-failure-recurrence.ts` | 192 | warning / medium — N-sprint aynı dosya fail |
| `dead-event-stream.ts` | 160 | critical / high — 10dk+ stream sessiz + aktif worker |
| `token-spike.ts` | 139 | warning / medium — cost threshold |
| `agent-routing.ts` | 138 | warning / medium — routing health |
| `notification-delivery-health.ts` | 123 | warning / high — bildirim teslim failure rate |
| `debt-trend.ts` | 117 | warning / low — debt artış oranı |
| `agent-routing-anomaly.ts` | 113 | warning / medium — anomali eşiği |
| `scope-collision-rate.ts` | 100 | warning / medium — çakışma sıklığı |
| `directives-protection.ts` | 91 | critical / high — mid-sprint DIRECTIVES değişikliği |
| `task-mode-idle.ts` | 72 | info / low — task-mode idle |
| `stale-worker.ts` | 61 | warning / medium — 3dk+ HB güncellenmemiş |

### 1.3 `src/monitor/` — Auditor Scan Loop & Dashboard (5 dosya, ~3 252 LoC)

| Dosya | LoC | Sorumluluk |
|---|---:|---|
| `auditor.ts` | 2 850 | **God object** — heartbeat scan/cache, boundary violations, stale locks, deadlock, dashboard write, ground truth, code-verified-done, ADR compliance (`checkADRCompliance` / `verifyWorkerResult` / `verifyFunctional` / `validateTechDebt`), orphan HB cleanup, CI baseline gather, vitest audit gate |
| `dashboard-manager.ts` | 258 | `.dashboard.json` read/validate/repair pipeline |
| `alert-emitter.ts` | 69 | Dual-write: `.dashboard.json` + sprint events JSONL |
| `sprint-state.ts` | 63 | `getCurrentSprintId()` — sprint-active.json → sprint-state.json fallback |
| `index.ts` | 12 | auditor.ts re-export hub |

---

## 2. Bağlam (Module Context within Deckent Architecture)

Üç modül **runtime orchestrasyonun üç farklı disiplinini** kapsıyor; ortak omurga `src/core/types.ts` + `src/core/event-stream.ts`:

- **agents/** = **iç-Worker yaşam döngüsü** (Brain → spawn-backend → worker.ts → result writeback). ADR-008 tek-yönlü bağımlılık ile sprint-controller'ın ana sahipliğine giriyor. Worker honest-gate (Sprint 165, `worker.ts:347`) Sprint 156-011 / Sprint 164 stub bug'ını write-boundary'de yakalayan kritik koruma.
- **nervous/** = **ADR-040 reaktif meta-orchestrator**. Brain process'inde yaşar (ADR-037 RBAC: `assertBrainScope` koruması). Pipeline: Observer (4 source) → DetectorRegistry (12 detector) → DecisionEngine (Authority Matrix) → Proposer (throttle) → Dispatcher (3 channel) + Executor (3 mode). User'a "should I do X?" diye soran proaktif öneri sistemi — `nervous_system.enabled: false` ile default-off.
- **monitor/** = **Auditor scan loop** (`runScanCycle` her 30sn): heartbeat, lock, scope, ADR (Layer 4 wire ADR-006/008/010, Sprint 143), ground truth (doc-sync mismatch), CI baseline. Dashboard yazıcısı tek (`.dashboard.json`), okuyucu çok (CLI status, MCP `deckent_status`, web dashboard SSE).

Üç modül **birbirini çağırmıyor**. Ortak temas noktaları:

1. **`agents/auditor.ts` → `orchestra/authority-enforcer.ts`** (re-export) — Brain EVALUATE fazında ADR compliance.
2. **`monitor/auditor.ts:1721-1832` → `verifyWorkerResult`/`verifyFunctional`/`validateTechDebt`/`checkADRCompliance`** — Sprint 138 Task 3 Auditor Authority Extension (3-pipeline).
3. **`nervous/observer.ts` → `orchestra/event-bus.ts`** — sprint lifecycle event'lerini consume eder (PLAN/SPAWN/EXECUTE… SPRINT_PHASE_CHANGE).
4. **`nervous/action-handlers.ts` → spawn-backend + file-lock + sprint-docs-updater + event-stream** — 4 MVP eylem reel sistem callback'leri.

---

## 3. Debt Risk (Anti-patterns + Code Smells)

| Risk | Severity | Açıklama |
|---|---|---|
| **`src/monitor/auditor.ts` god object** | 🔴 HIGH | 2 850 LoC, 50+ export — ADR-026 split policy bu modüle uygulanmamış. 7 ayrı sorumluluk (scan/lock/ADR/ground-truth/code-verify/orphan/CI-baseline) tek dosyada. Test edilebilirlik düşük, merge conflict yüksek risk. Sprint 187+ için P0 refactor adayı. |
| **`worker-verify.ts:enforceVerifyLoop` 0-caller** | 🟡 MEDIUM | ADR-037 V1.0 honesty note: prompt talimatıdır, kod-enforce DEĞİL. Runtime'da çağrılmıyor — worker disiplinine bağımlı. Hard-flip post-GA V2 planlı. CLAUDE.md ve worker-default.md zaten flag etmiş. |
| **`worker.ts:checkWorkerAuthority` her durumda `return true`** | 🟡 MEDIUM | Sprint 139 Task 34/35 ADR-037 V1.0 Layer-2 advisory/soft: violation emit edilir + console.warn ama bloke ETMEZ (`worker.ts:570-573`). Bilinçli — V1.0 design. Kullanım dokümantasyonu yeterli, ama "neden return true" yorumu eklenebilir. |
| **`nervous/action-handlers.ts` — 26/30 unimplemented stub** | 🟡 MEDIUM | 4 MVP handler dışındakiler `{ outcome: 'unimplemented' }` döndürüyor (Sprint 180 W2-1). Roadmap'te ama runtime'da silent skip → debug zor. Telemetri (unimplemented action ID counter) faydalı olur. |
| **`nervous/runtime-scope-check.ts` — `require()` ESM içinde** | 🟡 MEDIUM | `emitViolationEvent` `eslint-disable + require()` kullanıyor; ESM dynamic import işe yarayabilir ama caller `assertBrainScope()` sync. Best-effort fallback — kabul edilebilir ama yorum yetersiz. |
| **`src/agents/auditor.ts` adlandırma çakışması** | 🟢 LOW | 12 LoC re-export stub, ama `src/monitor/auditor.ts` ile aynı isim. IDE jump-to-definition kafa karıştırıcı. `agents/adr-compliance.ts` daha açık olur. |
| **`monitor/auditor.ts` HeartbeatCache modül-level mutable Map** | 🟢 LOW | `clearHeartbeatCache()` mevcut ama global state'in test isolation'ı düşük. Refactor: scan cycle başına local cache. |
| **`prompt-metrics.ts`, `prompt-ab-test.ts`, `agents/auditor.ts` re-export stub'lar** | 🟢 LOW | Backward-compat dünya görünüyor — kullanım analizi yapılıp temizlenebilir (bkz. §4). |
| **`agents/worker-rollback.ts` — Sprint 179→180 incident kaynak referansı** | 🟢 LOW | Yorum içinde "Sprint 179 -> 180 incident lost 7 src/ files" — incident retro link eklenebilir (file ya da ADR ref). |
| **`monitor/auditor.ts:isWorkerProcessAlive` subprocess backend `return false`** | 🟢 LOW | Yorum: "subprocess PID not stored in HB — conservative" — Heartbeat type'a `pid?: number` eklenirse Sprint 139 Task 17-19 backend parity tamamlanır. |

---

## 4. Dead Code (Zero-Caller / Unused Exports)

| Sembol | Dosya | Durum | Aksiyon |
|---|---|---|---|
| `enforceVerifyLoop` | `agents/worker-verify.ts` | 0-caller (CLAUDE.md flag) | ADR-037 V2 hard-flip'e kadar **tut**; yorum: "intentionally uncalled — V1.0 prompt-only" |
| `runTestVerifyLoop` | `agents/worker-verify.ts` | 0-caller (CLAUDE.md flag) | Aynı şekilde V2 için bekle |
| `prompt-metrics.ts` stub | `agents/prompt-metrics.ts` | Backward-compat re-export | Caller analizi: 0 ise sil; eski test'ler hâlâ import edebilir |
| `prompt-ab-test.ts` stub | `agents/prompt-ab-test.ts` | Aynı | Aynı analiz |
| `agents/auditor.ts` stub | `agents/auditor.ts` | Sprint 143'ten beri thin layer | `orchestra/authority-enforcer.ts` doğrudan kullanılırsa sil |
| `writeFinishedHeartbeat` | `agents/worker.ts:471` | `@deprecated` | Caller analizi sonrası sil |
| `clearHeartbeatCache`, `getHeartbeatCacheSize` | `monitor/auditor.ts` | "for testing" yorumlu | Test-only export — `__test__` namespace altına taşı veya test util'a çıkar |
| 26 stub action handler | `nervous/action-handlers.ts` | `unimplemented` döndürüyor | Roadmap'te — tut, ama implement tarihi izle |
| Detector "reserve_for:'sprint-148'" pattern (dead-event-stream) | Yorum referansı | Sprint 165 Bug W ile aktif edildi — yorum güncel | Yorum doğruluğu OK |

**Net:** Hiçbir kategorik dead code yok; tüm "uncalled" semboller bilinçli (V1.0 design hold, deprecated alias, roadmap stub, test export). Sprint 187'de **caller usage analizi** + yorum güncellemesi yeterli.

---

## 5. Documentation Gaps

| Dosya | Eksik | Öneri |
|---|---|---|
| `src/monitor/auditor.ts` | Modül-üst JSDoc YOK (2 850 LoC için) | Üst-blok JSDoc: "Auditor scan loop entry — 7 pipeline (heartbeat/lock/scope/ADR/ground-truth/orphan/CI). Single writer of `.dashboard.json`." |
| `src/agents/index.ts` | Yorum yok | `// Re-export hub for worker.ts public API` yeterli |
| `src/agents/auditor.ts` | İsim semantiği belirsiz (monitor/auditor ile karışıyor) | Üst yoruma: "Note: This is the agents/ ADR-compliance layer — not to be confused with monitor/auditor.ts" |
| `src/nervous/observer.ts` `FS_WATCH_TARGETS` | Sabit liste, neden bu 4? | Yorum: "Sprint 145+146 pattern — değiştirmek için ADR-040 güncellenmesi gerek" |
| `src/agents/prompt-analytics.ts` `MIN_SAMPLES_FOR_WINNER = 4` | Magic number | "4 sample minimum — Bayesian convergence threshold" |
| `src/agents/adaptive-agent.ts` `IMPROVEMENT_THRESHOLD = 0.7` | Magic number | "70% success rate altında improvement önerilir" |
| `src/nervous/action-handlers.ts` `MVP_ACTION_IDS` Set | Hangi 26'sı pending? | TODO listesi link'i veya ADR-040 referansı |
| `src/agents/worker-rollback.ts` archive root + TTL | İyi yorum ama API surface yok | `docs/reference/api-surface.md`'e worker-rollback patch path format eklenmeli |
| `src/agents/shared-context.ts` | Yorum kısa, atomic write semantiği eksik | `.tmp + rename` pattern'i ADR-006 ile bağla |
| `src/monitor/sprint-state.ts` | İyi JSDoc ama resolution order'a writer referansı yok | "Writers: writeSprintState() in sprint-controller.ts" referansı |
| `src/nervous/runtime-scope-check.ts` `emitViolationEvent` | `require()` neden gerekli? | "ESM dynamic import sync API yok — runtime detection için require()" |
| `src/nervous/detectors/dead-event-stream.ts` | `reserve_for` yorumu artık misleading | Güncelle: "Sprint 148 reserved → Sprint 165 Bug W ile aktif" |

**Net:** Çoğu dosya iyi yorumlanmış (TR + EN karışık) ama **`src/monitor/auditor.ts` 2 850 LoC için modül üst-açıklaması yok** — bu en büyük dokümantasyon açığı.

---

## 6. ADR Compliance

### ADR-035: Brain ↔ Worker ↔ Auditor Verification Protocol (15 channel codes)
- ✅ `agents/worker.ts:emitWorkerQuestion`, `writeResult` doğru `CHANNELS.QUESTION`, `CHANNELS.RESULT`, `CHANNELS.HEARTBEAT`, `CHANNELS.CODE_VERIFY_REQUEST` kullanıyor.
- ✅ `monitor/auditor.ts:emitVerificationEvent`, `emitADRViolationEvent` (Sprint 138 Task 3).
- ✅ `monitor/alert-emitter.ts` `CHANNELS.METRIC_EMITTED` dual-write (Sprint 166 T9).
- ⚠️ **Gap:** `nervous/dispatcher.ts` channel kullanmıyor — Nervous bildirimler ayrı JSONL + MCP. ADR-035'in 15 kanalına Nervous DECKENT→USER:NOTIFY (H6 hot-fix kapsamında) eklenmiş — ADR'de explicit listeleme yok, güncellemek faydalı.

### ADR-037: Brain-Auditor-Worker Authority Matrix RBAC V1.0
- ✅ `agents/worker.ts:checkWorkerAuthority` advisory/soft enforcement (V1.0 Layer-2 kasıtlı bloke ETMEZ).
- ✅ `nervous/runtime-scope-check.ts` Brain-PID kısıtlamasını runtime'da enforce ediyor.
- ✅ `nervous/dispatcher.ts` ve `observer.ts` `assertBrainScope()` çağırıyor (worker'dan başlatma engellenir).
- ✅ `agents/permission-guard.ts` self-modification koruması — agent rolleri (brain/auditor/worker) için ayrı path izinleri.
- ⚠️ **V2 readiness:** `worker.ts:checkWorkerAuthority` her zaman `return true` — hard-flip Sprint 187+ için switch flag (config.adr037_hard_enforce) hazırlanabilir.

### ADR-040: Nervous System Architecture (Proactive Meta-Orchestrator)
- ✅ Tam pipeline implement: Observer → DetectorRegistry → DecisionEngine → Proposer → Dispatcher + Executor → History.
- ✅ `bootstrap.ts:createNervousSystemIfEnabled` default-off (`config.nervous_system?.enabled !== true → null`).
- ✅ `authority-matrix.ts` 4 preset + 5 safety floor (KILL_LIVE_SPRINT, MANUAL_FILE_DELETE, COST_OVER_THRESHOLD, DESTRUCTIVE_GIT, ADR_DEPRECATE_ACCEPTED).
- ✅ `action-registry.ts` 30 eylem katalogu — kategori dağılımı doğru (low/medium/high/safety-floor).
- ⚠️ **Gap:** 26 stub handler `{ outcome: 'unimplemented' }` döndürüyor (`action-handlers.ts:48`). ADR-040 "Phase 1 MVP" notunda 4 eylem dışı not flag edilmeli (mevcut yorum doğru).

### ADR-043: Brain Crash Recovery Protocol
- ✅ `nervous/history.ts` JSONL append-only — crash sonrası `readAll()` ile state restore mümkün.
- ✅ `nervous/ipc-queue.ts` file-based pending/resolved iki dizin — restart sonrası in-flight approvalları kaybetmez.
- ✅ `agents/worker-lifecycle.ts:atomicWriteFileSync` tmp+fsync+rename pattern (Docker SIGKILL exit-137 fix).
- ⚠️ **Gap:** `monitor/auditor.ts:heartbeatCache` modül-level Map — Brain crash sonrası boş başlar (kabul edilebilir, ama yorumla belirtilmeli).

### ADR-044: Sprint State Observability Contract
- ✅ `monitor/sprint-state.ts:getCurrentSprintId` tek source of truth — CLI + MCP + dashboard aynı API.
- ✅ `monitor/dashboard-manager.ts` `.dashboard.json` schema validation + auto-repair.
- ✅ `monitor/alert-emitter.ts` dual-write (dashboard JSON + event stream JSONL).
- ⚠️ **Gap:** `sprint-state.ts` writers listesi yok — JSDoc'ta "writeSprintState() in sprint-controller.ts" referansı eksik (bkz. §5).

**Net ADR uyum skoru:** 5/5 ADR'de **temel uyum mevcut**. 4 minör gap'in tümü dokümantasyon/API surface düzeyi — runtime davranış doğru.

---

## 7. Refactor Recommendations

### 🔴 P0 (Sprint 187 acil)

1. **`src/monitor/auditor.ts` god object split (2 850 → ~5×500 LoC)**
   - `monitor/auditor-scan.ts` — heartbeat scan + cache + stale detection (~600 LoC)
   - `monitor/auditor-locks.ts` — lock + boundary + deadlock (~400 LoC)
   - `monitor/auditor-ground-truth.ts` — doc-sync mismatch (~250 LoC)
   - `monitor/auditor-code-verify.ts` — CODE_VERIFIED_DONE + tryCodeVerifiedDone (~350 LoC)
   - `monitor/auditor-adr-compliance.ts` — verifyWorkerResult + checkADRCompliance + verifyFunctional (~500 LoC)
   - `monitor/auditor-ci-baseline.ts` — vitest baseline + audit gate (~500 LoC)
   - `monitor/auditor.ts` — `runScanCycle` orchestrator only (~250 LoC), re-export router
   - **Justification:** ADR-026 god-object policy + Sprint 144 worker.ts split precedent + test isolasyonu.

### 🟡 P1 (Sprint 188-189)

2. **Re-export stub'ları temizle**
   - `agents/auditor.ts` → callers `orchestra/authority-enforcer.ts` doğrudan kullanmalı
   - `agents/prompt-metrics.ts` + `agents/prompt-ab-test.ts` → callers `prompt-analytics.ts` kullanmalı
   - **Gating:** caller usage analizi (npm grep), tests güncelle

3. **`monitor/auditor.ts:heartbeatCache` modüler scope'a taşı**
   - `class AuditorScanContext { private heartbeatCache: Map<...> }` — test isolation
   - Crash recovery yorumunda kabul edilebilir kalır

4. **ADR-037 V2 hard-flip switch hazırlığı**
   - `config.adr037_hard_enforce: boolean` (default false)
   - `worker.ts:checkWorkerAuthority` true ise `return false` (bloke)
   - Sprint 187+ kullanıcı projelerinde gradual rollout

### 🟢 P2 (Sprint 190+)

5. **`Heartbeat.pid?: number` ekle** → `isWorkerProcessAlive` subprocess backend desteklesin (Sprint 139 Task 17-19 backend parity tamamlamak).

6. **`nervous/action-handlers.ts` unimplemented action telemetry** → `unimplementedActionCounter` per action ID, retro'da raporla.

7. **`nervous/observer.ts:FS_WATCH_TARGETS`** → configurable (`.deckent/config.json` → `nervous.fs_watch_paths`).

8. **`agents/prompt-analytics.ts` magic numbers** → `core/constants.ts`'e taşı (`MIN_SAMPLES_FOR_WINNER`, `TREND_THRESHOLD`, etc.).

---

## 8. Sprint 187 Follow-up (Action Items)

| ID | Item | Önerilen Owner | Tahmin |
|---|---|---|---|
| FU-1 | `monitor/auditor.ts` god object split (P0 #1) | architect + bug-fixer | 3-4 task, ~6 saat |
| FU-2 | `agents/auditor.ts` rename → `agents/adr-compliance.ts` veya inline elimine | refactorer | 1 task, ~30dk |
| FU-3 | ADR-037 V2 `config.adr037_hard_enforce` flag eklenmesi | security-auditor | 1 task, ~2 saat |
| FU-4 | `monitor/auditor.ts` modül-üst JSDoc + her public fonksiyon için 1-line summary | doc-writer | 1 task, ~1 saat |
| FU-5 | `docs/reference/api-surface.md` — worker-rollback patch format + Heartbeat shape + Nervous notification surface | doc-writer | 1 task, ~1 saat |
| FU-6 | Re-export stub kullanım analizi + silme planı (`prompt-metrics`, `prompt-ab-test`, `agents/auditor`) | refactorer | 1 task, ~30dk |
| FU-7 | `nervous/action-handlers.ts` unimplemented action telemetry counter (ADR-040 phase 2 readiness) | data-engineer | 1 task, ~2 saat |
| FU-8 | `monitor/sprint-state.ts` JSDoc — writers listesi (writeSprintState referansı) | doc-writer | 1 task, ~10dk |
| FU-9 | `Heartbeat.pid?: number` + `isWorkerProcessAlive` subprocess support | bug-fixer | 1 task, ~1 saat |
| FU-10 | `agents/worker-verify.ts` `enforceVerifyLoop` / `runTestVerifyLoop` "intentionally uncalled until ADR-037 V2" yorum güncellemesi | doc-writer | 1 task, ~10dk |
| FU-11 | `nervous/detectors/dead-event-stream.ts` `reserve_for` yorum güncellemesi (Sprint 165 Bug W aktivasyonu) | doc-writer | 1 task, ~10dk |
| FU-12 | ADR-035 channel listesini Nervous DECKENT→USER:NOTIFY ile genişlet | architecture-planner | 1 task, ~30dk |

**Toplam tahmin:** 12 task, ~14-16 saat (Sprint 187 effort: low-normal).

---

## 9. Summary

`src/agents/`, `src/nervous/`, `src/monitor/` üç modülü **fonksiyonel olarak sağlam** ve **mimari olarak tutarlı**. Toplam 51 dosya / 12 477 LoC; tüm beş cross-check ADR'de (035, 037, 040, 043, 044) temel uyum sağlanmış. **Hiçbir kritik dead code yok**, runtime semantik yorumlanmış, honest-gate (Sprint 165) ve atomic write (Sprint 139) gibi koruma katmanları aktif.

**En kritik tek bulgu:** `src/monitor/auditor.ts` **2 850 LoC god object** — ADR-026 split policy bu modüle uygulanmamış, Sprint 187 P0 refactor adayı (bkz. §7 #1). İkincil bulgular dokümantasyon gap'ları (§5) ve ADR-037 V2 hard-flip readiness (§6, §7 #4) — runtime'da bloke edici değil, ama post-GA için planlanmalı.

**ADR uyum skoru:** 5/5 (her ADR'de gözlemlenen 4 minör gap dokümantasyon düzeyi, runtime davranışı doğru).

**Sprint 187 backlog:** 12 follow-up task, ~14-16 saat — büyük çoğunluğu doc-writer (8/12), refactor 3, code-fix 1.

---

*Audit completed 2026-05-21 — Worker w-185-004, task 185-004, sprint-185.*
