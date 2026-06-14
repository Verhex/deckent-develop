# Event Channels Reference

Deckent uses a structured, append-only JSONL event stream for Brain ↔ Worker ↔ Auditor
communication. Each event is written by `writeEvent()` from `src/core/event-stream.ts`
and stored in `.deckent/<sprint-id>-events.jsonl` (one JSON object per line, Protocol
Version 1.0, per ADR-035).

You can tail this stream in real time via the `deckent_watch` MCP tool. (The CLI `deckent watch` is a tmux split-view and does not read this JSONL stream.)
Events can be queried by channel using `readEvents(projectRoot, sprintId, { channel })`.

---

## Channel Codes

Every channel code follows the convention `SOURCE→TARGET:SIGNAL`. The `CHANNELS` constant
in `src/core/event-stream.ts` is the canonical definition; the table below is
generated from it.

### Brain ↔ Worker

| Channel | Constant | Fires when |
|---------|----------|------------|
| `BRAIN→WORKER:TASK_ASSIGN` | `CHANNELS.TASK_ASSIGN` | Brain assigns a new task to a worker at spawn time |
| `WORKER→BRAIN:HEARTBEAT` | `CHANNELS.HEARTBEAT` | Worker writes a periodic liveness heartbeat (`.hb` file update) |
| `WORKER→BRAIN:RESULT` | `CHANNELS.RESULT` | Worker finishes a task and writes its `.result` file |
| `WORKER→BRAIN:QUESTION` | `CHANNELS.QUESTION` | Worker raises a question or checkpoint request to Brain |
| `BRAIN→WORKER:ANSWER` | `CHANNELS.ANSWER` | Brain replies to a worker question or checkpoint |

### Worker → Auditor / Auditor → Brain

| Channel | Constant | Fires when |
|---------|----------|------------|
| `WORKER→AUDITOR:CODE_VERIFY_REQUEST` | `CHANNELS.CODE_VERIFY_REQUEST` | Worker requests Auditor to verify its completed code |
| `AUDITOR→BRAIN:VERIFICATION_RESULT` | `CHANNELS.VERIFICATION_RESULT` | Auditor reports a GO / NO_GO / GO_WITH_TECH_DEBT verdict for a task |
| `AUDITOR→BRAIN:SCOPE_COLLISION_DETECTED` | `CHANNELS.SCOPE_COLLISION_DETECTED` | Auditor detects that two tasks write to the same files (plan-time or runtime) |
| `AUDITOR→BRAIN:ADR_VIOLATION` | `CHANNELS.ADR_VIOLATION` | Auditor detects a worker result that violates an accepted ADR |
| `AUDITOR→BRAIN:GATE_COMPUTED` | `CHANNELS.GATE_COMPUTED` | Auditor finishes computing a multi-dimensional quality gate score |
| `AUDITOR→BRAIN:LOAD_REPORT_WRITTEN` | `CHANNELS.LOAD_REPORT_WRITTEN` | Auditor writes a load/utilization report to disk |

### Broadcast (Brain → All)

| Channel | Constant | Fires when |
|---------|----------|------------|
| `BRAIN→*:METRIC_EMITTED` | `CHANNELS.METRIC_EMITTED` | Brain emits a named numeric metric (coverage, token usage, duration, etc.) |
| `BRAIN→WORKER:FIX_REQUEST` | `CHANNELS.FIX_REQUEST` | Brain triggers a FIX-phase retry after a NO_GO result |
| `BRAIN→*:SPRINT_PHASE_CHANGE` | `CHANNELS.SPRINT_PHASE_CHANGE` | Sprint lifecycle transitions between phases (PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP) |

### User Notification

| Channel | Constant | Fires when |
|---------|----------|------------|
| `DECKENT→USER:NOTIFY` | `CHANNELS.NOTIFY` | Deckent surfaces a notification to the end user (dispatch, connector, alert) |

### Audit Trail (Deckent → Auditor)

| Channel | Constant | Fires when |
|---------|----------|------------|
| `DECKENT→AUDIT:EVENT_WRITTEN` | `AUDIT_EVENT_CHANNEL` (`src/core/audit-writer.ts`) | `writeAuditEvent()` appends a structured audit event to the tamper-evident hash chain (ENT-3) |

Unlike the channels above, this constant lives in `src/core/audit-writer.ts`, not in the
`CHANNELS` table of `event-stream.ts`. Events on this channel use `source: 'deckent'`,
`target: 'auditor'`, and every payload carries `prevHmac` / `hmac` chain fields plus a
`timestamp` added by `writeAuditEvent()`.

#### Payload actions — `capability.success` / `capability.error`

Every capability invocation dispatched by the autonomous engine (`kind=capability`
backlog entries, F8 broker) is audited through `createAuditedCapabilityRegistry`. The
emit callback in `src/orchestra/autonomous/runtime-loop.ts` writes one audit event per
invocation with `sprintId: 'autonomous'` (events land in
`.deckent/autonomous-events.jsonl`):

| Field | Value |
|-------|-------|
| `action` | `capability.success` — handler returned without throwing; `capability.error` — handler threw |
| `tenantId` | Invoking actor's tenant id; falls back to `'local'` when the invocation carries no actor |
| `actor` | Invoking actor's id; falls back to `'system'` when the invocation carries no actor |
| `target` | The invoked capability verb (`handler.requiredCapability`, e.g. `fs.read`) |
| `metadata` | `{ timestamp, error }` — `timestamp` is the ISO 8601 UTC invocation time; `error` is the handler's error message, present only on `capability.error` |

### Auditor Housekeeping

| Channel | Constant | Fires when |
|---------|----------|------------|
| `AUDITOR→BRAIN:ORPHAN_HB_DETECTED` | `CHANNELS.ORPHAN_HB_DETECTED` | Auditor finds a stale heartbeat file from a previous sprint |
| `AUDITOR→BRAIN:AUTHORITY_VIOLATION` | `CHANNELS.AUTHORITY_VIOLATION` | Auditor detects an RBAC boundary violation per ADR-037 |

### Timeout Management

| Channel | Constant | Fires when |
|---------|----------|------------|
| `BRAIN→WORKER:TIMEOUT_ASSIGN` | `CHANNELS.TIMEOUT_ASSIGN` | Brain sends a worker its task timeout budget at spawn |
| `WORKER→BRAIN:TIMEOUT_WARNING` | `CHANNELS.TIMEOUT_WARNING` | Worker signals it is approaching its timeout budget |
| `AUDITOR→BRAIN:TIMEOUT_CAP_EXCEEDED` | `CHANNELS.TIMEOUT_CAP_EXCEEDED` | Auditor reports a worker has exceeded the sprint-wide timeout cap |
| `BRAIN→WORKER:TIMEOUT_EXTEND` | `CHANNELS.TIMEOUT_EXTEND` | Brain grants a timeout extension to a worker |

### Lifecycle & State

| Channel | Constant | Fires when |
|---------|----------|------------|
| `BRAIN→WORKER:NEVER_DISPATCHED` | `CHANNELS.NEVER_DISPATCHED` | Evaluate phase reports a task that was planned but never spawned |
| `BRAIN→SPAWN:BLOCKED` | `CHANNELS.SPAWN_BLOCKED` | Spawn pipeline blocks a task due to a scope collision (`action='block'`) |
| `BRAIN→*:DEPENDENCY_RESOLVED_BY_FIX` | `CHANNELS.DEPENDENCY_RESOLVED_BY_FIX` | A fix-retry task completed DONE, resolving the original task's NO_GO for downstream consumers |
| `BRAIN→WORKER:DEPENDENCY_BLOCKED` | `CHANNELS.DEPENDENCY_BLOCKED` | A task cannot be spawned because its upstream dependencies are unresolved (state-change-only — duplicate events are suppressed) |
| `WORKER→BRAIN:AUTH_FAILED` | `CHANNELS.AUTH_FAILED` | Worker pre-spawn auth health check failed (`claude --version` non-zero or empty) |
| `BRAIN→AUDITOR:CONTAINER_PATH_SANITIZED` | `CHANNELS.CONTAINER_PATH_SANITIZED` | Brain sanitized a leaked container `/workspace` path in a host-facing config file |

---

## Event Structure

Every event written to `.deckent/<sprint-id>-events.jsonl` conforms to `DeckentEvent`:

```typescript
{
  timestamp: string;          // ISO 8601 UTC
  sequence: number;           // Monotonic per-sprint counter
  protocol_version: '1.0';    // ADR-035 Protocol Version 1.0
  source: string;             // 'brain' | 'worker' | 'auditor' | 'deckent'
  target: string;             // 'brain' | 'worker' | 'auditor' | 'user' | '*'
  channel: string;            // One of the CHANNELS values above
  payload: unknown;           // Channel-specific data
}
```

---

## Watching Events

```bash
# CLI — real-time stream
deckent watch

# MCP
deckent_watch { root: "." }
```

Both surface events from the active sprint's `.deckent/<sprint-id>-events.jsonl` file as
they are appended by `writeEvent()`.

---

## Notes

- **Fail-safe:** `writeEvent()` never throws. Write failures log a warning and return `null`
  so they do not crash the sprint.
- **DEPENDENCY_BLOCKED deduplication:** The event stream suppresses duplicate
  `BRAIN→WORKER:DEPENDENCY_BLOCKED` events for the same `(taskId, unresolvedDeps)` pair
  within a sprint to prevent log spam on every wave tick.
- **Source file:** `src/core/event-stream.ts` — `CHANNELS` constant, `writeEvent`,
  `readEvents`, `reconstructState`.
