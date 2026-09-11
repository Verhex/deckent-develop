# RECOVERY-BORN-716-SENSITIVE-WORKSPACE-ADMISSION-001 — IMPLEMENTED_LOCAL_VERIFIED

OUTCOME_ID: RECOVERY-BORN-716-SENSITIVE-WORKSPACE-ADMISSION-001  
DOGFOOD_MODE: ON  
DOGFOOD_HEALTH: DEGRADED  
RECOVERY_SEAM: ADR-D-007  
BASE_SHA: ff2e47564232d05656b8645f4c3fd3449b322dc9  
BRANCH: main  
WORKSPACE_MODE: MAIN  
PARENT_MASTER_ID: 3357  
TRIGGER_RUN: sprint-716 / task 716-001 / exact generations 1 and 2  
OWNER_DECISION_REF: owner-live-2026-09-04-fable-codex-merged-rca-start-and-complete  

## Bounded recovery outcome

Make exact Docker workspace admission project an execution-safe workspace instead of aborting the
entire main run when credential-shaped paths are present. Preserve strict secret containment,
remove the design-token filename false positive, and carry the exact secret-free pre-mount stage
and failure class through durable no-effect custody.

The triggering inventory had 5,828 paths and rejected four tracked paths: two `.npmrc` files and
two public design-token JSON files. No provider, container, mount, heartbeat, shell artifact,
partial result, or task result existed in either sprint-716 generation.

## Host-computed admission receipt

```json
{
  "schemaVersion": 1,
  "receiptId": "GR-2026-09-04-716-SENSITIVE-WORKSPACE-01",
  "outcomeId": "RECOVERY-BORN-716-SENSITIVE-WORKSPACE-ADMISSION-001",
  "state": "CONSUMED",
  "admittedAt": "2026-09-04T22:54:30+03:00",
  "consumedAt": "2026-09-04T22:54:30+03:00",
  "baseSha": "ff2e47564232d05656b8645f4c3fd3449b322dc9",
  "branch": "main",
  "policyDigest": "sha256:f65334ba14584c2a7a8d451fa20e4c0aaf39bd4ad5383c3fa84cac0070375f14",
  "currentScopeDigest": "sha256:d222ec90c9f7b3b4913f227a3c22594c3faf45d25cccfa7a3f17c02db1cae944",
  "scopeCount": 5,
  "scopeDigestAlgorithm": "sha256(JSON.stringify(path-sorted [{path,digest}]))",
  "authorityRef": "owner-live-2026-09-04-fable-codex-merged-rca-start-and-complete",
  "recoverySeam": "ADR-D-007"
}
```

The current-byte digest includes pre-existing dirty and untracked files in this exact scope. Those
bytes belong to the existing main recovery and must be preserved. No authored/model digest is
accepted as authority.

## Exact write scope

- `src/orchestra/execution-effect-docker-lifecycle.ts`
- `src/orchestra/spawn-backend-docker.ts`
- `tests/orchestra/execution-effect-docker-lifecycle.test.ts`
- `tests/orchestra/spawn-backend-docker-planning-preflight.test.ts`
- `tests/orchestra/spawn-backend-docker-mounts.test.ts`
- `scripts/lint-test-hermeticity.mjs` (source-derived proof ratchet only)

## Required behavior

1. Credential-shaped paths such as `.npmrc` are excluded from the provider workspace; neither
   names nor contents appear in receipts or logs. The admission records only canonical counts and
   domain-separated digests.
2. A task whose explicit write scope intersects an excluded sensitive path is denied before worker
   release with a typed `SENSITIVE_PATH_WRITE_DENIED`-class outcome. Tracked state is a useful host
   signal but never implies that a path is secret-safe.
3. Public design-system token assets are not classified as authentication-token files merely from
   a `*.tokens.json` basename. The rule remains fail-closed for actual credential-shaped names.
4. Portable path parsing, case folding, alias/collision behavior, and secret non-disclosure are
   deterministic across Linux, macOS, Windows-native, and WSL path semantics.
5. Every pre-mount no-effect result carries secret-free typed stage, failure code/class, and
   compensation state. `SENSITIVE_PATH_DENIED` or another exact blocker cannot collapse into an
   unqualified `PRE_MOUNT_ABORTED` observation.

## Negative scope and proof manifest

- No notification wording/timing, stale read-model, model provenance, finalizer, agent manifest,
  heartbeat, log cleanup, auth, provider, MASTER, ledger, runtime, `.tasks`, `.deckent`, `.brain`,
  `.brain/memory.db`, build, bot, cleanup, kill, commit, push, `/tmp`, or unrelated mutation.
- Failing-first unit/contract tests must cover exclusion, design-token admission, write denial,
  portable case behavior, secret-free receipts, and durable exact no-effect projection.
- Targeted tests plus independent diff review are supporting evidence. Production closure requires
  the later real main compiled-binary run; no disposable project can close this outcome.

Finite budget: one implementation pass and at most one evidence-changing repair pass. Unchanged
failure settles HOLD. Return boundary: only after local settlement candidate may the build/restart,
canonical stale-run recovery, and one owner-authorized main smoke be considered.

## Local settlement candidate

- Sensitive inventory paths are removed from the provider projection; only excluded count and a
  domain-separated digest survive. Explicit sensitive `filesWrite` authority fails before adapter
  effects with `SENSITIVE_PATH_WRITE_DENIED`.
- Conventional `design/tokens/*.tokens.json` public assets remain in the projection; credential-
  shaped names elsewhere remain excluded under portable case-folded matching.
- Exact Docker no-effect evidence now preserves secret-free pre-mount stage, failure code/class,
  and compensation state while the public custody reason remains the compatible
  `PRE_MOUNT_ABORTED` enum.
- Independent scoped verification: `3` test files, `106/106` tests passed; `git diff --check`
  passed.
- Real-main source admission proof: `5830` source paths, `5828` projected paths, `2` excluded
  sensitive paths, state `ADMITTED`; only counts and digests were emitted.
- The first compiled real-main smoke (`sprint-717`) proved the scanner and typed no-effect path,
  then exposed a second in-scope defect before mount: the plan parser re-screened the already-safe
  inventory and incorrectly regenerated `2 excluded` as `0 excluded`, producing
  `EFFECT_ALLOCATION / INVALID_INPUT`. Both generations durably proved container, mount, provider,
  heartbeat, and tracked-write effects absent. Finalization itself completed with a canonical
  terminal receipt and prefixed attribution digest.
- A failing-first allocation round-trip test now covers `.npmrc` exclusion together with public
  design tokens. The parser restores only the secret-free host proof (`count` plus domain-separated
  digest), verifies its canonical inventory-admission receipt, and then verifies the complete plan
  digest. Rejected names remain unrecoverable, and tampering remains `INVALID_INPUT`.
- Post-repair `106/106` scoped tests and `tsc --noEmit` passed. The first `build:all` completed and
  the bot was restarted on the new dist as PID `218591`.
- The owner-authorized post-fix `sprint-718` proved that allocation now round-trips: both exact
  generations published durable `ALLOCATING` lifecycle authority instead of failing
  `EFFECT_ALLOCATION / INVALID_INPUT`. It then reached real Docker preparation and settled
  terminally `COMPLETE` with logical progress `0 DONE / 1 blocked`; no provider invocation,
  worker heartbeat, task result, partial result, or tracked write occurred.
- Docker daemon history proves the exact preparation sequence: native probe succeeded, the
  dependency volume was created and populated, the workspace volume was created, and the
  population helper exited `1`; compensation then deleted both attempt-private volumes. The
  lifecycle's broad catch projected this exception as `ADAPTER_UNAVAILABLE`.
- An exact provider-free reproducer recovered the swallowed exception: Node `readFileSync(0)`
  raised `EAGAIN` on Docker's non-blocking stdin while reading the 249 KB main inventory. This is
  a host transport defect, not an LLM, provider, credential, planner, or model-selection defect.
- The population helper now consumes stdin through a bounded async stream reader. It rejects an
  invalid declared byte length before reading, caps bytes at the canonical inventory ceiling,
  rejects overrun/underrun with exit `78`, and retains the existing inventory and terminal-NUL
  checks. A 512 KB async-child regression is green and owns no filesystem/provider/network
  authority.
- Fresh-dist real Docker proof over the main inventory (`5,837` paths) completed with status `0`,
  empty stderr, and a `1,942,269`-byte native verification receipt. The diagnostic volume was
  removed. The combined lifecycle/mount/preflight battery is `108/108`; the hermetic gate reports
  zero confirmed violations with source-derived fingerprints
  `18159:634dd59938c7bb6f63568ea0052edcbdf26f3afaae512b24293cdec63e413f2a` and
  `1422:7a2c6f3e5a9c2b79407435e08ce2b8248097f113f5bb91415637a9ec2c596d55`.
- The final controlled `build:all` completed and the fresh-dist bot is running as PID `246295`.
  Production closure still requires one newly authorized real main worker-to-terminal run; the
  sprint-718 authority explicitly prohibited another retry. No `/tmp`, MASTER, ledger,
  `.brain/memory.db`, commit, or push mutation occurred here.

## Related nonblocking finding

`prepareAllocatedExecutionEffectDockerWorkspaceV1` still catches every production adapter
exception under the generic lifecycle code `ADAPTER_UNAVAILABLE`. Sprint-718 and the independent
read-only RCA prove that the adapter descriptor snapshot was valid and the actual exception arose
inside `populateWorkspace`. The durable host observation now identifies `EFFECT_PREPARATION`, but
does not preserve the safe adapter method/stage. This did not remain a current blocker after the
async-stdin repair and is not silently admitted into this bounded recovery outcome.
