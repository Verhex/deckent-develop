# PROVIDER-AUTHORITY-DOCKER-EVIDENCE-001 evidence archive

Date: 2026-08-21

## Outcome boundary

This archive covers the production wiring prerequisite recorded by MASTER row 3322.
It records the owner-confirmed additive/CAS authoring transition, live bounded
Claude verification and the separate stage seals. It does not claim Cursor/Grok
4.6 readiness; that remains the independently admitted 7091 production-image
and credential-authority residual.

## Production chain

- Provider-neutral bounded source:
  `src/providers/docker-bounded-reachability-evidence.ts`
- Exact Claude and Codex host plus Docker registrations:
  `src/providers/claude-provider-evidence-sources.ts` and
  `src/providers/codex-provider-evidence-sources.ts`
- Shared local source inventory and generic Docker resolver seam:
  `src/providers/provider-authority-runtime-bootstrap.ts`
- Effective-config, lazy, memoized Docker backend factory:
  `src/cli/provider-authority-process-runtime.ts`
- `provider-authority limits init` default consumer wiring:
  `src/cli/commands/provider-authority.ts`
- Explicit ratio-mode policy, exact-selector transition planner and CAS writer:
  `src/core/provider-limit-policy.ts`, `src/core/provider-limit-truth.ts` and
  `src/core/provider-limit-authoring.ts`
- Hermetic producer-to-entrypoint proof:
  `tests/cli/provider-limits-claude-docker-wire.test.ts`

The same lazy `BoundedReachabilityProbeTransport` resolver is passed to the exact
Claude and Codex Docker slots. Docker argv, credential mounts, image selection and
native execution remain inside `DockerSpawnBackend.invokeBoundedReachabilityProbe`.
Missing transport, missing budget, wrong profile, credential rejection, unreachable
backend and unsupported backend remain non-live typed outcomes.

`ratioEnforcement=observe_only` disables only ratio-threshold blocking for the
bounded owner-budgeted envelope. It retains pressure telemetry, preserves
unknown/stale/incomplete HOLD and absolute `minimumRemaining` enforcement, and
does not invent capacity for a provider with no measurable windows. Reachability
freshness is bound to the versioned source authority. The probe's provider token
budget is distinct from its provider-neutral 64 KiB CLI envelope ceiling;
overflow is `response_too_large`, ordinary provider non-zero is `rejected`, and
only explicit Docker daemon/socket or runner failure is `backend_unreachable`.

## Local verification

Command:

```text
npx vitest run tests/providers/docker-bounded-reachability-evidence.test.ts tests/providers/codex-provider-evidence-sources.test.ts tests/providers/claude-provider-evidence-sources.test.ts tests/providers/provider-authority-runtime-bootstrap.test.ts tests/cli/provider-authority-process-runtime.test.ts tests/cli/provider-limits-authoring-wire.test.ts tests/cli/provider-limits-claude-docker-wire.test.ts tests/core/task-artifact-classifier.test.ts tests/orchestra/projection-parity-artifacts.test.ts tests/orchestra/task-projection-parity.test.ts
```

Result: the initial production-wiring battery passed 10 files and 122 tests.
The final combined policy, producer, Docker classification and wiring battery is
recorded in the result-seal section below.

Command: `npx tsc --noEmit`

Result: exit 0.

Command: `git diff --check`

Result: exit 0.

Build projection command: `npx tsc && node scripts/copy-assets.mjs`

Result: exit 0; 113 assets copied, two executable bits applied, build identity
written. The build was deliberately additive, not a clean that could erase
retained aborted-sprint projections. `build:all` remains a landing gate after
task settlement and before an authorized commit.

## Real-binary authoring smoke

The real `dist/cli/entry.js provider-authority limits init` command used:

- provider `claude`
- model `claude-fable-5`
- auth and backend `subscription/cli/docker`
- execution profile
  `docker-execution-profile:8a7a2ac45234da38172d44874aefbd0d091373c8753b037ab6ac5db4b3d64e9f`
- tenant `main`
- owner-approved thresholds `warn=0.70`, `block=0.90`

The original first-writer-only path correctly refused to replace the existing
Codex authority. The repaired CLI then prepared owner-visible exact-selector
transitions and rechecked the current authority as a CAS token while holding an
exclusive sidecar:

- Codex `gpt-5.6-sol`: exact selector `update`, preserving the selector and
  changing the approved ratio mode to `observe_only` at 0.70/0.90.
- Claude `claude-fable-5`: exact selector `add`, preserving the Codex entry and
  adding live-derived `claude.session`, `claude.week-all` and
  `claude.week-fable` windows at `observe_only` 0.70/0.90.

Both transitions were separately previewed and owner-confirmed through the real
`dist/cli/entry.js provider-authority limits init` surface. The final chained
authority is
`provider-limit-authored:6e8e35827743f1f6d97744bafa1116c02d54566f7762ede87993bf620ccc7a63`;
the canonical reload snapshot is
`provider-limit-authored-layers:2b7ca54b2a8bd7c7fd257861bdf02e56169053e3cc9295b7af12c2b3913f4c52`.
The global config remained owner-only mode `0600`; the writer sidecar was absent
after settlement. Unknown fields and unrelated provider policies were preserved.

## XVerify stage receipts

- Design attempt:
  `xv-1787319220883-448ace7e-93de-43a6-a72b-0a85fac254a8`
- Implementation attempt:
  `xv-1787319260220-8268684f-74a5-45ce-90a6-303c36ddb56f`
- Result attempt:
  `xv-1787319473653-8276b030-cf6a-4c41-b23f-479559db7c59`

All three initial attempts ended `unavailable/HOLD` before verifier execution with
`limit_policy_unavailable` and
`verifier-exact-invocation-composition-hold:xverify_provider_scope_unavailable`.
There was no Claude provider call, usage evidence, verdict or closure receipt.
These are blocker receipts, not seals. Same-provider fallback was not used.

After authoring, the evidence chain exposed and closed two independent
classification defects without deleting durable truth:

- `xv-1787321243139-b08cee9e-fa17-409d-9ef0-a47d460c2be1` proved the
  98-percent advisory window was admitted by `observe_only`, then exposed an
  incorrect durable-advisory `limit_hold` label.
- `xv-1787321846829-8324bae5-87b9-4593-918f-b67a489984c6` ran a fresh
  source-versioned probe and exposed the token-count versus byte-ceiling unit
  error as `probe_unreachable`.

With those classifications repaired, Claude Docker reachability and the actual
Fable verifier completed. A first design response was honestly `UNCLEAR` because
the claim embedded a raw-file digest not present in the ranged evidence
manifest; the claim was narrowed rather than self-approved. A first
implementation response was honestly `UNCLEAR` because the 64 KiB constant
definition fell outside the target slice; the slice was expanded.

- Design `CONFIRMED`:
  `xv-1787322135345-1860d2d3-bb3f-4e08-883a-888d4864d4f4`,
  `cross-verify-verdict:sha256:6500375ec0c303c042b57374205542deb0e47d45e2562e956f4dba16e8c28a7f`.
- Implementation `CONFIRMED`:
  `xv-1787322410610-9e488ba4-bc6d-4cb6-8781-0c63a5ebaf52`,
  `cross-verify-verdict:sha256:ebb473cf21ea4f2011ea7d92d90eaa125f5477f46c7dcc8a516791c1c4a2e8c0`.
- Result `CONFIRMED`:
  `xv-1787322757548-7c851ce9-1b4f-4ab4-b9c3-2768ea43b46d`,
  `cross-verify-verdict:sha256:6cfb54edfc3cf1e82869990f7b4cb01acad32b0dfc8f099ea2dacd4bdf091022`.

Every successful seal carried a real Claude provider call, provider-reported
usage, terminal settlement and durable host adjudication receipt. Same-provider
fallback was never used.

## Lifecycle note

Sprint 608 was force-finalized as `ABORTED` after repeated source-only FIX retries
could not update the stale cross-provider test pin. It settled 2 of 7 logical tasks
and promoted no unresolved lineage to COMPLETE. Alperen then explicitly authorized
direct manual completion. The resume-specific classifier defect that misread
`task-*.skill-delivery.json` as a task projection was fixed and pinned separately;
no `.tasks` artifact was hand-deleted.

Sprint 607 also has a fenced `ABORTED` terminal receipt at
`.deckent/recently-works/sprint-607-terminal-receipt.json`, SHA-256
`40f1faea92874ce2e57a9ff7296d13345977b10ce86a1a334904cdc458f3fffd`.
Its later lifecycle projection refused with the typed
`ABORT_AUTHORITY_SPRINT_MISMATCH` because the canonical current projection
already belonged to Sprint 608. The receipt is durable; the foreign projection
was not overwritten. Sprint 608's receipt SHA-256 is
`b8a25ad0274778d9c7b0b7935cec50bba39717bb104bbae5842984287d193a77`.

The final liveness check found no Deckent sprint coordinator or worker process
and no Deckent worker container. The unrelated `local-llm` container remained
healthy and untouched.

## Final result proof

The combined bounded battery passed 15 test files and 201 tests with zero
failures. It covers policy normalization and precedence, ratio and absolute-floor
truth, additive/update/unchanged authoring, stale-CAS and concurrent-writer
refusal, CLI production wiring, exact Claude/Codex source registration,
source-revision cooldown supersession, Docker envelope and rejection
classification, artifact classification and task/projection parity.

`npx tsc --noEmit` and `git diff --check` both exited zero after that battery.
The final real config reload reported:

- authority
  `provider-limit-authored:6e8e35827743f1f6d97744bafa1116c02d54566f7762ede87993bf620ccc7a63`;
- authority snapshot
  `provider-limit-authored-layers:2b7ca54b2a8bd7c7fd257861bdf02e56169053e3cc9295b7af12c2b3913f4c52`;
- canonical runtime resolver `ready`;
- exactly one Codex Docker policy with window `codex.primary` and exactly one
  Claude Docker policy with windows `claude.session`, `claude.week-all` and
  `claude.week-fable`;
- both policies `observe_only`, `warn=0.7`, `block=0.9`;
- global config mode `0600` and no writer sidecar.

No raw account identity, credential, provider response or prompt was persisted
in this archive. Cursor was neither selected nor silently treated as having a
usage window.

## Ledger and gate closure

The former `PROVIDER_LIMIT_POLICY_UNAVAILABLE` blocker is resolved: the Codex
selector is preserved, Claude is additively authored, ratio enforcement is the
explicit owner-approved `observe_only` mode, and the independent provider path
is live. MASTER settlement remains non-terminal until the result seal, generated
projections and local gates below are complete; no closure-ledger event is
fabricated by this archive.

- `docs:master-plan` and `lint:master-plan`: 517 rows, 452 active, 187
  receipts and 13 blocker classes; generated Markdown/JSON are in sync.
- Closure scan v2.1: 452 rows, zero conflicts and no missing dangling target;
  projector bundle `9ac3d7eecdfb...`; closure gate verified all three current
  events for chain, identity, lifecycle and append-only integrity.
- `lint:hermetic`: 2,764 files, zero confirmed violations. The measured +8
  unresolved registry delta is explained in the ratchet as injected-store,
  injected-runner and suite-owned tmpdir proof; production inventory remains
  1,269 modules with a digest-only update.
- `lint:operating-policy`: canonical policy and control-block projections in
  parity; capsule hygiene clean.
- `npm run build:all` reached a typed clean HOLD because the active Telegram
  bot and retained Sprint 607/608 aborted/stale projections are protected. No
  artifact was deleted. Source dist had already passed the additive TypeScript
  and asset build; the clean-independent dashboard production build completed.
- The documented bot restart moved PID `346193` to `564672`; `bot status` and
  PID-based `kill -0` both proved the replacement process live. CLI dist smoke
  reported Deckent 0.100.0 and Claude Code 2.1.238.
