# ADR-020: Rich Sprint Output — 7-section summary (Sprint 044)

**Status:** accepted

**Date:** 2026-04-16

**Sprint:** _To be backfilled_

---

**Status:** accepted

**Context:** Sprint sonuç çıktısı tek satır metric'ti. Kullanıcı kaç task tamamlandı, hangi dosyalar değişti, ne öğrenildi gibi bilgilere erişemiyordu.

**Decision:** 7 bölümlü rich output: Header, Results, Changes, Tests, Agents, Learnings, Next Steps. ANSI renk desteği ve `NO_COLOR` env var desteği eklendi.

**Consequence:** Her sprint sonunda kullanıcı tam resmi görür. `NO_COLOR=1` ile CI-friendly düz metin çıktısı alınır. Sprint log formatı da güncellendi — `.brain/sprints/sprint-NNN.md` aynı 7 bölüm yapısını kullanır.
