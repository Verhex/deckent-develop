---
name: project-nervous-activation-plan
description: "Nervous System — Proactive Meta-Orchestrator (ADR-040). Phase 1 smoke 12 detector live Sprint 145, Phase 2-3 post-beta Sprint 198+ aktivasyon. W-K.6 stream."
metadata: 
  node_type: memory
  originSessionId: 831d4c9f-6acf-418d-aeab-2f47a8741e57
---

**Nervous System = Proactive Meta-Orchestrator** — Brain'in üstünde bir layer, sürekli observe + detect + propose + dispatch. ADR-040 accepted.

### Architecture

```
observer.ts          → file/event/heartbeat watch
       ↓
detector-registry.ts → 12 detector (stale_heartbeat, doc_drift, cost_spike, ...)
       ↓
decision-engine.ts   → severity assess
       ↓
proposer.ts          → action proposal (notification, auto-fix, escalate)
       ↓
dispatcher.ts        → user notify / auto-execute (authority-matrix gated)
       ↓
executor.ts          → actual action (within scope)
       ↓
authority-matrix.ts  → RBAC check (Brain/Auditor/User authority)
       ↓
runtime-scope-check.ts + history.ts
```

### Phase progression

- **Phase 1 (Sprint 145):** Smoke — 12 detector live, log-only mode
- **Phase 2 (Sprint 198+):** Auto-propose mode — user notification, accept/reject UI
- **Phase 3 (Sprint 200+):** Auto-execute mode — authority-matrix gated, low-severity auto-fix
- **Phase 4 (Sprint 205+):** Multi-tenant, ML-driven severity learning

### 12 Detector (Phase 1)

1. stale_heartbeat — worker heartbeat >2dk
2. doc_sync_ground_truth_mismatch — IDENTITY.md vs gerçek code count
3. cost_spike — sprint cost > N USD
4. boundary_violation — git diff scope dışı (Auditor)
5. circular_dependency — task graph cycle
6. mcp_stale_cache — long-running MCP build sonrası
7. lock_file_stale — `.locks/` >5dk
8. test_regression — vitest fail count artış
9. config_drift — `.deckent/config.json` runtime vs disk mismatch
10. provider_health — Claude/Codex/Gemini availability check
11. memory_decay_due — `.brain/memory.db` decay window aşıldı
12. partial_result_promote — Sprint 151 OOM safety

### Sprint 183 Nervous PLAN-phase pasif

- FSWatcher 500ms debounce
- Phase guard: EXECUTE-only (PLAN'da takılma yok, Sprint 182 14dk debug)
- DEPENDENCY_BLOCKED event spam debounce (state-change-only emit)

### W-K.6 stream (Sprint 198+)

- K-20: Nervous Phase 2 proposer UI (CLI/dashboard accept/reject)
- K-21: Self-modifying detector wire (ADR-039)
- K-22: Authority matrix Phase 3 RBAC
- K-23: ML-driven severity (post-Phase 3)

### Sprint 195 deckent_nervous_* MCP tools

5 tool already:
- `deckent_nervous_subscribe` — push notification listen
- `deckent_nervous_accept` — pending action accept
- `deckent_nervous_reject` — pending action reject
- `deckent_nervous_status` — dashboard
- `deckent_nervous_config` — authority mode + override

### Beta scope

- **Beta INCLUDE:** Phase 1 (12 detector live log-only) — yeterli
- **Post-beta:** Phase 2 proposer UI + accept/reject loop

İlgili: [[project_deckent_agentic_os_vision]], [[project_aegis_methodology]], [[project_topp_continuous_dispatch]]
