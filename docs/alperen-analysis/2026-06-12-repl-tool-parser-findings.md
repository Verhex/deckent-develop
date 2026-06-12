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
