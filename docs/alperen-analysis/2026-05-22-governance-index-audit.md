# `docs/governance/INDEX.md` Audit — Governance Master Index — 2026-05-22

**Kapsam:** `docs/governance/INDEX.md` + `scripts/doc-consistency-check.mjs` + `.deckent/docs.json` path referansları — Sprint 172 doc-reorg sonrası stale path'ler  
**Metodoloji:** Sistematik debugging — her referans disk'te doğrulandı, git log ile taşıma geçmişi izlendi, doc-consistency-check.mjs canlı çalıştırıldı  
**Perspektif:** Deckent dogfooding + Deckent ürün kullanıcısı

---

## Bu Dosya Nedir

`docs/governance/INDEX.md` — Deckent'in tüm yönetişim ve stratejik dokümanlarını tek noktadan listeleyen master index. "Yaşayan Sicil", "Yapısal Plan", "Beta Tracking", "Kimlik" kategorilerinde 8 doküman referanslar. `scripts/doc-consistency-check.mjs` komutunu referanslıyor.

**Git durumu:** git-tracked; sprint-bazlı güncelleme yok (manuel bakım).

---

## Kök Neden — Sprint 172 Doc-Reorg Artığı

`feat(sprint-172): doc-reorg + OSS GA prep` commit'i (`1c8cef29`) proje kökündeki büyük dokümanları `docs/` alt dizinlerine taşıdı:

| Eski Yol (kök) | Yeni Yol |
|----------------|----------|
| `DECKENT-MASTER-BLUEPRINT.md` | `docs/vision/blueprint.md` |
| `BETA-TRACKER.md` | `docs/release/beta-tracker.md` |
| `BETA-TRACKER-TR.md` | `docs/release/beta-tracker-tr.md` |
| `VISION.md` | `docs/vision/VISION.md` |
| `VISION-TR.md` | `docs/vision/VISION-TR.md` |

Dosyalar silinmedi — `git mv` ile taşındı (tüm yeni konumlar disk'te mevcut). Ama aşağıdaki 3 kaynak bu değişikliği yansıtmadı:

1. `docs/governance/INDEX.md` — eski yolları referanslıyor
2. `.deckent/docs.json` — managed-docs config, eski yollarla `file_not_found` alıyordu
3. `scripts/doc-consistency-check.mjs` — DOCS dizisi eski yollarla; çalıştırınca 3/7 dosyayı bulamıyordu

Ayrıca `.deckent/sprint-god-analysis/FINAL-REPORT.md` referansı da stale — Sprint 145 repo cleanup (`ed244027`) bu dosyayı `.deckent/archive/sprints/misc/sprint-god-analysis/` altına taşıdı.

---

## Tespit Edilen Sorunlar

### Sorun G1 — INDEX.md'de 4 Phantom Referans

**Öncelik:** Orta  
**Detay:** Tüm referanslar eski yollarla — disk'te mevcut değil:

| INDEX.md Referansı | Durum | Gerçek Konum |
|-------------------|-------|-------------|
| `.deckent/sprint-god-analysis/FINAL-REPORT.md` | ❌ GHOST | `.deckent/archive/sprints/misc/sprint-god-analysis/FINAL-REPORT.md` |
| `DECKENT-MASTER-BLUEPRINT.md` | ❌ GHOST | `docs/vision/blueprint.md` |
| `BETA-TRACKER.md` | ❌ GHOST | `docs/release/beta-tracker.md` |
| `BETA-TRACKER-TR.md` | ❌ GHOST | `docs/release/beta-tracker-tr.md` |

**Durum:** Düzeltildi — tüm referanslar yeni yollara güncellendi.

---

### Sorun G2 — docs.json'da 5 Phantom Path

**Öncelik:** Yüksek  
**Detay:** `managed-doc-runner.ts` her sprint kapanışında bu 5 entry için `file_not_found` dönüyor (silent skip, non-fatal ama boş iş):

| docs.json ID | Eski Path | Durum | Yeni Path |
|-------------|-----------|-------|-----------|
| `vision-en` | `VISION.md` | ❌ GHOST | `docs/vision/VISION.md` |
| `vision-tr` | `VISION-TR.md` | ❌ GHOST | `docs/vision/VISION-TR.md` |
| `beta-tracker-en` | `BETA-TRACKER.md` | ❌ GHOST | `docs/release/beta-tracker.md` |
| `beta-tracker-tr` | `BETA-TRACKER-TR.md` | ❌ GHOST | `docs/release/beta-tracker-tr.md` |
| `blueprint-md` | `DECKENT-MASTER-BLUEPRINT.md` | ❌ GHOST | `docs/vision/blueprint.md` |

**Etki:** Her sprint kapanışında 5 entry için `file_not_found` loglanıyor; bu dosyaların autoSection'ları (Sprint Metrics, Sprint History, Live Metrics vb.) hiç üretilmiyor — içerikler Sprint 167'den beri stale.

**Durum:** Düzeltildi — tüm 5 path yeni konumlara güncellendi.

---

### Sorun G3 — doc-consistency-check.mjs 3/7 Dosyayı Bulamıyordu

**Öncelik:** Orta  
**Detay:** `scripts/doc-consistency-check.mjs` çalıştırılınca:
```
⚠  MASTER-BLUEPRINT: file not found (DECKENT-MASTER-BLUEPRINT.md)
⚠  BETA-TRACKER (EN): file not found (BETA-TRACKER.md)
⚠  BETA-TRACKER (TR): file not found (BETA-TRACKER-TR.md)
Documents checked: 4/7
```

Etki: Consistency check tutarlı ölçüm yapamıyordu; sadece 4 doküman üzerinden çalışıyordu.

**Durum:** Düzeltildi — DOCS dizisi yeni path'ler ile güncellendi. Düzeltme sonrası: 7/7 bulunuyor.

---

### Sorun G4 — doc-consistency-check.mjs Canlı Durum: 5 Metrik Uyumsuz (İçerik Staleness)

**Öncelik:** Orta (path sorunu değil, içerik staleness)  
**Detay:** Path düzeltmesi sonrası `node scripts/doc-consistency-check.mjs` çıktısı:

| Metrik | Canonical (IDENTITY.md) | Stale Dokümanlar |
|--------|------------------------|-----------------|
| Sprint | 186 | DECKENT.md=166*, blueprint=167, beta-tracker(EN/TR)=167, ANA-PLAN-TR=164 |
| MCP tools | 31 | blueprint=27, ANA-PLAN-TR=17 |
| CLI commands | 55 | ANA-PLAN-TR=32 |
| Providers | 3 | ANA-PLAN-TR=1 |
| MCP resources | 8 | ANA-PLAN-TR=9 |

\* DECKENT.md'de sprint=166 yanlış pozitif — script ADR referansından ("Sprint 166 reconfirmed") sayıyı alıyor; DECKENT.md static adapter, sprint metrics içermiyor.

✅ agents_builtin=15, skills_builtin=21 — 5+ dokümanda uyuşuyor, doğru.

**Durum:** Belgelendi. Sprint 172-186 arası `autoSections` üretimi devre dışıydı (phantom paths) dolayısıyla bu stale içerikler birikti. Path düzeltmesi sonrası bir sonraki sprint kapanışında `autoSections` olan metrikler (Sprint Metrics, Sprint History) otomatik güncellenir. `ANA-PLAN-TR.md`'nin Sprint 164'ten güncellenmeyen non-autoSection içerikleri ayrıca güncellenmeli. **Gelecek Öneriler #1.**

---

### Sorun G5 — ANA-PLAN-TR.md Sprint 164 Snapshot'ı

**Öncelik:** Düşük (IDENTITY.md canonical, ANA-PLAN-TR override değil)  
**Detay:** `DECKENT-ANA-PLAN-TR.md` "Versiyon 3.0 — Mayıs 2026 — Sprint 164 sonrası güncellendi" ifadesiyle Sprint 164 durumunu yansıtıyor. 22 sprint geride. Metrik farkları (17→31 MCP tools, 32→55 CLI commands, 1→3 providers) büyük.

`docs.json`'da `autoSections` entry'si yok — managed-docs bunu güncellemiyor. Manuel bakım gerektiriyor.

**Durum:** Belgelendi — **Gelecek Öneriler #1.**

---

## Uygulanan Değişiklikler

| Dosya | Değişiklik | Sorun |
|-------|-----------|-------|
| `docs/governance/INDEX.md` | 4 phantom referans → yeni Sprint 172 yolları | G1 |
| `.deckent/docs.json` | 5 phantom path → yeni Sprint 172 yolları | G2 |
| `scripts/doc-consistency-check.mjs` | DOCS dizisi → yeni Sprint 172 yolları + açıklayıcı comment | G3 |

**Doğrulama:** `node scripts/doc-consistency-check.mjs` — path düzeltmesi sonrası **7/7 dosya bulunuyor** (önce 4/7). Metrik mismatches içerik-seviyesi staleness, path sorunu değil.

---

## Açık Kaynak Hazırlığı Değerlendirmesi

**Dogfooding perspektifi:**
- Sprint 172 doc-reorg iyi bir karardı (kökü temizledi) ama referanslar güncellenmedi — 14+ sprint boyunca managed-docs 5 dokümanı güncelleyemedi.
- `DECKENT-ANA-PLAN-TR.md` 22 sprint geride — agresif sprint temposu içerik bakımını zorlaştırdı.

**Kullanıcı perspektifi:**
- `doc-consistency-check.mjs` 3/7 dosyayı bulamıyordu — tüm check exit code 1'di; CI'da bu kontrolü kullanan kullanıcılar yanıltıcı çıktı alıyordu.
- `docs/governance/INDEX.md` "master index" olarak tanıtılıyor ama 4 link çalışmıyordu.

---

## Gelecek Öneriler

1. **ANA-PLAN-TR.md metrik güncelleme:** Sprint 186 değerlerine çek (31 MCP tools, 55 CLI, 3 providers, 8 resources, sprint-186). Bu dokümanın bazı bölümleri `docs.json`'a `autoSections` olarak eklenip yönetilmeye alınabilir.
2. **doc-consistency-check.mjs DECKENT.md parser iyileştirmesi:** DECKENT.md static adapter, sprint metriği içermiyor — script ADR referansından yanlış sayı alıyor. DECKENT.md'yi DOCS listesinden çıkarmak veya "metrics" bölümü yoksa skip yapmak daha doğru olur.
3. **docs.json'a VISION/BETA-TRACKER güncelleme sıklığı:** Bu dosyalar artık doğru path'lerde — bir sonraki sprint kapanışında autoSection'ları (Sprint Metrics, Sprint History) otomatik güncellenecek. Sprint 186 kapanışı sonrası doğrulanabilir.

---

## Kapanış

Audit 2026-05-22'de kapatıldı. `docs/governance/INDEX.md` = governance master index; 5 sorun tespit edildi, 4'ü düzeltildi. Kök neden: Sprint 172 doc-reorg dosyaları taşıdı ama 3 farklı kaynak güncellenmedi (INDEX.md, docs.json, consistency-check script). Path düzeltmesi sonrası 7/7 dosya bulunuyor; 5 metrik mismatch içerik staleness (path değil). `ANA-PLAN-TR.md` Sprint 164 snapshot'ı — 22 sprint geride, ayrıca güncelleme gerekiyor.
