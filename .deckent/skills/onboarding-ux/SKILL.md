# Onboarding UX

## Wizard as a Discriminated Step Machine
- Model a multi-phase wizard as an ordered array of a discriminated union (one variant per phase,
  tagged by `kind`). Callers and tests can then introspect exactly what each phase produced
  without re-running the whole wizard.
- Keep each phase's output type separate from its input probe — a phase that both probes the
  outside world AND decides based on prior phases' outputs becomes hard to test in isolation.
  Split "gather" from "decide" whenever a phase does both.
- Number phases in the module's top comment (`Step 1 — ...`, `Step 2 — ...`) even though the code
  is just a sequence of calls — the comment is the contract a future phase-reorder must respect.

## Plan-Before-Apply
- The terminal step of a config-writing wizard produces a **plan object**, never a direct write.
  Applying the plan (writing `config.json`, running attach commands) is an explicit, separate,
  later step.
- Mark the plan type with an explicit contract field or comment (e.g. "this is a plan, not an
  applied write") so a caller can't mistake "the wizard finished" for "the config was written."
- This split keeps the wizard pure/testable (same inputs → same plan, no I/O) and lets a UI layer
  show a confirm/diff screen before anything touches disk.

## Injectable Probes, Real Defaults
- Every step that touches the outside world (PATH discovery, auth login-state, platform, env
  vars) takes its probe as an injected parameter with the real implementation as the default —
  not a global import the step calls directly.
- Tests inject fakes for exactly the probes relevant to that phase; production code never has to
  know it is being tested. Same seam pattern the RPC dispatcher's handler map uses (see
  `rpc-protocol` skill) — inject the impure edge, keep the core pure.

## Degrade-Safe Teasers
- A startup teaser (e.g. "recent sessions") that reads best-effort disk state must NEVER throw:
  missing directory → `[]`, unreadable directory → `[]`, a record missing required fields → skip
  that one record, not the whole list.
- Guard trivial invalid input up front (`n <= 0` → `[]`) so the caller can invoke the teaser
  unconditionally on every startup, with no guard needed at the call site.
- A degraded (shorter or empty) list must look identical to "nothing to show yet" from the UI's
  perspective — never render a partial-error state for a teaser.

## Pure Derivation Steps
- A step that only folds prior steps' already-gathered outputs (no new probe, no I/O) should be a
  plain synchronous function, not `async` — trivially unit-testable with plain objects, never
  needs a fake.
- Keep probe-driven (`async`) and derivation (sync) steps visually distinguishable in the module —
  a reader should tell which steps need fixtures without reading the body.

## Anti-Patterns
- A wizard step that writes to disk "just this once" to save a round-trip — every write belongs
  in the explicit apply step, no exceptions.
- A teaser that throws on the first malformed record instead of skipping it — one corrupt file
  must not blank an otherwise-good list.
- Calling a real probe (PATH, network, subprocess) directly inside a step instead of through an
  injectable parameter — untestable without a live environment.

## Karpathy Notes
- **Think before coding:** Name every external probe a new step needs before writing its body —
  the seam is easier to design up front than to retrofit.
- **Simplicity first:** Don't add a generic step-runner/pipeline abstraction for a fixed-phase
  wizard — a plain ordered sequence of calls is simpler and just as testable.
- **Goal-driven:** A step is DONE when its plan/output round-trips through a test with injected
  fakes — not when it merely compiles.
