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
| `revision` | number | Monotonic freshness value derived with the read model's maximum-source-mtime rule. It covers every source read by the projection. The live stream can use it as a freshness cursor; it is not an event offset, pagination cursor, or backfill position. |
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

`readRunInspectorTaskDetail` returns one task drill-down. Package 1 supplies the existing task fields, including status, assigned agent/model, heartbeat summary, lock state, bounded plan view and its truncation flag, and result summary. The additive `lineage` block does not remove or change those keys.

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
| `logPath` | string or `null` | Path to the task's own log artifact, or `null` when unavailable. |
| `logTailAvailable` | boolean | Whether a task-local log artifact is available. It remains the availability truth even when content cannot be decoded. |
| `logTail` | `{ lines: readonly string[], truncated: boolean }` or `null` | Last lines of the task-local log, or `null` when the log is absent or cannot be decoded as text. A torn final line is retained as-is. |
| `resultEvidence` | object or `null` | Evidence derived only from the task's own result artifact; `null` when no usable result exists. |
| `resultEvidence.selfAssessment` | string or `null` | Recorded self-assessment, or `null` when the result omits it. |
| `resultEvidence.filesChanged` | string array | Recorded changed-file paths. Absence is represented honestly as an empty array. |
| `resultEvidence.notesPresent` | boolean | Whether the result contains notes; note content is not duplicated into the lineage block. |

The log tail defaults to the last 40 lines. Callers can request a different positive count, up to the hard limit of 200 lines. The joined tail content is also bounded by `SPRINT_DETAIL_TEXT_CAP`; `truncated` is `true` when earlier lines were omitted or the text cap shortened the returned set. Truncation is reported only by the typed flag, never by an in-band ellipsis.

## HTTP API

These are monitoring reads and use the same authentication class as `/api/sprint/live`. See [HTTP and SSE API surface](api-surface.md) for server authentication and route-wide policy.

| Method and path | Response |
|---|---|
| `GET /api/sprint/live` | Canonical schema-version 1 inspector snapshot. |
| `GET /api/sprint/task/:id` | Task detail with the additive `lineage` block, including its bounded `logTail`. Existing package-1 keys remain present. |
| `GET /api/inspector/runs` | Run-list envelope containing the current authority entry and any discoverable archive entries. |

The API face depends on the core read-model package. Route registration alone does not create a second lifecycle authority.

`GET /api/sprint/task/:id?tailLines=<1..200>` selects the maximum number of returned tail lines. Omitting it uses 40. Zero, values above 200, negative values, non-integers, and non-numeric values return a typed HTTP `400` response rather than silently changing the request.

## SSE live snapshot stream

`GET /api/sprint/live/stream` is the monitoring-authenticated live face of the schema-version 1 snapshot. It uses the same authentication class as `/api/sprint/live` and sends Server-Sent Events until the client disconnects.

| Contract | Behavior |
|---|---|
| Snapshot frame | `event: snapshot` with the full `/api/sprint/live` payload, including the authority-bound backward-compatible `active` field. Frames are complete latest-state projections, not event deltas. |
| Initial connection | With no `sinceRevision`, the current snapshot is delivered once immediately. |
| `?sinceRevision=<int>` | Primes the connection cursor. The stream emits a snapshot only when its `revision` is greater than the supplied non-negative integer, so reconnecting at the last seen revision does not duplicate that frame. A non-integer or negative value returns a typed HTTP `400` response instead of opening a stream. |
| Coalescing | Delivery is revision-gated and latest-wins. If source revisions advance faster than polling or delivery, intermediate revisions can be skipped; consumers must treat every snapshot as the complete current state. |
| Keepalive | `event: ping` frames keep an otherwise idle SSE connection alive. They do not advance the revision cursor or carry a snapshot. |
| Disposal | Closing the client connection disposes the snapshot observer and its timers. Reconnect with the last observed `revision` to continue without replaying that snapshot. |

This first cursor-stream slice provides resumable latest-snapshot delivery. It does not provide an event ledger or cursor backfill for skipped intermediate revisions.

## Terminal command

Task 3 ships the read-only Terminal face:

```bash
deckent inspect
deckent inspect <taskId>
deckent inspect --follow
deckent inspect <taskId> --follow
deckent inspect --json
deckent inspect <taskId> --json
```

| Invocation | Behavior |
|---|---|
| `deckent inspect` | Lists runs with run ID, state, source, and settlement time. |
| `deckent inspect <taskId>` | Shows task status, agent, model, heartbeat summary, plan truncation state, result self-assessment, lineage, and the bounded log-tail section when available. |
| `deckent inspect --follow` | Prints the run-list header once, then updates one status line from the core snapshot observer with lifecycle, phase, worker count, and revision. It does not implement a separate polling loop. |
| `deckent inspect <taskId> --follow` | Re-renders the selected task's status and heartbeat line when the snapshot revision advances. |
| `--json` | Emits the core read-model shape for machine consumers instead of the localized table/detail presentation. |
| Unknown task ID | Prints a typed, localized message without a stack trace and exits with code `1`. |

Human-readable labels use the English/Turkish message catalogs. The command consumes the core module directly; it does not infer state from formatted API or Terminal output. Closing follow mode or interrupting it with `SIGINT` disposes its snapshot observer and timer before exit. JSON task detail includes `logTail` verbatim from the core projection.

## Desktop live stream adoption

The Desktop Runs view subscribes to `/api/sprint/live/stream`. Stream snapshots update the authority chip and current-run row; archived rows continue to come from the run-list fetch. The Worker view uses its mounted view's stream subscription to update the selected task's heartbeat when that task is present in a snapshot. Each mounted view owns at most one subscription and closes it on unmount.

Stream failure is explicit: the Runs view shows a localized degradation notice and keeps the manual refresh affordance available. It does not silently present stale data as live. Desktop consumes the authoritative snapshot fields and does not derive lifecycle state in the renderer.

## MCP tool

`deckent_inspect` is the read-only MCP twin of the Terminal command. It reads the same core projections and accepts one optional argument:

| Arguments | Result |
|---|---|
| No arguments | Returns the `listRunInspectorRuns` list envelope documented under [Run list shape](#run-list-shape). |
| `{ "taskId": "<taskId>" }` | Returns the `readRunInspectorTaskDetail` object documented under [Task detail shape](#task-detail-shape), including `lineage`. |
| Unknown or invalid `taskId` | Returns a typed MCP error result; the tool does not throw an uncaught exception or fabricate a task. |

The successful MCP JSON shapes are the same shapes emitted by `deckent inspect --json` and `deckent inspect <taskId> --json`, respectively. This is projection parity, not a separately formatted approximation: MCP and Terminal consume the same core read model.

## Face availability

| Face | Package status |
|---|---|
| Core read model | Snapshot, disposable snapshot observer, task detail, run list, lineage, and bounded log-tail content. |
| HTTP API | Run list, additive task lineage with `tailLines`, and `/api/sprint/live/stream` latest-snapshot SSE. |
| Terminal | `deckent inspect` list/detail, follow, and JSON modes. |
| MCP | `deckent_inspect` list/detail with Terminal JSON-shape parity. |
| Desktop | Runs and Worker views adopt the live snapshot stream with explicit manual-refresh degradation and unmount disposal. |

## Explicit non-goals and open 6071 dimensions

Package 4 adds bounded log-tail lineage, API tail selection, Terminal follow mode, and Desktop stream adoption to the previously shipped revision-cursor stream. It does not close the full `RUN-INSPECTOR-001` outcome. The following 6071 dimensions remain open:

- No million-event virtualization proof or implementation yet.
- No complete cross-surface execution timeline covering attempt, agent, worker, tool, MCP, context, prompt/skill, token/cost/latency, checkpoint, approval, policy, verifier, result, and evidence lineage yet.

Existing full log streaming remains a separate face; the task-detail lineage carries only the bounded tail described above.
