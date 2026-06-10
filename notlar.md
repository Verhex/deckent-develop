# 🌙 Otonom Loop Notları — Alperen için sabah okuması

> Bu dosya CC'nin otonom sprint-döngüsünün analiz/başarısızlık günlüğü. Alperen 2026-06-11 gece:
> "madde sırası M-L-K-D-C-B/F-B/MF-diğer; build:all'ı kendin koş; sprint kill yok bekle;
> başarısızlıkta analiz notu buraya; onay alma, auto-mode devam."

## Operating model (bu döngü)
- Döngü: DIRECTIVES yaz → commit → `deckent plan --no-confirm` → `deckent start` → monitor → her result disk-verify → sprint sonu: lint + kayıt-düzelt + commit/push + `npm run build:all` (CC koşar) → sonraki sprint.
- Madde sırası: **M → L → K → D → C → B/F → B/MF → (gerisi CC seçimi: G/H/I/J/N/O/E/P)**.
- Model-katmanlama: fable=planlama, opus=zor-çekirdek, sonnet=normal, haiku=doc.
- Mikro-task + dependency grafiği; opt-in/default-off + fail-safe + cache-prefix korunumu (F1-TOK).
- Sprint kill YASAK — bekle, sonuç döner; exit-without-result → FIX ya da CC manuel respawn.
- /mcp restart GEREKMEZ bu döngüde (dogfood CLI dist'ten koşar; build:all yeni dist'i yazar).

## Sprint günlüğü (kronolojik — başarı kısa, başarısızlık detaylı)

### Sprint 278 — COMM-1 worker-to-worker iletişim ✅ (B-küme, 11/11)
- Başarı. SharedMemory+HandoffProtocol worker prompt/result'a bağlandı (dormant→canlı), WK-6 de kapandı.
- 11/11 disk-verified, tsc temiz, ghost-finalize 6. temiz koşu. build:all CC-otonom koştu (`0c27371b`).
- Not: sprint-reporter 3 task'a GO_WITH_TECH_DEBT etiketledi ama CC disk-verify hepsini DONE doğruladı (testler yeşil) — eval-rubric muhafazakarlığı, gerçek borç değil.
- Kalan (COMM-1 follow-up): flow/autonomous/Brain comms genişlemesi + dashboard görünürlük (M-küme'de WK-5 ile birleşebilir).

### Sprint 279 — M-küme: Dashboard/Monitoring/Wire (başlıyor)
- Sıra (Alperen): M ilk. WK-5 (docker live-monitor SSE) + WK-nervous + WK-cost + WK-import + DASH-001/002 + F7-ENT-verify + F7-004.
- Başladı 2026-06-11. Durum: planlanıyor.

---
_(Yeni girişler en alta eklenir. Başarısızlıkta: ne oldu, kök-neden, alınan aksiyon, kalan risk.)_
