# ADR-026: God Object Split Stratejisi — Faz 1-3 Tamamlandı (Sprint 076)

**Status:** accepted

**Date:** 2026-04-16

---

**Context:** `sprint-controller.ts` zamanla god object haline geldi (1300+ satır). Sprint 036'da brain.ts split'i yapılmıştı ama sprint-controller yeniden şişti. Test ve bakım güçlüğü arttı.

**Decision:** 3 fazlı kademeli split stratejisi:
- **Faz 1 (Sprint 072):** `sprint-phases.ts` — 7 sprint faz fonksiyonu extract edildi (`runPlanPhase`, `runSpawnPhase`, vb.)
- **Faz 2 (Sprint 075):** `sprint-utils.ts` — shared sprint utility fonksiyonları extract edildi
- **Faz 3 (Sprint 076):** `result-collector.ts` — `waitForResults()` ve IPC+fs.watch döngüsü extract edildi

Her fazda backward compatibility sprint-controller re-export layer üzerinden korundu.

**Consequence:** `sprint-controller.ts` orchestration koordinatörü rolüne döndü — iş mantığı bağımsız modüllerde. orchestra/ modül sayısı 37'den 47'ye çıktı. Her yeni modül bağımsız unit test kapsamı kazandı. Kademeli split stratejisi büyük refactor riskini minimize etti.

**Note (verified / evolution):** Faz 1-3 confirmed against code — `sprint-phases.ts`, `sprint-utils.ts`, `result-collector.ts` (`waitForResults` + IPC) all exist; `src/orchestra/brain.ts` is a ~53-line *"Slim Re-export Layer"* re-exporting from `sprint-controller.js` ✓. The split **continued past Faz 3** (many more dedicated `sprint-*` modules now — see the ADR-024 note). The "orchestra 37→47" figure is a Sprint-076 snapshot and is now far higher (drift-prone — canonical module counts are not pinned in ADRs; see `docs/architecture/architecture.md`). Behavior unchanged; documentation alignment only.

---

**Forward link — modularization groundwork for MOD-SPLIT (Alperen 2026-06-11):** The kademeli god-object split (this ADR + ADR-024) is the **modular foundation** the future **Community/Pro split (MOD-SPLIT, MASTER-PLAN §8)** will build on. Final shape (ADR-033 amendment, Sprint 281): **SAME codebase + modular enterprise-layer** — community = MIT, enterprise module separately licensed; NOT a fork / separate product / 2-repo split. The clean module boundaries established here (independent `sprint-*` / `core/` modules, thin re-export coordinators) are exactly what enables drawing the community↔enterprise line + a license-loadable enterprise layer. The MOD-SPLIT prereq "modül sınırı envanteri (enterprise-layer dosya haritası)" leverages this split work. Cross-ref: §8 MOD-SPLIT, ADR-065, ADR-033 (amendment DONE — Sprint 281).

**Amendment log:** 2026-06-11 — MOD-SPLIT modülerleştirme-temeli forward-link'i eklendi (Alperen ADR-review); MASTER-PLAN §8 MOD-SPLIT'e ADR-026 ref edildi. Aynı gün re-audit'te forward-link nihai MOD-SPLIT kararıyla düzeltildi (2-repo→aynı-kod-tabanı-modüler; pending→DONE). md+db senkron.

---

## Amendment — Sprint 281 (2026-06-11, ADR-review re-audit, full code-verification)

**Classification: dogfood** (mimari strateji; MOD-SPLIT temeli üzerinden ürün-yapısına dolaylı etki).

**Re-verified (Faz 1-3'ün üçü de gövde-okuma):** Faz 1 `sprint-phases.ts` — 7 faz-fonksiyonu orijinal adlarıyla canlı (ADR-024 amendment kanıtları) ✓ · Faz 2 `sprint-utils.ts` — 22 export, 456 LoC ✓ · Faz 3 `result-collector.ts` — `waitForResults` (:505, fs.watch + fallback-polling) + IPC `ipc-registry` köprüsü (:29-34) ✓ · backward-compat re-export'lar `sprint-controller.ts:173/:176` ✓.

**Bakım-bayrağı (ADR-024 re-audit'inden devir):** `sprint-controller.ts` bugün **1513 LoC** — Sprint 136 slim'i (209 LoC) sonrası kademeli geri-büyüme. Split-stratejisi geçerli; boyut-disiplini sürdürülemedi. MOD-SPLIT modül-sınırı envanteri çıkarılırken controller yeniden ele alınır (ayrı iş-maddesi yok, bu kayıt yeterli). md+db senkron (Alperen ADR-review).
