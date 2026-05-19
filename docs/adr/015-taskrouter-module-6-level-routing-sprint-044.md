# ADR-015: TaskRouter Module — 6-level routing (Sprint 044)

**Status:** accepted

**Date:** 2026-04-16

---

**Context:** Task → provider atama mantığı sprint-controller'da inline'dı ve genişletilemezdi. Yeni routing kuralı eklemek sprint-controller'ı her seferinde değiştirmeyi gerektiriyordu.

**Decision:** Ayrı `TaskRouter` modülü oluşturuldu. 6 seviyeli öncelik sırası: config → force → agent → skill → worker → fallback.

**Consequence:** Yeni routing kuralları sprint-controller'a dokunmadan eklenebilir. Her seviye bağımsız test edilebilir. Router, task metadata'sını (model, effort, scope) okuyarak otomatik provider seçimi yapar.

**Note (evolution):** The `TaskRouter` module is still current — `src/orchestra/task-router.ts` (`routeTask`, `TaskRouterConfig`) performs per-task provider + agent + skill routing. The **agent/skill selection it delegates to evolved to v2**: `src/core/routing-engine.ts` (`routeTaskV2`) "replaces `selectAgent()` + `selectSkills()` with a unified, intent-based decision" (3-layer: intent-classifier → activation-engine → routing-engine) per **ADR-028 (Decision-Engine V1→V2)**, default since Sprint 067. The original 6-level priority (config → force → agent → skill → worker → fallback) remains the foundational design. Behavior unchanged; documentation alignment only.
