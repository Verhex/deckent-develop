# Deckent Configuration Completion Audit Charter

## Authority and immutable snapshot

- Owner request: 2026-08-25 live instruction to exhaustively audit every configuration field and every code consumer, then document a complete product-finish plan in an isolated worktree.
- Worktree: `/tmp/deckent-config-completion-audit-20260825`
- Branch: `audit/config-completion-20260825`
- Base commit: `ff48978fb78139ea34b8c5e98fc41532437af9c9`
- Input config snapshot: `evidence/project-config.corrupted-backup.input.json`
- Input SHA-256: `34b6a7c25bca9a02ff2901682868e86ad4fc3bead05b2c4e5061cb249a686edb`
- Main-worktree uncommitted changes are explicitly excluded from code truth. They remain owner-owned and were neither copied nor modified.

## Single outcome

Produce an evidence-backed, machine-checkable inventory of the complete Deckent configuration contract at the pinned base commit, identify every schema/default/resolution/consumer/surface drift, and define a dependency-complete enterprise implementation plan. This audit does not implement product-code corrections.

## Exhaustiveness boundary

The field universe is the union of:

1. every finite leaf declared by `DeckentConfig` and config-adjacent public config types;
2. every leaf emitted by `createDefaultConfig()` or other canonical defaults;
3. every leaf accepted or inspected by validation/schema/migration code;
4. every literal or statically resolvable config path read or written by production code;
5. every leaf exposed by CLI, MCP, API, Dashboard, init/onboarding, generated metadata, or reference docs;
6. every leaf present in the pinned input config snapshot;
7. dynamic maps/arrays represented as wildcard contracts such as `providers.*` and `notifications.channels[]`.

A field is not considered covered until its matrix row contains evidence for declaration, default, validation, effective-resolution behavior, runtime consumer(s), operator surface, documentation, tests, and lifecycle/migration—or an explicit typed `NONE`, `NOT_APPLICABLE`, or `HOLD` with reason.

## Evidence rules

- Evidence is `relative/path:line` against the pinned base commit.
- Search hits alone do not prove runtime wiring; producer → resolver → consumer → ingress → proof must be traced.
- Tests prove only the behavior they execute; test-only imports are not production wiring.
- Missing or ambiguous evidence remains `HOLD`; no inferred green status.
- Hard-coded behavior that bypasses a declared config field is a drift even when current output is desirable.
- User/global/project/environment precedence is evaluated separately from field semantics.

## Deliverables

- `field-universe.json`: normalized exhaustive field/path universe and provenance.
- `consumer-index.json`: production and surface consumers with exact evidence.
- `CONFIG-FIELD-MATRIX.md`: human-readable per-field reconciliation.
- `DRIFT-REGISTER.md`: deduplicated findings with severity and product consequence.
- `PRODUCT-COMPLETION-PLAN.md`: dependency DAG, acceptance gates, migration/compatibility plan, and proof requirements.
- `VERIFICATION.md`: independent coverage and integrity checks.
- `MORNING-SUMMARY.md`: concise owner handoff.
- `agent-reports/`: bounded independent analyses.
- `handoffs/`: versioned subagent handoff receipts.

## Dogfood execution record

The first cross-checkout `deckent do` invocation was rejected with typed `DECKENT_BINARY_IDENTITY_HOLD` (`runtime-root-mismatch`). A same-checkout build was then produced successfully without touching the main worktree, and the canonical `deckent do` dry-run returned a one-task scaffold. The scaffold was intentionally not executed because its target files, scope, and GO/NO-GO criteria were unresolved placeholders. The exact multi-lane plan and verification gate are authored by this audit before any execution decision.

