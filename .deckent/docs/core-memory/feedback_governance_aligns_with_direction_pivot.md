---
name: feedback_governance_aligns_with_direction_pivot
description: "Deckent'in TÜM governance/operasyon katmanları (mimari/workspace/worker/brain/auditor/ADR/docs) 2026-06-29 yön-pivotuyla hizalı ilerlemeli; pivot ADR'ye bağlanmalı."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 19160cf1-778d-4af6-bd98-df55797bdb2d
---

Alperen (2026-06-29): "Projenin mimarisi yönü + workspace/worker/brain/auditor/ADR'ler **bugün karar verdiğimiz yön doğrultusunda ilerlemeli — bunu unutma.**"

**Why:** Yön MASTER-PLAN + memory + analiz dosyalarında yaşıyor, ama **derin governance katmanları** (özellikle her worker/brain/auditor prompt'una auto-inject edilen **ADR'ler**) eski yönü encode etmeye devam ederse, sistem dogfood / CC / Codex / Gemini ile çalışırken **eski davranışa geri kayar**. Pivot'un fiilen GOVERN etmesi için en derin katmana işlenmeli; aksi halde pointer'lar "bilgi" olur, "kanun" olmaz.

**How to apply:**
- Her deckent işinde (planlama/sprint/dogfood/el-kod) önce **pivot-yönüne karşı kontrol et**: [[project_hermes_deckent_direction_2026_06]] + `docs/MASTER-PLAN.md`.
- **Pivot bir ADR olarak yakalanmalı** (taslak: `.analysis/adr-095-terminal-first-pivot-draft.md`, status=proposed). ADR-yazımı **yalnız-Alperen-onayı** → onay sonrası `.brain/memory.db`'ye (build + `/mcp restart` gated). Kabul edilince ADR her worker/brain/auditor prompt'una **mandatory constraint** olarak otomatik enjekte olur = "buna göre ilerle" mekanizması.
- Pointer'lar eklendi (2026-06-29): `CLAUDE.md` (CC) · `DECKENT.md` (Codex/Gemini) · `.deckent/workspace/IDENTITY.md` (worker'lar) → **Aktif Yön** bloğu.
- **Rule dosyaları** (.claude/.codex/.gemini → brain/worker/auditor) sprint-mekaniği = korunacak moat; yönü ADR-auto-inject ile alır (gerekirse belt-and-suspenders direkt anchor — Alperen kararı).
- **Architecture docs** (`docs/architecture/*`) DOC-1 ile pivot'a göre güncellenir.
- ADR-katmanlama (deckent/proje/global) + AEGIS-redesign + ADR-revision ayrı plan-maddeleri (GOV pillar).

Related: [[project_hermes_deckent_direction_2026_06]] · [[feedback_dual_perspective_dogfood_product]] · [[feedback_no_minimum_no_mvp_deckent]].
