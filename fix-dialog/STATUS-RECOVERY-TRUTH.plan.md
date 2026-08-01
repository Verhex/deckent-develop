# Status · Recovery Truth — approved implementation plan

Authority: owner approval, 2026-08-01. Parent ledger:
`RECOVERY-BORN-488-STATUS-PROJECTION-001` and
`RECOVERY-BORN-488-RECOVERY-TERMINAL-001`.

## Constraints

- ADR-G-004: canonical docs change records why and resulting contract; generated projections are
  derived only from `docs/MASTER-PLAN.md`.
- ADR-G-020: implementation/write scope stays explicit; no global cleanup or foreign artifact
  mutation.
- ADR-G-035: product memory and dogfood core-memory remain separate.
- Provider-neutral and config-resolved; no provider/model/worker-count hardcode.
- No active Sprint, build or full-suite execution. Scoped tests and post-change real binary proof.
- Missing cross-platform/runtime authority is typed HOLD, never inferred success.

## Go criteria

1. `IDLE` plus retired exact run authority cannot expose historical open provider observations as
   current provider concurrency. The observations remain durably visible as unresolved evidence.
2. Current provider concurrency is scoped by exact run/task/attempt identity, not task-id parsing,
   timestamps, provider names or dashboard state.
3. One persisted revision/digest carries lifecycle, logical work, provider concurrency, terminal
   publication and conflict/HOLD evidence.
4. CLI, MCP, Terminal, Desktop/dashboard, metrics/notification and finalizer consumers do not
   independently infer those fields.
5. Start/resume rejects source/dist identity drift before dispatch with an exact recovery action.
6. Recover machine and human surfaces agree on a typed outcome and exit semantics.
7. Scoped unit/integration contracts, real binary smoke and platform capability matrix pass.

## Ordered slices

1. Provider observation reconciliation and canonical read-model schema/persistence.
2. Lifecycle producer wiring at start/phase/pause/resume/terminal/cleanup boundaries.
3. Consumer cutover across all status/control surfaces.
4. Source/dist admission and typed recover result.
5. Hermetic and built-binary proof; MASTER evidence/projections.
6. Owner-started dogfood canary plan only after all prior slices are green.
