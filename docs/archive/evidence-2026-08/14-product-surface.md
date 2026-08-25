# T14 — Product-surface transition residual

**Evidence date:** 2026-08-22
**Mode:** Read-only evidence map
**Verdict:** **LANDED FOUNDATION; PRODUCT OUTCOME OPEN**

The three recorded Run Inspector packages are landed slices of the read-only
observation foundation. They do **not** complete `RUN-INSPECTOR-001`,
Desktop-to-Terminal continuity, broad surface parity, or the primary-development
dogfood outcome. Package-level landing is reported separately from product
closure below.

## Landed package slices

| Slice | Landed capability and evidence recorded in `MASTER-PLAN.md` | Boundary |
| --- | --- | --- |
| Package 1 | Canonical schema-version-1 inspector snapshot; lifecycle sourced only from run-status authority; monotonic revision; tolerant worker/heartbeat/lock parsing; `/api/sprint/live` and task detail adoption; retirement of the separate `sprint-live-service`. Recorded proof: 99/99 targeted checks, TypeScript and gates clean, and a real-binary idle-lifecycle smoke. | Establishes an authority-backed snapshot foundation. It is not the full graph, evidence model, or two-surface experience. Sprint 541 ended `ABORTED`; the record does not convert that dogfood run into success. |
| Package 2 | Authority-plus-archive run listing, additive task lineage, `GET /api/inspector/runs`, Terminal `deckent inspect` table/JSON, and a Desktop authority lifecycle chip. Recorded proof: 109/109 targeted checks, TypeScript and gates clean, and real-binary API/CLI smoke. | Adds list/detail observation paths, not same-run handoff or complete inspector semantics. Sprint 542 ended `ABORTED` despite 4/5 dogfood tasks completing. |
| Package 3 | Revision/cursor snapshot observer, resumable SSE endpoint, `deckent_inspect` MCP twin, and a mounted single-fetch Desktop Runs panel. Recorded proof: 160/160 targeted checks, TypeScript, i18n, and gates clean, plus real-binary SSE/error/MCP smoke. | Closes the package's CLI/MCP read parity gap only. It does not close Desktop/Terminal parity as a whole. Sprint 543 ended with 3/5 dogfood tasks done and two planner-scope `NO_GO` results. |

These slices cover a useful read-only path: canonical lifecycle snapshot → run
list/detail → revisioned stream → CLI/MCP and initial Desktop consumption. The
brief's rule still applies: a fixture, component, endpoint, or package is staged
or landed evidence, not production `DONE`, until runtime/service, protocol,
Desktop, Terminal, identity/provenance, persisted resume, and real-process proof
join under one outcome.

## Still-open product outcome

| Required outcome | Current evidence | What remains before closure |
| --- | --- | --- |
| Full execution graph | `RUN-INSPECTOR-001` remains `OPEN` with truth vector `1/0/0/?/0/?/?`. Current packages expose lifecycle, runs, task lineage, and snapshot streaming. | One versioned graph must cover logical run, attempt, agent, worker, tool and MCP relationships with shared IDs and denominators. Desktop graph/timeline/panels and Terminal run-tree/detail must consume that contract without lifecycle inference. |
| Full evidence coverage | Current package evidence does not demonstrate the acceptance set end to end. Missing values must remain nullable or typed unavailable rather than fabricated. | Cover context, prompt/skill, token, cost, latency, logs, checkpoints, approvals, policy, verifier, result, and evidence lineage, including provenance, reason codes, and redaction. Prove reconnect/backfill, ordering, dedupe, backpressure, tenant isolation, million-event virtualization, accessibility, and Linux/macOS/Windows-native/WSL behavior. |
| Desktop ↔ Terminal same-run continuity | The packages provide parallel read surfaces, but not a handoff receipt. `TERMINAL-001` is `BLOCKED`; `CONVERSATION-RUN-001` and the shared application/surface contracts remain open. Desktop still has renderer-local transcript history while Terminal uses a different composition. | Demonstrate both clients attached to the same runtime and durable conversation/logical-run authority: same stable IDs and provenance before and after cross-process handoff, persisted readback/resume after disconnect or restart, and no nested CLI or renderer-local execution authority. |
| Surface parity | The narrow CLI↔MCP status row is `DONE`, and Package 3 establishes inspect CLI/MCP parity. The umbrella `SURFACE-PARITY-001` remains `BLOCKED` with `0/0/0/?/0/0/?`; `SURFACE-CUTOVER-001` and `SURFACES-001` are also blocked. | Publish the capability-by-capability matrix naming the canonical service, supported surfaces, and intentional negative space. Close the recorded start/approve/cancel/status/review/finalize/cleanup/resume differences across CLI, MCP, API, Terminal, Desktop, and connectors. Dashboard remains intentionally read-only. Prove the Golden Workflow across real processes. |
| `NATIVE-DEV-001` dogfood | `NATIVE-DEV-001` remains `BLOCKED` with `~/~/0/?/0/0/?`. The three aborted implementation sprints are honest package-development observations, not the required promotion evidence. | Complete five days of real Deckent development using Terminal plus Desktop as the primary environment, with same durable conversation/run handoff, recovery, performance, accessibility, and honest fallback evidence. Do not remove the existing fallback prematurely. External-product dogfood remains outside current scope and requires a separate owner admission after this closure. |

## Promotion and stop rule

The current surface is at **live read-only foundation**, not at protected control
or primary dogfood. Promotion requires a joined real-process proof for the same
logical identity and provenance, persisted resume, and the exact surface
obligation. Mutation surfaces such as start, approve, pause, and resume wait for
their authority closure.

Stop and retain the product outcome as open if any surface re-infers lifecycle,
cost, evidence, or approval state; if Desktop or Terminal owns a second runtime
or transcript authority; if missing inspector fields are filled with fake data;
or if package tests and endpoint landing are presented as UI/product completion.

## Source boundary

- `docs/MASTER-PLAN.md`: `RUN-INSPECTOR-001`, `SURFACE-PARITY-001`,
  `SURFACE-CUTOVER-001`, `SURFACES-001`, `TERMINAL-001`, and `NATIVE-DEV-001`.
- `CLOSURE-OS-PRODUCT-TRANSITION-BRIEF.md` §§5–7 and §11: joined production
  closure, the read-only Run Inspector candidate, the dogfood ladder, and the
  explicit distinction between persisted product direction and UI completion.

This note is evidence only. It neither changes a MASTER state nor grants
promotion, mutation, or release authority.
