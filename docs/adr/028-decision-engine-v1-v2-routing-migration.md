# ADR-028: Decision-Engine V1 → V2 Routing Migration

**Status:** accepted

**Date:** 2026-04-16

**Accepted:** Sprint 130

---

**Context:** Sprint 031'de keyword-based DecisionOrchestrator tasarlandı (6-step pipeline). Sprint 066'da intent-based V2 routing engine (routeTaskV2) ile değiştirildi.

**Decision:** V1 kod silinmeyecek — referans implementasyonu olarak korunacak. @deprecated ile işaretlendi.

**Consequences:** 4 kaynak dosya + 38 test maintained but unused in production. decision-logger.ts hâlâ V2 tarafından kullanılıyor.

**Note (verified vs code):** V2 confirmed — `routeTaskV2` in `src/core/routing-engine.ts`; `src/core/config.ts` defaults `routing_engine: 'v2'` and accepts `['v1','v2']` (V1 retained, selectable, `@deprecated`). Provenance: per `CLAUDE.md`/`IDENTITY.md` routing v2 has been the default since Sprint 067 (V2 introduced Sprint 066). The "4 source files / 38 tests" figures are a point-in-time snapshot (legacy V1 surface, not pinned). Behavior unchanged; documentation alignment only.

---

**Amendment — 2026-06-11 (ADR-review, code-alignment): V1 confirmed live + 2 minor inconsistencies.** `DecisionOrchestrator` (V1) is real (`src/orchestra/decision-engine.ts:101`), selectable via `routing_engine: 'v1'`, V2 default — ADR accurate. Two minor drifts found:
1. **features-manifest mislabel:** the Dead Features list (`docs/reference/features.md`, auto-generated) marks `decision-orchestrator-v1` as **dead/superseded**, but per this ADR V1 is **deprecated-but-retained-selectable** (reference impl), not dead. Manifest classification should read "deprecated/retained", not "dead".
2. **planner fallback:** `src/orchestra/sprint-planner.ts:468` uses `config.routing_engine ?? 'v1'` while `config.ts:1130` defaults to `'v2'` — with a fully-loaded config the `?? 'v1'` never fires, but it is an inconsistent default (should be `?? 'v2'`). 

Both tracked as MASTER-PLAN "ADR-Analizi Türetilen İşler → ADR-028-W" (low priority). md+db senkron.
