# ADR-089: Backend-Agnostic Worker Observation + Per-Worker Independent Backends

**Status:** accepted (principle + CLI/MCP parity) · firecracker/cloud backends = roadmap (proposed)

**Date:** 2026-06-11

**Related:** ADR-022 (CLI/MCP Feature Parity), ADR-027 (Hybrid Spawn Backend), ADR-066 (Provider Independence), WK-5 (docker live-monitor)

---

**Decision:**

1. **`watch` is backend-agnostic.** `deckent watch [worker]` observes a worker on **whatever backend it actually runs** — docker (`docker logs -f`), subprocess (stdout/stderr stream), tmux (attach), and (roadmap) firecracker microVM / cloud / ollama-host — resolved **per-worker from sprint/worker state**, NOT hardwired to tmux. "`deckent watch` dediğin worker neredeyse orada çalışır." Backend-forcing flags (`deckent watch --docker`, `--tmux`, …) select an explicit view.

2. **CLI/MCP parity — NO semantic split (ADR-022).** `deckent watch` (CLI) and `deckent_watch` (MCP) are the **same capability over the same core**. The current divergence (CLI `watch` = tmux-split vs MCP `deckent_watch` = event-stream subscribe) is a **parity violation to be removed**: one core resolves worker→backend→stream; CLI + MCP are thin wrappers calling it. A command does the same job in CLI and MCP.

3. **Per-worker independent backends (vision).** Each worker / each flow can declare its **own execution backend** — tmux, docker, firecracker microVM, cloud, ollama-host — chosen independently. Both the orchestrator (spawn) AND the observation layer (watch) are **backend-pluggable**; observation follows the worker wherever it runs.

**Context:** Today `watch` is tmux-centric and CLI/MCP semantics diverged (ADR-022 review, 2026-06-11). Workers already run on docker/tmux/subprocess (ADR-027). Product vision (Alperen 2026-06-11): make EVERY worker + EVERY flow **independently backed** — including future firecracker microVMs + cloud — so deckent scales from a laptop to a heterogeneous fleet and a user can observe ANY worker on ANY backend uniformly. Example: some workers on tmux, some docker, some firecracker, some cloud, some ollama-host — one `watch` UX across all.

**Consequence:**
- A **backend-observation abstraction** — per-backend attach/stream adapter (`docker logs -f`, subprocess pipe, tmux attach, cloud log API). `watch` resolves the worker's backend from sprint/worker state → dispatches the right stream.
- CLI + MCP share one observation core (parity); the CLI=tmux / MCP=event-stream divergence is unified.
- New backends (firecracker, cloud) plug in by implementing a **spawn adapter + observe adapter** — no `watch`/orchestrator rewrite.
- Builds on ADR-027 (hybrid spawn backend), WK-5 (docker live-monitor `logs -f` + `deckent watch --follow`, Sprint 279).

**Current state (2026-06-11):** docker/tmux/subprocess spawn exist (ADR-027); `watch --follow` docker `logs -f` added (Sprint 279 WK-5); CLI `watch` still tmux-centric; `deckent_watch` MCP = event-stream subscribe (diverged). Backend-agnostic resolution + CLI/MCP unification + firecracker/cloud are **work items** → MASTER-PLAN "ADR-Analizi Türetilen İşler → WATCH-W" + roadmap.

**Roadmap (proposed):** firecracker microVM backend; cloud backend; per-worker backend declaration in the task spec; uniform fleet-wide observation. These are forward-looking (not built); the backend-agnostic-watch + CLI/MCP-parity principle is decided/accepted now.

Cross-ref: ADR-022 (parity), ADR-027 (hybrid spawn), ADR-066 (provider independence), ADR-062 (embedded web terminal — PTY worker-attach), §S DESK-1 (god-level observation surface).
