# ADR-G-018: Verification Protocol & Event-Stream

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=versioned protocol v1.0 + append-only `.deckent/recently-works/<sprintId>-events.jsonl` (`src/core/event-stream.ts`; 2-file size-capped rotation) + ~30 additive channels (canonical = the `CHANNELS` map) + fail-safe write (never crashes a run) + permanent dual transport → tomorrow=APR approval-channels + COMM-2 typed vocabulary + PROGRESS naming-fix + per-mode channel completion (jointly with ADR-G-020)
**Status:** accepted (amendment — doc-drift fixed: event-path, ~30 channels, single-process sequence, rotation-implemented, core-messages coverage) · **Date:** 2026-06-30 · **Absorbs:** ADR-035 (Brain ↔ Worker ↔ Auditor Verification Protocol Standard) · **Supersedes:** —
**Crosswalk:** ADR-035 → ADR-G-018

> **Mechanism vs policy (cross-ref, NOT merge):** This ADR is the **mechanism** — the message envelope, the channel codes, the transport. **Who may send/receive on which channel** is **policy**, owned by ADR-G-020 (Authority). The two are deliberately **cross-referenced, not merged**: channels (here) and channel-rights (there) are separate cohesive concerns, each kept whole.

---

## Context

Sprint 137 meta-dogfood surfaced a verification gap: a worker reported `DONE` while vitest still had 53 failing tests — the "code exists → DONE" shortcut. The root cause was the absence of a **formal, versioned, parseable protocol** for Brain ↔ Worker ↔ Auditor messages; each component emitted its own ad-hoc file format (`.hb` heartbeat, `.result`, git-diff output) that could not be independently verified, replayed, or version-negotiated.

ADR-035 (Sprint 138) answered with a versioned message protocol + an append-only event-stream as the canonical-read layer, with file-based state continuing in parallel as a fail-safe. The 2026-06-30 review confirms it as **ADR-G** (the orchestration backbone every subsystem speaks over) and resolves the one piece of ADR-035 that did not age well — its "remove file-based by Sprint 142" roadmap (see Decision §5).

Heavier transports were considered and rejected at design time for a **zero-infrastructure, fail-safe** posture: gRPC/Protobuf (schema-compiler toolchain), WebSocket (Docker port-mapping + container reachability), Redis Pub/Sub and SQLite (external/heavier substrate). The append-only `.jsonl` stream needs no daemon, no port, and degrades safely.

> **Note:** the original Redis/SQLite rejection cited the old minimal-dependency rule (since reframed to merit-based selection, ADR-D-005); the append-only-`.jsonl` choice nonetheless stands on its own **fail-safe + zero-infra** grounds, independent of that reframe.

---

## Decision (Today)

### 1. Versioned message protocol (v1.0) + append-only event-stream

All protocol-managed **core** Brain ↔ Worker ↔ Auditor messages are recorded, in order, to an append-only **`.deckent/recently-works/<sprintId>-events.jsonl`** stream (`src/core/event-stream.ts`; `src/orchestra/event-stream.ts` is a re-export shim since the Sprint 279 core-move). The stream is the **canonical-read truth**; the protocol is forward-compatible (extra payload fields are ignored). (Coverage caveat: standard `worker.ts` mirrors `.result`/`.hb` to the stream, but some agentic entry paths — `agentic-worker-entry.ts`, `http-agentic-worker.ts` — write `.result`/`.hb` directly without an event-mirror; backend-parity is pending — EVENT-MIRROR-PARITY.)

```json
{
  "timestamp": "2026-04-14T10:00:00.000Z",
  "sequence": 42,
  "protocol_version": "1.0",
  "source": "worker | brain | auditor | deckent",
  "target": "brain | worker | auditor | user | *",
  "channel": "CHANNEL_CODE",
  "payload": {},
  "correlationId": "…",
  "causationId": "…"
}
```

- `sequence` — run-monotonic integer from 1. `nextSequence()` is a persisted file counter, **monotonic within a single process** but read-modify-write **without a lock** — multi-process concurrent writers are not yet atomicity-guaranteed (SEQ-ATOMIC).
- `target: "*"` — broadcast.
- `correlationId` / `causationId` — optional message-lineage (additive; consumers ignoring them stay compatible).

### 2. ~30 channel codes (additive — protocol stays 1.0; canonical = the `CHANNELS` map)

The original 15 V1.0 channels — `BRAIN→WORKER:TASK_ASSIGN`, `WORKER→BRAIN:HEARTBEAT/RESULT/QUESTION`, `BRAIN→WORKER:ANSWER`, `WORKER→AUDITOR:CODE_VERIFY_REQUEST`, `AUDITOR→BRAIN:VERIFICATION_RESULT/SCOPE_COLLISION_DETECTED/ADR_VIOLATION/GATE_COMPUTED/LOAD_REPORT_WRITTEN`, `BRAIN→*:METRIC_EMITTED/SPRINT_PHASE_CHANGE`, `BRAIN→WORKER:FIX_REQUEST`, `DECKENT→USER:NOTIFY` — remain **verbatim**. 13 were **added** since (ORPHAN_HB_DETECTED, AUTHORITY_VIOLATION, TIMEOUT_ASSIGN/WARNING/CAP_EXCEEDED/EXTEND, NEVER_DISPATCHED, SPAWN_BLOCKED, DEPENDENCY_BLOCKED, DEPENDENCY_RESOLVED_BY_FIX, AUTH_FAILED, CONTAINER_PATH_SANITIZED, PROGRESS, NERVOUS_NOTIFICATION, NERVOUS_APPROVAL_CONSUMED). The canonical list is the `CHANNELS` map in `src/core/event-stream.ts` (~30 today — count not pinned here). Channels are **additive by design**, so `protocol_version` stays `'1.0'`; a breaking change would bump to `2.0`.

### 3. Lineage & forward-compatibility

`source` / `target` / `channel` / `payload` is the fixed core; `correlationId` / `causationId` add causal lineage. New consumers read `protocol_version`; unknown payload fields are ignored — old consumers never break on additive growth.

### 4. Fail-safe (never blocks a run)

```xml
<fail-safe>
  <rule>writeEvent() is try/catch → console.warn + returns null on failure
        (disk full, permission) — a run NEVER halts on event-stream I/O error.</rule>
  <rule>Sequence monotonicity via a persisted counter — single-process monotonic; multi-process atomicity needs a lock (SEQ-ATOMIC).</rule>
</fail-safe>
```

### 5. Dual transport is PERMANENT (file-based `.hb`/`.result` + event-stream)

```xml
<dual-transport status="permanent" fail-safe="yes">
  <layer kind="file-based">.tasks/*.hb heartbeat + .tasks/*.result — the LIVE PRIMARY
    read path (result-collector.ts, worker.ts, ADR-D-007 manual-dispatch).</layer>
  <layer kind="event-stream">.deckent/recently-works/<sprintId>-events.jsonl — the
    canonical-READ, replayable, version-negotiated layer (2-file size-capped rotation).</layer>
  <decision>BOTH are preserved PERMANENTLY as a fail-safe pair. ADR-035's original
    "Backward-Compatibility Roadmap" (file-based soft-deprecated by Sprint 140, REMOVED
    by Sprint 142) is REJECTED — it never materialized (file-based was still live-primary
    at Sprint 172 and Sprint 280) and is now decided AGAINST: the event-stream is a
    canonical-read layer ON TOP of file-based state, never a replacement for it.</decision>
</dual-transport>
```

---

## Intent / Roadmap (Tomorrow)

- **APR approval-channels:** the ApprovalBroker (cross-environment live approval) sends/receives over dedicated event-stream channels — the protocol becomes the transport for human-in-the-loop approval. (MASTER-PLAN: APR.)
- **COMM-2 typed vocabulary:** the "no worker→worker direct messaging — all mediated through the Brain bus" rule (policy in ADR-G-020) becomes a **typed message vocabulary** (DEPENDENCY_REQUEST, …) over this stream — transport-invariant, machine-checkable.
- **PROGRESS naming-fix:** `PROGRESS` is a bare code, deviating from the `SOURCE→TARGET:NAME` convention every other channel follows; it (and any future channel) is normalized to the convention.
- **Per-mode channel completion (jointly with ADR-G-020):** the channel set is sprint-centric; process / autonomous / flow / mission modes (ADR-G-024) need their channel gaps closed — reconciled **with ADR-G-020**, which owns per-mode channel-rights.

---

## Consequences

**(+)** Every Brain/Worker/Auditor message is versioned, replayable, and independently verifiable (the Sprint-137 "DONE shortcut" is closeable — the Auditor becomes an active verifier); additive channels grow without breaking consumers; the stream is fail-safe and zero-infrastructure; the dual transport is a durable safety net. Mechanism (channels) and policy (channel-rights, ADR-G-020) stay cleanly separated, each cohesive.

**(−)** Per-event disk I/O grows the `.jsonl` — **rotation is implemented** (MAX_EVENT_FILE_BYTES cap, 2-file rotate-to-`.1`), not deferred; the sequence counter is single-process-monotonic but **not multi-process atomic** (no lock — SEQ-ATOMIC); some agentic entry paths write `.result`/`.hb` without an event-mirror (EVENT-MIRROR-PARITY); the `PROGRESS` naming deviation and per-mode channel gaps are open until the roadmap items land; channel-rights enforcement is advisory/soft today (ADR-G-020 V1.0).

---

## References / Absorbed

- **Absorbs:** ADR-035 (Brain ↔ Worker ↔ Auditor Verification Protocol Standard — protocol v1.0, event-stream, channel codes, fail-safe, dual transport).
- **Policy partner (cross-ref, NOT merged):** ADR-G-020 (Authority, Roles, Flow & Enforcement — owns channel send/receive rights, the no-worker→worker mediated-bus rule = COMM-2, and per-mode channel-rights).
- **Cross-ref:** ADR-G-014 (Spawn Backend & Observation — cross-backend observability rests on this stream) · ADR-G-025 (Process Resilience & Live Observability — the PROGRESS / WORKER-LIVE-TRACE structured progress-stream) · ADR-G-022 (Nervous System — proactive triggers over the bus) · ADR-G-024 (Mode Architecture — per-mode channels) · ADR-G-019 (ADR Governance — DB-first storage / taxonomy).
- **Born work-items:** APR (approval-channels) · COMM-2 (typed mediated-bus vocabulary) · PROGRESS naming-fix · per-mode channel completion · SEQ-ATOMIC (multi-process sequence lock) · EVENT-MIRROR-PARITY (agentic entry paths emit event-mirror) · EVENT-CHANNELS-DOC-SYNC (`event-channels.md` path + ~30-channel snapshot).
- **Direction:** `.analysis/adr-review-crosswalk.md` (row 035 → ADR-G-018).
