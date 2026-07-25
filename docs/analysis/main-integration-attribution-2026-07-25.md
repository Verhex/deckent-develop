# Main integration attribution — 2026-07-25

## Outcome

The goal worktree is not safely mergeable into dirty main as one unreviewed operation. Both
worktrees share the exact base `ff33181b5b1e415aa4cff1106f4edd48c0a14f05`, but their uncommitted
content differs materially. The obstacle blocks the direct-merge approach, not the productization
goal.

No commit, push, stage, stash, reset, restore, clean, merge, cherry-pick, file move or deletion was
performed by this inventory.

## Snapshot

| Surface | Tracked dirty | Untracked | Base |
|---|---:|---:|---|
| main | 75 | 63 | `ff33181b` |
| goal worktree | 372 | 161 | `ff33181b` |

Pre-report content anchors:

- goal tracked binary patch:
  `de1ea42c146b3ae250a0c0de8faac256f4abff491b809db172e9bd11a7dc9bf6`
- goal untracked content manifest:
  `bceceb221b81daa0e491d36f64db130f8dcbfd4f81c5f042e377a8778ce8c10d`
- main tracked binary patch:
  `5bcf99c6cd73d0195473e5c171233b91d58abb59eaef4dc56dc6bbb7e043122e`
- main untracked content manifest:
  `8a2cc4968f1f3c91ddc092a4124b71ebaf58bb6d1aa502428d2866fc581dc999`
- common dirty path list:
  `156f293e63a5a15d99e5f9b17566815a9ef47da212ae1d02b7595774b4f79b9b`

These hashes identify the inspected state; the addition of this report intentionally changes the
goal-worktree hashes on the next measurement.

## Attribution shape

Goal-worktree tracked changes:

| Top-level | Count |
|---|---:|
| `tests/` | 222 |
| `src/` | 105 |
| `docs/` | 23 |
| `scripts/` | 11 |
| `.brain/` | 4 |
| `.deckent/` | 3 |
| root docs/lock | 4 |

Goal-worktree untracked changes:

| Top-level | Count |
|---|---:|
| `.analysis/` | 59 |
| `tests/` | 54 |
| `src/` | 31 |
| `docs/` | 14 |
| `scripts/` | 1 |
| `.deckent/` | 1 |
| `node_modules` entry | 1 |

The `.tasks/` tree is gitignored and is not included in these Git status counts. Task/result files
there are runtime evidence, not implicit commit authority. A scan found 214 M-series result-shaped
files; 71 are not JSON, so result-file attribution alone is not reliable enough to authorize a
bulk commit.

## Common dirty paths

There are 51 paths dirty in both worktrees:

- 3 are byte-identical:
  - `.brain/exports/debt.md`
  - `.deckent/docs/core-memory/MEMORY.md`
  - `.deckent/docs/core-memory/law_alp_discipline_anchor.md`
- 19 divergent paths are cleanly mergeable by a base-aware three-way projection.
- 29 paths produce real overlapping conflicts.

Conflict-list SHA-256:
`bf3258e6d4701eae428f5492d5bba3174bf165bc1a15e9c8b0dc2e9b09a767b8`.

The exact-base diff3 projection contains 132 conflict hunks:

- 18 files have one or two conflict hunks.
- 4 files have three or four conflict hunks.
- 7 files have more than four conflict hunks.

The seven high-conflict files are tests (`docker-provider-cli`, `f1014-auth-isolation`,
`worker-auth-isolation`, `wm5-auth-guard`, `docker-provider-auth`, `docker-auth-precedence`,
`docker-multicli-buildarg`). They require semantic fixture reconciliation; choosing either whole
file would discard valid coverage from the other worktree. Production files are comparatively
bounded: the largest production conflicts are three hunks each in `spawn-backend-docker.ts` and
`mcp/server.ts`.

## Recovery snapshot reconciliation

The canonical snapshot
`.deckent/recovery-snapshots/main-dirty-2026-07-23T211052+0300/` is intact: all three
`SHA256SUMS` entries pass. Its 74 tracked paths were reconstructed at exact base `ff33181b` in a
disposable detached worktree and compared byte-for-byte with current main. Result:

- `0` captured tracked paths changed since the snapshot.
- Current main's one additional tracked dirty path is `.deckent/settings/repl-history`.
- Current main's five additional visible untracked paths are the four snapshot payload files
  themselves plus `.deckent/mcp-writer.lease`.

Therefore S1–S7 remains authoritative for current main attribution. The initial checksum attempt
from the repository root failed only because `SHA256SUMS` contains paths relative to the snapshot
directory; the correctly scoped verification passed and no integrity failure occurred.

### Conflict-to-snapshot-slice map

| Slice | Conflicting paths | Resolution rule |
|---|---:|---|
| S1 MCP entrypoint parity | 1 | Preserve real-path/symlink handshake while adding current common authority wiring. |
| S2 budget/settlement/crash | 5 | Reconcile lifecycle and settlement invariants before fixture expectations. |
| S3 cost/preflight surfaces | 6 | Use one owner policy/evidence projection; do not restore unknown-model `$0`. |
| S4 provider/auth/subprocess | 8 | Preserve credential isolation and backend capability semantics from both sides. |
| S5 config/model migration | 3 | Canonical API IDs and fail-loud migration remain load-bearing. |
| S6 hermetic tests | 2 | Update tests only after combined production behavior is fixed. |
| S7 docs/generated evidence | 4 | Regenerate from accepted combined code; never choose a whole generated side. |

The 29 paths are thus all attributable to an existing review slice; no eighth implementation
authority is needed.

### Real conflicts

- `.brain/exports/decisions.md`
- `.brain/exports/memory.md`
- `.brain/exports/summary.md`
- `.deckent/settings/features-manifest.json`
- `docs/MASTER-PLAN.md`
- `src/cli/commands/plan.ts`
- `src/core/config-migration.ts`
- `src/mcp/server.ts`
- `src/orchestra/runtime-budget-monitor.ts`
- `src/orchestra/spawn-backend-docker.ts`
- `src/orchestra/sprint-estimator.ts`
- `src/orchestra/sprint-spawner.ts`
- `tests/cli/commands/plan.test.ts`
- `tests/cli/helpers/output.test.ts`
- `tests/cli/spawn-multiprovider.test.ts`
- `tests/cli/start-cost-gate.test.ts`
- `tests/core/config-migration.test.ts`
- `tests/orchestra/docker-auth-precedence.test.ts`
- `tests/orchestra/docker-capture-truth.test.ts`
- `tests/orchestra/docker-multicli-buildarg.test.ts`
- `tests/orchestra/docker-provider-auth.test.ts`
- `tests/orchestra/docker-provider-cli.test.ts`
- `tests/orchestra/docker-settlement-monitor-wire.test.ts`
- `tests/orchestra/f1014-auth-isolation.test.ts`
- `tests/orchestra/scheduler-driver-composition.test.ts`
- `tests/orchestra/spawn-routing-adapter.test.ts`
- `tests/orchestra/sprint-estimator.test.ts`
- `tests/orchestra/wm5-auth-guard.test.ts`
- `tests/orchestra/worker-auth-isolation.test.ts`

### Divergent but mechanically auto-mergeable

- `src/cli/commands/start.ts`
- `src/cli/commands/status.ts`
- `src/core/cost-calculator.ts`
- `src/mcp/tools/start.ts`
- `src/orchestra/result-collector.ts`
- `src/orchestra/sprint-controller.ts`
- `src/orchestra/task-router.ts`
- `src/providers/claude.ts`
- `src/providers/gemini.ts`
- `tests/cli/start-snapshot-branch.test.ts`
- `tests/core/config.test.ts`
- `tests/core/cost-calculator.test.ts`
- `tests/mcp/run-tool-parity.test.ts`
- `tests/mcp/server.test.ts`
- `tests/mcp/tools/run.test.ts`
- `tests/orchestra/docker-budget-termination.test.ts`
- `tests/orchestra/docker-restart-reconcile.test.ts`
- `tests/orchestra/runtime-budget-monitor.test.ts`
- `tests/providers/gemini.test.ts`

“Auto-mergeable” is only a textual property. It is not proof that the combined behavior is correct;
the merged state still needs targeted tests, lint, `build:all`, full suite and compiled/live proof
appropriate to the claim.

## Exclusions

The integration manifest must exclude unless separately owner-approved:

- `.deckent/settings/resource-log.jsonl`
- `.analysis/ozet-notu-2026-07-18.md`
- `.analysis/ozet-notu/`
- runtime `.tasks/` worker/prompt/heartbeat/lock artefacts
- unadjudicated `.analysis/xverify/` receipts
- `node_modules`
- recovery snapshots and main-only user state
- publish/tag/repo-migration/key-custody/Desktop changes

Generated Brain exports and feature/identity manifests are not discarded. Their conflicting
versions require source-of-truth reconciliation and regeneration after code integration.

## Proposed commit stack

This is a review order, not authorization to commit:

1. **Execution budget landing and crash recovery**
   - landing state machine, checkpoint/continuation, termination ledger, settlement authority,
     Docker monitor/reconciler and their tests.
2. **Provider/model/limit/receipt authority**
   - canonical API model identity, exact provider/backend authority, reachability/limit evidence,
     fallback receipts and provider adapters.
3. **Approval and Goal-v2 runtime**
   - attended approval authority, normalized dependency graph, claim/fence/restart behavior and
     front-door wiring.
4. **Xverify finite production ingress**
   - prompt/attempt contract, strict runtime authority, common sprint/CLI ingress and tests.
5. **Surface parity and governance**
   - CLI/MCP/API wiring, error/manifest/orphan ratchets and documentation.
6. **SSOT regeneration**
   - MASTER-PLAN and Brain/feature/identity exports generated from the accepted combined state.

Files spanning more than one slice must be staged hunk-by-hunk. `git add -A` is not acceptable.

## Main integration order

1. Freeze other main writers for the integration window.
2. Create the reviewable local commit stack on the goal branch; do not push.
3. Re-measure main drift against the hashes above.
4. Apply non-overlapping commits first.
5. Reconcile the 29 conflict paths hunk-by-hunk against task evidence and accepted ADRs.
6. Regenerate derived SSOT files from the combined source.
7. Run targeted tests, lint, `build:all`, full suite and compiled provider-free smoke.
8. Ask separately for push approval.

## Owner gate

Required next authority: permission to create the local, no-push commit stack on
`goal/m1-graceful-budget-landing`. Main mutation remains a later, separately reviewed step.
