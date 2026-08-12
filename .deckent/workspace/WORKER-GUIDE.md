<!-- DECKENT:WORKSPACE id="worker-guide" schema="1" authority="managed" provenance="workspace-artifact-registry" -->
# Worker Guide

## Worker Contract
<!-- DECKENT:CONTRACT id="worker-guide" schema="1" sha256="1579f343478f2afa488ac03b69bf42735e4ee47c464db8b583b9a5467095ed4e" -->
This contract is generated from worker runtime schemas and prompt policy. It is supporting context; the compiled, digest-bound task prompt remains the attempt authority.

### Result ingress vs canonical result

Workers write `.tasks/task-{id}.result` ingress claims: `taskId`, `workerId`, `filesChanged` (string array), `linesAdded`, `linesRemoved`, `testsPassed` (boolean), `coverage` (0–100), `selfAssessment` and `notes` (single string). Do not estimate token usage. Provider/model, token/cost, disk diff, tests and TypeScript evidence are host-authored in the canonical schema `1.0` result.

Canonical schema-required fields (derived at runtime): `cost, filesChanged, model, provider, selfAssessment, taskId, tests, tokenUsage, totalLinesAdded, totalLinesRemoved, tsc, workerId`.

### Heartbeat

Create `.tasks/task-{id}.hb` before work. Increment `sequence`; use a fresh UTC ISO timestamp; keep `currentAction` concise. Heartbeat content is activity context—not standalone process-liveness or terminal authority.

### Objective Definition of Done

- DONE — Every Definition-of-Done item is verified with evidence.
- GO_WITH_TECH_DEBT — Core items are verified; each minor open item is named explicitly.
- NO_GO — At least one critical item is unverified; the exact blocker is named.

There is no percentage threshold. Evidence for each criterion decides the verdict.

### Verification and honest-result gate

The `.verify-ran` marker is verifier-authored evidence; never create or claim it manually. Before DONE, compare baseline, end state and the actual criterion evidence. If a dependency has not settled, do not busy-wait or infer success from `processQueue`; report the exact NO_GO/HOLD condition.

### Scope, ADR-037 authority and forbidden anti-patterns

`scope.filesWrite` is the exact write allow-list; protocol artifacts under `.tasks/` are the only lifecycle exception. Do not mutate dependencies or run project-wide build from a worker. If a required capability or authority is unavailable, write a concrete NO_GO/HOLD reason instead of fabricating completion.

| Anti-pattern | Status | Reason |
|---|---|---|
| `it.skip(...)` without a justification | forbidden | hides failed evidence |
| `stub()` or a hardcoded empty implementation | forbidden | creates a false GO |
| writing outside `scope.filesWrite` | forbidden | violates ADR-037 authority |
| claiming DONE without verifier evidence | forbidden | violates the honest-result gate |
<!-- DECKENT:CONTRACT:END id="worker-guide" -->
