# Sprint 145 Spec — Brain-Managed Adaptive Timeout System

**Tarih:** 2026-04-17 (Sprint 144 canlı sırasında, Alperen direktifi 13:10 UTC)
**Durum:** SPEC — Sprint 145 DIRECTIVES'e taşınacak
**Öncelik:** P0 (Sprint 144'te 2 NO_GO'nun kök sebebi)

---

## Problem Tanımı

### Mevcut (Sprint 144 kanıtı)
- `src/orchestra/spawn-backend-docker.ts:20` → `DEFAULT_TIMEOUT_SECONDS = 1200` **sabit**
- `src/orchestra/tmux.ts:71` → `WORKER_TIMEOUT_SECONDS = 1200` **sabit**
- DIRECTIVES'teki `Effort: low | normal | high` ibaresi worker.sh'a **hiç yansımıyor**
- Her task aynı 20dk hard cap alıyor

### Sprint 144 Canlı Fail Kanıtları
| Task | Effort | Gerçek Durum | Result |
|---|---|---|---|
| T-144-001 init split | high | %80 tamam (1566→282 LoC, 3 modül) | NO_GO timeout |
| T-144-002 doctor split | high | ✅ sınırda bitti (1102→1062 LoC, 3 modül) | DONE |
| T-144-004 worker split | high | %90 tamam (1669→434 LoC, 4 modül, 2 test) | NO_GO timeout |

**Pattern: %66 high-effort task fail rate** — yapısal sorun, worker değil tasarım.

### Alperen'in Tasarım Direktifi
> "Worker timeoutları brain çok iyi ayarlamalı her işe sabit timeout veremeyiz ama sonsuz sürede veremeyiz. Ayrıca timeout süresi worker çalışırken değiştirilir mi? Fix fazı olması bizi koruyor gerçi yinede timeout her workerda aynı olmamalı. Bunu parametize ve braine verelim birde config'e şunu ekleyelim docker min timeout örneğin 20000 yazsın kullanıcı brain spawnlarken bu değerin altına düşemesin. Kullanıcıların kontrolünde ama brainde işin içinde bu yapıyı düşün geliştir iyileştir sprint 145e ekleyelim."

**Üç prensip:**
1. **Brain otonom** — her task için uygun timeout hesaplar
2. **User-bounded** — kullanıcı min floor config'i belirler, brain altına düşemez
3. **Fix phase safety net** — yine de timeout alsa FIX phase retry ile iyileşir

---

## Tasarım

### 1. Timeout Hesaplama Heuristics (Brain içinde)

**Girdi:**
- `task.effort`: `low | normal | high`
- `task.scope.filesWrite.length`: yazılacak dosya sayısı
- `task.scope.directories.length`: scope büyüklüğü
- `estimateTaskLoC(task)`: DIRECTIVES'ten parse edilen hedef LoC (örn. "1566 → <400" ise delta ≈2000)
- `historicalAvg[agent][skill]`: sprint history'den ortalama süre (sprint 134+ verileri)
- `backendFactor`: docker (1.0x), tmux (0.9x), subprocess (0.8x)

**Algoritma:**
```typescript
function brainEstimateTimeout(task: Task, config: ResolvedConfig, history: SprintHistory): number {
  const baseByEffort = {
    low: 600,      // 10dk — basit bug fix, dokümantasyon, küçük refactor
    normal: 1200,  // 20dk — orta kapsamlı feature
    high: 2400,    // 40dk — God Object split, derin refactor, 1000+ LoC
  }[task.effort];

  const locDelta = estimateTaskLoC(task);
  const locMultiplier = Math.max(1.0, Math.log10(locDelta / 500 + 1) * 0.6);

  const scopeFiles = task.scope.filesWrite.length;
  const scopeMultiplier = 1 + (scopeFiles > 5 ? (scopeFiles - 5) * 0.05 : 0);

  const histAvg = history.avgDurationMs(task.assignedAgent, task.assignedSkills);
  const historyFactor = histAvg > 0 ? Math.max(1.0, (histAvg / 1000) / baseByEffort * 1.2) : 1.0;

  const backendFactor = { docker: 1.0, tmux: 0.9, subprocess: 0.8 }[config.spawn_backend] ?? 1.0;

  const estimated = Math.round(baseByEffort * locMultiplier * scopeMultiplier * historyFactor * backendFactor);

  // User-bounded: config floor'un altına düşme
  const minTimeout = config.timeout?.[`${config.spawn_backend}_min_timeout`] ?? 300;
  const maxTimeout = config.timeout?.max_timeout ?? 7200; // 2h hard ceiling

  return Math.max(minTimeout, Math.min(maxTimeout, estimated));
}
```

**Örnek (Sprint 144 canlı):**
- T-144-001 init split: effort=high (2400s base), LoC delta ~2000 (1.38x), scope 8 files (1.15x) → **~3800s = 63dk** (şu anki 1200s'den 3x fazla)
- T-144-003 retro split: effort=normal (1200s base), LoC delta ~450 (1.0x), scope 6 files (1.05x) → **~1260s = 21dk** (şu anki 1200s ile uyumlu, DONE'u açıklıyor)

### 2. Config Schema (User-editable)

`.deckent/config.json`:
```json
{
  "timeout": {
    "docker_min_timeout": 1200,
    "docker_max_timeout": 7200,
    "tmux_min_timeout": 900,
    "tmux_max_timeout": 5400,
    "subprocess_min_timeout": 600,
    "subprocess_max_timeout": 3600,
    "effort_base": {
      "low": 600,
      "normal": 1200,
      "high": 2400
    },
    "loc_scaling_enabled": true,
    "history_scaling_enabled": true,
    "runtime_extension_enabled": false
  }
}
```

**Validation:**
- `docker_min_timeout >= 300` (5dk altı Deckent için çok kısa)
- `docker_max_timeout <= 14400` (4h üzeri sprint timeout ile çakışır)
- `effort_base.high > normal > low` tutarlılık kontrolü
- `brain_estimate < min_timeout` → `min_timeout` kullanılır (kullanıcı koruması)
- `brain_estimate > max_timeout` → `max_timeout` kullanılır + WARN event

### 3. Runtime Timeout Değişim (İsteğe Bağlı Feature — Araştırma)

**Alperen sorusu:** "Timeout süresi worker çalışırken değiştirilir mi?"

**Teknik analiz:**

**Opsiyon A — UNIX `timeout` komutu:**
- `timeout 1200 claude -p - ...` → `timeout` komutu 1200s bekler sonra SIGTERM, 10s sonra SIGKILL
- `timeout`'un kendisi de bir process, PID var
- `kill -USR1 <timeout_pid>` ile uzatma **mümkün değil** — timeout komutu bunu desteklemiyor
- **Sonuç:** UNIX timeout ile runtime extension YAPILAMAZ

**Opsiyon B — Brain-side watcher process (önerilen):**
- Worker.sh'ı `timeout` olmadan çalıştır: `claude -p - ... &; WORKER_PID=$!`
- Brain side'ta ayrı bir `timeout-watcher.ts` daemon: her worker için `setTimeout(() => kill(WORKER_PID, 'SIGTERM'), timeoutMs)` + 15s sonra SIGKILL
- Brain runtime'da `extendTimeout(workerId, extraMs)` IPC call ile watcher'ın `setTimeout`'unu güncelleyebilir
- Kullanım: Brain worker'ın heartbeat'te "still processing" yazdığını görürse + progress olduğunu görürse otomatik +50% uzatma (1-2 kez max)

**Opsiyon C — Worker-self heartbeat score (middle ground):**
- Worker every 30s bir progress score heartbeat yazar (files modified, test count, loc delta)
- Brain score monoton artıyorsa ilerleme var demektir
- Timeout-1 dakikada 0 ise kill, ilerleme varsa +5dk uzatma otomatik
- En fazla 2x uzatma sonra mutlak kill (infinite loop koruması)

**Karar (Sprint 145 brainstorming konusu):** Opsiyon B + C hibrit — Brain watcher daemon + worker progress heartbeat. Sprint 145 ilk implementasyon **Opsiyon A-yı kapat + Opsiyon B base + `runtime_extension_enabled: false` default**. Sprint 146'da C eklenir.

### 4. Brain → Worker Pipeline Entegrasyonu

**Mevcut worker.sh template (src/orchestra/spawn-backend-docker.ts):**
```sh
timeout 1200 claude -p - --model opus ...
```

**Yeni worker.sh template:**
```sh
TIMEOUT=${TASK_TIMEOUT:-1200}
timeout $TIMEOUT claude -p - --model opus ...
```

**Brain tarafı (task-router.ts veya sprint-controller.ts):**
```typescript
// Her task spawn'da:
const timeoutSeconds = brainEstimateTimeout(task, config, history);
env['TASK_TIMEOUT'] = String(timeoutSeconds);
spawnDockerWorker(task, env);

// Audit trail:
emit(CHANNELS.TASK_ASSIGN, {
  taskId: task.id,
  timeoutSeconds,
  breakdown: { base, locMultiplier, scopeMultiplier, historyFactor, backendFactor },
});
```

### 5. Event Stream (ADR-035 entegrasyonu)

Yeni event tipleri:
- `BRAIN→WORKER:TIMEOUT_ASSIGN` — her task spawn'da timeout değeri + breakdown
- `BRAIN→WORKER:TIMEOUT_EXTEND` — runtime uzatma kararı (opsiyon B/C active ise)
- `WORKER→BRAIN:TIMEOUT_WARNING` — worker %80 timeout'a yaklaştığında erken uyarı
- `AUDITOR→BRAIN:TIMEOUT_CAP_EXCEEDED` — brain estimate > max_timeout durumunda

---

## Sprint 145 Task'ları (Öneri)

### Task A — Timeout Config Schema + Validation (P0)
- **Model:** opus | **Effort:** normal | **Agent:** architect | **Skills:** typescript-expert, system-architect
- **Files:** `src/core/config-types.ts`, `src/core/config.ts`, `src/core/config-validator.ts`, `tests/core/config-timeout.test.ts`
- **Scope:** `src/core/`, `tests/core/`
- **Kanıt:** `timeout.docker_min_timeout` validate ediliyor, invalid değer reject. `deckent config set timeout.docker_min_timeout 900` < 300 → hata.

### Task B — Brain Heuristic Timeout Estimator (P0)
- **Model:** opus | **Effort:** high | **Agent:** architect | **Skills:** system-architect, performance-optimizer
- **Files:** `src/orchestra/timeout-estimator.ts` (yeni, ~300 LoC), `src/orchestra/task-router.ts`, `tests/orchestra/timeout-estimator.test.ts`
- **Scope:** `src/orchestra/`, `tests/orchestra/`
- **Kanıt:** `brainEstimateTimeout(task, config, history)` → low/normal/high × LoC × scope × history kombinasyonları. 15+ test case (each branch).

### Task C — Sprint Controller Wire + worker.sh Template Update (P0)
- **Model:** opus | **Effort:** normal | **Agent:** refactorer | **Skills:** typescript-expert, devops-engineer
- **Files:** `src/orchestra/spawn-backend-docker.ts`, `src/orchestra/tmux.ts`, `src/orchestra/spawn-backend.ts`, `tests/orchestra/`
- **Scope:** `src/orchestra/`, `tests/orchestra/`, `tests/docker/`
- **Kanıt:** worker.sh template `TIMEOUT=${TASK_TIMEOUT:-1200}` kullanıyor. Env var passing canlı. `DEFAULT_TIMEOUT_SECONDS` constant deprecated.

### Task D — Timeout Event Stream Emit (P1)
- **Model:** opus | **Effort:** normal | **Agent:** architect | **Skills:** typescript-expert
- **Files:** `src/orchestra/event-stream.ts`, `src/orchestra/task-router.ts`
- **Scope:** `src/orchestra/`
- **Kanıt:** `.deckent/sprint-145-events.jsonl`'da `TIMEOUT_ASSIGN` event'i canlı, breakdown field dolu.

### Task E — Result Atomicity Guarantee (P0, bu spec'in parçası)
- **Model:** opus | **Effort:** normal | **Agent:** devops-engineer | **Skills:** docker-expert, typescript-expert
- **Files:** worker.sh template, `src/orchestra/spawn-backend-docker.ts`, `src/orchestra/spawn-backend.ts`
- **Scope:** `src/orchestra/`, `tests/docker/`
- **Description:** Worker SIGTERM/SIGKILL sırasında EXIT trap `git diff` çalıştırsın, değişen dosyaları + koca bir `TIMEOUT_WITH_WORK` payload ile result yazsın. Boş NO_GO yerine bu.
- **Kanıt:** T-144-001 senaryo simulate: `kill -TERM $WORKER_PID` + result dosyası `filesChanged: ["src/cli/commands/init.ts", "src/cli/commands/init-steps.ts", ...]` içeriyor.

### Task F — Brain Mid-Sprint Reconciliation Helper Wire (P0, önceden bilinen Sprint 136 T-003 dead wire fix)
- **Model:** opus | **Effort:** normal | **Agent:** bug-fixer | **Skills:** typescript-expert
- **Files:** `src/orchestra/result-evaluator.ts`, `src/orchestra/mid-sprint-adapter.ts`, `tests/orchestra/`
- **Scope:** `src/orchestra/`, `tests/orchestra/`
- **Description:** `TIMEOUT_WITH_WORK` selfAssessment alınınca Brain Spurious NO_GO Reconciliation helper'ı tetiklesin — `git diff` + test run + otomatik `GO_WITH_TECH_DEBT` karar verebilsin. Sprint 136 T-003'te helper yazıldı, Sprint 137'de wire canlı denilmiş ama dogfood Sprint 144'te ölü kanıtlandı.
- **Kanıt:** Sprint 144 T-144-001 gerçek sonuç simulate → Brain reconciliation sonrası otomatik `GO_WITH_TECH_DEBT` verebiliyor.

### Task G — Runtime Extension Prototype (Opsiyon B, P2 — isteğe bağlı)
- **Model:** opus | **Effort:** high | **Agent:** architect | **Skills:** system-architect, typescript-expert
- **Files:** `src/orchestra/timeout-watcher.ts` (yeni), `src/orchestra/task-router.ts`, worker.sh template
- **Scope:** `src/orchestra/`, `tests/orchestra/`
- **Description:** Watcher daemon; `runtime_extension_enabled: true` olduğunda devreye girer, progress heartbeat izler, +50% uzatma (max 2x) verir. Bu task opsiyonel — önceden config flag ile kapalı gelir.
- **Kanıt:** E2E test: worker 20dk heartbeat atıyor ama bitmiyor → watcher +10dk uzatma veriyor → worker bitiriyor → result yazıyor → DONE.

---

## Sprint 144 Üzerindeki Etkisi — Manual Reconcile Önerisi

Sprint 144 biterken T-144-001 ve T-144-004 **spurious NO_GO**. Koordinatör kararı (Alperen onaylı):

**Seçenek C — Sprint Sonu Manual Reconcile:**
1. Sprint 144 doğal akışta tamamlansın (27/27 veya FIX phase sonu)
2. Retro phase'de koordinatör iki task'ın `.result` dosyasını kontrol et:
   - `git diff --stat` ile gerçek ilerleme belgele
   - Eksik test dosyalarını liste halinde not et (T-144-001 3 test dosyası, T-144-004 muhtemelen 0 ya da 1)
   - `.result` dosyasını `selfAssessment: GO_WITH_TECH_DEBT` + gerçek ilerleme notu ile güncelle
3. Brain retro raporuna bu manual reconcile **kayıt altında** olacak, Sprint 145 zincir gate'inde şeffaf

**Alperen onayı:** "Evet bekleyeceğiz" dendi — bu seçenek Sprint 144 bitince uygulanacak.

---

## Kaynaklar

- **Alperen direktifi (2026-04-17 13:10 UTC):** Brain akıllı timeout, user-bounded floor, runtime extension sorusu
- **Sprint 144 canlı kanıtı:** T-144-001 (init) + T-144-004 (worker) NO_GO timeout, T-144-002 (doctor) sınırda DONE, T-144-003 (retro) rahat DONE
- **Önceki ilişkili ADR'ler:** ADR-035 (Verification Protocol), ADR-027 (Hybrid Spawn Backend)
- **Önceki ilişkili sprint bulguları:** Sprint 136 T-003 Spurious NO_GO helper (wire dead), Sprint 139 T-013 Docker HB Core Fix (atomic write foundation), Sprint 140 cost disaster (worker'ın yanlış davranışını tespit etme)

---

**Oluşturan:** Koordinatör, 2026-04-17 13:15 UTC (Sprint 144 canlı, T-144-001/004 NO_GO sonrası Alperen direktifi üzerine)

---

## 📚 Sprint 144 Canlı Meta-Dogfood Lesson (2026-04-17 13:15 UTC)

### Senaryo: Auditor.ts Core Dosya Kaybı
**Gözlem:** T-144-007 (Ölü Kod Wave A, `refactorer` agent) `src/agents/auditor.ts`'i yanlışlıkla silinen ölü dosya listesine dahil etmiş olabilir. Dosya şu anda git status'te `D` olarak görünüyor. T-144-006 (Auditor Async Scan) worker 12 dk aktif, muhtemelen yeniden yazıyor.

### Neden Kritik Lesson
Bu senaryo **gerçek kullanıcı dizininde de olabilir**: AI worker yanlış scope yorumuyla kritik dosyayı silebilir. Deckent'in bu durumu kendi kendine nasıl çözeceği **ürün dayanıklılığı kanıtı** olacak.

### Alperen Duruşu (2026-04-17 13:15 UTC)
> "İzleyeceğiz bu durum yaşanması normal, başka insanlarda core dosyalarını kaybedebilir, izleyeceğiz devam. Sakin kalabilirsin sorun yok. Çözüm her zaman var."

**Önemli:** Müdahale yok, otonom iyileşmeyi izle.

### Beklenen Brain Davranışı (hipotez)
1. **T-144-006 worker tamamlanırsa:** yeni `auditor.ts` async versiyonu yazar → dosya geri gelir, sprint chain gate geçebilir
2. **T-144-006 de timeout alırsa:** Brain FIX phase retry ile yeniden spawn → ikinci deneme genellikle daha hızlı (prompt cache + erken bilgi)
3. **T-144-006 retry da başarısız olursa:** Brain mid-sprint-adapter task'ı `NO_GO` yazacak, sprint chain gate FAIL → koordinatör manuel `git restore src/agents/auditor.ts` opsiyonu açılır (Alperen onayıyla)

### Sprint 145 Bu Lesson'dan Çıkarılacak Task Adayları

**P0 — Runtime Scope Enforcement (ADR-037 RBAC Wire Fix):**
Zaten audit'te tespit edilmişti (`checkWorkerAuthority()` runtime-dead). Bu vaka wire'ın canlı olması gerektiğini **kanıtladı**. Worker `filesWrite: ["auditor.ts"]` scope'u dışına çıkıp auditor.ts silemesin — runtime enforcement zorla dursun.

**P0 — Dead Code Delete Safety List:**
`refactorer` agent'in ölü kod silme task'larında **korumalı dosya listesi** olmalı (`src/agents/auditor.ts`, `src/agents/worker.ts`, `src/orchestra/sprint-controller.ts`, `src/core/memory-store.ts`). Bu dosyalar silinmeye çalışılırsa otomatik ABORT + NO_GO.

**P1 — Git Snapshot Auto-Rescue:**
Sprint start'ında `git stash create --include-untracked` ile snapshot al, chain gate FAIL olursa otomatik `git stash apply` ile tüm sprint değişikliğini geri al. Şu an sandbox mode var ama default kapalı.

**P1 — Worker Confusion Detection:**
Worker `filesWrite` içinde **olmayan** bir dosyaya dokunmaya çalışırsa (auditor.ts T-144-007 için) auditor gerçek zamanlı alert + Brain'e bildirim. Bu zaten event stream ADR-035'te var (`AUDITOR→BRAIN:BOUNDARY_VIOLATION`) ama wire zayıf.

### Meta-Dogfood Olumlu Yönü
- **Sprint canlı çalışıyor** — Brain panik olmadı, FIX phase doğal davranışla devrede
- **Koordinatör sakin** — Alperen direktifi
- **Monitor disiplini** — 15s interval, state değişikliğinde otomatik event
- **Kayıt altında** — bu lesson Sprint 145 brainstorming için dokümante edildi

### İlgili Memory Entry'ler
- `project_docker_hb_shutdown_bug.md` — Docker HB core fix pattern'i
- `project_sprint139_completed.md` — ADR-037 RBAC runtime enforcement iddiası (audit ile ölü kanıtlandı)
- `feedback_deckent_kill_approval_required.md` — müdahale kuralı, "izleyeceğiz" disiplini
- `feedback_no_half_measures.md` — çözüm her zaman var, yarım iş yok

---

**Kayıt zamanı:** 2026-04-17 13:15 UTC, Sprint 144 EXECUTE phase, 3 aktif worker, 5 result (2 DONE + 3 spurious NO_GO timeout), koordinatör pasif izleme modunda.

---

## 📝 LESSON GÜNCELLEMESİ (2026-04-17 13:16 UTC)

### Önceki Yanlış Teşhis
Koordinatör T-144-007 Ölü Kod Wave A'nın `auditor.ts`'i yanlışlıkla sildiğini düşünmüştü. Bu **yanlış teşhis** idi.

### Gerçek Durum (T-144-006 worker'ın raporuyla kanıtlandı)
- `src/agents/auditor.ts` **zaten 13 satırlık re-export shim** (Sprint 143 Layer 4 Runtime Wire'ında böyle kısaltılmış)
- Gerçek auditor logic'i `src/monitor/auditor.ts` + `src/orchestra/authority-enforcer.ts`'de yaşıyor — bunlar silinmedi
- T-144-007 Ölü Kod Wave A **doğru silme** yaptı (13 eski agent dosyası + eski auditor shim zaten ölü kod)
- T-144-006 Auditor Async worker DIRECTIVES'in yanlış yönlendirmesini tespit etti (auditor.ts sync I/O yok, gerçek sync I/O heartbeat-daemon.ts'de) ve doğru fix yaptı → **GO_WITH_TECH_DEBT** 
- Coverage 90%, 21 yeni test, 380/185 LoC delta

### Lesson (güncellenmiş)
**Koordinatör fazla paniklemiş, Alperen doğru söylemişti: "Çözüm her zaman var, sakin kalabilirsin."**

- Worker honest assessment v2 DIRECTIVES hatalarını düzeltiyor
- Git status `D` görünümü silme değil, daha önceki sprint'te shim'e indirgenme anlamına gelebilir
- Brain + worker kolektif kararı genellikle doğru — koordinatör müdahalesi olmadan otonom çözüm

### Sprint 145 Runtime Scope Enforcement İhtiyacı (hâlâ geçerli)
Teşhisim yanlış olsa da `checkWorkerAuthority()` runtime-dead kanıtı Sprint 145 için hâlâ valid. Eğer worker gerçekten yanlış scope'a girseydi, şu an runtime enforcement durduramazdı.

### Dogfood Değer
Bu senaryoyu canlı yaşamak (önce panik, sonra worker raporunu okuyup "iyi ki müdahale etmedim" demek) **dokümante edilmiş real kullanıcı deneyimi**. Sprint 145 DIRECTIVES'inde user-facing "sakin kalma" rehberi + koordinatör disiplin pattern'i olabilir.

---

**Güncelleme:** 2026-04-17 13:16 UTC
**Kaynak:** T-144-006 worker raporu (`notes` alanı) — "src/agents/auditor.ts is only 13 lines (re-export), no sync I/O to convert"
