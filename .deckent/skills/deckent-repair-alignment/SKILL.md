# Deckent Repair Alignment

Use this skill when repairing a failing test or a test pinned to an earlier
contract. The objective is alignment with the current product contract, not a
green check at any cost.

## Required Sequence

1. **Read before classifying.** Read every relevant implementation and contract
   file named in the task's `Reads` list. That list is the evidence boundary;
   never infer current behavior from a test title, an old sprint label, or memory.
2. **Reproduce before red.** Run the smallest authorized reproduction at the
   unmodified baseline. Record the failing assertion, actual value, expected
   value, and source location. If the reported failure does not reproduce, stop
   and report that fact rather than manufacturing a red test.
3. **Trace the live contract.** Follow the scoped source path that produces the
   observed value. Identify the current invariant and the exact source lines
   implementing it.
4. **Classify, then act.** Choose exactly one classification below. Do not edit a
   test until the evidence establishes that its pin is stale.
5. **Verify narrowly.** Run the declared targeted command. Keep the repaired
   assertion at least as strong and specific as the original.

## Classification Gate

### Stale pin

A test is stale only when the `Reads` source proves that the product contract
intentionally changed and the implementation consistently follows that newer
contract. Align the expected value, fixture, or setup to the live contract. In
the repair note, cite both the stale test location and the source location that
defines the replacement expectation.

### Real product bug

A failure is a product bug when the scoped source contract supports the test's
expectation but runtime behavior violates it. **Do not touch the test file.**
Return `NO_GO` and provide exact evidence in `path/to/source.ts:line` form for:

- the source line that states or implements the intended contract;
- the failing test assertion or reproduction line; and
- the implementation line producing the contradictory behavior.

If scope does not permit the product fix, name the required file without reading
or editing outside the authorized boundary.

### Insufficient evidence

If the allowed `Reads` do not establish either classification, do not guess.
Return `NO_GO`, name the missing contract source, and preserve all files.

## Assertion Integrity

Never make a suite green by:

- deleting an assertion or replacing it with a weaker/general assertion;
- widening exact equality into partial, truthy, snapshot-only, or catch-all
  matching without a source-backed contract reason;
- adding `skip`, `skipIf`, `todo`, focus markers, retries, or arbitrary timeout
  inflation to conceal the failure;
- swallowing an exception, accepting multiple incompatible outcomes, or
  rewriting a fixture so it no longer exercises the defect; or
- changing production code merely to satisfy an obsolete test pin.

When the contract permits multiple outcomes, assert the discriminant and every
required field explicitly. Preserve regression value, including edge cases.

## Evidence Checklist

- Baseline reproduction was run before mutation.
- Classification is `stale pin`, `product bug`, or `insufficient evidence`.
- Every claim cites an exact file and line number.
- The conclusion comes from source in the task's `Reads` list.
- No assertion was removed, weakened, skipped, or hidden.
- The declared targeted verification was run without piping away its exit code.


## Anti-Patterns
- Weakening or deleting an assertion to make a red test pass.
- "Fixing" a test without first reproducing the red and reading the landed
  source contract it pins.
- Classifying a product bug as a stale pin (or vice versa) without exact
  file-and-line evidence.
- Skipping a test (`.skip`) as a repair — a skip is a silent retirement.
- Editing files outside the declared repair scope to silence a neighbour.

## Karpathy Notes
- **Surgical:** align exactly the stale pin to the landed contract — do not
  reformat, rename, or "improve" the surrounding test while there.
- **Simplicity first:** the smallest fixture that reproduces the contract
  beats a shared helper invented for one repair.
- **Goal-driven:** DONE means the declared test command is green AND the
  product-bug branch was honestly ruled out (or reported as NO_GO with
  file:line) — not merely that the diff compiles.
