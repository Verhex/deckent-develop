# RECOVERY-BORN Intake Template

Working material for drafting a new `RECOVERY-BORN-*` row before it is
hand-inserted into `docs/MASTER-PLAN.md` under parent
`RECOVERY-DOGFOOD-BORN-001` (row 3169). Row 3169's own contract requires
every child row to record **trigger, affected surfaces, exact evidence,
priority, dependencies, acceptance and negative scope** before the
underlying defect is fixed; duplicates link to the canonical born ID
instead of creating a parallel patch.

Copy this file, fill in every `## <Field>` section below (replace the
`<...>` placeholder text — do not leave a placeholder unfilled or a
section empty), then validate the draft before handing it to the owner
for insertion:

```
node scripts/check-born-intake.mjs path/to/your-draft.md
```

The checker reports typed gaps (missing section, empty section, or an
unfilled placeholder) per field. It is a manual pre-insertion aid only —
it is not wired into any lint or CI chain.

## Work ID
<RECOVERY-BORN-<sprint>-<SLUG>-001 — e.g. RECOVERY-BORN-519-INTAKE-CHECKER-001>

## Parent ID
<RECOVERY-DOGFOOD-BORN-001, unless this is a duplicate — then the canonical born ID it links to instead>

## Title
<one-line summary of the defect this row records>

## Priority
<P0 | P1 | P2 | P3>

## Dependencies
<comma-separated Work IDs this row depends on, or "—" if none>

## Trigger
<the exact sprint/task/event that surfaced this defect — what happened, when, in which run>

## Affected surfaces
<affected product and dogfood surfaces — name the concrete modules/subsystems, not a category>

## Exact evidence
<exact evidence — file paths, sequence numbers, timestamps, command output, receipts>

## Acceptance
<what must be true for this row to close — the observable contract, not an implementation plan>

## Negative scope
<what this row explicitly does NOT cover — the boundary that keeps it from scope-creeping into adjacent work>

## Date
<YYYY-MM-DD>
