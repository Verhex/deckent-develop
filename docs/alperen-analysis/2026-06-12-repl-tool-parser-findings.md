# REPL Tool-Parser Dogfood Bulguları — 2026-06-12

**Bağlam:** deckent native REPL içinde Claude Fable 5 motoru ile `<deckent_tool>` aksiyon protokolünün canlı testi (write / bash / approval / deny).

## Bulgular

### 1. Multi-tag collapse (P1)
Tek asistan-turunda birden fazla `<deckent_tool>` etiketi gönderildiğinde yalnızca **bir** tanesi (sonuncusu) yürütülüyor; gerisi sessizce düşüyor. İki kez üst üste tekrarlandı (4 bash komutu → sadece son `ls` çıktısı döndü).
- **Olası kök:** parser `match` kullanıyor (`matchAll` değil) veya round-trip tek-aksiyon-per-turn varsayıyor (kuyruk yok).
- **Beklenen:** turdaki tüm etiketler sırayla kuyruğa alınmalı, her biri ayrı onaya düşmeli.

### 2. Prose-konumu hassasiyeti (P1)
Etiket uzun bir açıklama metninin sonunda dururken parser yakalamadı; aynı etiket çıplak (önünde-arkasında metin yok) gönderilince anında çalıştı.
- **Etki:** asistanın doğal 'önce açıkla, sonra aksiyon' davranışıyla çakışıyor → 'AÇIKLAMA YAPMA, yalnızca tek satır' kuralı bu kırılganlığın semptomu.
- **Beklenen:** etiket prose içinde herhangi bir konumda güvenilir yakalanmalı (`matchAll`, konumdan bağımsız).

### 3. Sessiz-düşürme (P2, 1+2'nin sonucu)
Yakalanmayan/atlanan etiketler için kullanıcıya hiçbir uyarı yok — 'wired ≠ çalışıyor'. Yakalanan vs atlanan tag sayısı loglanmalı; çok-tag durumunda açık uyarı verilmeli.

## Çalışan davranışlar (regresyon-guard)
- **Write + approval round-trip:** ✅ `.deckent/repl-approval-test.md` yazıldı.
- **Bash tek-komut:** ✅ `node --version` → v24.15.0.
- **Deny akışı:** ✅ onaylanmayan aksiyon → `[deckent] iptal edildi: deckent_bash` (net sinyal, sessiz-fail yok).

## Öneri
`matchAll` + tur-içi tool kuyruğu + per-tool onay + atlanan-tag uyarısı. Önceliği: P1 multi-tag/prose-konumu birlikte düzeltilmeli (aynı parser yolu).

---

## KAPANIŞ — Sprint 285 (2026-06-12, CC kapanış-notu)

Üç bulgu da kapatıldı (5-task sprint; teşhis-önce deseni):
- **#1 multi-tag:** Kök parser DEĞİLDİ (tüm-tag exec-loop sağlamdı) — motor da sıralıydı; gerçek kırılganlık Ink confirm **tek-slot**'uydu (eşzamanlı/re-entrant ezilme) → **FIFO confirm-kuyruğu** (`createConfirmQueue`, [i/N] gösterge, deny-birini-geç-devam). 7/7 test.
- **#2 prose-konumu:** Kök stream-toplamaydı — `assistant` complete-message blokları `collected`'a girmiyordu → blok-birleştirme + max-length reconciliation; 22-case konum-matrisi yeşil. "AÇIKLAMA YAPMA" sistem-prompt kısıtı kaldırıldı (semptom-kural bitti).
- **#3 sessiz-düşürme:** parsed-vs-executed telemetri + malformed-tag görünür i18n-uyarı.
- **Bonus (CC-ek-bulgu):** `turnInput` modele yalnız SON tool-sonucunu veriyordu → TÜM ardışık sonuçlar beslenir.

Vakalar: 285-003 sentetik-NO_GO (eval-misfire; kod sağlamdı) · 285-005 OOM-137 (artifact'ler kurtarıldı). Açık-debt: PTY-harness deny/multi-tag senaryo-ayarı + exit-kodu (REPL-TOOL-DEBT-1, MASTER-PLAN).
