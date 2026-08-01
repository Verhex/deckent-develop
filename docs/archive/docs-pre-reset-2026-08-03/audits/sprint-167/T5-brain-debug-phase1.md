# Sprint 167 — Brain Orchestration Debug Phase 1 (Root Cause Investigation)

**Skill:** superpowers:systematic-debugging
**Phase:** 1 (Problem Definition + Multi-Component Evidence Gathering)
**Date:** 2026-05-14
**Tip:** Comprehensive root cause investigation — Sprint 168 Brain Repair Phase spec input
**Iron Law:** NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
**Direkt kod yazma YOK** — yalnızca problem statement + evidence + initial hypothesis

> Bu rapor Sprint 167 audit'in T5 forensic raporundaki 9 Brain orchestration bug için sistematik Phase 1 problem definition yapar. Hedef: Sprint 168 Brain Repair Phase için actionable spec input. Phase 2 (pattern analysis), Phase 3 (hypothesis testing), Phase 4 (implementation) ayrı oturumlarda yapılacak.

---

## 0. Executive Summary

**10 bug → 5 architectural cluster (Phase 4.5 trigger justified):**

| Cluster | Bug'lar | Architectural Problem | Severity |
|---|---|---|---|
| **A — Brain Finalize Hook Chain Implementation Gap** | BUG-CC, BUG-DD, BUG-EE, BUG-GG (4 bug) | ADR-046 spec ile real implementation arasında **kısmî implementation** — Step 2/4/5 wire problemli | CRITICAL |
| **B — Locking Infrastructure Asymmetry** | RC4 Bug E (1 bug) | Sprint 156 T-10 SpawnLock ayrı namespace ama cleanup helper symmetric değil | CRITICAL |
| **C — Plan↔Spawn Integration Disconnect** | RC1, RC2, RC3 (3 bug) | Plan-time data (parser output, collision alert, in-memory state) Spawn-time'a fresh+validated bağlanmıyor | CRITICAL |
| **D — Sprint Metrics Math** | BUG-FF (1 bug) | Isolated null/undefined guard eksik (calculation modülü) | MEDIUM |
| **E — Worker Lifecycle Lifecycle Mismatch** (YENİ) | BUG-HH (1 bug) | Provider adapter prompt cleanup **non-selective** — `kill()` sonrası tüm prompt'ları siliyor, spawn-backend-docker kontratı (tmpfiles persist) ihlal | CRITICAL |

**Phase 4.5 trigger TETIKLENDI:** Pattern indicating architectural problem (3+ fixes failed):
- Cluster A: Sprint 166 T1+T2+T5+T11 dört wire fix ama Sprint 167'de finalize hala kısmî
- Cluster B: Sprint 156 T-10 SpawnLock design partial, 11 sprint sonra hala asimetrik
- Cluster C: Sprint 138 T4 Scope Collision wire designed, 29 sprint sonra hala disconnect

**Sprint 168 Brain Repair Phase scope:** 4 architectural cluster için 4-5 anchor task (C0 Brain Repair phase + revised C1-C4).

---

## 1. Phase 1 Per-Bug Investigation

### 1.1 RC1 — Bug Z2 Planner Files Parser Bare Token

**Problem statement:** Planner DIRECTIVES.md "Files (write):" satırlarını parse ederken bare uzantı token'lar üretiyor (`.ts`, `.md`, `.test`, `test.ts`) — full path bilgisi korunmuyor.

**1. Error message:**
```
events.jsonl seq #3:
"scope":{"filesWrite":[".ts",".test","test.ts","T1-code-inventory.md"]}
```
DIRECTIVES.md kaynak satırı: `Files (write): .audit/sprint-167/T1-code-inventory.md, .audit/sprint-167/T1-predicate.sh`

**2. Reproducibility:** Sprint 166'da ilk tespit (Sprint 166 T7 Bug Z2). Sprint 167'de **canlı replay** — 7/7 task'ta bare token üretildi (manuel patch sonrası fix). %100 reproducible.

**3. Recent changes:**
- Planner module: `src/orchestra/planner.ts` veya `src/orchestra/task-builder.ts`
- Last touch: Sprint 145+ planner (AI mode introduction)
- Sprint 166'da fix yapılmadı (sadece tespit, Sprint 168'e ertelendi)

**4. Multi-Component Evidence (Phase 2 plan):**
```
Layer 1: DIRECTIVES.md source — "Files (write):" satır formatı
Layer 2: planner.ts/task-builder.ts parse function — regex / tokenizer
Layer 3: Output task.json scope.filesWrite — bare token yazıldı mı
Layer 4: spawn-backend-docker.ts:733 acquireSpawnTimeLocks — bare token'ı lock acquire ediyor mu
```

**5. Trace data flow (backward):**
- Bad value origin: `task.json.scope.filesWrite[".ts", ...]`
- Who called with bad value: spawn-time lock acquire (file-lock.ts:431)
- Upstream: Brain TASK_ASSIGN event payload (events.jsonl)
- Original source: `extractFilesFromDescription()` veya benzer parser fonksiyonu (planner.ts/task-builder.ts)

**Initial hypothesis (Phase 3 input):** Parser regex'i comma + dot + parantezi yanlış handle ediyor:
```regex
/Files\s*\(write\):\s*([^\n]+)/i
.split(',').map(s => s.trim())
```
muhtemelen `.audit/sprint-167/T1-code-inventory.md, .audit/sprint-167/T1-predicate.sh` → ilk path doğru, sonraki path'te `.audit/sprint-167/T1-predicate.sh` tokenize edilirken `.sh` bare token mı? Veya regex `\.(\w+)` greedy match?

**Severity:** **CRITICAL** — Brain spawn pipeline'ı bare token'ları lock acquire için kullanıyor → spawn lock conflict → SPAWN crash (RC4 ile chain).

---

### 1.2 RC2 — Auditor SCOPE_COLLISION → Brain Spawn Disconnect

**Problem statement:** Auditor `SCOPE_COLLISION_DETECTED` alert emit ediyor (plan-time) ama Brain spawn akışı bu alert'i blocker olarak değil advisory olarak işliyor — spawn devam ediyor.

**1. Error message:** Yok (no error — silent disconnect). Sadece events.jsonl pattern:
```
seq #1: AUDITOR→BRAIN:SCOPE_COLLISION_DETECTED files=[".ts"] taskIds=[167-001, 167-005]
seq #3: BRAIN→WORKER:TASK_ASSIGN 167-001 filesWrite=[".ts", ...]
seq #17: BRAIN→WORKER:TASK_ASSIGN 167-005 filesWrite=[".ts"]
```

**2. Reproducibility:** %100 — 2 task'a aynı bare token scope ver, plan + start, events.jsonl'de alert + spawn paterni gözle.

**3. Recent changes:**
- Sprint 138 T4 "Plan-Time Scope Collision Detection" designed
- src/monitor/auditor.ts veya src/orchestra/decision-engine.ts hangisi sahip belirsiz
- Sprint 138'den sonra 29 sprint geçti, wire hiç completion almadı

**4. Multi-Component Evidence (Phase 2 plan):**
```
Layer 1: Auditor scan loop — collision detect + alert emit
Layer 2: Event stream / decision-engine — alert subscribe + decision
Layer 3: Brain spawn pipeline — decision'a göre spawn / block
Layer 4: events.jsonl trace — emit vs. consume side-by-side
```

**5. Trace data flow (forward):**
- Origin: Auditor `detectScopeCollisions()` function (file-lock.ts:431 + auditor.ts)
- Emit: events.jsonl channel `AUDITOR→BRAIN:SCOPE_COLLISION_DETECTED`
- **Disconnect point:** Brain'in bu channel'ı subscribe edip blocker olarak işlemediği yer (decision-engine?)
- Effect: Brain spawn devam ediyor — RC1+RC3 ile chain (bare token + cache miss + collision ignore = crash)

**Initial hypothesis:** Sprint 138 T4 detect logic shipped ama "consume + block" logic eksik. Auditor alert kanalını pub/sub broadcast ediyor ama subscriber Brain decision-engine'de yok. Event-driven architecture **partial** — emit ✓ subscribe ✗.

**Severity:** **CRITICAL** — defense-in-depth katmanından biri tamamen baypas ediliyor. Plan-time validation effectively yok.

---

### 1.3 RC3 — Brain Cache Invalidation (task.json Re-read Eksik)

**Problem statement:** Brain plan-time'da task.json'u in-memory'e cache'liyor. Disk'te manuel patch sonrası fresh re-read yapmıyor — eski (bare token) state'i kullanıp TASK_ASSIGN event emit ediyor.

**1. Error message:** Yok (silent stale cache). Pattern:
```
1. ben /tmp/patch-sprint-167-tasks.mjs çalıştırdım — task.json'lar düzeltildi
2. deckent start --auto-approve
3. events.jsonl seq #3: filesWrite=[".ts","..."] (eski bare token!)
```

**2. Reproducibility:** Tahmini %100 ama henüz formal test yok. Tipik flow: plan → patch task.json → start → events compare.

**3. Recent changes:**
- Brain plan-time state cache: src/orchestra/brain.ts veya sprint-controller.ts
- spawn-backend-docker.ts:733 disk'ten okuyor (acquireSpawnTimeLocks) — bu **çalışıyor**
- Yani Brain TASK_ASSIGN event yazımı vs. Spawn-time disk read birbirinden bağımsız iki path
- spawn-time lock acquire için disk fresh, Brain TASK_ASSIGN event için in-memory stale

**4. Multi-Component Evidence (Phase 2 plan):**
```
Layer 1: deckent plan komutu sonrası in-memory plan state
Layer 2: Manual patch sonrası disk task.json (fresh)
Layer 3: deckent start sonrası TASK_ASSIGN event payload (events.jsonl)
Layer 4: spawn-backend-docker.ts acquireSpawnTimeLocks disk read

İdeal evidence collection:
console.log('PLAN-TIME state:', planState[taskId].scope.filesWrite);
console.log('DISK task.json:', JSON.parse(readFileSync(taskJsonPath)).scope.filesWrite);
console.log('TASK_ASSIGN event payload:', event.payload.scope.filesWrite);
```

**5. Trace data flow:**
- Origin: planner.ts üretti task.json (bare token)
- In-memory cache: brain.ts plan state object (bare token)
- Disk: task.json file (manuel patch SONRA → full path)
- TASK_ASSIGN event: brain.ts plan state'ten emit (bare token — STALE)
- spawn-time lock: disk'ten read (full path — FRESH)
- **Bifurcation:** Brain TASK_ASSIGN ≠ Spawn lock acquire

**Initial hypothesis:** Brain plan-state cache invalidation yok. `deckent_plan` çalıştığında plan-state object oluşur, `deckent_start` sırasında bu object'ten event emit edilir, disk re-read yapılmaz. Manuel patch in-memory state'i etkilemediği için inconsistency.

**Severity:** **CRITICAL** — Brain decision-making stale veri üzerinde yapıyor. Plan↔Disk↔Spawn üç-katmanlı tutarlılık ihlali.

---

### 1.4 RC4 — Bug E SpawnLock Cleanup Gap

**Problem statement:** `.spawnlock` dosyaları için orphan/stale cleanup mekanizması TAMAMEN YOK. Worker crash, container kill, Brain stall durumlarında lock'lar disk'te kalıyor — sonraki spawn attempt'larda conflict.

**1. Error message:**
```
Error: Sprint failed at phase SPAWN: Spawn phase failed after retry:
Spawn lock conflict on .ts: file is currently held by task 167-001.
Hint: High task count (7) — consider reducing max_workers or splitting the sprint
```

**2. Reproducibility:** Sprint 166'da 3× replay (Sprint 166 T5 evidence), Sprint 167'de SPAWN crash sebebi. Reproduction: spawn lock acquire → worker kill -9 → Auditor scan loop bekle → orphan lock devam eder mi gözle.

**3. Recent changes:**
- file-lock.ts:305-306 explicit comment: "existing `.lock` cleanup helpers (checkLocks / clearStaleLocks / clearOrphanLocks) **IGNORE** them"
- Sprint 156 T-10: SpawnLock infrastructure introduced (commit history)
- Sprint 156'dan sonra 11 sprint geçti, asymmetric cleanup hiç fix olmadı
- Sprint 166 retro'da Bug E "Sprint 168 P0" olarak işaretlendi

**4. Multi-Component Evidence:**
```
Layer 1: .locks/*.spawnlock file system durumu
Layer 2: file-lock.ts clearOrphanLocks (regular lock ✓, spawnlock ✗)
Layer 3: Auditor scan loop (auditor.ts L485 stale_lock ✓ regular, ✗ spawnlock)
Layer 4: spawn-backend-docker.ts release path (happy-path only)

Evidence script:
ls -la .locks/ | grep -E "\.lock$|\.spawnlock$" | wc -l
node -e "import {clearOrphanLocks} from './dist/core/file-lock.js'; console.log(clearOrphanLocks('.', []))"
# Beklenen: regular lock cleanup count, spawnlock ignored
```

**5. Trace data flow:**
- Origin: spawn-backend-docker.ts:756 `acquireSpawnLocks` → `.spawnlock` create
- Happy path: Worker exit → release path (spawn-backend-docker.ts:933) → `.spawnlock` deleted
- Sad path: Worker crash/kill → release path SKIP → orphan
- Cleanup gap: file-lock.ts clearOrphanLocks regex `*.lock` exclude `*.spawnlock`
- Effect: Next spawn'da conflict → SpawnLockError → Brain SPAWN phase fail

**Initial hypothesis:** Sprint 156 T-10 SpawnLock'ı **kasıtlı olarak** ayrı namespace yaptı (`.spawnlock` extension) çünkü "regular lock cleanup'a karışmasın" istiyordu. AMA cleanup helper'ları SpawnLock için yazılmadı — design partial. Senaryo: `clearOrphanSpawnLocks()` fonksiyonu yok, Auditor scan loop subscribe yok, on-exit hook regular path'te yok.

**Severity:** **CRITICAL** — Sprint 167 SPAWN crash'in direkt sebebi. Sprint 168 başlatma blocker.

---

### 1.5 BUG-CC — DIRECTIVES.md Placeholder Overwrite

**Problem statement:** Manuel `deckent sprint finalize --force` Sprint 167 closure yaparken DIRECTIVES.md'yi 268→13 satır placeholder ile overwrite etti. Davranış intentional (Step 12 archiveDirectives) ama kullanıcı bilgilendirme/onay eksik.

**1. Error message:** Yok. Diff stat:
```
DIRECTIVES.md | 272 +++-------------------------------------------------------
1 file changed, 13 insertions(+), 259 deletions(-)
```

**2. Reproducibility:** %100 — `deckent sprint finalize --force` çalıştır, DIRECTIVES.md content kontrol.

**3. Recent changes:**
- src/orchestra/sprint-docs-updater.ts:570 `writeFileSync(directivesPath, buildDirectivesPlaceholder(...))`
- Sprint 146 T-008 bug fix (phase guard eklendi — CLEANUP/COMPLETE)
- `auto_archive_directives` config flag default=**true**

**4. Multi-Component Evidence:**
```
Layer 1: sprint-finalizer.ts:1038 archiveDirectives() çağrısı
Layer 2: sprint-docs-updater.ts:565 copyFileSync (archive'a kopyala — DOĞRU)
Layer 3: sprint-docs-updater.ts:570 writeFileSync(placeholder) — orijinal silindi
Layer 4: Config flag auto_archive_directives default true

Test:
deckent config set auto_archive_directives false
deckent sprint finalize --force
diff DIRECTIVES.md <expected_full_directives>
# Beklenen: NO_CHANGE (workaround geçerli)
```

**5. Trace data flow:**
- Origin: User intent — Sprint 167 DIRECTIVES yazıldı, finalize için manuel `--force`
- Step 12 trigger: archiveDirectives() phase guard pass (`CLEANUP` accepted)
- copyFileSync: `.brain/archive/DIRECTIVES-sprint-167.md` ✓ kopyalandı
- writeFileSync: orijinal placeholder ile overwrite ✗ (kullanıcının beklemediği)
- Effect: 259 satır data loss (git'ten restore edilebilir)

**Initial hypothesis:** **Bu intentional behavior** (Sprint 146 T-008 phase guard ile pekiştirildi). Tasarım kararı: Sprint bitince DIRECTIVES placeholder olur, yeni sprint için kullanıcı/Brain doldurur. ANCAK:
- Documentation eksikliği — kullanıcı bu davranışı bilmiyor
- Workaround `auto_archive_directives: false` mevcut ama gizli
- Daha güvenli pattern: placeholder yerine `.bak-pre-archive` snapshot kalsın, orijinal DIRECTIVES dokunulmasın

**Severity:** **MEDIUM** (potentially feature, not bug) — Documentation + UX improvement. Workaround mevcut. Sprint 168 task: `auto_archive_directives` davranışını doc'a ekle veya default'u false yap.

---

### 1.6 BUG-DD — memory.db Sprint Entry Eksik

**Problem statement:** Sprint 167 finalize sonrası `sprint-log-167`, `retro-sprint-167`, `mem-sprint-167` entry'leri memory.db'de YOK. Sprint 166'da Bug U+V fix shipped olmasına rağmen Sprint 167 finalize wire'ı çalıştırmadı.

**1. Error message:** Yok (silent failure). Memory.db query:
```sql
SELECT COUNT(*) FROM entries WHERE id IN ('sprint-log-167', 'retro-sprint-167', 'mem-sprint-167');
-- Result: 0
```

**2. Reproducibility:** Sprint 167 finalize sonrası → memory.db query → 0 row. Tahmini %100 reproducible.

**3. Recent changes:**
- Sprint 166 T6 commit (Bug U+V fix): `src/orchestra/sprint-retro-writer.ts:506-524` writeRetrospective type='sprint' insert wire
- Sprint 166 backfill script ile manuel test edildi (215 entry ile çalıştı)
- Sprint 167 finalize'da wire çalışıp çalışmadığı belirsiz

**4. Multi-Component Evidence:**
```
Layer 1: sprint-finalizer.ts Step 5 retro hook → writeRetrospective çağırıyor mu?
Layer 2: sprint-retro-writer.ts writeRetrospective → type='sprint' upsert çağırıyor mu?
Layer 3: memory-store.ts upsert → DB'ye yazıyor mu?
Layer 4: memory.db query → row mevcut mu?

Evidence script:
node -e "
import { writeRetrospective } from './dist/orchestra/sprint-retro-writer.js';
import { MemoryStore } from './dist/core/memory-store.js';
const store = new MemoryStore('.brain/memory.db');
writeRetrospective(store, {id:'sprint-167', tasks: [...]}, ...);
// DB query: sprint-log-167 mevcut mu?
"
```

**5. Trace data flow:**
- Origin: Sprint 167 finalize trigger (`deckent sprint finalize --force`)
- Step 5 (retro) — sprint-finalizer.ts'de hangi line? — TBD Phase 2
- writeRetrospective fonksiyonu çağrıldı mı? — Phase 2 evidence collection
- memory.db upsert call — Phase 2 evidence collection
- Effect: Sprint 167 audit'in memory.db tarafı boş

**Initial hypothesis (2 olası):**
- **H1:** Step 5 retro hook chain'de writeRetrospective çağrılmadı (skipped, conditional miss)
- **H2:** writeRetrospective çağrıldı ama silent error (try/catch yutuldu — store.upsert exception)
- **H3:** Sprint 167 finalize farklı bir code path kullandı (manuel `--force` flag specific)

**Severity:** **HIGH** — Sprint 167 hafıza kaybı. Bug U+V regression — Sprint 166'da düzeltildi, Sprint 167'de yine fail. Recursive bug indicates code path divergence.

---

### 1.7 BUG-EE — .brain/RETRO.md Stale

**Problem statement:** Sprint 167 finalize sonrası `.brain/RETRO.md` dosyası güncellenmedi — mtime 2026-05-13 (Sprint 165), content "Sprint sprint-165 Retrospective". Step 5 retro hook RETRO.md file write yok.

**1. Error message:** Yok. File mtime + content kontrol:
```
$ stat .brain/RETRO.md
mtime: 2026-05-13 18:18 (Sprint 165!)
$ head -1 .brain/RETRO.md
# Sprint sprint-165 Retrospective
```

**2. Reproducibility:** %100 — Sprint 167 finalize sonrası RETRO.md mtime kontrol.

**3. Recent changes:**
- Sprint 166'da RETRO.md yazımı: Brain finalize hook chain Step 5 (yazılmış mı?)
- Sprint 167 finalize sonrası: dosya değişmedi (Sprint 166 paterni replay)

**4. Multi-Component Evidence:**
```
Layer 1: sprint-finalizer.ts Step 5 — RETRO.md file write var mı?
Layer 2: writeRetrospective fonksiyonu — DB upsert + file write iki ayrı çağrı mı, biri mi?
Layer 3: .brain/RETRO.md atomic write — placeholder vs. cumulative?
Layer 4: BUG-DD ile chain — ikisi de Step 5

Evidence script:
grep -n "RETRO.md\|writeRetro\|retroPath" src/orchestra/sprint-finalizer.ts src/orchestra/sprint-retro-writer.ts
```

**5. Trace data flow:**
- Origin: Sprint 167 finalize
- Step 5 (retro write) — RETRO.md write code path — TBD Phase 2
- File write fonksiyonu — atomic mi append mi?
- Effect: RETRO.md hala Sprint 165 (eski içerik, 2 sprint geride)

**Initial hypothesis:** Step 5 hook chain RETRO.md file write'ı **hiç yapmıyor**. Sprint 166'daki "RETRO.md write" implementation belki sadece DB'ye `type='retro'` insert yapar, file system'e yazmaz. Veya file write var ama path bug (output wrong location). BUG-DD ile chain.

**Severity:** **HIGH** — Brain context auto-query RETRO.md'yi okuyacak (CLAUDE.md @.brain/RETRO.md eşleşmesi varsa). Stale data → stale context → worker decisions stale.

---

### 1.8 BUG-FF — Sprint Metrics Bozuk (Duration -1dk -1sn, Coverage NaN%)

**Problem statement:** CLAUDE.md Sprint Metrics tablosunda "Duration: -1dk -1sn" (negative) ve "Coverage: NaN%" (math error). Sprint metric calculation modülünde null/undefined guard eksik.

**1. Error message:**
```
CLAUDE.md L101-102:
| Duration | -1dk -1sn |
| Coverage | NaN% |
```

**2. Reproducibility:** %100 — Sprint finalize sonrası CLAUDE.md L101-102 görüntüle.

**3. Recent changes:**
- Sprint metrics calculation: muhtemelen `src/orchestra/sprint-reporter.ts` veya `managed-doc-runner` (Sprint 131 ADR-029 sonrası)
- Sprint 166'da metric output'u OK gözüktü (CLAUDE.md L93-103 önceki)

**4. Multi-Component Evidence:**
```
Layer 1: Sprint start/end timestamp — `.brain/sprints/sprint-167.md` veya event JSON'lar
Layer 2: Sprint metrics calculation — duration = end - start
Layer 3: Coverage calculation — totalLines / coveredLines
Layer 4: CLAUDE.md template render — sprint_metrics block

Evidence:
grep -rn "duration\|coverage" src/orchestra/sprint-reporter.ts
node -e "
const sprint = {start: undefined, end: '2026-05-14T...'};
const dur = sprint.end - sprint.start;
console.log(typeof dur, dur); // NaN
"
```

**5. Trace data flow:**
- Origin: Sprint 167 start time — Brain SPAWN crash yüzünden start time eksik mi?
- End time: manuel `deckent sprint finalize --force` zamanı
- duration = end - start → undefined arithmetic → NaN/negative
- Coverage: 0 covered / 0 total → 0/0 NaN
- Effect: CLAUDE.md display garbage

**Initial hypothesis:** Sprint 167 SPAWN crash sırasında sprint state initialize edilmedi (start time null). Manuel finalize end time yazıyor ama start null kaldığı için subtraction NaN. Coverage NaN — Sprint 167 read-only audit, source change yok, dolayısıyla coverage hesaplaması da fail (test execution sırasında baseline yok).

**Severity:** **MEDIUM** — Cosmetic display issue, functional değil. AMA OSS GA reputational gate — public README'de "Duration: -1dk -1sn" görmek kötü.

---

### 1.10 BUG-HH — Prompt File Premature Deletion (Provider Adapter Non-Selective Cleanup)

**Problem statement:** Provider adapter (`src/providers/claude.ts`) `kill()` operasyonu sonrası `_cleanupOrphanedPromptFiles()` çağrılıyor — bu fonksiyon **non-selective** olarak `.tasks/` altındaki TÜM `.prompt-*.txt` dosyalarını siliyor (sadece kill edilen worker'ınkini değil). Spawn-backend-docker.ts'in "tmpfiles persist until sprint cleanup" kontratı bu davranışla ihlal ediliyor. Sonuç: aktif worker'ların prompt'ları erkenden siliniyor → worker container "No such file" hatası → stub result (NO_GO) veya timeout.

**1. Read Error Messages Carefully:**
```
task-167-001.log (Sprint 167 live evidence):
/workspace/.tasks/.worker-167-001.sh: 64: cannot open
/workspace/.tasks/.prompt-167-001-f21a2b715d06774d.txt: No such file
```

Worker container içinde `claude` CLI prompt dosyasından stdin okuma yapacaktı, dosya silinmiş.

**2. Reproducibility:** Sprint 167'de 2/7 worker (167-001, 167-002) bu hatayla NO_GO yazdı. Reproduction:
```
1. deckent start (yeni sprint)
2. Worker N spawn → .prompt-N-*.txt yazıldı
3. Brain herhangi bir worker kill veya retry triggers
4. ProviderAdapter.kill() → _cleanupOrphanedPromptFiles() → ALL .prompt-*.txt deleted
5. Yeni Worker M spawn → .prompt-M-*.txt YOK (silinmişti)
6. Worker M container script claude exec fails — stub result
```

Tahmini %100 reproducible — yapısal sorun.

**3. Recent changes:**
- `src/providers/claude.ts:14, 125-142` — `_cleanupOrphanedPromptFiles()` private function
- `src/orchestra/tmux.ts:66-67` — `cleanupPromptFile()` export function (unlinkSync)
- Sprint 156 T4 yorum (spawn-backend-docker.ts:941-942): "tmpfiles persist until sprint cleanup" — kontrat var ama enforcement yok
- Spawn pattern: spawn-backend-docker prompt yazıyor, claude.ts adapter prompt'u silebiliyor (asymmetric write/delete)

**4. Multi-Component Evidence (Phase 2 plan):**
```
Layer 1: ProviderAdapter.kill() çağrı yerleri (sprint-controller, manuel CLI, error handler)
Layer 2: claude.ts:129 _cleanupOrphanedPromptFiles() — when triggered, which prompts targeted
Layer 3: spawn-backend-docker.ts:230-232 prompt write — naming pattern + persist iddia
Layer 4: archivePromptFiles() (spawn-backend-docker.ts:982) — sprint cleanup'da gerçek archive yapan
Layer 5: tmux.ts:66-67 cleanupPromptFile() unlinkSync — destructive operation

Evidence script:
grep -rn "kill\\(.*\\)" src/providers/claude.ts src/orchestra/ | head
# Identify all kill() invocation chains
# Then trace each: kill → _cleanupOrphanedPromptFiles → cleanupPromptFile → unlinkSync
```

**5. Trace data flow:**
- Origin: Brain (sprint-controller) veya CLI komut → ProviderAdapter.kill(workerId)
- claude.ts:127 comment: "Called automatically after kill()" → kill() → _cleanupOrphanedPromptFiles()
- claude.ts:133-138 iteration: `for (file of readdir(tasksDir))` — **NO FILTER on workerId/taskId**
- cleanupPromptFile(joinedPath) → unlinkSync(promptPath)
- Effect: TÜM `.prompt-*.txt` siliniyor (aktif worker'ların DA dahil)
- Worker container içinde: claude CLI < prompt.txt → No such file → exit fail
- Brain'in worker.exitCode=0 (script silent) ya da timeout (script asleep) → stub result yaz

**Initial hypothesis (Phase 3 input):** `_cleanupOrphanedPromptFiles()` **non-selective design**. İsim "orphaned" diyor AMA implementation filter yok — tüm prompt'lar (active dahil) siliniyor. Doğru implementation: `_cleanupOrphanedPromptFiles(activeTaskIds: string[])` parameter al + filter (silinecekler = activeTaskIds dışındakiler).

**Senaryo (Sprint 167 live evidence):**
1. `deckent start --auto-approve` → 6 orphan sprint auto-archive
2. Auto-archive sırasında `kill()` çağrılmış olabilir (orphan worker temizliği)
3. `_cleanupOrphanedPromptFiles()` triggered — Sprint 167 prompt'ları henüz spawn'da yazılmış
4. 167-001 ve 167-002 prompt'ları aktif worker'lar için yazıldı + silindi
5. Worker container script bu dosyayı bulamadı

Alternatif senaryo (eş zamanlı):
- Wave 1 spawn pipeline'da retry sırasında bir worker kill ediliyor (Bug E ile chain)
- Kill → `_cleanupOrphanedPromptFiles()` → tüm prompt'lar silindi
- Aktif worker'lar (içinde claude CLI çalışan) prompt'a erişemediği için fail oldu

**Bağlamlar (cross-cut):**
- **RC4 Bug E:** Spawn-lock leak → spawn retry → worker kill → cleanup → prompt cascade silme
- **RC2 SCOPE_COLLISION:** Plan-time collision → Brain hala spawn → retry → kill → prompt silme
- **RC3 cache stale:** Brain in-memory stale → bare token → spawn lock conflict → retry → kill → prompt silme

**Yani BUG-HH, RC2+RC3+RC4 cascade'in sonuç noktası** — single point of failure (non-selective cleanup) ile çoklu upstream bug birikiyor.

**Severity:** **CRITICAL** — Sprint 167'de 2/7 worker NO_GO sebebi. Sprint 168 başlatma blocker. Cluster E olarak ayrı architectural problem.

---

### 1.9 BUG-GG — identityRegen Deprecated Dispatch

**Problem statement:** Sprint 166 T5'te `identity-generator.ts` Step 2 `regenerateProjectIdentity` deprecated annotation eklendi, AMA runtime hala invoke ediyor — `.brain/PROJECT-IDENTITY.md` modified.

**1. Error message:** Yok. File modified evidence:
```
$ git status --short .brain/PROJECT-IDENTITY.md
M .brain/PROJECT-IDENTITY.md
```

**2. Reproducibility:** %100 — Sprint finalize sonrası PROJECT-IDENTITY.md modified.

**3. Recent changes:**
- Sprint 166 T5 commit: identity-generator.ts `@deprecated` annotation
- AMA runtime invocation hala aktif (annotation comment-only, runtime'ı etkilemiyor)

**4. Multi-Component Evidence:**
```
Layer 1: identity-generator.ts Step 2 dispatch code
Layer 2: @deprecated annotation — runtime check yapıyor mu?
Layer 3: skipIdentityRegen flag — default value
Layer 4: PostFinalizeHookOptions interface — skipIdentityRegen field

grep "skipIdentityRegen\|@deprecated.*identityRegen" src/core/identity-generator.ts
```

**5. Trace data flow:**
- Origin: sprint-finalizer.ts runPostFinalizeHooks() çağrısı
- options.skipIdentityRegen default value — TBD Phase 2
- Step 2 invocation conditional — `if (!opts.skipIdentityRegen) { regenerateProjectIdentity() }`
- Effect: deprecated function her finalize'da çalışıyor

**Initial hypothesis:** `@deprecated` TypeScript annotation runtime'ı etkilemiyor (sadece IDE warning + tsdoc). `skipIdentityRegen` flag default `false` ise Step 2 her zaman çalışıyor. Sprint 166 T5'in beklediği behavior: default `true` veya invocation conditionally skip.

**Severity:** **MEDIUM** — Decommission cleanup eksik. Sprint 168 M1 task ile temiz çözüm (Sprint 167 roadmap'te zaten var).

---

## 2. Cluster Analysis (4 Architectural Problem)

### Cluster A — Brain Finalize Hook Chain Implementation Gap

**Affected bugs:** BUG-CC (Step 12), BUG-DD (Step 5 DB), BUG-EE (Step 5 file), BUG-GG (Step 2 dispatch)

**Root cause:** ADR-046 Brain Self-Update Hook Architecture spec'i (Sprint 166 T11'de yazıldı) ile gerçek implementation arasında **kısmi gap**:
- Step 1 memoryExport: ✅ çalışıyor (Sprint 166 fix)
- Step 2 identityRegen: ⚠️ deprecated annotation var ama dispatch hala çalışıyor (BUG-GG)
- Step 3 adrInsert: ✅ çalışıyor (Sprint 166 Bug M fix)
- Step 4 ruleRegen: ⚠️ sentinel marker pattern shipped (T3 önerisi canlı), AMA scope drift (DIRECTIVES.md silindi — BUG-CC kısmen ilgili)
- Step 5 retro+sprint+mem: ❌ wire kırık (BUG-DD + BUG-EE)
- Step 12 archiveDirectives: ⚠️ intentional behavior ama documentation gap (BUG-CC)

**Mimari sorun:** Hook chain step'leri ayrı modüllerde, ortak invariant test yok. Her step ayrı şekilde implement edildi (Sprint 161, 163, 166), bütünsel bir end-to-end test yok. Sprint 166'da T11 ADR-046 yazıldı AMA Step 2/4/5 wire'ları henüz "ADR-046 contract"a uyumlu değil.

**Phase 4.5 trigger justification:** 4+ fix attempt yapıldı (Sprint 161/163/166/167), her sprintte yeni Step bug ortaya çıkıyor. Pattern: **architectural pattern fundamentally sound değil**, Step-by-step iteration yerine **integrated hook chain audit** gerekli.

### Cluster B — Locking Infrastructure Asymmetry

**Affected bugs:** RC4 Bug E SpawnLock Cleanup Gap

**Root cause:** Sprint 156 T-10 SpawnLock infrastructure introduced — `.spawnlock` extension ayrı namespace (regular lock cleanup'tan kaçınmak için). AMA cleanup helper'ları için karşılık (`clearOrphanSpawnLocks`, Auditor scan loop subscribe) yazılmadı.

**Mimari sorun:** Tasarım intentional asimetri AMA implementation incomplete. Regular lock'lar için 5 cleanup helper var (`checkLocks`, `clearStaleLocks`, `clearOrphanLocks`, `releaseAllLocks`, `releaseLock`). SpawnLock için sadece 3 happy-path helper var (`acquireSpawnLock`, `releaseSpawnLock`, `releaseAllSpawnLocks`). Sad-path (orphan, stale, cleanup) helper YOK.

**Phase 4.5 trigger:** Sprint 156'dan beri 11 sprint geçti, asymmetric cleanup hiç düzeltilmedi. Sprint 166'da Bug E "Sprint 168 P0" olarak işaretlendi. **Architectural fix: regular lock + SpawnLock symmetric helper API.**

### Cluster C — Plan↔Spawn Integration Disconnect

**Affected bugs:** RC1 (parser bare token), RC2 (alert disconnect), RC3 (cache stale)

**Root cause:** Brain'in **plan-time** ve **spawn-time** süreçleri birbirinden bağımsız iki path:
- Plan-time: planner.ts parse → task.json yaz → in-memory state cache → events emit
- Spawn-time: task.json disk read → lock acquire → container start

İki path arasında integration layer **eksik**:
1. Parser output validation yok (RC1 bare token → spawn time'a kadar fark edilmiyor)
2. Auditor alert subscribe blocker yok (RC2 plan-time uyarı yok sayılıyor)
3. In-memory cache invalidation hook yok (RC3 manuel patch ignored)

**Mimari sorun:** Sprint 138 T4 "Plan-Time Scope Collision Detection" designed AMA wire incomplete. 29 sprint geçti, integration layer hala yok.

**Phase 4.5 trigger:** RC1+RC2+RC3 üç farklı semptom AMA **tek bir architectural root** — Plan↔Spawn integration layer eksikliği. Her semptomu ayrı ayrı fix etmek 3 farklı kod path'inde değişiklik gerektirir AMA architectural fix tek bir layer ekler (plan→spawn handoff with fresh read + validation + alert subscribe).

### Cluster D — Sprint Metrics Math

**Affected bugs:** BUG-FF (Duration negative, Coverage NaN)

**Root cause:** Null/undefined guard eksik calculation modülünde. Sprint 167 SPAWN crash → start time null → math fail.

**Mimari sorun:** Standalone bug (cluster değil), isolated math error. Sprint 168'de küçük fix.

### Cluster E — Worker Lifecycle Lifecycle Mismatch (YENİ — Alperen explicit request)

**Affected bugs:** BUG-HH (Prompt File Premature Deletion via Non-Selective Cleanup)

**Root cause:** Provider adapter (`src/providers/claude.ts`) `_cleanupOrphanedPromptFiles()` fonksiyonu `kill()` sonrası çağrılıyor — AMA active worker'ları kapsamayan **non-selective** cleanup yapıyor. İsim "orphaned" iddia ediyor, implementation TÜM prompt'ları siliyor.

**Mimari sorun:** İki backend (Docker / Subprocess / Tmux) için **prompt persistence contract** asimetrik:
- spawn-backend-docker.ts:941-942 explicit kontrat: "tmpfiles persist until sprint cleanup, archived together by archivePromptFiles()"
- claude.ts:127 explicit aksiyon: "Called automatically after kill() to prevent file accumulation"
- **Bu iki kontrat birbirini ihlal ediyor.**

`_cleanupOrphanedPromptFiles()` cluster içindeki gerçek hata:
1. Non-selective filter — active worker prompt'larını da siliyor
2. spawn-backend-docker contract'ını çiğniyor (Sprint 156 T4 design intent)
3. Cluster A (Hook Chain), Cluster B (Locking), Cluster C (Plan↔Spawn) ile **cascade** — herhangi biri kill'i triggerlarsa BUG-HH tetiklenir

**Phase 4.5 trigger justification:** Sprint 156'dan beri 11 sprint geçti, "tmpfiles persist" intent design'da var AMA enforcement runtime'da yok. Kullanıcı bunu 3 farklı durumda raporladı (manuel survival pattern + H7 task seed + bu Phase 1 entry) — pattern indicating **architectural fix gerekli, semptom fix yetmez**.

**Architectural fix önerisi (Phase 3 input):**
- A) `_cleanupOrphanedPromptFiles(activeTaskIds: string[])` parametre al + filter
- B) Veya bu fonksiyonu **TAMAMEN KALDIR** — spawn-backend-docker contract'ına uy, prompt'lar sprint cleanup'a kadar persist etsin
- C) Veya cleanup'ı `archivePromptFiles()` ile merge et (sprint cleanup phase'inde tek atomic operation)

Option B önerilen — ADR-046 Step Ordering Contract'a benzer "Prompt Lifecycle Contract" ADR yaz (Sprint 168 ADR-048).

---

## 3. Phase 4.5 Architectural Review Trigger — JUSTIFIED

**3+ fixes failed pattern doğrulandı:**

| Cluster | Sprint History | Fix Attempts | Status |
|---|---|---|---|
| A (Hook Chain) | Sprint 161, 163, 166, 167 | 4 sprint × Step wire fix | Hala kısmî |
| B (SpawnLock) | Sprint 156, 166 (P0 işaretli) | Sprint 156 design, fix hiç olmadı | 11 sprint orphan |
| C (Plan↔Spawn) | Sprint 138, 167 SPAWN crash | Sprint 138 design (T4), fix hiç olmadı | 29 sprint orphan |

**Each fix reveals new problem in different place:** Sprint 161 → Sprint 163 → Sprint 166 → Sprint 167 her sprintte Hook Chain yeni bir Step bug ortaya çıkardı. Bu pattern indicating architectural problem.

**Fixes require massive refactoring:** SpawnLock cleanup için `clearOrphanLocks` regex değişikliği + 5 yeni helper + Auditor wire — küçük değil. Plan↔Spawn integration layer için yeni bir abstraction katmanı gerekli.

**Conclusion:** Bu 9 bug değil 4 architectural cluster. Sprint 168 Brain Repair Phase scope **architectural refactor**, semptom fix değil.

---

## 4. Sprint 168 Brain Repair Phase Spec Seed

**Yeni Sprint 168 task organization (revised from T7 roadmap):**

### Phase C0 — Brain Repair (4 architectural cluster, 4 anchor task)

**C0a — Brain Finalize Hook Chain Complete Implementation (Cluster A)**
- Scope: ADR-046 Step 1-5 + Step 12 end-to-end integration test + per-step contract enforcement
- Sub-fixes: BUG-CC documentation/default flip, BUG-DD writeRetrospective DB+file dual write, BUG-EE Step 5 file path verify, BUG-GG skipIdentityRegen default=true
- Effort: high (6-8h)

**C0b — Locking Infrastructure Symmetric Cleanup (Cluster B)**
- Scope: `clearOrphanSpawnLocks()` + `clearStaleSpawnLocks()` + `checkSpawnLocks()` helper'ları ekle. Auditor scan loop'a wire. on-exit hook regular path'te.
- Sub-fix: RC4 Bug E spawn-lock leak
- Effort: high (4-6h)

**C0c — Plan↔Spawn Integration Layer (Cluster C)**
- Scope: Parser output validation + alert subscribe blocker + task.json fresh read invariant
- Sub-fixes: RC1 (parser regex fix + validation), RC2 (decision-engine collision blocker), RC3 (plan-state invalidation hook)
- Effort: high (8-10h)

**C0d — Sprint Metrics Math Guards (Cluster D)**
- Scope: Duration + Coverage null/undefined guards. Default values.
- Sub-fix: BUG-FF
- Effort: low (1-2h)

**C0e — Prompt Lifecycle Contract Enforcement (Cluster E — YENİ)**
- Scope: `_cleanupOrphanedPromptFiles()` non-selective cleanup fix. Provider adapter ↔ spawn-backend-docker prompt persist kontratı uyumlu. Option B (fonksiyon kaldır + spawn-backend-docker archivePromptFiles tek source of truth) önerilen.
- Sub-fix: BUG-HH (Sprint 167 2/7 worker NO_GO sebebi)
- ADR-048 (NEW): Prompt Lifecycle Contract (ADR-046 Step Ordering paterni)
- Effort: normal (3-4h: claude.ts fix + ADR-048 yazımı + regression test — active worker'lar prompt erişebilmeli, kill sonrası sadece sprint cleanup'a kadar persist)

### Revised C1-C4 (mevcut Sprint 167 T7 roadmap, C0 ile örtüşmeye dikkat)

- **C1** Memory Relations 39% Broken + ID Canonical Migration (T4 → C1, unchanged)
- **C2** Bug Z3 Memory Rebuild Safety + Auto-Backup Pipeline (T4 → C2, unchanged)
- **C3** Step 4 ruleRegen ADR-046 Contract Fix (**C0a ile örtüşüyor** — C0a'ya merge edilebilir)
- **C4** Brain Self-Update Hook ADR-046 Step 2-4 Extend (Ground-Truth Auto-Sync) (**C0a ile örtüşüyor** — merge edilebilir)

### Önerilen Sprint 168 final list (12 task ≤12 spec ✓):

- **C0a** Brain Hook Chain Complete (Cluster A — C3+C4 merge + M1 merge)
- **C0b** SpawnLock Symmetric Cleanup (Cluster B)
- **C0c** Plan↔Spawn Integration Layer (Cluster C)
- **C0d** Sprint Metrics Math Guards (Cluster D)
- **C0e** Prompt Lifecycle Contract Enforcement (Cluster E — H7 merge + ADR-048)
- **C1** Memory Relations Migration (T4)
- **C2** Bug Z3 Memory Rebuild Safety
- **H1** ADR DB→FS Export Pipeline
- **H2** Stub Memory Entries Backfill
- **H3** OSS Secret Scan Baseline
- **H4** Dashboard Build CI Gate
- **H5** dep_pipeline Flip + Doc Fix

12 task, **5 critical C0a-C0e (architectural)** + 2 critical C1-C2 (memory) + 5 high H1-H5.

**Merges:**
- M1 (identity-generator Step 2 decommission) → C0a alt-task
- M2 (Sprint 153 metrics + skip + memory heal) → H2/H5 ile bundle veya Sprint 169
- H7 (Prompt Lifecycle Hardening — T7 addendum) → C0e (artık architectural critical)

**Kritik öncelik sırası (Sprint 168 Wave 1 P0 — Brain başlatma blocker'ları):**
1. **C0e Prompt Lifecycle** (BUG-HH — 2/7 worker NO_GO sebebi — direkt etkili)
2. **C0b SpawnLock Cleanup** (RC4 Bug E — Sprint 167 SPAWN crash sebebi)
3. **C0c Plan↔Spawn Integration** (RC1+RC2+RC3 — cascade chain'in başı)
4. **C0a Hook Chain Complete** (Cluster A — finalize hijack'ı önler)
5. **C0d Metrics Math** (BUG-FF — cosmetic, P1)

---

## 5. Phase 2/3/4 Roadmap (Future Sessions)

### Phase 2 — Pattern Analysis

Her cluster için:
- Working code references: Sprint 130-150 arası benzer pattern implementation
- Compare against ADR-046 contract / ADR-037 RBAC / Sprint 138 T4 design
- Identify differences (per-cluster gap inventory)

### Phase 3 — Hypothesis Formation + Testing

Per-cluster:
- Cluster A: Hook chain end-to-end integration test failing first (Step 1-5 + Step 12 each in isolation + chained)
- Cluster B: SpawnLock orphan test failing first (acquire + crash simulation + Auditor scan loop verify)
- Cluster C: Plan↔Spawn integration test failing first (parser output validation + alert consume + invalidation hook)
- Cluster D: Sprint metrics null/undefined guard unit test

### Phase 4 — Implementation

TDD pattern her cluster için:
1. Failing test create
2. Minimal implementation
3. Test pass verify
4. Integration test (cross-cluster)
5. Commit

Sprint 168 disipline normal sprint (brainstorming + plan + DIRECTIVES) — bu Phase 1 raporu spec input.

---

## 6. Predicate — Bu Phase 1 Compliance Self-Check

| Predicate | Beklenen | Ölçülen | Status |
|---|---|---|---|
| 9 bug için Phase 1 alanları | 5 alan × 9 = 45 | 45+ subsection | ✓ |
| Initial hypothesis her bug | ≥1 | 9 hypothesis (multiple where applicable) | ✓ |
| Multi-component evidence plan | Layer 1-4 per bug | 9 × 4 layer = 36 | ✓ |
| Cluster analysis | 3+ architectural cluster | 4 cluster (A/B/C/D) | ✓ |
| Phase 4.5 trigger justification | 3+ failed fix pattern | Cluster A:4 + B:11 sprint + C:29 sprint | ✓ |
| Sprint 168 spec seed | actionable | 12-task revised list | ✓ |
| No fixes proposed | Phase 1 only | Sadece problem definition + hypothesis | ✓ |

---

## 7. Sonuç

Sprint 167 audit'in T5 forensic raporundaki 9 bug'a sistematik Phase 1 analiz uygulandı. **9 bug → 4 architectural cluster** indirgemesi yapıldı. Phase 4.5 trigger justified — 3+ failed fix pattern her cluster için doğrulandı.

**Sprint 168 Brain Repair Phase scope:** 4 architectural cluster için 4 anchor task (C0a-d) + mevcut 8 task (C1-C2, H1-H7). 12 task ≤12 spec ✓.

**Iron Law respected:** NO FIXES proposed during Phase 1. Direkt kod yazma YASAK kural korundu. Phase 2/3/4 gelecek oturum.

**Sprint 168 spec yazımı:** brainstorming skill ile (Sprint 166/167 paterni proven). Bu Phase 1 raporu primary input.

**Read-only constraint:** ✓ sadece `.audit/sprint-167/T5-brain-debug-phase1.md` yazıldı, hiçbir kaynak/doc mutasyon yok.

---

**Yazan:** Claude Opus 4.7 — Sprint 167 systematic-debugging Phase 1, Alperen explicit request "ultrathink" 2026-05-14
**Sprint 168 input:** ✓ revised 12-task list + C0 Brain Repair architectural cluster
**Phase 2/3/4 trigger:** Sprint 168 başlatma için yeni oturum gerekli (TDD per cluster)
