# T12 — Repository migration dependency order

**Date:** 2026-08-22
**Mode:** Read-only audit of `REPO-MIGRATION-001`
**Verdict:** **GO for ordering; HOLD for execution**

`REPO-MIGRATION-001` remains `OPEN`. Its recorded dependencies are not settled, its 2026-07-31 weekend schedule expired unexecuted, and ADR-G-041 now requires a logical Core/Enterprise boundary freeze before any physical extraction. This note defines ordering only. It does not move files, change remotes, perform a repository cutover, choose license terms, or introduce license checks into kernel/runtime logic.

## Current dependency state

| Authority/work | Current state | Ordering consequence |
| --- | --- | --- |
| `MODULAR-BOUNDARY-FREEZE-001` / ADR-G-041 | Binding direction; executable ownership/import ratchet remains roadmap work | Apply the logical owner map and no-new-crossing rule now, while retaining the compact modular monolith. This is the first guard and remains active through every later phase. |
| `REPO-CLEANUP-001` | `OPEN` | Produce the exact retain/wire/archive/delete disposition and recovery manifest before cleanup execution or migration rebaseline. Branch, HOME, DB, and runtime state remain separate authorities. |
| `REPO-CLEANUP-APPLY-001` | `BLOCKED` on `REPO-CLEANUP-001`; destructive `G3` gate | Run only after the manifest is stable and fresh destructive approval exists. A read-only audit cannot imply this approval or apply the cleanup. |
| `DOCS-TOPOLOGY-001` | `OPEN` | Settle ownership and consumers for `docs`, `docs1`, `.analysis`, and generated documentation before choosing the repository export set or rewriting links/writers. |
| `MEMORY-AUTHORITY-001` | `OPEN`; `G2,G6` | Establish repo-local, provider-neutral canonical memory and projection rules before deciding what crosses the repository boundary. `.brain`/`.deckent` local state is carried privately, never promoted into public repository authority. |
| `REPO-MIGRATION-001` | `OPEN`; `G2,G5` | Rebaseline target, source set, history, remotes, docs, memory, rollback, and read-only transition only after all three declared dependencies above are satisfied. Obtain fresh decision and remote-operation authority; the expired schedule grants none. |

## Required sequence

1. **Freeze logical ownership without moving code.** Record a target owner for new capabilities, prevent new cross-layer crossings, place Enterprise concerns behind public Core ports, and preserve one kernel, scheduler, policy, state, and evidence authority.
2. **Settle cleanup inventory.** Complete `REPO-CLEANUP-001` with an exact consumer graph, hashes, disposition, and recovery plan. Do not conflate repository files with HOME, database, runtime, or memory authorities.
3. **Settle docs topology and memory authority.** These may be analyzed alongside cleanup inventory, but both must finish before migration rebaseline. Documentation writers/links need one topology; canonical memory needs a repo-local authority with provider surfaces as projections and private local state excluded from the public source set.
4. **Apply approved filesystem cleanup.** Only after step 2 and a fresh `G3` receipt may `REPO-CLEANUP-APPLY-001` perform recoverable moves/deletions and prove links, tests, and clean-clone behavior. Completion evidence becomes an input to rebaseline; it is not repository-cutover authority.
5. **Close physical-extraction admission gates.** Before interpreting the target as separate Core/Enterprise repositories, settle versioned contracts, kernel purity, application services, surface protocol, adapter ports, executable import ratchets, behavior baselines, migrations/rollback fixtures, and the declared environment proof plan. Calendar timing is not admission evidence.
6. **Perform behavior-neutral Core extraction inside the existing lineage.** Extract in dependency order: contracts → kernel → runtime → application/SPI. Keep the root `deckent` package as a compatibility facade, migrate consumers one by one, and require unchanged Community behavior before advancing.
7. **Rebaseline and authorize repository migration.** With the dependency evidence current, define the exact public Core target/source/history/remotes/docs/memory exclusions/rollback/read-only transition. Run a fresh secret audit and obtain new `G2` and `G5` authority. The missing legacy sync script must be rebuilt and reviewed; its absence is not permission to improvise a cutover.
8. **Cut over public Core, then add Enterprise repositories.** The public `deckent` repository contains MIT Core packages and Community distribution. Only afterward may the private Enterprise repository be established for additive modules that consume published semver Core APIs, use isolated state migrations, and never copy Core source or create a second runtime authority.
9. **Prove cutover assurance.** Verify Core-only and Core+Enterprise install, upgrade, rollback, recovery, compatibility, every-environment, and supply-chain matrices. Both compositions must retain the same kernel/run/task/evidence identities; entitlement failure must not stop Core or lose data.

## Explicit stop conditions

Repository migration must remain on **HOLD** if any of the following is proposed or observed:

- a filesystem move, remote change, history rewrite, visibility flip, or archive transition before the applicable fresh gate;
- a package/repository split before contract-stability and behavior-proof gates;
- a private Enterprise repository that deep-imports or copies Core internals;
- a second kernel, scheduler, policy, state-machine, registry, or evidence authority;
- license or entitlement logic inside kernel/runtime business logic rather than the module admission/composition boundary;
- public publication of private `.brain`/`.deckent` state, secrets, or provider HOME projections as canonical memory.

## Audit conclusion

The safe order is **logical-boundary freeze → cleanup inventory → docs topology plus memory authority → approved cleanup apply → contract-stability gates → consumer-by-consumer Core extraction → fresh repository rebaseline/authorization → public Core cutover → additive Enterprise split → assurance**. This sequence satisfies the existing `REPO-MIGRATION-001` dependency row while incorporating ADR-G-041's no-premature-split and single-kernel constraints. No migration execution is authorized by this note.
