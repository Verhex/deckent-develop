---
name: project_dashboard_control_plane
description: F7 Dashboard vizyonu — god-level UI/UX + tam işlevsel + user-enterprise friendly tek kontrol düzlemi + API auth düzeltme
metadata: 
  node_type: memory
  originSessionId: 89c2bcbe-de85-4468-bb6d-2fa12f4b7622
---

Alperen direktifi (2026-05-31, Sprint 208 sırasında): Dashboard god-level olmalı. **UI/UX harika tasarım + konsept**, TAM işlevsel, herkesin (developer/şirket/sade kişi — 3-yüz) her işini kontrol edebildiği ve anladığı, **tamamen user-enterprise friendly** tek kontrol düzlemi. ROADMAP-GOD-LEVEL.md §F7'ye eklendi.

**Mevcut sorunlar (2026-05-31):**
- Dashboard 14 React bileşeni var (src/dashboard/src/components/: Dashboard, SprintControl, AgentGrid, MemoryView, DebtTable, Terminal, SprintHistory, CheckpointPanel, Settings, Login) AMA işlevsel değil + güncel değil.
- Terminal kullanımı zayıf (embedded web terminal ADR-062 var ama yetersiz).
- **API auth-disabled olmadan çalışmıyor:** `DECKENT_API_AUTH_DISABLED=1 npx deckent serve` şart — bu insecure, prod-safe değil. server.ts + middleware/auth.ts + auth-config.ts düzeltilmeli.

**F7 task'ları (ROADMAP):** F7-001 API auth fix (P1), F7-002 canlı veri parite (P1), F7-003 UI/UX redesign (P1), F7-004 terminal güçlendir, F7-005 sprint kontrol paneli, F7-006 enterprise görünüm (multi-tenant + RBAC-aware UI + audit viewer), F7-007 memory/ADR/debt explorer, F7-008 onboarding sihirbazı (sade kişi).

**Why:** Dashboard = deckent'in 3-yüz kontrol düzlemi (developer/şirket/sade kişi). CLI güçlü ama herkes CLI kullanamaz; god-level ürün için görsel, sezgisel, herkesin anladığı bir arayüz şart. Enterprise satışı için RBAC-aware multi-tenant dashboard kritik.

**How to apply:**
- F7 YÜKSEK öncelik — F3/F4 (process mode + enterprise) ile paralel ilerleyebilir (RBAC/tenant/audit UI'ları F4 backend'ine bağlanır).
- API auth (F7-001) ilk — disabled-flag bağımlılığı kalkmalı, güvenli default + temiz token akışı.
- UI/UX redesign tam kapsamlı (modern, responsive, dark/light, bilgi mimarisi) — "harika tasarım + konsept" Alperen'in vurgusu.
- Sprint'lerde dashboard task'ları react-specialist/frontend-designer agent'larına gider.

İlgili: [[project_deckent_trinity_anchor]] (3-yüz), [[project_embedded_web_terminal]] (ADR-062 terminal), [[project_deckent_god_level_vision]] (no-minimum), [[feedback_scale_up_autonomous]] (çok-task).
