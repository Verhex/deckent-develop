# ADR-040: Nervous System Architecture — Proactive Meta-Orchestrator

**Status:** accepted

**Date:** 2026-04-20

**Sprint:** sprint-147

---

## Context

Deckent'in Sprint 144–146 boyunca yaşanan canlı olaylar, proaktif bir meta-katmana olan ihtiyacı kanıtladı:

- **Sprint 145 08:14 TRT**: DIRECTIVES.md, EXECUTE fazında template'e döndü (463 byte — içerik silinmiş). Sprint duraklayarak manuel müdahale gerektirdi.
- **Sprint 145 test-writer anomalisi**: 14/17 task (%53) aynı agent'a route edildi — normal dağılım %40 eşiğini aştı. Brain fark etmedi, sadece retro sonrası görüldü.
- **Sprint 146 T-146-005 `string;` corruption**: Bir task'ın assignedAgent alanı geçerli bir agent ID yerine TypeScript syntax kalıntısı içeriyordu. Sprint sonuna kadar fark edilmedi.
- **Sprint 146 dead SDL write**: Sprint Decision Log yazma girişimi sırasında silent failure oluştu, record kayboldu.

Bu olayların ortak paydası: mevcut mimaride Brain/Auditor/Worker üçlüsü **reaktif** çalışıyor — hata oluştuktan sonra retro'da görülüyor. Proaktif bir gözlemci katman yoktu.

## Decision

`src/nervous/` altında **Proactive Meta-Orchestrator** (Nervous System) inşa edildi. Sprint 147'nin 22 task'ı bu kararı hayata geçirdi.

### Mimari Pipeline

```
Observer → DetectorRegistry → DecisionEngine → Proposer → Dispatcher → Executor
```

**Observer** (`T-147-004`): 4 event source — EventBus, Filesystem watcher (.tasks/, .brain/, DIRECTIVES.md, .deckent/), 15s Cron tick, Sprint lifecycle events (SPRINT_PHASE_CHANGE, SPRINT_RETRO_COMPLETE).

**DetectorRegistry** — 5 MVP detector:
- `StaleWorkerDetector` (T-147-009): 3dk+ HB yok → WORKER_RESPAWN suggest
- `ScopeCollisionMonitor` (T-147-010): PLAN/EXECUTE fazında çakışan filesWrite → SCOPE_COLLISION_REORDER
- `DebtTrendAnalyzer` (T-147-011): Son 3 sprint >%15 debt rate → DEBT_REPRIORITIZE
- `AgentRoutingHealth` (T-147-012): Agent ID corruption (`string;` pattern) + %40 anomaly detection
- `DirectivesMidSprintProtection` (T-147-013): EXECUTE/FIX fazında DIRECTIVES.md template'e dönüşünü tespit + emergency restore

**DecisionEngine** (T-147-005): DetectorResult → AuthorityMatrix lookup → DecisionOutput (policy + risk + safetyFloor flag).

**AuthorityMatrix** (T-147-003): 4 preset:
- `strict`: low→suggest-30m, medium/high→approve
- `balanced`: low→autonomous, medium→suggest-30m, high→approve  
- `autopilot`: low/medium→autonomous, high→suggest-5m
- `full-auto`: all→autonomous (safety floor hariç)

**5 Locked Safety Floor** (asla override edilemez):
KILL_LIVE_SPRINT, MANUAL_FILE_DELETE, COST_OVER_THRESHOLD, DESTRUCTIVE_GIT, ADR_DEPRECATE_ACCEPTED

**Proposer** (T-147-006): Throttle (5dk groupKey dedup) + severity filter + NervousNotification builder.

**Executor** (T-147-007): 3 mod — autonomous (hemen), suggest-timeout (timer + auto-apply), approve (user decision bekler). Reversible undo desteği.

**Dispatcher** (T-147-018): Context detection (MCP env / TTY) + 3 adapter — MCP, CLI, File. Cross-channel dedup.

**History** (T-147-008): `.deckent/nervous-history.jsonl` append-only audit trail. 30-day retention.

### Action Registry

30 eylem, 4 kategori (T-147-002):
- Low risk (8): DEAD_EVENT_STREAM_CLEANUP, ORPHAN_TASK_ARCHIVE, LOG_ROTATION, CACHE_INVALIDATE, STALE_LOCK_RELEASE, IPC_DIR_CLEANUP, DEBT_TRENDING_REPORT, METRIC_EMIT
- Medium risk (11): DIRECTIVES_WRITE, PROMPT_BUILDER_TWEAK, SKILL_ROUTING_ADJUST, DEBT_REPRIORITIZE, WORKER_RESPAWN, SCOPE_COLLISION_REORDER, ADR_DRAFT, RETRO_AUGMENT, AGENT_PERFORMANCE_FLAG, SPRINT_GATE_ADJUST, TASK_DEPENDENCY_REWIRE
- High risk (11): SPRINT_START, SPRINT_STOP, SRC_MODIFICATION, COMMIT_CREATE, COMMIT_PUSH, AGENT_DISABLE, COST_THRESHOLD_RAISE, ADR_ACCEPT, PROVIDER_SWITCH, CONFIG_MIGRATE, NPM_PUBLISH

### User Interface

**CLI** (T-147-014): `deckent nervous` — dashboard, accept/reject/edit/undo/history/log subcommands.

**CLI Config** (T-147-015): `deckent config nervous set mode <preset>` + per-action override.

**MCP Tools** (T-147-016): 5 yeni tool — deckent_nervous_subscribe, deckent_nervous_accept, deckent_nervous_reject, deckent_nervous_status, deckent_nervous_config. Toplam 27 MCP tool.

**Config Schema** (T-147-017): `nervous_system` section — 3-layer config merge. Default: enabled=false (Sprint 148'de true).

**Sprint Controller Hook** (T-147-021): Her phase geçişinde EventBus'a SPRINT_PHASE_CHANGE + SPRINT_RETRO_COMPLETE emit.

## Consequences

### Positive
- **Proaktif görünürlük**: Hata olmadan önce tespit edilir, kullanıcıya önerilir.
- **Autonomy control**: 4 preset + per-action override ile granüler kontrol. Safety floor garantisi.
- **Audit trail**: Her eylem JSONL history'de, undo destekli.
- **Sprint 145/146 bug'ları yakalanabilir hale geldi**: AgentRoutingHealth T-147-012 direkt olarak `string;` corruption'ı tespit eder.
- **CLI/MCP parity**: ADR-022-v2 gereği her CLI komutu MCP tool olarak da erişilebilir.

### Negative
- **Complexity artışı**: ~3500+ LoC yeni modül. Sprint 148'de canlı dogfood gerekli.
- **enabled=false başlangıç**: Sprint 148 aktifleştirme + Sprint 149 doc sprint zorunlu.
- **Self-modifying risk**: Deckent kendi `src/nervous/`'ini yazıyor — ADR-039 self-modifying detection aktif tutulmalı.
- **FS watcher overhead**: 4 dizin izleme — low-traffic projelerde ≤1% CPU, high-traffic'de monitoring gerekebilir.

## References

### Sprint 145 Canlı Kanıtlar
- DIRECTIVES.md mid-sprint template bug (08:14 TRT, EXECUTE fazı, 463 byte)
- test-writer %53 anomaly (14/17 task, tek agent overload)
- Sprint 145 T-145-006 NotifyDispatcher foundation (Nervous Dispatcher base)
- Sprint 145 T-145-003 EventBus (Observer subscription base)

### Sprint 146 Kanıtlar
- T-146-005: `string;` agent corruption (assignedAgent geçersiz değer)
- T-146-012: ADR-040 placeholder types (nervous-types.ts ~190 LoC, status=proposed)
- Sprint 146 retro: 16/17 done, avg rubric 94

### Sprint 147 Implementation Tasks
- T-147-001: nervous-types.ts genişletme (ObserverEvent, DetectorContext, ActionDefinition, ExecutionRecord)
- T-147-002: action-registry.ts (30 eylem, risk matrix)
- T-147-003: authority-matrix.ts (4 preset, resolvePolicy, safety floor)
- T-147-004: observer.ts (NervousObserver, 4 source)
- T-147-005: decision-engine.ts (DecisionEngine, quiet hours)
- T-147-006: proposer.ts (Proposer, throttle, groupKey)
- T-147-007: executor.ts (Executor, 3 mod, pending approvals)
- T-147-008: history.ts (NervousHistory, JSONL, undo, prune)
- T-147-009: detectors/stale-worker.ts
- T-147-010: detectors/scope-collision.ts
- T-147-011: detectors/debt-trend.ts
- T-147-012: detectors/agent-routing.ts (string; corruption detector)
- T-147-013: detectors/directives-protection.ts (emergency restore)
- T-147-014: cli/commands/nervous.ts (deckent nervous)
- T-147-015: cli/commands/config-nervous.ts (deckent config nervous)
- T-147-016: mcp/tools/nervous.ts (5 MCP tool)
- T-147-017: core/config.ts nervous_system schema extension
- T-147-018: nervous/dispatcher.ts (3 adapter, context detection)
- T-147-019: tests/nervous/integration/ (40+ test suite)
- T-147-020: tests/e2e/nervous-flow.test.ts (canlı sprint sim)
- T-147-021: orchestra/sprint-controller.ts lifecycle event emit
- T-147-022: ADR-040 accept (bu kayıt)

### Design Spec
- `docs/superpowers/specs/2026-04-20-deckent-nervous-system-design.md` (583 satır, 14 section)

---

> **Note (verified vs code, Sprint 172):** `src/nervous/` exists with the full pipeline modules (observer, detector-registry, decision-engine, proposer, dispatcher, executor, authority-matrix, history, runtime-scope-check, detectors/) and the **sprint-controller EventBus hook is wired** (`src/orchestra/sprint-controller.ts` — `emitSprintEvent('SPRINT_PHASE_CHANGE', …)`, "always fires, subscribers optional"). The MCP `deckent_nervous_*` tools exist. Consistent with this ADR's own caveats, the Nervous System is **config-gated / opt-in**: the proactive Observer pipeline is not the default active path, and in practice deckent-dev operates self-modifying sprints via ADR-047 (Manuel Subagent Dispatch) rather than autonomous nervous execution. The "Toplam 27 MCP tool" figure (under "MCP Tools") is a Sprint-147 snapshot — the current count is higher (~31, drift-prone; canonical: `docs/reference/mcp-tools.md`). Behavior unchanged; documentation alignment only.
