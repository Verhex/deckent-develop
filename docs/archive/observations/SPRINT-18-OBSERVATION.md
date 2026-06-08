# Sprint 18 Observation Report — Orchestration Smoke Test

**Tarih:** 2026-03-18
**Hedef:** 10 paralel doküman görevi ile orkestrasyon smoke test
**Sonuç:** KISMI BASARI — 8/10 görev tamamlandı, 2 görev planlanmadı

---

## Özet

Sprint 18, deckent orkestrasyon motorunun ilk gerçek smoke test'iydi. 10 doküman görevi verildi, motor 8 tanesini planladı ve hepsini başarıyla tamamladı. Toplam süre: ~260 saniye (~4.3 dakika). Kaynak koda dokunulmadı, sadece docs/ dizinine yazıldı.

---

## Faz Analizi

### PLAN (T+0 → T+2s)
- **Durum:** BASARILI
- Brain DIRECTIVES.md'yi okudu, 10 görevden **sadece 8'ini planlama**ya aldı
- `max_workers: 8` config limiti nedeniyle görev 9 (BRAIN-GUIDE.md) ve görev 10 (DASHBOARD-GUIDE.md) **planlanmadı**
- Tüm 8 task için model: **sonnet** (doğru seçim — doküman görevleri için opus gereksiz)
- Task JSON dosyaları `.tasks/task-018-001.json` → `task-018-008.json` olarak oluşturuldu
- **Bug:** Planner `max_workers` limitini görev sayısına eşitlemiş — tüm görevleri planlayıp sırayla çalıştırması gerekirdi

### SPAWN (T+2s → T+5s)
- **Durum:** BASARILI
- tmux session `deckent` oluşturuldu (9 window: 1 bash + 8 worker)
- 8 worker window spawn edildi: `w-018-001` → `w-018-008`
- Her worker kendi tmux pane'inde bağımsız çalışıyor
- Log dosyaları `.tasks/task-018-XXX.log` olarak pipe-pane ile yazılmaya başladı

### EXECUTE (T+5s → T+~240s)
- **Durum:** BASARILI
- 8 worker paralel çalıştı
- İlk tamamlanan: task-002 (TROUBLESHOOTING), task-003 (SECURITY) — ~60s'de DONE
- Son tamamlanan: task-001 (GLOSSARY) — ~120s'de result yazdı (en uzun süren)
- Heartbeat (.hb) dosyaları düzenli yazıldı (sequence 1→3)
- **Bug:** Heartbeat timestamp'leri yanlış saat diliminde — auditor hepsini "stale agent" olarak işaretledi

### EVALUATE (T+~240s → T+~255s)
- **Durum:** BASARILI
- Brain 8 result dosyasını okudu
- 3 task DONE, 5 task GO_WITH_TECH_DEBT olarak değerlendirildi
- 0 NO_GO — hiçbir görev başarısız olmadı
- Coverage: %36.9 (sadece doküman görevleri — kaynak kod değişikliği yok)

### RETRO (T+~255s → T+~258s)
- **Durum:** BASARILI
- `.brain/RETRO.md` yazıldı
- `.brain/sprints/sprint-018.md` yazıldı
- `.brain/MEMORY.md` güncellendi (Sprint 18 learnings eklendi)
- `.deckent/config.json` → `last_sprint_id: "sprint-018"` güncellendi

### CLEANUP + COMPLETE (T+~258s → T+~260s)
- **Durum:** BASARILI
- `.tasks/` dizini tamamen temizlendi (tüm .json, .hb, .result, .log dosyaları silindi)
- tmux worker window'ları kapatıldı (sadece bash window kaldı)
- Dashboard final state: `COMPLETE, done: 8/8`
- Job dosyası: `COMPLETE`

---

## Üretilen Dokümanlar

| # | Dosya | Boyut | Değerlendirme |
|---|-------|-------|---------------|
| 1 | docs/GLOSSARY.md | 18 KB | DONE |
| 2 | docs/TROUBLESHOOTING.md | 14 KB | DONE |
| 3 | docs/SECURITY.md | 14 KB | GO_WITH_TECH_DEBT |
| 4 | docs/MCP-GUIDE.md | 20 KB | GO_WITH_TECH_DEBT |
| 5 | docs/MEMORY-SYSTEM.md | 10 KB | GO_WITH_TECH_DEBT |
| 6 | docs/SPRINT-LIFECYCLE.md | 19 KB | GO_WITH_TECH_DEBT |
| 7 | docs/CONFIG-REFERENCE.md | 18 KB | GO_WITH_TECH_DEBT |
| 8 | docs/WORKER-GUIDE.md | 22 KB | DONE |
| 9 | docs/BRAIN-GUIDE.md | **YOK** | PLANLANMADI |
| 10 | docs/DASHBOARD-GUIDE.md | **YOK** | PLANLANMADI |

Toplam üretilen doküman: ~135 KB (8 dosya)

---

## Tespit Edilen Sorunlar

### 1. Planner max_workers Limiti (KRITIK)
- **Sorun:** Planner, `max_workers: 8` limitini görev sayısı limiti olarak yorumladı
- **Etki:** 10 görevden 2'si (BRAIN-GUIDE, DASHBOARD-GUIDE) hiç planlanmadı
- **Beklenen:** Planner tüm 10 görevi planlayıp, ilk 8'i paralel çalıştırmalı, kalan 2'yi kuyrukta bekletmeli
- **Fix:** `src/orchestra/brain.ts` → `planSprint()` veya `spawnWorkers()` fonksiyonunda task sayısı ile worker sayısı ayrı ele alınmalı

### 2. Heartbeat Timestamp Sorunu (YÜKSEK)
- **Sorun:** Worker heartbeat'leri yanlış timestamp yazıyor (10:05, 10:10 vs gerçek: 11:23+)
- **Etki:** Auditor tüm worker'ları "stale agent" olarak işaretledi — 42+ false positive alert
- **Fix:** Worker heartbeat yazımında `new Date().toISOString()` kullanıldığından emin ol, timezone sorununu kontrol et

### 3. Dashboard Done Counter Gecikmesi (ORTA)
- **Sorun:** 8 worker result yazmasına rağmen dashboard `Done: 0/8` göstermeye devam etti
- **Etki:** Brain EVALUATE fazına geçene kadar progress güncellenmiyor — anlık durum yanıltıcı
- **Fix:** Auditor scan loop'unda `.result` dosyalarını da kontrol edip dashboard'u güncellemeli

### 4. Auditor Alert Overflow (DÜŞÜK)
- **Sorun:** Stale agent alertleri her scan'de tekrar oluşturuldu → 42+ duplicate alert
- **Etki:** Dashboard alert listesi gereksiz büyüdü
- **Fix:** Alert dedup mekanizması ekle — aynı source+message kombinasyonu zaten varsa tekrar ekleme

### 5. DEBT.md Boş Tablo (PRE-EXISTING)
- **Sorun:** Sprint cleanup DEBT.md tablosunu boşaltmış, `debt-002.test.ts` dolu tablo bekliyor
- **Etki:** 4 test fail (1023/1027 passed)
- **Fix:** Sprint 18 ile ilgili değil — debt tablosu boşken test'in pass etmesi gerekir

### 6. GO_WITH_TECH_DEBT Oranı Yüksek (DÜŞÜK)
- **Sorun:** 5/8 task GO_WITH_TECH_DEBT olarak değerlendirildi
- **Olası Sebep:** Worker'lar `tsc --noEmit` ve `vitest run` çalıştırdı ama coverage doküman görevleri için düşük çıktı
- **Fix:** Doküman görevleri için farklı GO kriterler tanımlanmalı (coverage check gereksiz)

---

## Dashboard Son Durumu

```json
{
  "sprint": { "phase": "COMPLETE", "status": "COMPLETE" },
  "progress": { "done": 8, "active": 0, "total": 8 },
  "alerts": [],
  "agents": []
}
```

---

## Metrikler

| Metrik | Değer |
|--------|-------|
| Planlanan görev | 8/10 |
| Tamamlanan görev | 8/8 |
| DONE | 3 |
| GO_WITH_TECH_DEBT | 5 |
| NO_GO | 0 |
| Toplam süre | 260s (~4.3 dk) |
| Worker model | sonnet (tümü) |
| tmux window | 8 |
| Üretilen doküman | 8 dosya, ~135 KB |
| Test regresyon | 0 (4 fail pre-existing) |
| tsc --noEmit | CLEAN |
| Auditor alert | 42 (tümü false positive) |
| Stale agent | 7/8 (heartbeat timestamp bug) |

---

## Sprint 19 İçin Önerilen Fix'ler

1. **P0 — Task Queue:** `max_workers` sadece paralel worker limiti olsun, tüm görevler planlanıp kuyrukta beklesin
2. **P1 — Heartbeat Timestamp:** Worker heartbeat'te doğru UTC timestamp kullanılmalı
3. **P1 — Dashboard Progress:** Auditor `.result` dosyalarını tarayıp done counter'ı güncelesin
4. **P2 — Alert Dedup:** Aynı alert tekrar oluşturulmasın
5. **P2 — Doc Task Criteria:** Doküman görevleri için coverage check'i kaldır veya farklı eşik belirle
6. **P3 — DEBT.md Test:** Boş tablo durumunu handle et

---

## Sonuç

Orkestrasyon motoru **çalışıyor.** Plan → Spawn → Execute → Evaluate → Retro → Cleanup döngüsü baştan sona tamamlandı. 8 worker paralel çalıştı ve hepsi başarılı sonuç üretti. Ana kırık noktalar planner'ın task sayısı limiti ve heartbeat timestamp hatası. Bu ikisi düzeltildiğinde motor 10+ paralel görev için hazır.
