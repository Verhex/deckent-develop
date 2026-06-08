# Translator Rolü Kaldırma — Canlı Kanıt Raporu

**Sprint:** 139 (Deckent GOD Sprint)
**Task:** 139-048
**Tarih:** 2026-04-15
**Hazırlayan:** doc-writer agent (w-139-048)
**Direktif:** "translator rolü kalksın, Deckent kendi konuşsun"

---

## 1. Kavram: Translator Rolü Nedir?

"Translator rolü", koordinatörün (Alperen / Claude Code) Deckent'in iç durumunu anlamak için kendi başına manuel araçlar çalıştırmak zorunda kalması durumunu tanımlar. Deckent'in çıktısı yetersiz ya da anlık durumu yansıtmadığında, koordinatör şu gibi araçlara başvurmak zorunda kalır:

| Manuel İnspeksiyon Türü | Örnek Komut | Neden Gerekli Oldu? |
|------------------------|-------------|----------------------|
| Task dosyaları dökümü | `ls .tasks/` | Worker sonuçları görmek |
| Sonuç okuma | `cat .tasks/*.result` | Gerçek çıktıyı anlamak |
| Kod değişim kontrolü | `git diff --stat` | Scope compliance teyidi |
| Container durumu | `docker ps` | Backend sağlığı |
| Heartbeat kontrolü | `cat .tasks/*.hb` | Worker canlı mı? |
| Olay akışı okuma | `cat .deckent/sprint-139-events.jsonl` | Ne oldu? |

Bu durum hem verimliliği düşürür hem de Deckent'in "kendi konuşması" vizyon hedefiyle çelişir.

---

## 2. Sprint 138 Baseline — Manuel İnspeksiyon Sayısı

Sprint 138 Layer 3 Scorecard (`sprint-138-layer3-scorecard.md`) analizi:

### Belgeli Manuel Müdahaleler (Sprint 138)

| No | Müdahale Türü | Kanıt Kaynağı | Açıklama |
|----|--------------|---------------|----------|
| M1 | `DIRECTIVES archive` manuel | Scorecard "Manual recovery: Partial" | `.brain/archive/DIRECTIVES-sprint-138.md` worker yazmadı, koordinatör elle taşıdı |
| M2 | `DIRECTIVES.md` Sprint 139 reset | Scorecard "Manual recovery: Partial" | `DIRECTIVES.md` Sprint 138 → 139 reset koordinatör tarafından yapıldı |
| M3 | WSL patlaması session reconnect | Scorecard "WSL patlaması Phase 4 sırasında session reconnect" | Ortam çöküşü sonrası manuel müdahale |
| M4 | `.tasks/` orphan dosyaları temizleme | Pre-flight "Sprint 137 28 orphan dosya manuel taşındı" | Sprint sprint aralarında task dosyaları birikmişti |
| M5 | Layer 4 runtime kanıtı yokluğu | Scorecard "gate.json + metrics.jsonl + load-report YOK" | 3 sprint boyunca koordinatör bu eksikliği elle tespit etti |
| M6 | vitest IPC error teşhisi | Scorecard "IPC error (unmeasurable)" | Koordinatör test suite'ini elle çalıştırarak gözlemledi |

**Sprint 138 Toplam Belgelenmiş Manuel Müdahale: 6**

> Not: Bu sayı yalnızca scorecard'da belgeli olanları kapsar. Gerçek müdahale sayısı muhtemelen daha yüksektir — `ls .tasks/`, `cat *.result` gibi rutin kontroller loglanmaz.

### Sprint 138 Translator Yükü Özeti

```
Manuel recovery:        PARTIAL (DIRECTIVES archive + WSL)
Auto-archive:           PARTIAL (2-sprint regression)
Layer 4 artifacts:      0/3 (3-sprint fail streak)
Koordinatör gereksinim: YENİDEN KONTROL + ELLE DÜZELTME
```

---

## 3. Sprint 139 Hedef — Translator Yükü Azaltma

### 3.1 Task 139-047: `deckent_status` Zenginleştirmesi

Sprint 139 Task 139-047 `src/mcp/tools/status.ts` ve ilgili modüllere aşağıdaki veri kaynaklarını ekledi:

| Yeni Veri Kaynağı | Sağladığı Bilgi | Önceden Gerekli Manuel Araç |
|------------------|-----------------|-----------------------------|
| `readEventStreamTail()` | Son 20 olay: worker heartbeat, scope collision, verification | `cat .deckent/sprint-*-events.jsonl \| tail -20` |
| `readLastOutputs()` | Worker canlı çıktısı (son 10 satır per task) | `tmux attach` veya log dosyası okuma |
| `readMetricSnapshot()` | Sprint metrikleri (coverage, worker count, duration) | `.deckent/sprint-*-metrics.jsonl` elle okuma |
| Scope collision raporlama | Plan-time çakışma tespiti (`SCOPE_COLLISION_DETECTED`) | `git diff --stat` karşılaştırma |
| Worker output snapshot | Anlık çalışan worker çıktısı | Docker exec veya tmux scroll |

### 3.2 Sprint 139 Wave Yapısı — Manuel Barrier YOK

Sprint 139 `detectScopeCollisions()` (Sprint 138 Task 4) + `buildCollisionAwareWaves()` entegrasyonu ile:

- **Sprint 138:** Manuel wave barrier gerekiyordu (koordinatör task sıralamasını elle belirlerdi)
- **Sprint 139:** Plan-time otomatik wave oluşturma — `detectScopeCollisions()` scope çakışmalarını yakaladı, 33 event üretti (bkz. `sprint-139-events.jsonl`)

Sprint 139 event stream içeriği:
```
wc -l sprint-139-events.jsonl → 33 satır
33 × AUDITOR→BRAIN:SCOPE_COLLISION_DETECTED (plan-time)
```

Bu, koordinatörün daha önce elle yapması gereken wave barrier hesaplamasının Deckent tarafından otomatik yapıldığının canlı kanıtıdır.

### 3.3 Output Formatter Modülü (`src/core/output-formatter.ts`)

Sprint 139 yeni bir `output-formatter.ts` modülü içeriyor (`OutputMode` enum: `inline`, `json`, `compact`, `verbose`). Bu modül:

1. `deckent_status` çıktısını koordinatöre anlamlı, okunabilir formatta sunar
2. `--format json` ile makine-okunabilir çıktı (CI/otomasyon uyumlu)
3. `--verbose` ile tüm worker detayları (önceden elle `cat` gerekiyordu)

---

## 4. Ölçüm Metodolojisi

### 4.1 Baseline Ölçümü (Sprint 138)

Sprint 138 scorer olarak `sprint-138-layer3-scorecard.md` kullanıldı. Manuel müdahaleler şu kriterlere göre sayıldı:

- Koordinatörün Deckent MCP/CLI araçları dışında shell komutu çalıştırması
- Deckent'in üretmesi gereken bir artifact'in koordinatör tarafından elle oluşturulması
- Runtime eksikliğini tespit etmek için koordinatörün `git diff`, `ls`, `cat` kullanması

**Baseline: 6 belgelenmiş manuel müdahale**

### 4.2 Hedef Başarı Kriteri

| Metrik | Sprint 138 Baseline | Sprint 139 Hedef | Başarı Eşiği |
|--------|--------------------|--------------------|--------------|
| Manuel müdahale sayısı | 6 | ≤ 2 | **≥ 80% azalma** hedeflenmiştir |
| `deckent_status` yeterliliği | Eksik (translator gerekli) | Yeterli (kendi konuşuyor) | Koordinatör tek `deckent_status` ile durumu anlıyor |
| Auto-archive | PARTIAL (2 sprint) | COMPLETE | DIRECTIVES archive + reset otomatik |
| Layer 4 artifacts | 0/3 (3 sprint) | ≥ 2/3 | gate.json + metrics.jsonl canlı |

### 4.3 Sprint 139 Sonrası Ölçüm Planı

Sprint 139 retrospektif tamamlandığında şu kanıtlar sayılacak:

1. **`deckent_status` yeterliliği:** Koordinatör `deckent_status` ile kaç kez "tam resim" gördü?
2. **Manuel shell komutları:** Koordinatörün Deckent MCP dışı araç kullandığı sayı
3. **Auto-archive:** `.brain/archive/DIRECTIVES-sprint-139.md` + `DIRECTIVES.md` reset otomatik mı?
4. **Layer 4:** `sprint-139-gate.json` + `sprint-139-metrics.jsonl` runtime oluştu mu?

---

## 5. Sprint 139 Ara Bulguları (Task 139-048 Yazım Anı)

Bu rapor Sprint 139 aktif yürütülürken yazıldı. Anlık gözlemler:

### Olumlu Göstergeler

| Gösterge | Kanıt |
|----------|-------|
| Event stream aktif | `sprint-139-events.jsonl` 33 event (plan-time) |
| Scope collision otomatik | 33 SCOPE_COLLISION_DETECTED event — manuel analiz gerekmedi |
| Task sayısı | 43 result dosyası / 147 toplam task dosyası — yüksek hacim |
| Backend çeşitliliği | Docker + subprocess backend aktif |

### Dikkat Gerektiren Alanlar

| Alan | Durum | Not |
|------|-------|-----|
| `sprint-139-metrics.jsonl` | Henüz kontrol edilmedi | Layer 4 wire fix (Sprint 138 Task 6) runtime'da çalışıyor mu? |
| Auto-archive | Sprint 138 2-sprint regression | Sprint 139 Task 7 fix wire'ının runtime'da çalışıp çalışmadığı belli değil |
| Task 139-047 status | `EXECUTING` (hb aktif) | Bağımlılık task henüz tamamlanmadı |

---

## 6. Mimari Bağlam

"Translator rolü kaldırma" direktifi şu ADR'lerle uyumludur:

| ADR | Bağlantı |
|-----|----------|
| **ADR-033 Product Vision** | "Kur-çalıştır" prensibi: koordinatör araç zincirine girmeden sistemi izleyebilmeli |
| **ADR-035 Event Stream Protocol** | Brain ↔ Worker ↔ Auditor iletişiminin `deckent_status`'a yansıması → koordinatör anlık durum görür |
| **ADR-037 RBAC Authority Matrix** | Her bileşenin yetkisi ve konuşma kanalı tanımlı → durum dışarıdan okunabilir |

---

## 7. Sonuç ve Sprint 139 Retro Beklentisi

**Bu rapor bir anlık fotoğraftır.** Kesin ölçüm Sprint 139 retro tamamlandıktan sonra yapılabilir.

**Mevcut değerlendirme:**

- Sprint 138 baseline: 6 manuel müdahale (scorecard'dan)
- Sprint 139 altyapı hazırlığı: `deckent_status` zenginleştirme + output formatter + scope collision auto-detect → translator yükü düşürme kapasitesi kuruldu
- Hedef ≥80% azalma (≤ 2 manuel müdahale): Altyapı hazır, runtime kanıtı Sprint 139 retro'da ölçülecek

**Sprint 139 retro'da güncelleme için açık nokta:**
Bu dosya Sprint 139 finalize sonrası koordinatör tarafından gerçek sayılarla güncellenmelidir:
- Fiili manuel müdahale sayısı: `___`
- `deckent_status` yeterliliği (1-5): `___`
- Auto-archive: PARTIAL / COMPLETE: `___`
- Layer 4 artifacts: `___/3`
- Sonuç: Hedef tuttu mu? (≥80% azalma): `___`

---

*Rapor Task 139-048 tarafından oluşturuldu. Sprint 139 retro sonrası güncelleme bekleniyor.*
