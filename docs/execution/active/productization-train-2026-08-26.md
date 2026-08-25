# Productization Train — 2026-08-26 (triage-sonrası ilk sıra)

> Operating-policy §4 gereği MASTER'dan seçilmiş sıralı çalışma-ağacıdır; yeni work-identity
> içermez. Tam sınıflandırma: `.analysis/master-triage-2026-08-26/`. Node'lar tüketildikçe
> SİLİNİR (delete-on-consume); kalıcı kayıt MASTER satır-evidence'ıdır.

## Sıra (her node = 1 dogfood-dalgası; DIRECTIVES-hattı aynen)

1. **KANIT-6 batch'i** — 3298 · 3169 · 4070 · 4080 · 7096 · 8095: kanıt-toplama + receipt
   ile kapanış (540/60 emsali; kod-yazımı beklenmiyor, çıkarsa satır KOSULABILIR'e düşer).
2. **Kalite-kapıları dalgası** — 202 (tsc-FAIL→FIX beslemesi + mock-ratchet) + 203
   (deletion-aware honest-gate) + 201 (ERRORS.md forensic dilimi) + 205 (sıcak-yol lint'i).
3. **Replay-merdiveni** — 3300 → 3301 → 3302 → 3303 → 3304 (sıralı basamaklar; hepsi yeşilse
   3299 zincir-receipt'le kapanır). Önkoşul: 3302 için 3276/3285 (bkz node 5).
4. **RECOVERY-BORN mikro-paketi-1** — 3171 · 3173 · 3174 · 3175 · 3176 · 3177 (event-truth
   A3 altyapısıyla hizalı altı dar satır; tek 6-task dalga).
5. **Settlement-atomiği dalgası** — 3276 + 3285 (atomic landing-proposal + host-owned
   checkpoint; 3302'nin önkoşulu) + 3282/3295 ardışığı.
6. **Mekanik süpürme** — 7141 (131-throw typed dönüşümü, gen-repair-directives'le) + 3315
   (spawnSync kuyruğu) + 204 + 207.

## Paralel şeritler (owner-kararına bağlı — trene girmedi)
- **Owner-penceresi (42):** günlük 20-30dk karar-turu önerisi — her gün 3-5 satır karar.
- **Platform-lane (47 ENV):** karar bekliyor — (a) GitHub-CI matrix ADVISORY-kanıt + typed
  acceptance-amendment'ları, (b) gerçek Win/mac makine, (c) ertele.
- **Dilimleme-seansları (91 PROGRAM):** haftada 2 seans; seans-başına 2-3 ebeveyn → dilim
  önerileri owner-admission'a.
