# ADR-028: Decision-Engine V1 → V2 Routing Migration

**Status:** accepted

**Date:** 2026-04-16

**Accepted:** Sprint 130

---

**Context:** Sprint 031'de keyword-based DecisionOrchestrator tasarlandı (6-step pipeline). Sprint 066'da intent-based V2 routing engine (routeTaskV2) ile değiştirildi.

**Decision:** V1 kod silinmeyecek — referans implementasyonu olarak korunacak. @deprecated ile işaretlendi.

**Consequences:** 4 kaynak dosya + 38 test maintained but unused in production. decision-logger.ts hâlâ V2 tarafından kullanılıyor.

**Note (verified vs code):** V2 confirmed — `routeTaskV2` in `src/core/routing-engine.ts`; `src/core/config.ts` defaults `routing_engine: 'v2'` and accepts `['v1','v2']` (V1 retained, selectable, `@deprecated`). Provenance: per `CLAUDE.md`/`IDENTITY.md` routing v2 has been the default since Sprint 067 (V2 introduced Sprint 066). The "4 source files / 38 tests" figures are a point-in-time snapshot (legacy V1 surface, not pinned). Behavior unchanged; documentation alignment only.
