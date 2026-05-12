# deckent_status MCP Tool

## Genel Bakış

`deckent_status`, aktif bir Deckent sprint'inin anlık durumunu sorgulayan MCP (Model Context Protocol) aracıdır. Herhangi bir ön koşul gerektirmez ve salt okunur (read-only) bir operasyon olduğu için istediğiniz sıklıkta güvenle çağrılabilir. Sprint başladıktan sonra ilerlemeyi izlemek, worker'ların durumunu kontrol etmek ve olası sorunları tespit etmek için kullanılır.

Bu tool, `.dashboard` dosyasını okuyarak Auditor'ın periyodik scan döngüsü ile ürettiği anlık görüntüyü döndürür. Aynı zamanda `sprint-state.json` ve iş durumu (`job`) bilgilerini birleştirerek tek bir tutarlı yanıt oluşturur.

---

## Parametreler

| Parametre | Tip | Varsayılan | Açıklama |
|-----------|-----|------------|----------|
| `json` | `boolean` | `false` | Ham JSON çıktısı döner; insan okunabilir özet eklenmez. Programatik tüketim için kullanılır. |
| `verbose` | `boolean` | `false` | Ekstra tanılama alanlarını ekler: tam agent atama haritası, skill atamaları, bağımlılık grafiği (varsa). |
| `outputMode` | `'explainatory' \| 'standart' \| 'verbose' \| 'json'` | `'standart'` | Yanıtın render biçimini belirler (aşağıya bakınız). |

---

## Dönen Alanlar

`deckent_status` çağrısı bir JSON nesnesi döndürür. Temel alanlar şunlardır:

### `sprint`
Aktif sprint bilgilerini içerir.

```json
{
  "sprint": {
    "id": "sprint-155",
    "startedAt": "2026-05-12T08:00:00.000Z"
  }
}
```

- `id` — Sprint tanımlayıcısı (ör. `sprint-155`). `sprint-state.json` kanonik kaynak olarak kullanılır; `.dashboard` eski olsa bile doğru değer döner.
- `startedAt` — Sprint'in başladığı UTC zaman damgası.

### `progress`
Görev tamamlanma istatistikleri.

```json
{
  "progress": {
    "done": 7,
    "total": 10
  },
  "progressBar": "███████░░░",
  "eta": "~3 minutes"
}
```

- `done` — Tamamlanan görev sayısı.
- `total` — Sprint'teki toplam görev sayısı.
- `progressBar` — Blok karakterlerden oluşan görsel ilerleme çubuğu (10 hane genişlik).
- `eta` — Tahmini tamamlanma süresi; geçen süre ve tamamlanan görev ortalamasına göre hesaplanır.

### `agents`
Çalışmakta olan worker agent'larının listesi.

```json
{
  "agents": [
    { "id": "w-155-003", "taskId": "155-003", "status": "EXECUTING" }
  ],
  "workerSummary": "1 active"
}
```

- Her giriş bir worker'ın kimliğini, üstlendiği görevi ve mevcut durumunu içerir.
- `workerSummary` — Özet metin (ör. `"3 active"`).

### `alerts`
Auditor tarafından tespit edilen sorunlar.

```json
{
  "alerts": [
    { "level": "WARN", "message": "Worker w-155-004 stale (last hb 3 min ago)" }
  ],
  "alertSummary": "1 alert"
}
```

Uyarı türleri:
- **STALE_WORKER** — Heartbeat 2 dakikadan uzun süredir güncellenmemiş worker.
- **BOUNDARY_VIOLATION** — `git diff --stat` ile tespit edilen kapsam dışı dosya değişikliği.
- **STALE_LOCK** — 5 dakikadan uzun süredir kilitli dosya (`.locks/`).
- **CIRCULAR_DEPENDENCY** — Görevler arasında döngüsel bağımlılık.

### `eventStreamTail`
Son 20 yapılandırılmış olayın listesi (`.deckent/<sprintId>-events.jsonl` dosyasından).

```json
{
  "eventStreamTail": [
    { "type": "TASK_STARTED", "taskId": "155-003", "ts": "2026-05-12T08:05:00.000Z" },
    { "type": "TASK_DONE",    "taskId": "155-001", "ts": "2026-05-12T08:06:30.000Z" }
  ]
}
```

Event stream, sprint yaşam döngüsü boyunca Brain ve Worker'ların yaydığı olayları (TASK_STARTED, TASK_DONE, TASK_NO_GO, PHASE_CHANGE vb.) kronolojik sırada tutar. `deckent_status` bu akışın kuyruk kısmını döndürerek en güncel aktiviteyi özetler.

### `metricSnapshot`
Sprint için toplanan metrik anlık görüntüsü (`.deckent/<sprintId>-metrics.jsonl`).

```json
{
  "metricSnapshot": {
    "tokenUsage.total": 142000,
    "noGoRate": 0.2
  }
}
```

### `phaseCountdown`
Aktif fazın ne kadar süredir devam ettiği.

```json
{
  "phaseCountdown": { "phase": "EXECUTE", "elapsedSec": 312 }
}
```

### `backendBreakdown`
Aktif worker'ların provider dağılımı.

```json
{
  "backendBreakdown": { "claude": 3, "codex": 1 }
}
```

### `agentAssignments` / `skillAssignments`
Hangi agent ve skill'in hangi göreve atandığını gösterir.

```json
{
  "agentAssignments": {
    "doc-writer": ["155-001", "155-002"]
  },
  "skillAssignments": {
    "documentation-writer": ["155-001", "155-002"]
  }
}
```

### `job`
Arka plan iş durumu (`RUNNING` / `COMPLETE` / `FAILED`).

```json
{
  "job": {
    "status": "RUNNING",
    "sprintId": "sprint-155",
    "startedAt": "2026-05-12T08:00:00.000Z"
  }
}
```

---

## `outputMode` Seçenekleri

`outputMode` parametresi, dönen metnin nasıl biçimlendirileceğini kontrol eder.

### `standart` (varsayılan)
Markdown tablo formatında özlü çıktı. Hızlı bir bakış için idealdir.

```
| Alan         | Değer              |
|--------------|--------------------|
| Sprint       | sprint-155         |
| Faz          | EXECUTE            |
| İlerleme     | 7 / 10 ███████░░░ |
| Worker       | 3 active           |
| Uyarı        | 0 alerts           |
| ETA          | ~3 minutes         |
```

### `explainatory`
Emoji destekli, Türkçe açıklama bloklarıyla zenginleştirilmiş çıktı. Sprint'in genel gidişatına dair bağlamsal yorumlar içerir. Faz geçişlerini, başarı/başarısızlık oranlarını ve önerilen sonraki adımları özetler.

```
🚀 Sprint sprint-155 — EXECUTE fazında
🎯 İlerleme: 7/10 görev tamamlandı (███████░░░)
👷 3 aktif worker
⏱ Tahmini kalan süre: ~3 dakika
✅ 0 uyarı — sprint sağlıklı
```

### `verbose`
Zaman damgaları ve tam alan listesi dahil ayrıntılı anlık görüntü. Tanılama (debugging) ve derin inceleme senaryoları için kullanılır. `verbose: true` parametre ile birleştirildiğinde bağımlılık grafiği ve tam agent detaylarını da içerir.

### `json`
İnsan okunabilir özet olmadan ham JSON döndürür. Programatik işleme, otomasyon scriptleri veya başka araçlara besleme için kullanılır. `json: true` parametresi ile eşdeğerdir.

---

## Özel Durumlar

### Aktif Sprint Yok
`.dashboard` dosyası mevcut değilse tool `active: false` ve `message: "No active sprint."` döndürür. `deckent_start` ile bir sprint başlatmadan önce bu durum normaldir.

### Sprint Tamamlandı (COMPLETE)
Son iş durumu `COMPLETE` ve görev listesi mevcutsa tool tamamlanan görev özetlerini `completedTasks` alanında döndürür; `.dashboard` artık mevcut olmasa bile önceki sprint verilerine erişilebilir.

### Dashboard Okuma Hatası
`.dashboard` bozulmuşsa `readDashboardSafe()` otomatik onarım (repair) dener. Onarım başarısız olursa `error: true`, `repaired: false` ve hata detayı döndürülür.

---

## Kullanım Örnekleri

### Temel durum sorgusu (MCP)
```json
{
  "tool": "deckent_status"
}
```

### Ham JSON çıktısı
```json
{
  "tool": "deckent_status",
  "arguments": { "json": true }
}
```

### Açıklamalı Türkçe çıktı
```json
{
  "tool": "deckent_status",
  "arguments": { "outputMode": "explainatory" }
}
```

### Tam tanılama görünümü
```json
{
  "tool": "deckent_status",
  "arguments": { "verbose": true, "outputMode": "verbose" }
}
```

---

## CLI Karşılığı

```bash
deckent status          # standart çıktı
deckent status --watch  # canlı izleme (periyodik polling)
deckent status --json   # ham JSON
```

---

## İlgili Tool'lar

| Tool | Açıklama |
|------|----------|
| `deckent_start` | Sprint'i başlatır; `deckent_status` ile izlenir |
| `deckent_review` | Sprint bittikten sonra GO/NO_GO kararı verir |
| `deckent_retro` | Tamamlanan sprint retrospektifini gösterir |
| `deckent_kill` | Çalışan sprint veya belirli worker'ı durdurur |
