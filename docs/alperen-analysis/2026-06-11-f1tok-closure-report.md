# F1-TOK Kapanış Raporu — Token/Limit Optimizasyonu (Sprint 273-275)

> ⚠️ **ERRATA (2026-06-11 akşam):** Bu rapordaki $-eşdeğer A/B sayıları `deckent usage`'ın
> stale model-key fiyat bug'ıyla hesaplandı (opus+haiku=$0 sayılıyordu). Gerçek kazanç
> **−%33** (sonnet-only $0.67→$0.45), −%58 değil; ayrıca kazanç sprint 276-280'de geri eridi
> ve retro "Limit burn" satırı hiç wire edilmemiş (0-caller). Düzeltilmiş analiz:
> [2026-06-11-sprint273-now-usage-calibration.md](2026-06-11-sprint273-now-usage-calibration.md) §4-5.

> Kaynak hipotez: `docs/alperen-analysis/2026-06-10-weekly-limit-reverse-engineering.md`
> (boot-cw fleet yazımının %44-63'ü haftalık limiti yiyor; prompt skorları 85/90 → ≥97).
> Bu rapor 3 sprint'in (273 Faz 0+1+1,5, 274 Faz 2, 275 kanıt) GERÇEK ledger verisiyle sonucu.

## TL;DR
- **Prefix-küçültme ÇALIŞTI:** task-başı $-eşdeğer **$0.52 (273) → $0.22-0.24 (274-275)**, ~%55 düşüş.
  Kaynak: ADR-037 worker-operative (20.3K→~1K), Skills-first blok sırası, ADR render dedupe,
  goCriteria/persona çelişki temizliği, gitignore prefix-stabilizasyonu.
- **Warm-spawn ÇALIŞMADI (dürüst negatif sonuç):** cache-gate ölçümü **warm-share %0** —
  docker worker'ları arasında server-side prompt-cache PAYLAŞILMIYOR. Her worker ayrı Claude
  CLI session'ı (ayrı tmpfs HOME, ayrı cache namespace) → warmer'ın yazdığı cache'i kimse okumuyor.
  Warm AÇIKKEN boot-cw payı %63, KAPALIYKEN (274) %56 — fayda yok, sadece 45s sprint gecikmesi.
  **Karar: cache_warm default-off + dogfood config'inde KAPATILDI.**

## Ölçülmüş A/B (gerçek transcript ledger, `deckent usage --sprint`)

| Sprint | Tema | Task-başı $-eşdeğer | Boot-CW payı | Not |
|--------|------|---------------------|--------------|-----|
| 271 | (optimizasyon öncesi) | $0.36 | %58 | kaynak-gözlem sprint'i |
| 272 | (orkestrasyon) | $0.10 | %38 | opus-ağır, az-CW karışım |
| **273** | **F1-TOK öncesi düzen** | **$0.52** | %57 | eski prompt sırası — baseline |
| **274** | **prefix-küçültme aktif** | **$0.22** | %56 | adr-operative+Skills-first+kind-limit |
| **275** | **+ warm-spawn deneyi** | **$0.24** | %63 | warm fayda sağlamadı (cache-gate FAIL) |

> Mutlak $ task-mix'e duyarlı (sonnet/haiku oranı sprint'e göre değişir); asıl sinyal
> **273→274 aynı-tür işte %58 düşüş** ve **275'te warm'ın boot-cw'yi düşürmemesi**.

## Neyin işe yaradığı / yaramadığı

**İşe yarayan (kalıcı, default-on):**
1. **ADR-037 operative-extract** — prompt'taki en büyük tek balast (20.3K) → ~1K worker-operative özet
   (tam metin DB'de; `prompt.adr_render: operative` ile işaretli bölüm basılır).
2. **Skills-first blok sırası** — paylaşılan skill blokları prefix'in başında (renderTemplate'te
   fiilen uygulandı; determinizm guard'ı kilitledi).
3. **ADR render dedupe** — başlık+status tek-basım (saf tekrar düştü, içerik korundu).
4. **Çelişki temizliği** — goCriteria full-suite↔targeted çelişkisi + persona "full test suite"
   ifadeleri targeted-verify'a hizalandı (false-NO_GO riski + token israfı azaldı).
5. **gitignore prefix-stabilizasyonu** — runtime artıkları (heartbeat.pid/sprint.lock/backup)
   git-status'u kirletmiyor → CC worker system-prompt prefix'i sprintler arası sabit.
6. **Ölçüm altyapısı** — limit-ledger (transcript'ten gerçek sayım; `.result` beyanları ~%30
   gerçeklikteydi) + `deckent usage` CLI/MCP/REPL-slash + retro "Limit burn" satırı + cache-gate.

**İşe yaramayan (kapatıldı):**
- **Warm-spawn (cross-worker cache):** mimari sınır — subscription+docker modelinde her worker
  izole session, server-side cache cross-session paylaşılmaz. Cache yalnız aynı-worker çok-tur'da
  ısınır (zaten hit-rate %100 orada). Cross-worker ısınma mümkün değil; mekanizma kodda kaldı
  (default-off) ama deckent-dev'de KAPALI.

## Yapısal sınır (boot-cw tabanı)
Boot-CW payı ~%56-63'te taban yapıyor çünkü **her worker prompt-prefix'ini bir kez yazmak ZORUNDA**
(izole session). Bunu daha da düşürmenin tek gerçek yolu prefix'i KÜÇÜLTMEK (yapıldı) — paylaşmak
değil (mimari olarak imkânsız). Gelecekte daha agresif kazanç: kalan büyük ADR'lere de operative
bölüm yazmak (insan/CC işi, opt-in) + persona/skill prompt'larını operative-trimle.

## Kalan / sürekli
- **Sürekli izleme:** `deckent usage` (7-gün) + her retro'daki "Limit burn" satırı haftalık gözden
  geçirme için yeterli — ayrı sprint gerektirmez.
- **Opsiyonel gelecek:** ADR operative-extract'i en ağır 3-5 ADR'ye yaymak (her biri küçük CC işi).

**Sonuç: F1-TOK tamamlandı.** Hedef (task-başı ≤$0.45, kalite sabit) aşıldı; warm-spawn'ın
çalışmadığı dürüstçe ölçüldü ve kapatıldı. Token süreci kapanır; kalan yalnız pasif izleme.
