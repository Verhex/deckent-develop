# deckent_retro MCP Tool

## Genel Bakış

`deckent_retro`, tamamlanan bir sprint'in retrospektif raporunu okumak için kullanılan MCP tool'udur. Sprint sonu Brain tarafından otomatik oluşturulan retrospektif; metrik özeti, agent/skill performans tabloları, öğrenimler (learnings) ve token kullanımını içerir. Bu tool hem güncel sprinte ait RETRO.md'yi hem de geçmiş arşivlenmiş sprint retrospektiflerini sorgulayabilir.

---

## Parametreler

| Parametre | Tür       | Zorunlu | Açıklama                                                         |
|-----------|-----------|---------|------------------------------------------------------------------|
| `sprintId` | `string` | Hayır   | Arşivden okumak istenen sprint ID'si (örn. `"sprint-083"`). Verilmezse güncel `.brain/RETRO.md` okunur. |

---

## Dönüş Değerleri

```json
{
  "data": {
    "content": "# Sprint sprint-154 Retrospective\n...",
    "highlights": [
      "5 tasks completed on first try",
      "2 tasks self-healed (auto-fixed errors)"
    ],
    "sprintId": "sprint-083",
    "archived": true
  },
  "summary": "Sprint sprint-083 retrospective — 8/10 tasks completed. Key highlights extracted."
}
```

| Alan         | Tür        | Açıklama                                                              |
|--------------|------------|-----------------------------------------------------------------------|
| `content`    | `string`   | Tam retro markdown içeriği                                            |
| `highlights` | `string[]` | İçerikten çıkarılan önemli maddeler (max 5 bullet point)              |
| `sprintId`   | `string`   | Arşiv sorgusunda döner; güncel sorguda yer almaz                      |
| `archived`   | `boolean`  | `true` ise arşivden okundu, `false`/undefined ise güncel RETRO.md'den |
| `summary`    | `string`   | İnsan-okunur kısa özet satırı                                         |

Hata durumunda `isError: true` ile hata mesajı döner; tool exception fırlatmaz.

---

## Sprint Sonu Retro Üretim Süreci

Sprint `CLEANUP` fazına geçmeden önce Brain, `writeRetrospective()` fonksiyonunu çağırır. Bu fonksiyon `src/orchestra/sprint-retro-writer.ts` içinde tanımlıdır ve şu adımları izler:

### 1. Veri Toplama
- Tüm `.tasks/task-NNN.result` dosyaları okunur.
- Her task'ın `selfAssessment`, `testsPassed`, `coverage`, `tokenUsage`, `rubricScores` ve `notes` alanları çıkarılır.
- `feedbackLoop` bilgisine göre "first-try tamamlanan" ve "self-healed" task'lar ayrıştırılır.

### 2. Metric Summary Hesaplama
Sprint metrikleri şu formüllerle hesaplanır:

| Metrik             | Hesaplama                                             |
|--------------------|-------------------------------------------------------|
| `completedTasks`   | DONE + GO_WITH_TECH_DEBT sayısı                       |
| `noGoRate`         | `(noGoTasks / totalTasks) × 100`                      |
| `selfHealingRate`  | `(healedTasks / retriedTasks) × 100`                  |
| `coveragePercent`  | Tüm task coverage değerlerinin ağırlıklı ortalaması   |
| `tokenUsage`       | Task başına input/output/cache token toplamları       |

### 3. RETRO.md Yazımı
Rapor aşağıdaki bölümlerden oluşur ve max **400 satır** ile sınırlandırılır:

```
# Sprint {id} Retrospective
## Summary         — Tamamlanma oranı, self-healing, süre
## Highlights      — İlk denemede biten / self-healed task'lar
## Issues          — NO_GO task'lar, boundary violations
## Metrics         — Tablo: tasks, coverage, NO_GO rate vb.
## Agent Performance  — Agent bazında görev/başarı istatistikleri
## Skill Performance  — Skill bazında performans tablosu
## Token Usage     — Task × model bazında token dökümü
## Quality Dimensions — Correctness / Coverage / Scope / Completeness skorları
## Learnings       — NO_GO notları, pattern'ler, açık debt uyarıları
```

Önceki `RETRO.md`, üzerine yazılmadan önce `.brain/archive/retro-{sprintId}.md` olarak arşivlenir.

---

## Learning Extraction — Dual-Write Mekanizması

Brain öğrenimleri hem markdown dosyasına hem de SQLite veritabanına yazar:

### MEMORY.md (Markdown — Append)
Sprint learnings `.brain/MEMORY.md` dosyasına eklenir:
```markdown
## Sprint sprint-154 Learnings
- Task 154-003: NO_GO — RubricRegistry init failed; missing import path
- Task 154-007: GO_WITH_TECH_DEBT — Coverage below threshold (62% < 80%)
```
Max satır: **1500** — Limit aşımında başlık (ilk 10 satır) korunarak eski satırlar kesilir.

### memory.db (SQLite — Structured)
İki ayrı entry türü yazılır:

```typescript
// Retro entry — tam rapor
store.upsert({
  id: `retro-${sprint.id}`,
  type: 'retro',
  title: `Sprint ${sprint.id} Retrospective`,
  content: retroMarkdown,
  sprint_id: sprint.id,
  sprint_num: 154,
  tags: ['retro', 'sprint-154']
}, 'brain');

// Memory/Learning entry — yalnızca learnings bölümü
store.insert({
  id: `mem-${sprint.id}`,
  type: 'memory',
  title: `Sprint ${sprint.id} Learnings`,
  content: learningsSection,
  sprint_id: sprint.id,
  sprint_num: 154,
  tags: ['learning', 'sprint-154']
});
```

Decay yönetimi: `MEMORY_DECAY_SPRINTS = 20` — 20 sprint geçtikten sonra eski learnings otomatik temizlenir (`decay_exempt` ile önemli girdiler korunabilir).

---

## Bilgi Akışı

```
Sprint tamamlanır (EVALUATE fazı sona erer)
  ↓
writeRetrospective() çağrılır
  ↓
Tüm .result dosyaları okunur → metrikler hesaplanır
  ↓
RETRO.md yazılır (max 400 satır)
  ↓
Eski RETRO.md → .brain/archive/retro-{id}.md
  ↓
Learnings → MEMORY.md'ye append
  ↓
Retro + Learnings → memory.db'ye dual-write
  ↓
deckent_retro tool / deckent://retro resource erişilebilir
```

---

## Kullanım Örnekleri

**Güncel sprint retrosu:**
```json
{ }
```

**Belirli bir arşiv sprinti:**
```json
{ "sprintId": "sprint-150" }
```

**CLI alternatifi:**
```bash
deckent retro
deckent retro --perf
deckent retro --trend 5
```

---

## Notlar

- `deckent://retro` MCP resource'u, DB'den otomatik olarak güncel retro'yu yükler — `deckent_retro` tool'una gerek kalmadan context'e eklenir.
- Highlights çıkarımı deterministik: yalnızca `- ` ile başlayan satırlardan max 5 madde seçilir.
- Arşiv aramada iki format denenir: `retro-sprint-NNN.md` ve `retro-NNN.md`.
