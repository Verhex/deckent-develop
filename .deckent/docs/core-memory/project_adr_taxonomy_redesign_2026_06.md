---
name: project_adr_taxonomy_redesign_2026_06
description: "ADR 4-layer taxonomy redesign delivered (2026-06-30) — G/D/UG/UP classes, 89→41, renumbered to adr-g/d-NNN; the canonical record of how ADRs work now."
metadata: 
  node_type: memory
  type: project
  originSessionId: 19160cf1-778d-4af6-bd98-df55797bdb2d
---

**ADR Governance Redesign — TESLİM (2026-06-30).** deckent ADR'leri tek-tek (89 madde, interaktif) incelenip 4-katmanlı taksonomiye geçirildi. Bu, ADR'lerin artık nasıl çalıştığının **canonical kaydı**.

## 4-Katman Taksonomi (precedence G > U > D)
- **ADR-G** (Global / Constitution) — immutable, publisher-fed, her yere ships, LLM ihlal edemez. **34 adet.**
- **ADR-D** (Dogfooding / Dev) — yalnız contributor (deckent'i derleyen). **7 adet.**
- **ADR-UG** (User Global) — kullanıcının global tercihleri (henüz boş; şema hazır).
- **ADR-UP** (User Project) — kullanıcının proje-içi kararları (henüz boş; şema hazır).
- **Precedence G > U > D:** global-anayasa kullanıcıyı, kullanıcı dogfood-dev'i ezer.

## Renumber + Sonuç
- Eski `adr-NNN` → yeni **`adr-g-NNN` / `adr-d-NNN`** (sınıf-içi renumber). **89 → 41 aktif** (34 G + 7 D), 3 arşiv (005/009/038), 1 sil (061 → AEGIS-RD'ye bırakıldı). G-003/D-003 kasıtlı boşluk.
- **Crosswalk (eski→yeni + her kararın gerekçesi):** `.analysis/adr-review-crosswalk.md` = SSOT karar-kaydı.
- **ADR-AUTHORING-STD** (ADR-G-019, eski 036): her ADR bugünü (current-state) + yarını (intent/roadmap) şeffaf belgeler; büyük ADR'ler `##`-section / XML-şema.

## Sistem-entegrasyon (canlı, doğrulandı)
- **DB:** `memory.db` `entries` +5 kolon (`adr_class`/`scope`/`immutable`/`source_authority`/`enforcement_level`); 34 G + 7 D dolu.
- **Parser:** `src/core/adr-file-sync.ts` yeni `adr-{class}-{num}` şema (legacy `adr-NNN` fallback korundu).
- **Dosyalar:** `docs/adr/adr-g/d-NNN-*.md` (41) + `docs/adr/archive/` (3); README korundu.
- **Rule-files:** `.claude/.codex/.gemini/.cursor` (brain/auditor/worker) yeni-ID inject ediyor.
- **Validator:** `scripts/adr-validator.mjs` yeni-şema + ·-header + ##-section (`lint:adr` 41 ✓).
- **Exports:** `.brain/exports/*.md` yeniden-üretildi. Test: memory 152 ✓ · importer 1448 ✓ · build ✓.
- Commit'ler: `ab43169c` (migration) · `2660eff8` (rules+born) · `9b622fe3` (066-W) · `f68c8595` (064-W) · `14f4992c` (validator).

## Doğan-iş + dedicated-task (MASTER-PLAN'de izli)
- **29 born-item** → `docs/MASTER-PLAN.md` (Kaynak=ADR-rev): ROLE-GUARD · DEP-TOOL · BRAIN-FAILOVER · WORKER-LIVE-TRACE · MODE-RENAME (sprint→evrensel) · EVOLUTION-SELECTIVE-SCALE · NERVOUS-GENERALIZE · vb.
- **ADR-064-W** (dedicated, scheduler-correctness): planDispatch-wire — model(`planContinuous`: DONE+fix-agg) ↔ runtime(`respawnEligibleTasks`: DONE∪MRR+collision) **dep-semantik DIVERGENCE**; olduğu-gibi-wire S280-MRR-deadlock'u regresse eder → reconcile + tam dispatch-test şart.
- **ADR-087-W** (dedicated): auditor ~6 spawnSync (sync-fn: checkBoundaryViolations/defaultRunGitStatus/GrepEvidence/runVitestOnFiles) → async-cascade.
- Eski governance-reset metodolojisi + sonraki-oturum kuyruğu bu memory'ye merge edildi (`project_adr_review_progress` kapandı).

İlişkili: [[feedback_adr_documents_today_and_tomorrow]] · [[feedback_governance_aligns_with_direction_pivot]] · [[project_hermes_deckent_direction_2026_06]] · [[project_aegis_methodology]] (ADR-061 sil) · [[project_task_type_taxonomy_vision]] (→G-028) · [[project_topp_continuous_dispatch]] (→G-026).
