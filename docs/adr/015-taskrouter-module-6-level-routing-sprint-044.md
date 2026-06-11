# ADR-015: TaskRouter Module — 6-level routing (Sprint 044)

**Status:** accepted

**Date:** 2026-04-16

---

**Context:** Task → provider atama mantığı sprint-controller'da inline'dı ve genişletilemezdi. Yeni routing kuralı eklemek sprint-controller'ı her seferinde değiştirmeyi gerektiriyordu.

**Decision:** Ayrı `TaskRouter` modülü oluşturuldu. 6 seviyeli öncelik sırası: config → force → agent → skill → worker → fallback.

**Consequence:** Yeni routing kuralları sprint-controller'a dokunmadan eklenebilir. Her seviye bağımsız test edilebilir. Router, task metadata'sını (model, effort, scope) okuyarak otomatik provider seçimi yapar.

**Note (evolution):** The `TaskRouter` module is still current — `src/orchestra/task-router.ts` (`routeTask`, `TaskRouterConfig`) performs per-task provider + agent + skill routing. The **agent/skill selection it delegates to evolved to v2**: `src/core/routing-engine.ts` (`routeTaskV2`) "replaces `selectAgent()` + `selectSkills()` with a unified, intent-based decision" (3-layer: intent-classifier → activation-engine → routing-engine) per **ADR-028 (Decision-Engine V1→V2)**, default since Sprint 067. The original 6-level priority (config → force → agent → skill → worker → fallback) remains the foundational design. Behavior unchanged; documentation alignment only.

---

## Amendment — Sprint 281 (2026-06-11, ADR-review re-audit, full code-verification)

**Classification: BOTH** (routing = mixed-fleet ürün-vaadi; `- Provider:` per-task override doğrudan user-yüzü).

**Re-verified (gövde-okuma):** Modül-ayrıklığı gerçek — `routeTask` (`task-router.ts:248`) + `TaskRouterConfig` (:29), **sprint-controller'da 0 referans**; tüketiciler decision-engine / task-mode-runner / mid-sprint-adapter / sprint-planner / sprint-spawner ✓ · 6-seviyeli öncelik canlı (docblock :235-241 + body :279+), günün bileşimi: 1 config-override (`skill_routing`) → 2 `forceModel` → 3 **`task.provider`** (per-task `- Provider:` override — sonradan eklenen seviye) → 4 agent-tercihi → 5 availability-guard → 6 registry-default ✓ · Note'un `routeTaskV2` delegasyonu (`routing-engine.ts:267`) ✓.

**Evrim (Note-sonrası 4 kazanım):** WM-2c **SSOT routing-key** (:280-284 — kanonik `task.type → taskKindToIntent → INTENT_TO_ROUTING_KEY`, legacy `detectTaskType` geri-uyum) · Sprint 219-015 surface-agent bonus (:254-257, `applyUserSurfaceBonus` — refactorer-collapse önleyici, ADR-079) · Sprint 202 registry-default fallback (:262-266 — pure-Ollama config sessizce claude'a düşmez) · `resolveWorkerAuth` per-task auth-precedence (:170-182, `task.authMode > config.auth_mode > 'subscription'`). md+db senkron (Alperen ADR-review).
