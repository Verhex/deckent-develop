# SPEC TEMPLATE (PCOMP-8 U3 · G7+G20) — MANDATORY sectioned format for do/sprint NL specs

> Rule: Brain/CC may NOT submit a `deckent do` NL or a sprint spec unless EVERY mandatory
> section below is filled. "Empty section = not submittable." If a section genuinely does
> not apply, write `—: reason-not-applicable` (silent omission is forbidden).
> Source defects: Alperen's sprint-442 analysis §3.5-3.9 (ambiguous seams/semantics/ordering)
> + A3 gap-matrix G7/G20. A future `do --spec <file>` will consume this template machine-readably.

## 1 · PURPOSE (one paragraph)
What changes, for whom, which defect/feature. Out-of-scope items do NOT go here —
prohibitions belong in §6.

## 2 · FILE SCOPE
- **Write:** full-path file list (bare filenames forbidden). New files carry a "new:" prefix.
- **Read-critical:** contract files that MUST be read for the work to be done correctly.
  (The normalize layer auto-completes imports/mentions; entries here are HUMAN knowledge on top.)
- **Separate-test decision:** do tests live in this task or in a dedicated task? (`together` | `separate-task`)

## 3 · EDGE POLICIES (answer at least three questions)
- Ordering/concurrency: (e.g. duplicate/missing sequence, two-process race → expected behavior?)
- Legacy/backward compatibility: what happens when an old format/record is encountered?
- Error path: which condition raises a TYPED error, which is silently tolerated? (string-throw forbidden)

## 4 · RETURN/MUTATION SEMANTICS
If a public surface is added: return type, no mutable internal-reference leak
(clone/readonly decision), idempotency, naming↔behavior consistency
(e.g. whatever `listFlows` promises by name it must return — state the source explicitly).

## 5 · PROOF (behavior run MANDATORY)
- `tsc clean` is NOT proof by itself (it cannot catch ordering/fold/state defects).
- Mandatory: targeted test scenarios that prove the behavior (by name) AND/OR
  a real-binary run command + its expected output.
- Task-ID references: if a seam is left to another task, spell out the FULL task definition
  ("Task-2 fills it" is forbidden — "<in-plan title> fills it under this contract: …").

## 6 · PROHIBITIONS (fixed block — goes into every spec verbatim)
- Do NOT produce report/summary/verification markdown files (proof = tests + run output).
- goNogo may name only file paths genuinely written by THIS task; example/invented paths forbidden.
- No commas/separators in task titles. No string-throw; use the typed-error family.
- Existing export signatures do NOT change unless the task explicitly demands it.
- ADR constraints are binding (listed in the planner prompt); on conflict → write an
  amendment-proposal note instead of the task.

## 7 · SIZE
Target task count / decomposition note (micro-task law: heavy work = 20-40 micro tasks;
small work is explicitly marked "mini"). State `DECKENT_PLANNER_MIN/MAX_TASKS` if needed.
