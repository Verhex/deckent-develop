# Audit — `src/core/active-workers.ts`

> Per-file audit (Sprint 187 / 50-task pilot — actually executing as Sprint 186 task 186-023).
> Source line count: **91 LoC** (small, single-purpose utility module).

---

## 1. Inventory

| Field | Value |
|-------|-------|
| Path | `src/core/active-workers.ts` |
| LoC (raw) | 91 |
| Effective LoC (non-comment, non-blank) | ~45 (heavy header + JSDoc) |
| File kind | Utility / shared helper (state + pure functions) |
| Created | Sprint 168 (C0e — BUG-HH eradication, `getActiveWorkerIds()` shared helper extract) |
| Last semantic change | Sprint 170 (P0-5 — `PENDING_SPAWNS` Set + `markPending/markActive/clearPending` race-window protection) |
| Module-level state | `PENDING_SPAWNS: Set<string>` (taskIds in spawn window before `.hb` exists) |
| Constants | `TASKS_DIR = '.tasks'` |

### Exports

| Symbol | Kind | Purpose |
|--------|------|---------|
| `markPending(taskId: string): void` | function | Add taskId to PENDING_SPAWNS *before* prompt write — bridges race window |
| `markActive(taskId: string): void` | function | Remove taskId from PENDING_SPAWNS *after* `.hb` exists (heartbeat now authoritative) |
| `clearPending(taskId: string): void` | function | Remove on spawn-failure / error path — prevents Set leak |
| `_clearAllPending(): void` | function (test-only) | Clears entire Set between test cases |
| `_getPendingSpawns(): string[]` | function (test-only) | Snapshot of current pending taskIds |
| `getActiveWorkerIds(projectRoot: string): string[]` | function | Returns deduped union(PENDING_SPAWNS, taskIds parsed from `.tasks/*.hb`) |

Internal-only type `HeartbeatPayload` (`{ taskId?, workerId?, status? }`) — narrowing shape for JSON.parse output, not exported.

### Imports

| Specifier | Kind | Use |
|-----------|------|-----|
| `node:fs` | runtime | `readFileSync`, `readdirSync`, `existsSync` |
| `node:path` | runtime | `join` |

Zero third-party deps; zero project imports — leaf module in the dependency graph.

### Reverse dependencies

`grep -rE "from ['\"].*active-workers"` (src/ + tests/) → **5 source files**:

| Consumer | Symbols used | Notes |
|----------|--------------|-------|
| `src/providers/claude.ts:17,150` | `getActiveWorkerIds` | `_cleanupOrphanedPromptFiles()` selective filter (default arg fallback) |
| `src/orchestra/spawn-backend-docker.ts:20,177,194,448,473` | `markPending`, `markActive`, `clearPending` | Docker spawn lifecycle wire (P0-5, Sprint 170) |
| `tests/core/active-workers.test.ts` | `getActiveWorkerIds` | 4 baseline cases |
| `tests/core/active-workers-pending.test.ts` | All 6 exports | Pending-Set lifecycle suite |
| `tests/orchestra/docker-spawn-race.test.ts` | `getActiveWorkerIds`, `markPending`, `markActive`, `clearPending`, `_clearAllPending` | 3s race-window regression test |
| `tests/orchestra/tmux-prompt-filename.test.ts:43` | `getActiveWorkerIds` (mocked) | tmux backend isolation — module-level mock |
| `tests/providers/claude-cleanup-active-protected.test.ts:51` | (implicit via default arg) | Asserts helper-as-default behaviour |

Direct production callers: **2** (claude.ts, spawn-backend-docker.ts). Test coverage: **5 files**. ADR-048 cites `src/core/active-workers.ts:67` by line number — protocol-level fixture.

---

## 2. Bağlam (Architectural Context)

Bu modül Sprint 168 *Cluster E* (BUG-HH eradication) sırasında doğdu. O sprintten önce **aktif worker enumerasyonu** yalnızca `src/monitor/auditor.ts:2162-2168` içinde inline bir ifade olarak yaşıyordu; bu ifade `workerId`'leri okuyordu (lock-cleanup için). Sprint 168 C0e fix'i `ClaudeAdapter._cleanupOrphanedPromptFiles()`'ın "Option C selective filter" davranışını gerektirdi — yani Docker prompt dosyaları (`.prompt-{taskId}-{promptId}.txt`) bir taskId-tabanlı whitelist gerektiriyordu. İki pattern (auditor'ün `workerId` + cleanup'ın `taskId`) kasıtlı olarak ayrı tutuldu (JSDoc'taki "NOTE — field choice rationale" bloğu bunu sözleşme olarak yazıyor). `src/core/active-workers.ts` bu ihtiyaç için yeni bir leaf modül olarak `core/`'a yerleştirildi, böylece ADR-008 "core → orchestra import yok" kuralı korundu.

Sprint 170 P0-5'te (BUG `docker-spawn-race`) ikinci kuşak fonksiyonellik eklendi: spawn başlangıcı (`docker run` + health check) ~3 saniye sürebiliyor ve bu pencerede sibling bir worker `kill()` çağrısı `_cleanupOrphanedPromptFiles()`'i tetikleyebiliyordu. `.hb` henüz yazılmamışsa yeni spawn'ın prompt dosyası silinirdi → fatal başlangıç hatası. Çözüm: süreç-içi `PENDING_SPAWNS: Set<string>` ile `markPending` (prompt yazımından önce) → `markActive` (`.hb` diskte) → `clearPending` (error path) protokolü. `getActiveWorkerIds` döndürdüğü kümeyi pending set ile **union** alır, böylece prompt cleanup yalnızca gerçekten ölü taskId'leri hedefler.

ADR ekosistemindeki yeri:
- **ADR-048 (Prompt Lifecycle Contract)** — kontratın *Decision 4* (selective filter) maddesi bu dosyayı **isim ve satır numarası ile** referans verir (`docs/adr/048-prompt-lifecycle-contract.md:39,46,58`). Modül effective olarak ADR-048'in implementation surface'idir.
- **ADR-027 (Hybrid Spawn Backend)** — Docker backend race-window partner'ı; `markPending/markActive/clearPending` Docker yaşam döngüsünün ayrılmaz parçası.
- **ADR-008 (Brain Merkezi Import — Tek Yönlü Bağımlılık)** — `core/` katmanında bilerek konumlandırıldı (sadece `node:*` import; tüketiciler `core/` → `providers/`, `orchestra/` yönünde).
- **ADR-044 (Sprint State Observability Contract)** — `getActiveWorkerIds` aktif sprint state'in tek tek-kanal observation noktası (sprint-state-tracker'a girdi).

Sprint 171 audit'inde (`docs/audits/sprint-171/02-concern/04-performance.md` §1.12 ve `docs/audits/dynamic-split/core-audit.md` §89-103) modül zaten incelendi: **clean** (test izolasyonu, header dokümantasyonu, ADR uyumu), tek MEDIUM uyarı sync-I/O perf bulgusu (bkz. §3 D-1).

---

## 3. Debt Risk

| ID | Risk | Severity | Likelihood | Impact |
|----|------|----------|------------|--------|
| D-1 | `getActiveWorkerIds` her çağrıda `.tasks/` sync taraması + her `.hb` için sync read + `JSON.parse`. Cache yok. Sprint 171 perf audit 1.12'de MEDIUM olarak işaretlendi. | 🟡 MEDIUM | HIGH (her cleanup tetiklemesinde) | Hot-path değil ama N workers × M cleanup çağrısı disk I/O multiplier'ı |
| D-2 | `PENDING_SPAWNS` modül-seviyesi global state. Test izolasyonu için `_clearAllPending` underscore-prefixed test-only API var; ancak forget edilirse cross-test state sızıntısı olur. | 🟢 LOW | LOW | Test suite zaten `beforeEach(_clearAllPending)` kullanıyor (kanıt: `docker-spawn-race.test.ts:35`, `active-workers-pending.test.ts:18`) |
| D-3 | `getActiveWorkerIds` malformed `.hb` dosyalarını sessizce yutar (`catch {}` boş). Audit/observability sinyali kayboluyor; korup dosyalar tespit edilmiyor. | 🟢 LOW | LOW | Olası fakat nadir; yine de prod incident'lerde tanı zorlaştırır. Debug log + `_warnInvalidHeartbeat` çentik atılabilir. |
| D-4 | `HeartbeatPayload` arayüzü modül-private. `src/agents/worker.ts` ve `monitor/auditor.ts` aynı şekil için kendi tip tanımlarını taşıyor → drift riski. | 🟢 LOW | MEDIUM | `src/core/heartbeat-types.ts` benzeri tek-kaynak adayı |
| D-5 | `TASKS_DIR = '.tasks'` sabit; çoklu-proje / custom-dir senaryolarında parametrize edilmiyor. ADR-034 multi-project isolation ile aynı doğrultuda değil. | 🟢 LOW | LOW | Çağrılar `projectRoot` alıyor ama içeri sabit `.tasks` join'leniyor — şu an tüm callsite'lar `.tasks` kullanıyor, fakat config-driven olamıyor |
| D-6 | `PENDING_SPAWNS` cross-process / worker-process boundary'de senkronize değil (yalnızca Brain ana sürecinde yaşar). Docker worker subprocess'leri kendi Set'lerini görmez. | 🟢 LOW | LOW | Tasarım gereği OK — yalnızca spawn-side koruma istendi; worker subprocess `.hb` yazınca race biter |

Toplam: 6 risk maddesi (1 MEDIUM, 5 LOW). Modül son derece dar kapsamlı — gerçek hot-spot yok.

---

## 4. Dead Code Candidates

**Hiçbir dead code adayı yok**. Tüm 6 export'un canlı tüketicisi var:

```bash
$ grep -rnE "(markPending|markActive|clearPending|getActiveWorkerIds|_clearAllPending|_getPendingSpawns)" src/ tests/ | grep -v active-workers.ts
src/orchestra/spawn-backend-docker.ts:20:import { markPending, markActive, clearPending } ...
src/orchestra/spawn-backend-docker.ts:177:    markPending(taskId);
src/orchestra/spawn-backend-docker.ts:194:    clearPending(taskId);
src/orchestra/spawn-backend-docker.ts:448:    clearPending(taskId);
src/orchestra/spawn-backend-docker.ts:473:    markActive(taskId);
src/providers/claude.ts:17:import { getActiveWorkerIds } ...
src/providers/claude.ts:150:    const active = activeTaskIds ?? getActiveWorkerIds(this.projectDir);
tests/core/active-workers.test.ts: [4 cases on getActiveWorkerIds]
tests/core/active-workers-pending.test.ts: [4 cases on full Pending API]
tests/orchestra/docker-spawn-race.test.ts: [3 race-window regression cases]
tests/orchestra/tmux-prompt-filename.test.ts:43: vi.fn(() => [] as string[]),  # mocked
tests/providers/claude-cleanup-active-protected.test.ts:51: # default-arg fallback assertion
```

Notlar:
- `_clearAllPending` ve `_getPendingSpawns` underscore-prefixed (test-only contract). Production'da çağrılmıyor → `core-audit.md:99` zaten doğru tespit etmiş.
- `HeartbeatPayload` private interface — module-local, doğrudan tüketici yok ama tip-daraltma için zorunlu.

Inline-delete adayı bulunmuyor. Tersine: D-4'te belirtildiği gibi `HeartbeatPayload`'ın **çıkartılması** (extract) düşünülebilir.

---

## 5. Documentation Gaps

| Gap | Açıklama | Önerilen Aksiyon |
|-----|---------|------------------|
| G-1 | Modül header'ı dosyanın varoluş nedenini özetlemiyor. Açıklama doğrudan `PENDING_SPAWNS` yorum bloğunda başlıyor; üst-düzey "this module owns active-worker enumeration for prompt-cleanup safety" satırı yok. | İlk satırlara `/** ... */` modül-üstü JSDoc ekle; ADR-048 link'i ver. |
| G-2 | `markPending` / `markActive` / `clearPending` döngüsünü açıklayan tek bir sequence diagram veya yorum bloğu yok. Her fonksiyonun kendi tek-satır JSDoc'u var; ancak "ne zaman, hangi sırayla" sözleşmesi `spawn-backend-docker.ts` yorumlarına dağılmış. | Dosya başına 6-8 satırlık "Spawn lifecycle protocol" comment block ekle. |
| G-3 | `getActiveWorkerIds`'in **pending Set ile union** yaptığı (`.brain/exports/decisions.md:4124` "pozitif nüans" olarak işaretli) önemli bir behavior, JSDoc'ta açıkça yazılmamış. Sadece kod yorumu (line 68) söylüyor. | JSDoc `@returns` satırını "deduped union of in-memory pending set and on-disk .hb taskIds" olarak güncelle. |
| G-4 | Test-only API'lar (`_clearAllPending`, `_getPendingSpawns`) JSDoc'larında "test helper" yazıyor ama production'da çağrılmamasını lint-enforce edecek bir mekanizma yok (ESLint rule, naming convention yeterli sayılmış). | TSDoc `@internal` veya `@deprecated` (test-only) tag ekle; bir lint rule (no-internal-import) düşünülebilir. |
| G-5 | `TASKS_DIR` sabitinin "neden hard-coded" olduğu açıklanmamış; ADR-034 multi-project isolation ile çelişiyor görünüyor (D-5). | Yorum: "Mirrors `.deckent/config.json` `tasksDir` default; if config-aware variant needed, see TODO #..." |
| G-6 | Malformed `.hb` durumunda `catch {}` sessiz yutma; davranış JSDoc'ta belirtilmemiş ("malformed/missing/unreadable → silently skipped"). | `@remarks` bloğu ile fail-soft kontratı yaz. |

---

## 6. ADR Compliance Check

| ADR | Maddesi | Compliance | Not |
|-----|---------|-----------|-----|
| ADR-001 (TypeScript + ESM) | `.ts`, ESM imports, `export function` | ✅ PASS | Standart |
| ADR-002 (Node16 module resolution) | `.js` uzantısı? — yok import path'lerinde sadece `node:fs`/`node:path` var | ✅ PASS | İç project import yok; n/a |
| ADR-006 (spawnSync security) | Spawn yok | ➖ N/A | |
| ADR-008 (Brain Merkezi Import — Tek Yönlü) | `core/`'da yaşıyor, sadece `node:*` import. Tüketiciler `providers/` ve `orchestra/`. | ✅ PASS | İdeal leaf konumu |
| ADR-010 (Tek Runtime Dep) | Üçüncü-parti yok | ✅ PASS | |
| ADR-027 (Hybrid Spawn Backend) | Docker spawn race-window protection partner'ı (`markPending/markActive/clearPending` Sprint 170 P0-5) | ✅ PASS | Doğrudan implementation surface |
| ADR-034 (Multi-Project Isolation) | `TASKS_DIR = '.tasks'` hard-coded — yalnızca `projectRoot` parametrize, dizin adı değil | ⚠️ PARTIAL | Aynı host'ta paralel deckent projeleri için OK (her `projectRoot` farklı); custom `tasksDir` config destekli değil |
| ADR-035 (Verification Protocol Standard) | Auditor / cleanup pipeline'a observability girişi | ✅ PASS | `getActiveWorkerIds` non-mutating, idempotent — protocol uyumlu |
| ADR-036 (ADR Governance Integration) | Worker prompt injection yok; salt-veri modülü | ➖ N/A | |
| ADR-037 (Authority Matrix RBAC V1.0) | Policy gate yok; pure data accessor | ➖ N/A | |
| ADR-038 (Self-Modifying Task Detection) | `core/` dosyası; refactorer için "küçük dosya" değil (91 LoC, açık tüketici) → silinme riski düşük | ✅ PASS | Sprint 145 vakası gibi false-delete riski yok |
| ADR-044 (Sprint State Observability Contract) | `getActiveWorkerIds` sprint-state-tracker için temel okuma kanalı | ✅ PASS | Tek sorumluluk; kontrat uyumlu |
| ADR-048 (Prompt Lifecycle Contract) | *Decision 4* (selective filter) **bu dosyayı isim+satır ile referans verir** | ✅ PASS | Implementation = spec'in canlı versiyonu |

Net: aktif ADR ihlali **yok**. ADR-034 için *partial*: `TASKS_DIR` config-driven olmamak çoklu-proje izolasyonu kapsamında bir sınır vakası (her `projectRoot` farklı olduğu sürece sorun değil, ancak custom `tasksDir` config'i mevcut değil).

---

## 7. Refactor Recommendations

### R-1 (önerilen, low-effort) — Header JSDoc + Lifecycle Comment Block

- Dosya başına 6-10 satırlık modül-üstü JSDoc ekle (G-1, G-2 birleştir).
- `getActiveWorkerIds` JSDoc'una "deduped union(pending, .hb)" satırını yaz (G-3).
- Etki: **+10-15 LoC** (yorum). Davranış değişmez.
- Risk: sıfır.

### R-2 (orta) — `HeartbeatPayload` Tipini Ortak Modüle Taşı

- Yeni dosya: `src/core/heartbeat-types.ts` (tek `export interface HeartbeatPayload`).
- `worker.ts`, `monitor/auditor.ts`, `active-workers.ts` import etsin (D-4).
- Etki: drift riski biter, 3 dosyada tek-kaynak.
- Risk: düşük; tip-only refactor.

### R-3 (orta, perf) — `getActiveWorkerIds` Cache + Invalidate

- Sprint 171 P2 önerisi (`04-performance.md:672-686`).
- 200-500ms TTL micro-cache **veya** explicit invalidate (markPending/markActive/clearPending → `cachedIds = null`).
- Etki: hot-cluster cleanup çağrılarında disk I/O azalır.
- Risk: cache invalidation bug'ları için ek test yükü; D-1'in MEDIUM severity'sini düşürür.

### R-4 (defensive, low) — Malformed `.hb` Debug Log

- `catch (e) { ... }` bloğuna `debugLog('malformed heartbeat', file)` ekle (G-6, D-3).
- Etki: production tanı kolaylaşır; davranış değişmez.
- Risk: sıfır (zaten boş catch).

### R-5 (savunmacı, isteğe bağlı) — `TASKS_DIR` Config-Aware

- `getActiveWorkerIds(projectRoot, tasksDir = '.tasks')` overload veya config-loader entegrasyonu.
- Etki: ADR-034 *partial* → *full*. Çağırıcılar default ile uyumlu.
- Risk: çağrı yüzeyi değişir; ancak test sayısı küçük (5 file), maliyet düşük.

Net tavsiye: **R-1 + R-4 birlikte Sprint 188 cleanup pass'ında**; **R-2** ayrı bir tip-hijyen task'ı; **R-3** opsiyonel performans task'ı (perf yükü kanıtlanırsa); **R-5** ADR-034 çoklu-proje desteği gelecekte istenirse.

---

## 8. Sprint 188 Follow-up Items

| ID | Item | Tip | Tahmini Effort |
|----|------|-----|----------------|
| FU-1 | Modül-üstü JSDoc + spawn lifecycle comment block ekle (G-1, G-2; R-1) | doc | low (≤15 dk) |
| FU-2 | `getActiveWorkerIds` JSDoc'unu "pending ⋃ heartbeat" union davranışıyla netleştir (G-3; R-1) | doc | low (≤10 dk) |
| FU-3 | Malformed `.hb` için debug log ekle (D-3, G-6; R-4) | observability | low (≤20 dk) |
| FU-4 | `HeartbeatPayload` tipini `src/core/heartbeat-types.ts` altında tek kaynak haline getir; `worker.ts`, `monitor/auditor.ts`, `active-workers.ts` import etsin (D-4; R-2) | refactor | normal (1-2 saat) |
| FU-5 | `getActiveWorkerIds` cache + invalidate (Sprint 171 §1.12 P2; R-3) — gerçek hot-cluster perf signal'i varsa; aksi halde defer | perf | normal (2-3 saat, +test) |
| FU-6 | `TASKS_DIR` config-aware overload (ADR-034 *partial* → *full*; R-5) — yalnızca multi-project custom-tasksDir senaryosu açılırsa | refactor | normal |
| FU-7 | Test-only API'lar için `@internal` TSDoc tag (G-4) — uzun vadede no-internal-import lint rule düşünmek için kanca | doc + lint | low |

---

## 9. Summary

`src/core/active-workers.ts` Sprint 168 C0e (BUG-HH eradication) sırasında `getActiveWorkerIds()` shared helper extract'i olarak doğdu ve Sprint 170 P0-5'te Docker spawn race-window protection için `PENDING_SPAWNS` Set + `markPending/markActive/clearPending` trio'su ile genişletildi. 91 LoC, **6 export** (4 production + 2 test-only), iki `node:*` import dışında dış bağımlılığı yok; ideal bir `core/` leaf modülü. Direkt production tüketici sayısı **2** (`src/providers/claude.ts`, `src/orchestra/spawn-backend-docker.ts`), test kapsamı **5 dosya**; ADR-048 *Decision 4* bu dosyayı isim+satır numarasıyla referans veriyor (implementation surface). ADR-001/002/008/010/027/035/038/044/048 ile tam uyum; ADR-034 *partial* (TASKS_DIR hard-coded). Tek MEDIUM debt: `getActiveWorkerIds` her çağrıda sync disk taraması (Sprint 171 §1.12 — opsiyonel Sprint 172 P2 cache aday). Dead code yok. Belge boşlukları: modül-üstü JSDoc, lifecycle protocol açıklaması, union behavior'un explicit dokümantasyonu (G-1..G-3). Önerilen aksiyon: Sprint 188'de R-1 (header doc) + R-4 (debug log) — toplam ~30 dk, davranış değişmez; R-2 (HeartbeatPayload extract) ayrı tip-hijyen task'ı; R-3 (cache) hot-spot kanıtlanırsa. Modül **sağlam, dar kapsamlı, sözleşme-uyumlu** — bu pilot'ta gözlenen en clean dosyalardan biri.
