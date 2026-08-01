# Nervous proposal title/message (Bug 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `DetectorResult.title`/`message` required (tsc-enforced) so every nervous detector ships a real headline/description, the registry stamps the authoritative `detectorId`, and bootstrap reads these directly — eliminating the `'unknown'` proposal display.

**Architecture:** Required `title`/`message` on `DetectorResult` + per-detector text at every return site + registry `detectorId` stamp + bootstrap reads fields directly. The type change makes the 12-detector update tsc-enforced (no detector can be missed).

**Tech Stack:** TypeScript (ESM, Node16 — `.js` suffixes), vitest.

## Global Constraints

- **ESM imports:** relative imports end in `.js`.
- **Lossless:** no detector BEHAVIOUR change — only added `title`/`message` text + a registry-stamped `detectorId`. Risk/actions/severity/groupKey/metadata unchanged; proposer/dispatcher/CLI render unchanged.
- **i18n:** `title`/`message` are operator/diagnostic strings (English-default, like `reasoning[]`/debug) — NOT user-facing UI copy. No `getMessage`.
- **tsc-enforced completeness:** required `title`/`message` make a missing field a compile error — `npx tsc --noEmit` is the checklist of remaining detectors.
- **Hermeticity (ADR-087):** tests in-memory; no fs/network.
- **Surgical:** `src/core/nervous-types.ts`, `src/nervous/detectors/*.ts` (12), `src/nervous/detector-registry.ts`, `src/nervous/bootstrap.ts`, + tests.
- **TDD:** failing end-to-end test first.

---

## Task 1: Required title/message + registry detectorId stamp + bootstrap read

**Files:**
- Modify: `src/core/nervous-types.ts` (`DetectorResult` ~line 191)
- Modify: `src/nervous/detectors/*.ts` (all 12, EVERY `return { … }` site)
- Modify: `src/nervous/detector-registry.ts` (`runAll` ~line 181-183)
- Modify: `src/nervous/bootstrap.ts` (`runPipeline` ~line 275-286)
- Test: `tests/nervous/bootstrap.test.ts` (extend) + a detector test

**Interfaces:**
- Produces: `DetectorResult` with required `title: string`, `message: string`, optional `detectorId?: string`.

- [ ] **Step 1: Write the failing end-to-end test**

In `tests/nervous/bootstrap.test.ts` (read it first for its existing `runPipeline`/bootstrap harness + stub-detector pattern), add a test that drives the pipeline with a stub detector returning a real `title`/`message`, and asserts the dispatched/proposed notification carries them — NOT `'unknown'`:

```typescript
it('bug 2: proposal carries the detector title/message/detectorId, never "unknown"', async () => {
  // Build a stub detector returning a real result; run it through runAll + the pipeline.
  // Assert the resulting notification.title === '<real title>', .message === '<real message>',
  // .detectorId === the stub detector's id — and none equals 'unknown' / 'Detected: unknown'.
  // Use the file's existing harness (capture the dispatched notification via a stub dispatcher).
});
```
(Adapt to the file's actual harness — capture the notification the dispatcher receives. If `bootstrap.test.ts` has no pipeline harness, add the assertion in the detector+registry test instead and drive `runPipeline` with stubs.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/nervous/bootstrap.test.ts -t "bug 2"`
Expected: FAIL — title/message come back `'unknown'` / `'Detected: unknown'` (detectors don't set them; bootstrap reads absent metadata fields).

- [ ] **Step 3: `DetectorResult` — add required title/message + optional detectorId**

In `src/core/nervous-types.ts`, change `DetectorResult` (~line 191) to:
```typescript
export interface DetectorResult {
  /** Bu detector tarafından belirlenen risk seviyesi */
  readonly risk: RiskLevel;
  /** Öneri eylemler (boş → sadece log) */
  readonly suggestedActions: ReadonlyArray<Pick<NotificationAction, 'id' | 'label' | 'risk' | 'payload'>>;
  /** Notification üretilmeli mi */
  readonly shouldNotify: boolean;
  /** Human-readable headline (REQUIRED — e.g. "Stale worker w-290-001"). */
  readonly title: string;
  /** Human-readable description (REQUIRED — what was detected + why it matters). */
  readonly message: string;
  /** Authoritative detector id — stamped by the registry, not the detector body. */
  readonly detectorId?: string;
  /** Notification severity — shouldNotify true ise kullanılır */
  readonly severity?: Severity;
  /** Gruplama anahtarı — throttle için */
  readonly groupKey?: string;
  /** Detector'a özgü ham veri */
  readonly metadata?: Record<string, unknown>;
}
```
Run `npx tsc --noEmit` — it now errors on EVERY detector return site missing `title`/`message`. That list IS the work for Step 5.

- [ ] **Step 4: registry stamp + bootstrap read**

`src/nervous/detector-registry.ts` `runAll` (~line 181-183) — stamp the detector id:
```typescript
        const result = detector.detect(ctx);
        if (result !== null) {
          results.push({ ...result, detectorId: detector.detectorId });
        }
```
`src/nervous/bootstrap.ts` `runPipeline` (~line 275-286) — read the fields directly:
```typescript
    const detectorId = result.detectorId ?? String((result.metadata as { type?: unknown } | undefined)?.type ?? 'detector');
    const notification = proposer.propose(result, decisions, {
      detectorId,
      sprintId: event.sprintId,
      taskId: event.taskId,
      title: result.title,
      message: result.message,
    } as never);
```
(Drop the old `metadata.title`/`metadata.message`/`'unknown'` lines. The `?? 'detector'` only fires if the registry stamp is bypassed — never `'unknown'`.)

- [ ] **Step 5: Fill title/message in all 12 detectors (tsc-guided)**

For EACH `npx tsc --noEmit` error (every `return { … }` in `src/nervous/detectors/*.ts`), add a concise, SPECIFIC `title` + `message` built from the data already in scope at that return. Read each detector to use its real variables. Pattern (stale-worker, the canonical example):
```typescript
    return {
      risk: 'medium',
      shouldNotify: true,
      severity: 'warning',
      title: `Stale worker${staleWorkers.length > 1 ? `s (${staleWorkers.length})` : ` ${staleWorkers[0]!.id}`}`,
      message: `Heartbeat stale >${Math.round(this.staleThresholdMs / 60000)}min — respawn proposed for ${staleWorkers.map(w => w.id).join(', ')}`,
      groupKey: `stale-worker:${staleWorkers.map(w => w.id).join(',')}`,
      suggestedActions: /* unchanged */,
      metadata: { type: 'stale-worker', count: staleWorkers.length },
    };
```
Apply the same shape to all 12 (`agent-routing-anomaly`, `agent-routing` [multiple returns: corrupt-agent / anomaly], `build-failure-recurrence`, `dead-event-stream`, `debt-trend`, `directives-protection`, `notification-delivery-health`, `scope-collision-rate`, `scope-collision`, `stale-worker`, `task-mode-idle`, `token-spike`). Each `title` ≤ ~60 chars (headline), `message` one sentence (what + why). Do NOT change risk/actions/severity/groupKey/metadata. **`npx tsc --noEmit` clean ⟺ every detector done** — that is the completeness gate.

- [ ] **Step 6: Run tests + tsc + nervous regression**

Run: `npx tsc --noEmit && npx vitest run tests/nervous/`
Expected: tsc clean (all detectors filled); the bug-2 test passes (title/message/detectorId real, not 'unknown'); the existing nervous suite stays green. If a pre-existing test asserted `metadata.title`/`'unknown'`, that encoded the bug — update it with a one-line `// bug-2: title/message now first-class` justification and report it.

- [ ] **Step 7: Commit**

```bash
git add src/core/nervous-types.ts src/nervous/detectors/ src/nervous/detector-registry.ts src/nervous/bootstrap.ts tests/nervous/
git commit -m "$(cat <<'EOF'
fix(nervous): proposals carry real title/message/detectorId, never 'unknown' (bug 2)

DetectorResult.title/message are now required (tsc-enforced); every detector
provides a specific headline + description; the registry stamps the
authoritative detectorId; bootstrap reads the fields directly (dropped the
metadata-bag + 'unknown' fallbacks). Fixes the Sprint-290 'unknown' proposal
display. No detector behaviour change.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:** B1 required title/message + optional detectorId → Step 3; B2 per-detector text → Step 5; B3 registry stamp → Step 4; B4 bootstrap read → Step 4; tests (type-enforced, registry-attach, end-to-end no-unknown) → Steps 1/6. ✅

**Placeholder scan:** the per-detector title/message are intentionally not all pre-written — the implementer derives each from the detector's in-scope data (Step 5 gives the canonical pattern + the full detector list, and tsc enforces every site). This is guided, not a placeholder. ✅

**Type consistency:** `DetectorResult` adds `title: string` / `message: string` / `detectorId?: string`; the registry stamps `detectorId`; bootstrap reads `result.title`/`message`/`detectorId`; `proposer.propose(...)` context shape unchanged (it already takes title/message/detectorId). ✅
