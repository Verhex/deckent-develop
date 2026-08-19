---
name: feedback-full-suite-cadence
description: Full test suite her landing'de DEĞİL, 3 landing'de bir koşulur (Alperen 2026-08-19)
metadata:
  type: feedback
---

Full vitest suite'i her landing sonrası koşma; **3 landing süreci sonrasında bir** koş.
Aradaki landinglerde scoped/hedefli testler + gate'ler (hermetic, i18n, operating-policy,
master-plan) yeterlidir. Sayaç: sprint-564 landing'i = 1. koşu (2026-08-19); sonraki full
suite ≈ 3 landing sonra.

**Why:** Full suite ~15 dk + yüksek CPU/RAM; her landing'de koşmak landing temposunu
boğuyor. Baseline-parite driftleri (PLATFORM.md, operation-ingress, hermetic sayaçları)
zaten gate'lerde/3'lük koşuda yakalanıyor.

**How to apply:** Landing checklist'inde "full suite" adımını landing-sayacına bağla;
[[feedback_vitest_16gb_local_cap]] limitleri (VITEST_MAX_FORKS=2, ≤16GB) full koşuda
aynen geçerli. Playbook Ders-13 bu kadansla amend edildi.
