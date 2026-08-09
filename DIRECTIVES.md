# DIRECTIVES — Dogfood smoke: single documentation task

## Goal

Prove the run lifecycle end to end with the smallest possible safe payload: one worker, one new
documentation file, zero edits to any existing file. This run exists to demonstrate that a worker
is born, claims its task, produces a real artifact and settles honestly.

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

## Task 1: Document the owner-managed model activation surface

- Files: docs/reference/model-activation.md
- Scope: docs/reference/
- Dependencies: none

Create a new reference page describing the owner-managed model activation surface that ships in
this repository. Read the actual command registration and the activation store before writing, and
describe only what the code really does.

The page must cover: what the activation layer is for (the detected pool is what a provider OFFERS,
activation is what the owner ALLOWS), the exact registered subcommands for listing, activating and
deactivating, what happens when a model has no recorded decision (existing behaviour is preserved),
and where the decisions are stored. Keep it to roughly one screen, use the heading and tone style of
the neighbouring pages in the same directory, and include one short worked example of deactivating a
model and confirming the result.

**Test:** `npx vitest run tests/docs/config-reference.test.ts`

**NO-GO:** The file edits or deletes anything outside the single new page, names a subcommand or
flag that does not exist in the source, states behaviour that contradicts the activation store
implementation, or omits the no-recorded-decision case.
