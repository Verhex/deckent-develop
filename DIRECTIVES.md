# WORKER-PROMPT-COST-ARCHITECTURE-001: Comparable Prompt-Cost Canary Authority

## Goal

Close the missing production measurement seam under MASTER Work 7094. Deckent must compare a
baseline and candidate sprint from canonical archived settlement artifacts and issue one
fail-closed, immutable decision that binds measured cache-hit ratio, provider-reported USD,
quality parity, cohort comparability, and the exact prompt feature snapshot. This slice builds the
authority and product ingress; it does not flip `prompt.catalog_mount_mask` default or claim the
80% target before a real A/B canary consumes it.

## Execution contract

- DOGFOOD_MODE=ON. Run identity comes only from the canonical allocator.
- Five-task DAG: Tasks 1 and 2 execute concurrently; Task 3 executes independently in parallel;
  Task 4 depends on Tasks 1-3; Task 5 depends on Task 4 and is the production fan-in.
- No docs/evidence, MASTER, follow-up, changelog, generated projection, provider login/auth,
  live database, config-default, Brain-memory, or execution-authority mutation by workers.
- Never delete `.brain/memory.db`; never clean `.tasks` manually; preserve unrelated dirty files.
- No `npm run build`, `npm run build:all`, full suite, provider call, bot restart, or auth mutation
  while the run is active. Hermetic scoped Vitest and `npx tsc --noEmit` are allowed.
- Production wiring must close canonical archive producer -> comparison authority -> immutable
  receipt store -> CLI entrypoint. Test-only imports or reference-price-only savings are HOLD.
- Provider-reported USD is distinct from calculated/reference USD. Missing native billing remains
  typed unavailable; subscription/local zero cannot be relabelled as provider-reported USD.
- `measuredHitRatio` is derived only from exact provider token counters and exposes its explicit
  denominator. Zero/unmeasured denominators are typed HOLD, never 0% by invention.
- Comparability binds task/cohort identity, provider/model/accounting authority, feature snapshot,
  settled lineage, and quality verdicts. Mixed/foreign/corrupt/incomplete cohorts fail closed.
- User-visible CLI text is entirely `getMessage(key, lang)` in English and Turkish. Remove the
  existing touched `usage.ts` local label table and hardcoded option descriptions; no new debt.
- Root operator owns post-terminal build, real-binary baseline/candidate proof, A/B dogfood runs,
  MASTER projection, and different-provider XVerify when eligible.

## Task 1: Provider-neutral canary comparison kernel

- Files: src/core/prompt-cost-canary.ts, tests/core/prompt-cost-canary.test.ts
- Scope: src/core/, tests/core/
- Type: feature
- Goal: Implement a versioned deterministic comparison contract over explicit baseline and
  candidate cohort samples. Aggregate logical-lineage input/cache-read/cache-creation/output,
  provider-reported USD, duration and normalized quality verdicts; compute exact measured hit
  ratios and deltas; validate cohort/provider/model/billing/feature comparability; return typed
  `PROMOTE`, `HOLD`, or `REJECT` with bounded reason codes. Promotion requires configurable
  quality non-regression and measured cost/cache thresholds; no provider/model literals and no
  reference-price substitution. Canonical encoding and plan/decision digests are mandatory.
- Test: npx vitest run tests/core/prompt-cost-canary.test.ts

## Task 2: Immutable content-addressed canary receipt store

- Files: src/core/prompt-cost-canary-receipt-store.ts, tests/core/prompt-cost-canary-receipt-store.test.ts
- Scope: src/core/, tests/core/
- Type: feature
- Goal: Persist or replay the exact comparison decision as a versioned immutable receipt under a
  tenant/environment-scoped `.deckent` authority. Use project-relative paths, strict validation,
  canonical content identity, create-or-verify semantics, atomic write+fsync, private permissions,
  symlink/path-escape/concurrent-publication/collision defenses, bounded discovery, and fresh
  process replay. Existing bytes are never overwritten and corrupt/conflicting receipt is HOLD.
- Test: npx vitest run tests/core/prompt-cost-canary-receipt-store.test.ts

## Task 3: Canonical archive cohort reader

- Files: src/core/prompt-cost-canary-archive.ts, tests/core/prompt-cost-canary-archive.test.ts
- Scope: src/core/, tests/core/
- Type: feature
- Goal: Read two explicit sprint IDs only through canonical sprint-archive read authority and
  manifest-bound task/result/evaluation artifacts. Derive one deterministic cohort sample per
  logical lineage, including exact attempt identity, normalized verdict/quality, feature snapshot,
  token counters, provider/model/billing source, provider-reported USD availability, and duration.
  Reject incomplete, duplicate, foreign, unsealed, unverified, or mixed-authority artifacts with
  typed reasons. Do not parse legacy docs/evidence or transcripts as settlement authority.
- Test: npx vitest run tests/core/prompt-cost-canary-archive.test.ts

## Task 4: Usage CLI comparison and receipt ingress

- Files: src/cli/commands/usage.ts, src/cli/helpers/messages.ts, tests/cli/usage-command.test.ts, tests/cli/usage-comparison.test.ts
- Scope: src/cli/, tests/cli/
- Dependencies: Task 1, Task 2, Task 3
- Type: feature
- Goal: Extend `deckent usage` with an explicit baseline/candidate canary mode, stable JSON,
  dry-run by default, and digest-bound `--apply` receipt publication. Consume the production
  archive reader, kernel and receipt store; expose decision, measuredHitRatio denominator/deltas,
  exact provider-reported USD availability/deltas, quality parity and bounded reason codes without
  raw identities or paths. Validate mutually exclusive options. Migrate all touched local labels
  and option descriptions to canonical EN/TR messages.
- Smoke: node dist/cli/entry.js usage --baseline-sprint sprint-639 --candidate-sprint sprint-641 --json -> valid JSON with a typed PROMOTE/HOLD/REJECT decision and no stack trace
- Test: npx vitest run tests/cli/usage-command.test.ts tests/cli/usage-comparison.test.ts

## Task 5: Real production fan-in and hostile replay matrix

- Files: tests/integration/prompt-cost-canary.integration.test.ts
- Scope: tests/integration/
- Dependencies: Task 4
- Type: test
- Goal: Exercise actual production modules from two canonical tmpdir sprint archives through CLI
  dry-run, digest-bound apply and fresh-process replay. Prove deterministic receipt identity,
  measured cache denominator, provider-reported USD separation, quality non-regression gate, no
  archive mutation, and typed HOLD/REJECT for missing billing, unmeasured cache, cohort mismatch,
  quality regression, tamper, wrong digest, symlink and receipt collision. No fixture-local
  reimplementation of production logic.
- Test: npx vitest run tests/integration/prompt-cost-canary.integration.test.ts

## Outcome acceptance

- The run reaches an honest terminal settlement with all five logical lineages resolved; a
  terminal state alone is not production closure.
- Production CLI consumes canonical archive data and returns a deterministic comparison decision;
  provider-reported USD and measured cache ratio can never be fabricated from reference pricing.
- Digest-bound apply publishes one immutable receipt and fresh-process replay returns the same ID.
- Scoped tests, TypeScript/lint, post-terminal build, real-binary smoke and archive/finalizer
  integrity are green before landing.
- Default-ON remains separate: only a real comparable baseline/treatment run with a promotable
  receipt may change the effective dogfood/product default, followed by different-provider XVerify.
