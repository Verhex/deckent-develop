# ADR-G-014: Spawn Backend, Options & Observation

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=`SpawnBackendFactory` (auto = Windows→subprocess / else→docker; tmux deprecated; explicit-selection — **no fallback chain**) + per-task backend override + `SpawnOptions`/`ProviderSpawnOptions`/`SpawnBackendOptions` chain + `watch --follow` (docker `logs -f`) + auditor-in-process role-split red-line (scope advisory/soft per ADR-G-020) → tomorrow=firecracker/cloud/ollama-host backends + WATCH-W (CLI≡MCP unify) + per-worker backend declaration + WORKER-LIVE-TRACE
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-027 (Hybrid Spawn Backend) + ADR-007 (SpawnOptions Interface) + ADR-089 (Backend-Agnostic Worker Observation) · **Supersedes:** —
**Crosswalk:** ADR-027 (+ ADR-007 fold + ADR-089 merge) → ADR-G-014

> **Note (ADR-D-003 vacancy):** old ADR-007 (SpawnOptions) was a dev-class candidate, but the spawn-options contract is inseparable from the backend it spawns onto — so it is **folded here** into the global spawn law. This is why the dev-class number **ADR-D-003 is intentionally vacant** (documented, not back-filled).

---

## Context

Three spawn-layer decisions, recorded separately, describe one cohesive concern — *how deckent launches a worker, with what options, and how that worker is observed wherever it runs*:

- **ADR-007 (2026-04-16)** defined `SpawnOptions { allowedTools?, autoApprove? }`: Brain computes an `--allowedTools` restriction from each worker's scope, and `autoApprove` adds the provider's permission-bypass flag.
- **ADR-027 (Sprint 123 → revisited Sprint 139)** addressed hybrid backends. Its original verdict — "hybrid backend permanently rejected, one backend at a time" — was **split** by the 2026-06-11 review: the *role-split* form ("worker in Docker + auditor as a separate subprocess") stays rejected, but the *single-backend-per-sprint* claim is **superseded** — per-task backend override is now live and heterogeneous per-worker backends are embraced.
- **ADR-089 (2026-06-11)** made `watch` **backend-agnostic** — observe a worker on whatever backend it actually runs — and flagged the CLI/MCP `watch` semantic divergence as a parity violation to remove.

The 2026-06-30 review merges all three into one ADR-G law (runtime behavior the product carries to every user), **preserving the role-mix red-line** while **embracing the heterogeneous-backend vision**.

---

## Decision (Today)

### 1. Hybrid spawn backend — `SpawnBackendFactory`

deckent spawns workers onto one of three backends through `SpawnBackendFactory`. **`auto` resolves deterministically — Windows → `subprocess`, otherwise → `docker`; `tmux` is deprecated (warns on use); any backend may be selected explicitly. There is NO docker→tmux→subprocess *fallback chain*:** `create()` instantiates the resolved backend, and `createAsync()` checks `isAvailable()` and **throws** if unavailable — it does not silently fall back to another backend. Each backend fully implements the `SpawnBackend` interface (E2E-covered, Sprint 139 Tasks 17–19); no backend is a partial citizen.

### 2. Per-worker / per-task independent backends

Backend selection is **per-worker, not per-sprint**. `sprint-spawner.ts` resolves an `effectiveBackend` per task — a `- Backend: docker|tmux|subprocess` directive (Sprint 252 PSL-1, mixed-fleet Sprint 248–254) overrides the run default, so different workers in the same run can execute on different backends. Heterogeneous fleets (some workers on tmux, some on docker) are first-class.

### 3. Role-mix red-line — PRESERVED (from ADR-027)

```xml
<role-mix-redline>
  <preserved>Brain is NEVER a worker; the Auditor runs IN-PROCESS (sprint-controller),
    independent of any spawn backend.</preserved>
  <rejected>Role-based backend-mixing — "worker in Docker + auditor as a SEPARATE
    subprocess" — remains rejected. The auditor needs no backend of its own.</rejected>
  <why>Cross-backend observability is solved by the append-only event-stream (ADR-G-018),
    NOT by giving each role its own backend. Per-WORKER heterogeneity (§2) is embraced;
    per-ROLE backend-split is not.</why>
</role-mix-redline>
```

### 4. SpawnOptions interface (folds ADR-007)

```xml
<spawn-options>
  <base>SpawnOptions { allowedTools?: string; autoApprove?: boolean }  (tmux module)</base>
  <chain>ProviderSpawnOptions (core/provider.ts) → SpawnBackendOptions extends
    ProviderSpawnOptions (orchestra/spawn-backend.ts) — multi-provider extension;
    allowedTools/autoApprove semantics UNCHANGED.</chain>
  <allowedTools>Brain computes the --allowedTools restriction from the worker's
    scope.filesWrite (sprint-spawner writeTargets → allowedTools).</allowedTools>
  <autoApprove>Maps to each provider's own permission-bypass flag, per-provider:
    claude --dangerously-skip-permissions · codex --dangerously-bypass-approvals-and-sandbox
    · gemini yolo. (Claude CLI rejects bypass as root → the docker backend runs host-user.)
    SECURITY (explicit): the Docker backend FORCES autoApprove:true (IMMUTABLE,
    spawn-backend-docker.ts) — a docker worker ALWAYS runs permission-bypassed, BY DESIGN:
    the container is the isolation boundary, so full autonomy is contained, not gated.
    Non-container backends honor the opts value. (ADR-G-020 authority context.)</autoApprove>
</spawn-options>
```

The array-args security invariant (ADR-G-002) is carried uniformly for the **outer backend spawn** (the `spawn`/`spawnSync` of the docker/tmux/subprocess process) — never re-derived per backend. **Caveat:** the *inner* worker command is assembled as a joined **string** (`provider-command-spec.ts` `parts.join(' ')`) from controlled parts (model · prompt-FILE path · flags — no untrusted interpolation), not array-args; tightening it is tracked under G-002's command-string concern (WORKER-CMD-ARRAY).

### 5. Backend-agnostic `watch` (folds ADR-089)

`deckent watch [worker]` observes a worker on **whatever backend it actually runs** — resolved per-worker from sprint/worker state, never hardwired to tmux:

```xml
<backend-agnostic-watch>
  <docker>docker logs -f  (watch --follow, WK-5 Sprint 279)</docker>
  <subprocess>stdout/stderr pipe stream</subprocess>
  <tmux>session attach</tmux>
  <roadmap>firecracker microVM / cloud log-API / ollama-host</roadmap>
  <resolution>TARGET: one observation core resolves worker → backend → stream.
    Today the watch path branches per-backend (docker vs heartbeat/log-tail vs tmux);
    backend-forcing flags (--docker / --tmux) select an explicit view. WATCH-W unifies it.
    Also: the observe-side `monitor-adapter` selects a CONFIG-level backend and its `auto`
    resolves to tmux — conflicting with the spawn-factory `auto`→docker; align-or-deprecate
    (BACKEND-AUTO-ALIGN).</resolution>
</backend-agnostic-watch>
```

### 6. CLI / MCP watch-parity — no semantic split

`deckent watch` (CLI) and `deckent_watch` (MCP) are the **same capability over the same core** (ADR-G-011 thin-wrapper). The current divergence — CLI `watch` = tmux-split vs MCP `deckent_watch` = event-stream subscribe — is a **parity violation to be removed** (work-item WATCH-W): one core resolves worker→backend→stream, and CLI + MCP are thin wrappers over it. A command does the same job on both surfaces.

---

## Intent / Roadmap (Tomorrow)

- **New backends (roadmap):** firecracker microVM, cloud, and ollama-host backends — so deckent scales from a laptop to a heterogeneous fleet. Each plugs in by implementing a **spawn adapter + an observe adapter**; no `watch`/orchestrator rewrite. (ADR-027's "revisit when distributed execution is needed" point has arrived; this is ORCH-BE.)
- **WATCH-W:** unify the CLI=tmux-split vs MCP=event-stream divergence into one backend-agnostic observation core with one semantic across CLI + MCP. (MASTER-PLAN: WATCH-W, P1.)
- **Per-worker backend declaration:** each worker/flow declares its own execution backend in the task spec; both the orchestrator (spawn) and the observation layer (watch) are backend-pluggable.
- **Ties WORKER-LIVE-TRACE (ADR-G-025):** the per-worker live progress-stream observes a worker on any backend, everywhere (terminal / CLI / MCP / dashboard), live or last-snapshot — `.log` tailing is insufficient.

---

## Consequences

**(+)** One spawn law spans launch + options + observation across a heterogeneous backend fleet; per-worker backends are embraced while the role-mix red-line (Brain≠worker, auditor in-process) holds; `watch` follows a worker onto any backend; the `SpawnOptions` contract and the array-args invariant are uniform across every backend. New backends are additive (an adapter pair), not a rewrite.

**(−)** `auto` is deterministic (no fallback chain) and `tmux` is deprecated; the Docker backend forces `autoApprove:true` (contained-by-container, but a docker worker always runs permission-bypassed). The array-args invariant is uniform for the outer spawn but the inner worker-command is a joined string of controlled parts (WORKER-CMD-ARRAY). The CLI/MCP `watch` semantic split is a live parity violation until WATCH-W lands, and the observe-side `monitor-adapter` `auto` disagrees with the spawn-factory `auto` (BACKEND-AUTO-ALIGN); firecracker/cloud/ollama-host backends are roadmap; per-worker backend declaration in the task spec is forward-looking. Scope/file-authority enforcement on each backend is advisory/soft today (ADR-G-020 V1.0).

---

## References / Absorbed

- **Absorbs:** ADR-027 (Hybrid Spawn Backend — role-split red-line preserved; single-backend-per-sprint superseded) · ADR-007 (SpawnOptions Interface — folded; **ADR-D-003 intentionally vacant**) · ADR-089 (Backend-Agnostic Worker Observation + per-worker independent backends + CLI/MCP watch-parity).
- **Cross-ref:** ADR-G-011 (Surface Parity & Thin-Wrapper — CLI≡MCP, WATCH-W) · ADR-G-018 (Verification Protocol & Event-Stream — cross-backend observability substrate) · ADR-G-020 (Authority, Roles, Flow & Enforcement — worktree/scope enforcement, autoApprove security) · ADR-G-025 (Process Resilience & Live Observability — WORKER-LIVE-TRACE) · ADR-G-002 (spawnSync Security Pattern — array-args invariant, uniform per backend) · ADR-G-008 (Provider Abstraction & Fleet — per-provider bypass flags).
- **Born work-items:** WATCH-W (backend-agnostic watch + CLI/MCP unify, P1) · ORCH-BE (firecracker/cloud/ollama-host backends + per-worker backend declaration) · WORKER-LIVE-TRACE (with ADR-G-025) · WORKER-CMD-ARRAY (inner worker-command string→array-args, G-002 family) · BACKEND-AUTO-ALIGN (`monitor-adapter` `auto` ↔ spawn-factory `auto`, under WATCH-W).
- **Direction:** `.analysis/adr-review-crosswalk.md` (rows 027 + 007 + 089 → ADR-G-014), `.analysis/hermes-vs-deckent-direction-decisions.md`.
