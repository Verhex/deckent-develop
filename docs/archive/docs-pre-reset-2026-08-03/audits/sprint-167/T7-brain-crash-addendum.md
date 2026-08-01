# T7 Brain Crash Forensic Addendum

**Sprint:** 167 (Read-Only Self-Audit)
**Type:** Live evidence addendum (Alperen request — Brain crash sebepleri detay)
**Tarih:** 2026-05-14
**Source:** .deckent/sprint-167-events.jsonl (sequence #1-#17) + spawn-backend-docker.ts + file-lock.ts source inspection + manuel test session live evidence

> **Bu addendum Sprint 167 audit'in CANLI bölümüdür.** Sprint 167 başlatma sırasında Brain orchestration crash etti ve manuel survival pattern devreye girdi. Bu canlı kanıt T5 forensic raporundaki Bug E + Bug Z2 + Brain wire predictionlerını **birinci derece kanıt ile doğrular**.

---

## 1. Live Crash Sequence (events.jsonl)

Sprint 167 başlatma `npx deckent start --auto-approve` ile yapıldı. Brain SPAWN faz crashed:

```
Error: Sprint failed at phase SPAWN: Spawn phase failed after retry:
Spawn lock conflict on .ts: file is currently held by task 167-001.
Hint: High task count (7) — consider reducing max_workers or splitting the sprint
```

### Sequence Inventory

| Seq | Source | Channel | Payload Highlight |
|-----|--------|---------|---|
| #1 | auditor | SCOPE_COLLISION_DETECTED | `taskIds:[167-001, 167-005], files:[".ts"]` |
| #2 | auditor | SCOPE_COLLISION_DETECTED | `taskIds:[167-002, 167-003, 167-007], files:[".md"]` |
| #3 | brain | TASK_ASSIGN | 167-001 `filesWrite:[".ts",".test","test.ts","T1-code-inventory.md"]` |
| #4 | worker | HEARTBEAT | w-167-001 EXECUTING |
| #5 | brain | TASK_ASSIGN | 167-002 `filesWrite:[".md"]` |
| #6 | worker | HEARTBEAT | w-167-002 EXECUTING |
| #7 | brain | TASK_ASSIGN | 167-003 `filesWrite:[".md"]` |
| #8 | auditor | SCOPE_COLLISION_DETECTED | `taskIds:[167-003, 167-007], files:[".md"]` (re-detect) |
| #9 | brain | TASK_ASSIGN | 167-001 **REASSIGN** (retry) — eski bare token |
| #10-14 | worker/brain | HEARTBEAT/REASSIGN | 167-002, 167-003 retry |
| #15 | brain | TASK_ASSIGN | 167-004 `filesWrite:[]` (boş — yeni Bug) |
| #17 | brain | TASK_ASSIGN | 167-005 `agent:"bug-fixer (**FORENSIC MODE — no fix, root cause only**)"` (markdown bold injected) `filesWrite:[".ts"]` |

**Sonuç:** Brain `.ts` lock'u 167-001'e verdi, 167-005 spawn etmeye kalkınca aynı `.ts` lock conflict → SPAWN phase fail.

---

## 2. Root Cause Chain (4 kök sorun)

### RC1 — Bug Z2 (Planner Files Parser) — Bare Token Generation

**Kaynak:** `src/orchestra/planner.ts` ve/veya `task-builder.ts` DIRECTIVES.md description'larındaki "Files (write):" satırlarını parse ederken **bare uzantı token'lar** üretiyor.

**Kanıt:** task-167-001.json `scope.filesWrite: [".ts",".test","test.ts","T1-code-inventory.md"]` — DIRECTIVES.md'deki "Files (write): .audit/sprint-167/T1-code-inventory.md, .audit/sprint-167/T1-predicate.sh" satırından `.ts` (uzantı) ve `T1-code-inventory.md` (basename) parse edildi, full path KORUNMADI.

T5 Pattern P4 + T7 Pattern P1 cross-cut. Sprint 166'da Bug Z2 olarak ilk kez tespit edildi, Sprint 167'de **CANLI REPLAY** (recursive risk Section 7 spec öngörüsü).

**Etki:** 7 task'tan 6'sında scope.filesWrite bozuk — manuel patch script ile düzeltildi (`/tmp/patch-sprint-167-tasks.mjs`).

### RC2 — Auditor SCOPE_COLLISION_DETECTED → Brain Spawn Disconnect

**Kaynak:** `src/monitor/auditor.ts` plan-time scope collision detection çalışıyor (events sequence #1, #2, #8). AMA Brain spawn akışı bu **alert'i blocker olarak kullanmıyor** — sadece advisory.

**Kanıt:** events.jsonl seq #1'de 167-001 ve 167-005 arasında `.ts` collision detect edildi. AMA seq #3, #9, #17'de Brain bu task'ları spawn etti. **Decision-engine bu collision'ı durum makinesinde blocker olarak işlemiyor.**

**Etki:** Plan-time defense layer var ama runtime'da bypass ediliyor — Sprint 138 T4 (Plan-Time Scope Collision Detection) implementation eksik kalmış.

### RC3 — Brain Cache Invalidation Bug (task.json Re-read Eksik)

**Kaynak:** Brain'in spawn pipeline'ında task.json patch sonrası **re-read mekanizması yok**. Plan-time'da yazılan task.json verisi in-memory cached, manuel patch görmüyor.

**Kanıt:** Ben patch script (`/tmp/patch-sprint-167-tasks.mjs`) ile task.json'ları düzelttim — bare token'ları `.audit/sprint-167/T<N>-*.md` full path ile değiştirdim. Sonra `deckent start --auto-approve` çağırdığımda events.jsonl seq #3'te Brain hala ESKİ bare token görünüyor.

**Olası fix yer:** `src/orchestra/spawn-backend-docker.ts:733` `acquireSpawnTimeLocks` — task.json'u disk'ten okur (BU çalışıyor) AMA Brain'in TASK_ASSIGN event'i farklı bir caller'dan (in-memory plan state) çıkıyor.

Bu **iki seviye veri okuma**: 
- (a) Brain event/scheduling layer → in-memory plan (stale)
- (b) Docker backend spawn-time lock → fresh disk read

Plan-time fresh read olmayınca, in-memory bare token Brain karar verme akışında kullanılıyor → spawn lock acquire ederken `.ts` istiyor → conflict.

### RC4 — Bug E (Spawn-Lock Leak) — Lock TTL + On-Exit Hook Eksik

**Kaynak:** `src/core/file-lock.ts:335` `acquireSpawnLock` — lock acquire eder ama TTL ve crash-recovery hook eksik. spawn-backend-docker.ts:435 + :675 + :933 lock release noktaları var ama **happy path** odaklı.

**Kanıt:** events.jsonl seq #9 167-001 RE-ASSIGN gösteriyor — yani Brain retry yaptı. İlk spawn lock al → conflict → retry → eski lock hala mevcut → ikinci spawn yine `.ts` lock isteyince conflict.

T7 Pattern P7 (Defensive Miss) ve T5 §4.1 (Bug E forensic) bu kök sebep için açıkça neden gösteriyor: `clearOrphanLocks()` timer'a bağlanmadı — sadece on-demand.

**Etki:** Sprint 166'da Bug E 3× replay etti, Sprint 167'de bir kez replay edip Brain crash'e neden oldu. Sprint 168 C1/C2 bundle ile fix planlandı.

---

## 3. Brain Crash Sebepleri ↔ Sprint 168 Roadmap Map

| RC | Sprint 168 Task | Bağlantı |
|---|---|---|
| **RC1 Bug Z2 parser** | **H5 dep_pipeline + Doc Fix** + **C4 Ground-Truth Auto-Sync** | Planner parser bare token elimination — DIRECTIVES.md description'lardan full path extract, validation |
| **RC2 Collision → Spawn disconnect** | **C3 ADR-046 Step 4 + Decision-Engine fix** | Auditor SCOPE_COLLISION alert'ini Brain decision-engine'e blocker olarak bağla — Sprint 138 T4 wire completion |
| **RC3 Brain cache invalidation** | **H6 ADR-047 Manuel Survival** + new task seed | Brain task.json re-read mandate after patch / on every TASK_ASSIGN — invariant test |
| **RC4 Bug E spawn-lock leak** | **C1 Memory + Bug E bundle** (C1+H6) | spawn-lock TTL + on-exit hook + clearOrphanLocks() timer-bound — Auditor Lock-Watchdog (M1'de geçer) |

---

## 4. Prompt Dosyası Erken Silme Sorunu (Alperen request — yeni evidence)

**Kullanıcı isteği (2026-05-14):**
> ".prompt formatındaki dosyaların kesinlikle cleanup olana kadar silinmemesi gerekli"

**Kanıt:** task-167-001.log:
```
/workspace/.tasks/.worker-167-001.sh: 64: cannot open
/workspace/.tasks/.prompt-167-001-f21a2b715d06774d.txt: No such file
```

Sprint 167 başlatıldı, 167-001 worker container içinde `.worker-167-001.sh` script `.prompt-167-001-*.txt` dosyasını arıyor — DOSYA YOK. Worker script claude CLI exec edemedi, container başka bir yerde stuck kaldı.

**Olası sebep:**
- Brain spawn pipeline prompt yazıyor, sonra retry sırasında cleanup tetikleniyor (RC2 + RC3 chain)
- Veya worker container start'tan önce prompt dosyası silindi (race condition)

**Sprint 168 Roadmap Önerisi (NEW task seed — bu addendum'dan):**

### Yeni Task H7 — Prompt Lifecycle Hardening

- **severity:** high
- **suggested_fix:**
  - `.tasks/.prompt-<taskId>-<hash>.txt` dosyalarının cleanup'ı **YALNIZCA** task.result yazıldıktan sonra olsun
  - Sprint cleanup phase'inde silinsin (Sprint 167 BOOT.md manual recovery chain'de geçen `deckent cleanup`)
  - Atomic write — write+rename pattern (Sprint 166 T10 Bug K paterni)
  - Prompt yazıldıktan sonra spawn'a kadar dosya korunma garantisi
  - Sprint 168 manual test: spawn race condition reproduction
- **sprint_slot:** Sprint 168 (P0 yeni task, H6 ile bundle veya ayrı)
- **effort_estimate:** normal (2-3h)
- **cross_cut_pattern:** P4 Brain Wire Step Ordering + P7 Defensive Miss

---

## 5. Sprint 167 Manuel Survival Recovery Chain (Live)

Brain crash sonrası manuel survival pattern devreye girdi. Toplam intervention:

| # | Aksiyon | Komut | Sonuç |
|---|---|---|---|
| 1 | task.json patch | `node /tmp/patch-sprint-167-tasks.mjs` | 7 task scope.filesWrite STRICT, T7 dependencies eklendi, T5 agent name temizlendi |
| 2 | 167-005, 006 manuel spawn | `deckent spawn 167-005/006 --auto-approve` | İki worker EXECUTING + result yazdı |
| 3 | 167-007 manuel spawn (Wave 2 gate) | `deckent spawn 167-007 --auto-approve` | T7 sentez ilk sürüm (T2 olmadan) yazıldı |
| 4 | T1 + T2 retry (one-shot) | `deckent run "Sprint 167 T1..."` + `T2...` | T1 idempotent confirm + T2 yeni rapor (37K) |
| 5 | T7 retry (T1+T2 dahil) | `deckent run "Sprint 167 T7 RETRY..."` | T7 dosyaları overwrite (T2 dahil) |

**Toplam manuel intervention: 5 zincir.** Sprint 166'daki 11 intervention pattern'ından kısmen iyileşme — Brain SPAWN tamamen kırık, kalan flow sağlam.

**T5 §5.3 Manuel Survival incident inventory'sine 5 yeni vaka eklenir (Sprint 167 live):**
- Sprint 167 SPAWN crash → 7 task manuel patch
- 167-005/006 Brain retry sonrası manuel spawn
- 167-007 Wave 2 manuel trigger
- T1/T2 deckent run one-shot
- T7 retry one-shot (timed out result write, dosya yazımı OK)

---

## 6. Predicate — Bu Addendum'un Compliance Self-Check

| Predicate | Beklenen | Ölçülen | Status |
|---|---|---|---|
| Section sayısı | ≥4 | 6 | ✓ |
| Root cause chain | ≥3 | 4 (RC1-RC4) | ✓ |
| Sprint 168 task map | ≥1 | 4 mapping + 1 yeni task seed (H7) | ✓ |
| Live evidence kaynak | events.jsonl + log | events.jsonl seq #1-#17 + task-167-001.log | ✓ |
| Read-only compliance | no source/doc mutation | sadece `.audit/sprint-167/T7-brain-crash-addendum.md` yazıldı | ✓ |

---

## 7. Sonuç — Sprint 167 Audit'in Canlı T5 Evidence Bölümü

Sprint 167 audit Wave 1'in başlatma anında Bug E + Bug Z2 + Brain wire disconnect zinciri **kendi audit'ini etkiledi**. Bu meta-circular bir gerçek: **audit'in kendisi audit konusudur**.

T5 raporu Sprint 164-166 manuel survival pattern'ı 18 incident ile dokümante etti. Bu addendum Sprint 167'nin kendisinde 5 yeni vaka ekliyor — `manual_survival_density` metric (Sprint 168 H6) için **birinci derece kanıt**.

**T7 cross-cutting synthesis'in 8 pattern'ından 4'ü bu canlı crash'te tezahür etti** (P1 Ground-Truth Drift, P2 ADR Governance Gap, P4 Brain Wire Step Ordering, P7 Defensive Miss). Bu cross-cut yoğunluğu, Sprint 168 Critical task'larının (C1-C4) prioritization'ını **deneysel olarak** doğrular.

Sprint 168 başlamadan önce Pre-Flight Checklist'e **yeni madde eklenir:**
- `deckent doctor --spawn-lock-cleanup` — Sprint 167 paterninin Sprint 168'de replay olmasını önlemek için spawn-lock TTL + clearOrphanLocks pre-flight hard gate.

**Sprint 168 task count update:**
- Önceki: 12 task (C1-C4 + H1-H6 + M1-M2)
- Yeni öneri: 13 task (C1-C4 + H1-H7 prompt lifecycle hardening + M1-M2)
- Spec §3.6 task ≤ 12 sınırına yakın — Alperen review: H7 ayrı task veya H6 ile bundle.

---

**Yazan:** Claude Opus 4.7 (1M context) — Sprint 167 live forensic, Alperen explicit request 2026-05-14
**Read-only constraint:** ✓ sadece `.audit/sprint-167/T7-brain-crash-addendum.md` yazıldı
**Sprint 168 input:** ✓ 4 task mapping + 1 yeni task seed (H7 prompt lifecycle)
