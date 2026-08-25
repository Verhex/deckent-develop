---
name: feedback-full-suite-cadence
description: Full test suite her landing'de DEGIL, 5 landing'de bir kosulur (Alperen amendment 2026-08-26; onceki 3'tu)
metadata:
  type: feedback
---

Full vitest suite'i her landing sonrasi kosma; **5 landing sureci sonrasinda bir** kos
(Alperen 2026-08-26 gece amendment'i: "cok vakit kaybettiriyor, 5 turda 1 kosalim" —
onceki 3-landing kadansi 2026-08-19). Aradaki landinglerde scoped/hedefli testler +
20-gate lint + `tsc --noEmit` yeterlidir. Sayac: 2026-08-26 gece munhasir kosum
(38743/0 yesil, C-dalgasi landing'i) = son kosum; sonraki full suite 5 landing sonra.

**Why:** Full suite olculen maliyeti ~21 dk/kosum (38.7k test; 2026-08-26 gecesi 4 kosum
~80+ dk). Ayni gece full-suite gercek bir 206-kirmizi regresyon dalgasini yakaladi —
kadans seyreklestirildi ama sifirlanmadi; gate'ler + scoped kosumlar aradaki guvenlik agidir.

**How to apply:** Landing checklist'inde "full suite" adimini landing-sayacina bagla;
[[feedback_vitest_16gb_local_cap]] limitleri (VITEST_MAX_FORKS=2, <=16GB) aynen gecerli.
Verdict'i pipe'siz exit-code'la yakala ([[feedback_disk_evidence_before_claims]] — pipe
son komutun kodunu dondurur, ayni tuzak 2026-08-26 gecesi iki kez bagimsiz uretildi).
Suite kosarken build ALMA: dist-integrity teardown'i orta-kosu build'i
HermeticDistIntegrityError ile duzgunce yakalar ([[feedback_build_after_source_change]]).
