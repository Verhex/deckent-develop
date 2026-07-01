---
name: feedback_adr_documents_today_and_tomorrow
description: "ADR'ler (özellikle ADR-G) bugünü + yarını (hedef-niyet/roadmap) ŞEFFAF belgeler — sadece mevcut-durum değil, evrim-yönü + neden."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 19160cf1-778d-4af6-bd98-df55797bdb2d
---

Alperen (2026-06-30, ADR-015/routing review): "Bunun ADR/dokümante kısmı **bugünü VE yarını hedef-niyetlerle açıklasın, şeffaf olsun.** Bu bizim için önemli ve kritik."

**Why:** ADR'ler deckent'in nihaileşme/evrim yolunu LLM-agent'lara + contributor'a + user'a **şeffaf** aktarmalı. Statik "şu an böyle" yetmez; "buraya gidiyoruz + neden" gerekir — özellikle **sürekli-gelişen tool'larda** (örn. learned-routing: bugün 6-level + routeTaskV2, yarın öğrenen model/effort matrisi + auto-model-upgrade). Şeffaf intent, agent'ların ve katkıcıların yönle hizalı çalışmasını sağlar.

**How to apply:** Her ADR (özellikle ADR-G) şu yapıyla: **Context → Decision (today-state) → Intent/Roadmap (tomorrow: hedef-niyet + neden) → Consequences**. Today ile tomorrow ayrı ama bağlı yazılsın. Bu, ADR-036 (ADR Governance Integration) içinde **authoring-standard** olarak kurallaştırılacak (crosswalk born-item: ADR-AUTHORING-STD). İlk uygulama: ADR-G-006 (Routing & Model/Effort Selection — learned & evolving).

Related: [[project_hermes_deckent_direction_2026_06]] · [[feedback_governance_aligns_with_direction_pivot]].
