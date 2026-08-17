# Run inspector read model

## Product contract

The run inspector is the canonical, read-only projection of run state. The core read model owns the response shapes. HTTP and Terminal are faces over that model; they do not calculate lifecycle state independently.

Lifecycle has one authority: the canonical run-status authority. Inspector artifacts may add task, archive, heartbeat, plan, result, lock, and lineage evidence, but they never override or re-infer lifecycle. This keeps the existing [`/api/sprint/*` contract](api-surface.md#core-read-and-diagnostic-routes) and the new inspector faces on one truth.

The package is tolerant of absent or malformed optional artifact files. It returns nullable or empty evidence instead of fabricating values. Reading the inspector does not mutate run state.

## Snapshot shape

The schema-version 1 snapshot is the canonical live-run projection served by `/api/sprint/live`. Existing response keys remain compatible; the inspector fields are additive.

| Field | Type | Meaning |
|---|---|---|
| `schemaVersion` | `1` | Version of the inspector response contract. Additive fields do not change version 1; a semantic change requires a version change. |
| `generatedAt` | ISO-8601 string | Time at which this projection was generated. It is not a lifecycle timestamp. |
| `revision` | number | Monotonic freshness value derived with the read model's maximum-source-mtime rule. It covers every source read by the projection. Treat it as a change detector, not an event offset or pagination cursor. |
| `lifecycle` | canonical lifecycle value | Lifecycle copied from the run-status authority. Artifact presence cannot replace this value. |
| `active` | boolean | Backward-compatible active-state projection derived from the same lifecycle authority. |
| `tasks` | task summary array | Tolerantly parsed task views for the current run. Missing optional artifacts remain missing or nullable. |

## Run list shape

`listRunInspectorRuns(projectRoot, opts?)` returns the current logical run together with archived runs discovered from the settlement/archive layouts already written by the runtime.

### List envelope

| Field | Type | Meaning |
|---|---|---|
| `schemaVersion` | `1` | Inspector schema version. |
| `generatedAt` | ISO-8601 string | Projection generation time. |
| `revision` | number | Maximum-source-mtime revision across the authority and archive sources read for this response. An added archive record can advance it. |
| `runs` | run entry array | Current run first, followed by archives newest-first. If no archive directory exists, only the current authority entry is returned. |

### Run entry

| Field | Type | Meaning |
|---|---|---|
| `runId` | string | Logical run identifier found in the authority or archive record. |
| `lifecycle` | canonical lifecycle value, when `source` is `authority` | Current lifecycle copied from the run-status authority. It is never inferred from archive files. |
| `recordState` | archive record state, when `source` is `archive` | State recorded by the archived settlement record. It is not promoted to current lifecycle authority. |
| `source` | `'authority' \| 'archive'` | Provenance of the entry. |
| `startedAt` | string or `null` | Recorded start time, or `null` when the source does not contain one. |
| `settledAt` | string or `null` | Recorded settlement time, or `null` when absent. |
| `taskCounts` | recorded task-count object or `null` | Counts present in the source record. Missing counts are not reconstructed. |

## Task detail shape

`readRunInspectorTaskDetail` returns one task drill-down. Package 1 supplies the existing task fields, including status, assigned agent/model, heartbeat summary, lock state, bounded plan view and its truncation flag, and result summary. Task 1 of this package adds `lineage` without removing or changing those keys.

### Detail fields

| Field | Meaning |
|---|---|
| Task identity and status | Identifies the requested task and reports artifact-backed task state. Unknown IDs are not replaced with synthetic tasks. |
| Agent and model | Values recorded for the task; absence stays absent. |
| Heartbeat summary | Bounded, tolerant projection of the task heartbeat rather than a liveness authority claim. |
| Lock state | Artifact-backed lock information; it does not override canonical run lifecycle. |
| Plan and truncated flag | Bounded plan projection. The explicit flag reports whether content was truncated; consumers must not present a truncated plan as complete. |
| Result summary | Artifact-backed result fields, including `selfAssessment`, when present. |
| `lineage` | Task-local log and result-evidence provenance described below. |

### Lineage block

| Field | Type | Meaning |
|---|---|---|
| `logPath` | string or `null` | Path to the task's own log artifact, or `null` when unavailable. The detail response does not include log content. |
| `logTailAvailable` | boolean | Whether the task-local log tail can be obtained through the existing log face. It does not mean log content is embedded here. |
| `resultEvidence` | object or `null` | Evidence derived only from the task's own result artifact; `null` when no usable result exists. |
| `resultEvidence.selfAssessment` | string or `null` | Recorded self-assessment, or `null` when the result omits it. |
| `resultEvidence.filesChanged` | string array | Recorded changed-file paths. Absence is represented honestly as an empty array. |
| `resultEvidence.notesPresent` | boolean | Whether the result contains notes; note content is not duplicated into the lineage block. |

## HTTP API

These are monitoring reads and use the same authentication class as `/api/sprint/live`. See [HTTP and SSE API surface](api-surface.md) for server authentication and route-wide policy.

| Method and path | Response |
|---|---|
| `GET /api/sprint/live` | Canonical schema-version 1 inspector snapshot. |
| `GET /api/sprint/task/:id` | Task detail with the additive `lineage` block. Existing package-1 keys remain present. |
| `GET /api/inspector/runs` | Run-list envelope containing the current authority entry and any discoverable archive entries. |

The API face depends on the core read-model package. Route registration alone does not create a second lifecycle authority.

## Terminal command

Task 3 ships the read-only Terminal face:

```bash
deckent inspect
deckent inspect <taskId>
deckent inspect --json
deckent inspect <taskId> --json
```

| Invocation | Behavior |
|---|---|
| `deckent inspect` | Lists runs with run ID, state, source, and settlement time. |
| `deckent inspect <taskId>` | Shows task status, agent, model, heartbeat summary, plan truncation state, result self-assessment, and lineage. |
| `--json` | Emits the core read-model shape for machine consumers instead of the localized table/detail presentation. |
| Unknown task ID | Prints a typed, localized message without a stack trace and exits with code `1`. |

Human-readable labels use the English/Turkish message catalogs. The command consumes the core module directly; it does not infer state from formatted API or Terminal output.

## Face availability

| Face | Package status |
|---|---|
| Core read model | Package 1 plus Task 1: snapshot, task detail, run list, and lineage. |
| HTTP API | Task 2: run list endpoint and additive task lineage. |
| Terminal | Task 3: `deckent inspect` list/detail and JSON modes. |
| Desktop | Task-dependent after the HTTP package; not part of packages 1–2 documented here. |

## Explicit non-goals and open 6071 dimensions

Packages 1–2 are a bounded read-model and face expansion, not closure of the full `RUN-INSPECTOR-001` outcome. The following remain open 6071 dimensions:

- No million-event virtualization proof or implementation yet.
- No revision-plus-cursor event stream, cursor backfill, or resume stream yet. `revision` is not a cursor.
- No complete execution graph/timeline covering attempt, agent, worker, tool, MCP, context, prompt/skill, token/cost/latency, checkpoint, approval, policy, verifier, result, and evidence lineage yet.
- No reconnect, ordering, deduplication, or backpressure closure yet.
- No claim of Desktop parity, tenant-isolation proof, accessibility proof, or Linux/macOS/Windows-native/WSL scale proof in these packages.

Existing log streaming remains a separate face. The task-detail lineage block deliberately exposes availability and provenance, not log content.
