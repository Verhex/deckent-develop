# Bağımlılık Pipeline ve Wave Yürütme

deckent, görevler arasındaki bağımlılıkları topolojik sırayla çözerek paralel wave'lerde çalıştırır. Bu belge Kahn algoritmasına dayalı wave oluşturma mekanizmasını, `dependency_pipeline_enabled` yapılandırmasını ve ADR-045/ADR-064'ün runtime kablolama geçmişini açıklar.

---

## Neden Bağımlılık Pipeline?

Görevler arasında veri akışı vardır. Bir modülün arayüzünü tanımlayan görev tamamlanmadan o arayüzü kullanan görev başlamamalıdır. Eski FIFO (First-In-First-Out) yaklaşımında tüm görevler tek sırada bekler ve paralel çalışma fırsatı kaçar. Bağımlılık pipeline'ı şu sorunları çözer:

- **Bağımsız görevler** aynı anda (paralel) çalışır.
- **Bağımlı görevler**, tüm üst-görevler tamamlanana kadar spawn edilmez.
- **Dosya çakışmaları** (aynı dosyaya yazan iki görev) otomatik olarak sıralı yapılır.

---

## Kahn Algoritması ile Wave Oluşturma

### `buildDependencyGraph()` — `src/orchestra/dependency-scheduler.ts`

```typescript
export function buildDependencyGraph(
  tasks: Task[],
  includeCollisions = true,
): DependencyGraph
```

Bu fonksiyon şu adımları izler:

1. **Yönlü çizge oluşturma**: Her görevin `dependencies[]` listesinden kenarlar çizilir.
2. **Çakışma kenarları**: `detectScopeCollisions()` (Sprint 138 entegrasyonu), aynı dosyaya yazan görev çiftlerini tespit eder ve aralarına sentetik bağımlılık kenarı ekler.
3. **Kahn algoritması — topolojik sıralama**:
   - Her düğümün giriş derecesi (`inDegree`) hesaplanır.
   - Giriş derecesi 0 olan tüm düğümler aynı wave'e atanır.
   - Bu düğümler çözüldükçe bağımlı düğümlerin giriş dereceleri azaltılır.
   - Kalan giriş derecesi 0 olanlar bir sonraki wave'i oluşturur.
   - Döngü varsa (`hasCycle: true`) tespit edilir ve raporlanır.

Örnek çıktı:
```
Wave 0: [task-001, task-002, task-003]   ← bağımsız, paralel
Wave 1: [task-004, task-005]             ← task-001 ve task-002'ye bağımlı
Wave 2: [task-006]                       ← task-004 ve task-005'e bağımlı
```

### DependencyGraph Yapısı

```typescript
export interface DependencyGraph {
  dependencies: Map<string, Set<string>>;   // görev → bağımlı olduğu görevler
  dependents: Map<string, Set<string>>;     // görev → kendine bağımlı görevler
  waveAssignment: Map<string, number>;      // görev → wave indeksi
  waves: DependencyWave[];                  // sıralı wave listesi
  hasCycle: boolean;
  cycleTaskIds: string[];
}
```

---

## `dependency_pipeline_enabled` Yapılandırması

`.deckent/config.json` içindeki bu bayrak wave yürütmesini açar/kapatır:

```json
{
  "dependency_pipeline_enabled": true
}
```

| Değer | Davranış |
|-------|---------|
| `true` (kod varsayılanı, `src/core/config.ts`) | Wave bazlı yürütme: bağımlılıklar çözülünce spawn |
| `false` | Legacy FIFO: tüm görevler tek sıraya alınır |

Sprint 156'da varsayılan `false → true` olarak güncellendi. deckent'in kendi dogfood projesinde ise Sprint 281 itibarıyla `true` yapılmıştır (Sprint 279/280 canlı kanıtı: Wave-1 paralel spawn, Wave-2 bekleme, Wave-3 tamamlanmayla tetiklenme gözlemlendi).

---

## ADR-045: Wave-Based Execution — Runtime Kablolama

Sprint 161'de bir sorun keşfedildi: `dependency_pipeline_enabled: true` ayarlı olmasına rağmen Wave 2 ve 3 görevleri hiç spawn edilmiyordu. Sprint asıldı (hangti kaldı). Sprint 164 forensic analizinde 6 kanıtla kök neden tespit edildi: `respawnEligibleTasks()` fonksiyonu vardı ama hiçbir yerden çağrılmıyordu.

ADR-045, bu kablolama sorununu 3 karar maddesiyle çözdü:

### Karar 1 — `applyStatusMutation()` — Inline Durum Güncelleme

`collectResults()` bir `.result` dosyası topladığında, görevin in-memory durumunu hemen günceller:

| selfAssessment | Yeni durum |
|----------------|-----------|
| `DONE` | `TaskStatus.DONE` |
| `GO_WITH_TECH_DEBT` | `TaskStatus.DONE` (bağımlıyı bloke etmemek için) |
| `NO_GO` | `TaskStatus.NO_GO` |

`GO_WITH_TECH_DEBT → DONE` dönüşümü kasıtlıdır: borçla kapanan bir görevin bağımlısı bloke olmamalıdır.

```typescript
// src/orchestra/result-collector.ts
function applyStatusMutation(task: Task, result: TaskResult): void
```

### Karar 2 — `maybeRespawn()` — Dep-Aware Yeniden Spawn

`waitForResults()` ana döngüsüne her `collectResults()` sonrasında çağrı eklendi:

```typescript
// src/orchestra/result-collector.ts
const maybeRespawn = async (): Promise<void> => {
  if (!config?.dependency_pipeline_enabled) return;
  const respawnEligibleTasks = await loadRespawn();
  await respawnEligibleTasks(projectRoot, sprint, config, spawnOpts);
};
```

`respawnEligibleTasks()` (sprint-spawner.ts), `t.status === TaskStatus.DONE` filtresiyle uygun görevleri bulur ve spawn edilmemiş olanları başlatır.

### Karar 3 — Slot Kontrolü Korunur

`sprint-spawner.ts` içindeki `slotsAvailable = maxWorkers - currentlyExecuting` kontrolü değiştirilmedi. Çift spawn önlenir, `enforceWaveDependency()` korunur.

---

## ADR-045 Ek: Bağımlılık Tatmin Seti Genişletme (Sprint 280)

Sprint 280'de tespit edilen sorun: bir üst-görevin `MANUAL_REVIEW_REQUIRED` durumuna düşmesi, bağımlı görevleri sonsuza kadar bloke ediyordu (canlı deadlock). Çözüm: bağımlılık tatmin seti artık `DONE ∪ MANUAL_REVIEW_REQUIRED` içerir:

```typescript
// src/orchestra/sprint-spawner.ts
const doneTasks = new Set(
  sprint.tasks
    .filter(t =>
      t.status === TaskStatus.DONE ||
      t.status === TaskStatus.MANUAL_REVIEW_REQUIRED,
    )
    .map(t => t.id),
);
```

Hâlâ çalışan (EXECUTING) üst-görevler bağımlıyı bloke etmeye devam eder.

---

## ADR-064: TOPP — Sürekli Dispatch (Wave Bariyer Kaldırma)

Sprint 178'de ADR-064 ile wave bariyer mantığı genişletildi. Eski yaklaşımda Wave N tamamen bitmeden Wave N+1 başlamıyordu. `dispatchTick()` ile bu bariyer kaldırıldı:

```
dispatchTick(yeniToplananlar) = processQueue() + maybeRespawn()
```

**Sürekli mod (varsayılan)**: Her tick'te uygun bekleyen görevler değerlendirilir. Bir görev tamamlanır tamamlanmaz, bağımlıları aynı tick içinde spawn edilir. Wave 0 ve Wave 1 arasında artık yapay bekleme yoktur.

**Legacy FIFO kaçış kapısı**: `DECKENT_LEGACY_FIFO=1` ortam değişkeni set edildiğinde sistem eski davranışa döner. Kaynak kodu değişikliği gerektirmez.

### Sprint 179 Doğrulaması

Sprint 179'da 12 görevli fan-out testiyle sürekli dispatch canlı olarak doğrulandı: `maxWorkers=2` ile eski wave-barrier yaklaşımı en iyi ihtimalle 6 seri geçiş gerektirirken, sürekli dispatch tek bir dolum + reaktif spawn döngüsüyle tamamlandı.

---

## Bağımlılık Pipeline Görselleştirmesi

```
Sprint Görevi Grafiği:
  T1 ─────────────────┐
  T2 ──────────────── ├──► T4 ──────────────────► T6
  T3 ─────────────────┘         ▲
                                T5 ─────────────────►  T6

Wave 0: T1, T2, T3          (bağımsız, paralel spawn)
Wave 1: T4, T5              (T1+T2+T3 → DONE sonrası)
Wave 2: T6                  (T4+T5 → DONE sonrası)
```

ADR-064 sürekli dispatch ile: T1 bittiğinde T4'ün spawn edilmesi için T2/T3'ün bitmesi beklenmez; T4 için `enforceWaveDependency()` kontrolü geçilirse hemen spawn edilir. Wave sadece mantıksal bir sıralama aracıdır, artık bir bariyer değildir.

---

## Cascade Bloke Mekanizması

Bir görev başarısız olduğunda (NO_GO), bağımlı görevler otomatik olarak `BLOCKED` durumuna alınır:

```typescript
// src/orchestra/dependency-scheduler.ts
export function cascadeBlockDependents(
  failedTaskId: string,
  graph: DependencyGraph,
  tasks: Task[],
  callback?: CascadeEventCallback,
): CascadeResult
```

Başarısızlık kategorisi (`CODE` | `RUNTIME` | `AMBIGUOUS`) cascade kararını etkiler: `RUNTIME` veya `AMBIGUOUS` türündeki başarısızlıklar cascade başlatmaz (geçici hata olabilir). Yalnızca `CODE` türü cascade'i tetikler.
