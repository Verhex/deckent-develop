# Nervous proposal "unknown" display fix — required title/message per detector (Bug 2)

- **Date:** 2026-06-18
- **Arc:** ARC-E / Nervous System (ADR-040) precision
- **Status:** design approved (Approach B) → writing-plans next
- **Scope class:** Tier-0 (internal core logic) → unit-test-sufficient
- **Origin:** Live dogfood (Sprint 290). Pending nervous proposals displayed as `⚠ WARNING — unknown / Detected: unknown / detectorId: unknown` even though the real `type` (`stale-worker`) and `actions` (`WORKER_RESPAWN`) were present. The reject path revealed the true types, proving the data exists but the human-readable fields are not populated. The user: "nervous can't ship proposals as 'unknown' — unacceptable."

## 1. Problem

`bootstrap.ts:275-278` builds the proposal context by reading `result.metadata.{detectorId,title,message}`:
```ts
const detectorId = String(metadata.detectorId ?? 'unknown');
const title = String(metadata.title ?? detectorId);
const message = String(metadata.message ?? `Detected: ${detectorId}`);
```
But detectors set `metadata: { type: 'stale-worker', count }` — **not** `detectorId`/`title`/`message`. So every field falls back to `'unknown'` / `Detected: unknown`. The detector classes DO carry an authoritative `detectorId` field (e.g. `StaleWorkerDetector.detectorId = 'stale-worker'`), but it is never propagated into the result. **Contract mismatch:** the pipeline expects human-readable fields that the detectors never produce.

## 2. Design — Approach B (required title/message, type-enforced)

Make the human-readable fields a **first-class, compile-enforced** part of the detector contract — so no detector can ever ship `'unknown'` again.

### B1 — `DetectorResult` gains required `title` + `message` (and registry-filled `detectorId`)
`src/core/nervous-types.ts` `DetectorResult`:
```ts
export interface DetectorResult {
  readonly risk: RiskLevel;
  readonly suggestedActions: ReadonlyArray<Pick<NotificationAction, 'id' | 'label' | 'risk' | 'payload'>>;
  readonly shouldNotify: boolean;
  /** Human-readable headline (REQUIRED — e.g. "Stale worker w-290-001"). */
  readonly title: string;
  /** Human-readable description (REQUIRED — what was detected + why it matters). */
  readonly message: string;
  /** Authoritative detector id — filled by the registry from the detector, NOT the detector body. */
  readonly detectorId?: string;
  readonly severity?: Severity;
  readonly groupKey?: string;
  readonly metadata?: Record<string, unknown>;
}
```
Making `title`/`message` **required** forces every detector return site to provide them (tsc fails until they do) — the structural guarantee against future `'unknown'`.

### B2 — every detector provides a specific `title` + `message`
All 12 detectors (`src/nervous/detectors/*.ts`), at **every** `return { … }` site (some detectors emit several, e.g. `agent-routing` corrupt-agent vs anomaly), add a concise, specific `title` + `message` derived from the data already in scope (worker id, counts, rates, paths). Examples:
- stale-worker → `title: \`Stale worker ${w.id}\``, `message: \`Heartbeat stale >${threshold}min on task ${w.taskId} — respawn proposed\``
- scope-collision → `title: 'Scope collision'`, `message: \`${n} tasks write overlapping files — reorder proposed\``
- token-spike → `title: 'Token spike'`, `message: \`Cost ${cost} exceeds ${threshold} (${severity})\``
The text is i18n-internal (English-default operator/diagnostic strings, not user-facing UI — consistent with the existing `reasoning[]`/debug conventions).

### B3 — registry attaches the authoritative `detectorId` (DRY)
`detector-registry.ts:179-183` `runAll`: when pushing a result, stamp the detector's id so the detector body never restates it:
```ts
const result = detector.detect(ctx);
if (result !== null) {
  results.push({ ...result, detectorId: detector.detectorId });
}
```

### B4 — bootstrap reads the fields directly
`bootstrap.ts:275-286`: drop the `metadata`-bag indirection + `'unknown'` fallbacks; read `result.title` / `result.message` / `result.detectorId` directly:
```ts
const detectorId = result.detectorId ?? String((result.metadata as { type?: unknown })?.type ?? 'detector');
const notification = proposer.propose(result, decisions, {
  detectorId,
  sprintId: event.sprintId,
  taskId: event.taskId,
  title: result.title,
  message: result.message,
} as never);
```
(The `?? 'detector'` defensive fallback can only fire if the registry attach is bypassed — it is never `'unknown'`.) The proposer/dispatcher/CLI render unchanged — they already consume `title`/`message`/`detectorId`.

## 3. Lossless / constraints

- **No detector behaviour change** — only added headline/description text + a registry-stamped id. Risk/actions/severity/groupKey/metadata unchanged.
- **i18n:** operator/diagnostic strings (English-default), consistent with `reasoning[]` and debug logs — NOT user-facing UI copy. No `getMessage` needed.
- **tsc-enforced completeness:** required `title`/`message` make a missing field a compile error, not a silent `'unknown'`.
- **Existing notification consumers unchanged** (proposer/dispatcher/CLI already read title/message/detectorId).

## 4. Test & proof (hermetic)

1. **Type-enforcement:** a representative detector's `detect()` returns a `DetectorResult` with non-empty `title`/`message` (assert they are not `'unknown'` / not empty). Cover ≥3 detectors of different kinds (stale-worker, scope-collision, token-spike).
2. **Registry attaches detectorId:** `runAll` over a stub detector → the emitted result's `detectorId` equals the detector's `detectorId`.
3. **End-to-end (the symptom):** drive `runPipeline`/bootstrap with a real detector result → the proposed notification's `title`/`message`/`detectorId` are the detector's values, NOT `'unknown'` / `'Detected: unknown'`. This is the exact Sprint-290 failure reproduced + fixed.
4. Tests are hermetic (in-memory stubs; no fs/network) per ADR-087.

## 5. Non-goals (deferred)

- **Bug 3** (Telegram → nervous wiring) — separate fix (next).
- **i18n of the operator strings** — out of scope (these are diagnostic, English-default; UI surfacing them can localize later).

## 6. Files

- `src/core/nervous-types.ts` — `DetectorResult` (+ required title/message, optional detectorId).
- `src/nervous/detectors/*.ts` — all 12 detectors, every return site (title/message).
- `src/nervous/detector-registry.ts` — `runAll` detectorId stamp.
- `src/nervous/bootstrap.ts` — read fields directly.
- Tests: `tests/nervous/` (detector title/message + registry-attach + end-to-end no-unknown).
