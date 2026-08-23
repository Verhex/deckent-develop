# Sprint identity inventory

**Evidence date:** 2026-08-23
**Scope:** Identity diagnosis and recovery boundaries only. This inventory performs no runtime mutation.

## Finding

The repository has three different identity domains. Treating them as one numeric namespace caused a detached-job timestamp to influence sprint allocation.

| Identity | Meaning | Canonical shape | Producer | Consumer |
|---|---|---|---|---|
| Sprint identity | Monotonic repository planning sequence | `sprint-NNN` (ordinal) | Sprint allocation through `getNextSprintId()` and persistence through `updateLastSprintId()` in `src/core/utils.ts` | Sprint logs, archives, recent-work/task archive evidence, and the next-sprint allocator |
| Run identity | One admitted execution attempt of a sprint | Runtime-owned execution/attempt ID; not a sprint ordinal | Run-flow admission path used by the MCP `start` tool | Provider-authority records, run-flow state, and start responses |
| Job identity | Handle and IPC namespace for a detached runner process | Value returned by `createExecutionJobId()` | Detached branch of the MCP `start` tool in `src/mcp/tools/start.ts` | `writeJobState()`, `getIpcDir()`, the runner config, and the caller-facing `jobId` |

A run or job may execute a sprint, but neither identity advances the sprint ordinal.

## Disk-proven ordinal floor

The durable ordinal evidence established **622** as the repository sprint floor before this recovery. Therefore the first canonical successor at that boundary was **`sprint-623`**.

During execution, `sprint-623` and `sprint-624` were allocated to two rejected PLAN attempts and their forensic task artifacts were preserved. The accepted implementation run is `sprint-625`; `.deckent/config.json:last_sprint_id` now legitimately reads `sprint-625`. This current value must not be confused with the pre-recovery pollution: the incident source was a legacy epoch-shaped detached-job identity entering sprint-shaped state, not the later ordinal advancement through 623–625.

The relevant allocator in `src/core/utils.ts` scans these durable filename surfaces:

- `.brain/sprints/`
- `.brain/archive/sprints/`
- `.deckent/archive/sprints/`
- `.recent-works/` (including `task-<ordinal>-...` names)

It then reads `.deckent/config.json:last_sprint_id`, parses both sources as sprint ordinals, and returns the maximum plus one. In this incident, the **producer** of polluted sprint-shaped state was the legacy detached-job identity path; the **consumer** that turned it into allocation pressure was the sprint ordinal/config scan in `getNextSprintId()`.

## Legacy epoch family and collision

Historical detached jobs used a millisecond epoch value in a sprint-shaped name:

```text
sprint-<Date.now()>
```

These `sprint-17…` values belong to the **legacy job namespace**, not the ordinal sprint namespace. Their `sprint-` prefix collided lexically with the filename/config patterns consumed by sprint allocation. The collision was semantic: a detached job identifier looked parseable as an ordinal even though it described a process execution.

`parseSprintOrdinal()` now identifies the legacy family by the bounded real-epoch interval from **2000-01-01T00:00:00.000Z (inclusive)** to **3000-01-01T00:00:00.000Z (exclusive)** and excludes members of that family from ordinal allocation. The check is semantic rather than a digit-count rule, so it does not impose an arbitrary upper bound on a future ordinal sequence.

The current detached branch in `src/mcp/tools/start.ts` no longer creates a sprint-shaped ID locally. It calls `createExecutionJobId()`, then passes that job identity unchanged to job state, IPC directory selection, runner configuration, and the response.

## Recovery scope

Recovery is intentionally narrow:

1. Restore the sprint allocation floor to the disk-proven ordinal **622**, which made **`sprint-623`** the first post-recovery allocation.
2. Keep run identities and detached job identities in their own namespaces.
3. Prevent legacy epoch-family identifiers from contributing to ordinal maxima.
4. Correct polluted configuration only; do not infer missing ordinal history from `last_sprint_id`.
5. Make no renames, deletions, or timestamp-to-ordinal conversions.

This document records the boundary. It does not modify `.deckent/config.json`, runtime state, archives, or job records.

## Preserved history

The recovery preserves **all existing timestamp-named history exactly as stored**, including every historical `sprint-<epoch-ms>` archive, event, metric, task, job, and IPC reference that remains on disk. Those values remain valid evidence of their original detached executions.

Preservation means:

- no timestamp record is rewritten;
- no timestamp record is deleted;
- no timestamp identifier is renumbered;
- no timestamp identifier is represented as a canonical sprint ordinal; and
- cross-references retain their original identifier bytes.

Exclusion from future sprint allocation is not deletion or invalidation. Legacy epoch-family records remain queryable historical evidence; they are only classified under the job/run lineage that produced them rather than the ordinal sprint sequence.
