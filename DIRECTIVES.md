# DIRECTIVES — Dogfood verification run 2: single documentation task

## Goal

Second consecutive measurement of the run lifecycle with a payload of the same
shape as the previous run: one worker, one new documentation file, zero edits to
any existing file. This run exists to confirm that the previous success was
repeatable and to produce a comparable token profile.

This is a documentation sprint only. Provider, model, effort and effective concurrency are resolved
exclusively from effective config, registry, role policy, auth/reachability evidence, usage/limit
authority and host admission. No instruction-level provider or model override exists.

## Execution Contract

- The worker creates exactly one NEW file. It must not edit, move or delete any existing file.
- No source code, no configuration, no test file and no lifecycle command is in scope.
- Workers must not run `npm run build`, `npm test`, a full suite, provider login/auth mutation,
  sprint lifecycle commands, git commit or cleanup.
- Content must be grounded in the repository as it actually is. Any command or flag named in the
  document must exist in the source; nothing may be invented from the prompt text alone.
- Write for both audiences (dual-lens): precise enough for an enterprise operator, plain enough for
  a solo user.

---

## Task 1: Document the run-flow inbox surface

- Files: docs/reference/run-flow-inbox.md
- Scope: docs/reference/, src/cli/commands/runs.ts
- Dependencies: none

Create a new reference page describing the run-flow inbox that `deckent runs` exposes. Read the
actual command registration and option wiring in src/cli/commands/runs.ts before writing, and
describe only what the code really does. That source path is inside your read scope.

The page must cover: what the inbox lists and what a run-flow is in lifecycle terms, how a run is
targeted (list position versus flow-id prefix), each decide option that is actually registered
including what it does and what it requires, and the stale-classification option together with its
dry-run-by-default behaviour and the flag that makes it durable. Keep it to roughly one screen and
include one short worked example of inspecting the inbox and then acting on a single run.

**Test:** `npx vitest run tests/docs/config-reference.test.ts`

**NO-GO:** The file edits or deletes anything outside the single new page, names an option that is
not registered in the source, describes the stale-classification default incorrectly, or omits how a
run is targeted.
