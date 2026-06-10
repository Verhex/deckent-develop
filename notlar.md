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

### Sprint 279 — M-küme: Dashboard/Monitoring/Wire ✅ (11/11, commit `36292002`)
- Başarı. 11/11 disk-verified DONE; tsc temiz; build:all CC-otonom koştu (dashboard vite 2282 modül). ghost-finalize yine temiz koşu.
- İşler: WK-import (core→orchestra import-cycle çözüldü, ADR-008 — event-stream core/'a taşındı + shim), WK-nervous (panic-gate 10s timeout→auto-proceed, SAFETY_FLOOR muaf), WK-cost (cost_guard mid-sprint dispatch-stop, default-off), WK-7 (auditor O(n) spawnSync→async-batch cache pre-warm), DASH-001 (/api/kill/all), DASH-002 (sidebar bell-badge, lucide/emoji-yasak), WK-5 (docker logs -f follow), F7-ENT-verify (4 enterprise endpoint regresyon-kilit), COMM-1 dashboard panel, +2 doc.

**⚠️ Sabah için 2 bulgu (Alperen oku):**
1. **Gerçek regresyon yakalandı+düzeltildi (executor Test 6).** WK-nervous timeout'u eski "approve sonsuz bekler" testini kırdı (COMMIT_PUSH artık 10s sonra auto-proceed). Worker eski testi güncellememişti (scope'undaydı — gerçek miss). CC düzeltti: test SAFETY_FLOOR action'a (KILL_LIVE_SPRINT) çevrildi → "muaf-sınıf sonsuz bekler" semantiği korundu. **Baseline-stash kanıtı**: diğer 23 test-dosya düşüşü 279-ÖNCESİ pre-existing (flaky/stale-count: mcp-help 32→34 tool, serve "Deckent is ready" mesaj-değişimi, doctor ollama-provider, sprint-controller STACK_COMMANDS mock, nervous-faz1-smoke detector-severity). 279 yalnız bu 1 regresyonu getirdi, o da kapandı.
2. **managed-docs RETRO render i18n locale-leak** (ayrı bug, K/O-küme follow-up). RETRO her sprint VISION.md/beta-tracker.md/blueprint.md (EN doc'lar) içine TR başlık yazıyor (`Metric|Value`→`Metrik|Değer`, `Total Tasks`→`Toplam Task`). Render tüm doc'lara proje-default locale (TR) uyguluyor, per-doc hedef-dili yok sayıyor. Bu sprintte revert ettim (commit'lenmedi); kalıcı fix managed-docs render'a per-doc locale parametresi gerektirir.

- **DURDU — Alperen "bu sprintten sonra dur, yarın sabah devam" dedi (2026-06-11).** Otonom loop duraklatıldı. Sıradaki: **L-küme** (human-interaction kalan: REPL-001/002 slash parity, APPROVE-007b, PLANOBS, BOT-2d, DEFER, CKPT).

---
_(Yeni girişler en alta eklenir. Başarısızlıkta: ne oldu, kök-neden, alınan aksiyon, kalan risk.)_
