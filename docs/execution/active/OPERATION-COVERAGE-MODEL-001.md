# Outcome Capsule — OPERATION-COVERAGE-MODEL-001

OUTCOME_ID: OPERATION-COVERAGE-MODEL-001
DOGFOOD_MODE: ON
BASE_SHA: a8e4189f18d42aff968964e334e8ca1d6e9d1d4b

## Authority

- Parent MASTER ID: `4031`; parent outcome: `4030 OPERATION-001`.
- Mode: `DOGFOOD_MODE=ON`, `WORKSPACE_MODE=MAIN`, `DELIVERY_MODE=DIRECT_MAIN`.
- Owner decision: Alperen live acceptance, 2026-08-29 — 4030 child DAG and authority
  boundary accepted; record transfer and planner recovery authorized.
- Base SHA: `a8e4189f18d42aff968964e334e8ca1d6e9d1d4b`.
- Branch/workspace: root `main`; no worktree; existing unrelated dirt is preserved.
- Single product outcome: build the semantic action/effect coverage model that makes the
  existing OPERATION-001 audit site-granular and fail-closed. This outcome does not claim
  operation-catalog, invocation-context, effect-context, permission, approval, or effect
  migration closure.

## Allowed mutations

Product implementation is limited to these three existing tracked files:

- `scripts/audit-operation-ingress.mjs`
- `scripts/operation-ingress-baseline.json`
- `tests/scripts/audit-operation-ingress.test.ts`

Deckent may additionally mutate its canonical run/task/settlement/runtime records while the
dogfood run is active. This capsule, `DIRECTIVES.md`, and the later authenticated MASTER
projection are control-plane records, not worker write scope.

## Read-only authority

- `package.json`, `scripts/script-registry.json`, `scripts/lint-operation-catalog.mjs`
- `src/core/operation-catalog.ts`, `src/core/operation-catalog.v1.json`
- `src/core/operation-catalog.generated.ts`
- Existing lint-gate and hermetic-test patterns under `scripts/` and `tests/scripts/`
- TypeScript compiler APIs already present through repository dependencies

## Explicit exclusions

- No new files, dependency, package, generated source, i18n surface, CLI/MCP/API/Desktop/
  Terminal behavior, or production ingress/effect writer mutation.
- No catalog convergence (`4032`), invocation context (`4033`), effect context (`4034`),
  registry binding (`4035`–`4038`), ingress propagation (`4039`, `4041`–`4045`), or effect
  migration (`4046`–`4049`).
- No capability/permission decision or enforcement (`4040`) and no approval authority
  (`4050`). Resolving an operation is never represented as authorization.
- No file-level promotion, aggregate-count compensation, dead `resolveOperation` credit,
  call-site substitution, unknown-taxonomy acceptance, or baseline laundering.
- No MASTER state flip, Closure OS disposition, XVerify, commit, push, provider auth mutation,
  sprint kill, or manual `.tasks` deletion.

## Execution topology

One atomic implementation task owns all three files. The previously generated pending preview
`a0b6cd6a-2e89-4c6f-a2cd-c33c6f6307cf` is not admissible because it split the explicit
one-task request into three concurrent tasks; it must not be started. The canonical task order
inside the single worker is:

1. Define the stable call-site identity, AST binding-provenance, action/effect taxonomy, and
   fail-closed comparison contract in the audit.
2. Evolve the tracked baseline to the exact site-granular schema emitted and consumed by that
   audit without erasing or hiding live debt.
3. Add hermetic async-process positive and adversarial tests, then run integrated verification.

No FIX task may widen the three-file allowlist or cross any explicit exclusion. A FIX remains
part of this same outcome and must preserve the single-writer authority.

## Verification manifest

- `VITEST_MAX_FORKS=2 npx vitest run tests/scripts/audit-operation-ingress.test.ts --reporter=dot`
- `node scripts/audit-operation-ingress.mjs --check`
- `npm run lint`
- Real script entrypoint proof over repository truth; test fixtures use isolated temp roots,
  asynchronous process APIs, no `spawnSync`, network, or external service.
- Independent read-only analysis checkpoint after worker settlement and disk verification.
- Remote CI is advisory. XVerify is explicitly deferred by owner decision.

## DONE criteria

- Every counted semantic action/effect is supported by AST binding provenance and a
  deterministic stable call-site ID; direct, alias/import and shadowed-binding cases are
  distinguished.
- `fs-read`, `fs-write`, `fs-delete`, `db-memory`, `process`, `provider-network`, and `tool`
  taxonomies are separately measured; unknown taxonomy or ambiguous attribution fails closed.
- File-level promotion, dead resolve, aggregate compensation and site substitution each have
  a hermetic negative proof tied to the exact affected site.
- Repeated identical scans produce identical IDs and baseline comparison. A changed or moved
  site cannot silently inherit another site's credit.
- All scoped verification passes from current source, the worker settles terminally, and an
  independent read-only checkpoint returns GO/PASS.
- Evidence is transferred through authorized MASTER/settlement projection; only then is this
  capsule deleted on consume. Parent `4030` remains open.

## Stop conditions

- Any write outside the three product files or discovery of another live writer.
- The required model cannot be implemented using existing repository dependencies and the
  exact file authority.
- Correctness requires permission, approval, invocation/effect context, catalog convergence,
  registry propagation, or effect-writer migration.
- Baseline regeneration cannot preserve live unmatched debt with an auditable site mapping.
- Sprint/worker/settlement identity is ambiguous, provider/auth state would need mutation, or
  disk and Deckent status disagree.

On stop, record a typed HOLD/NO_GO; do not widen authority or manufacture completion.

## Transition cleanup

After terminal settlement, verify no active sprint/worker/settlement using CLI and disk truth.
Then run exact-sprint official `deckent cleanup` dry-run; apply cleanup only to owned,
cleanup-eligible state. Never use `rm .tasks/*`; preserve live/ambiguous state, durable
receipts/evidence, handoffs, and `.brain/memory.db`. Re-measure readiness before admitting the
next child.
