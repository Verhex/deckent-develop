# Nervous stale-worker false-positive fix — mtime-based freshness (Bug 1)

- **Date:** 2026-06-18
- **Arc:** ARC-E / Nervous System (ADR-040) precision
- **Status:** design approved (Approach A) → writing-plans next
- **Scope class:** Tier-0 (internal core logic) → unit-test-sufficient
- **Origin:** Live autonomous dogfood (Sprint 290). The nervous `StaleWorkerDetector` repeatedly proposed `WORKER_RESPAWN` for HEALTHY docker workers (290-001/002/004/005) — disk-verified the `.hb` files were fresh (2-7s mtime) while the detector reported `lastHeartbeat=2026-06-18T00:00:00 / 00:10:00` (round midnight).

## 1. Problem (live, disk-verified)

Docker workers write heartbeats with `timestamp: now()` (`worker.ts:360` = the **container's** `new Date()`). The containers run on a skewed/unsynced clock (booting near midnight, advancing from there), so their self-reported `hb.timestamp` is ~11h behind the host's real time (observed: `00:00:00` for a just-spawned worker, `00:10:00` for one 10 min in).

`scanActiveWorkers` (`sprint-state-tracker.ts:82-92`) builds `activeWorkers[].lastHeartbeat` from that self-reported `hb.timestamp`:
```ts
lastHeartbeat: typeof hb.timestamp === 'string' ? hb.timestamp : new Date(0).toISOString(),
```
`StaleWorkerDetector` (`detectors/stale-worker.ts:43-46`) then compares it against the **host** coordinator's `ctx.now`:
```ts
const lastHbMs = new Date(w.lastHeartbeat).getTime();
return ctx.now.getTime() - lastHbMs > this.staleThresholdMs; // 10 min
```
Host-now (≈11:45) − container-time (≈00:10) ≈ 11h ≫ 10 min → **every active docker worker is flagged stale** → spurious `WORKER_RESPAWN`. If auto-applied, this would kill healthy workers mid-task.

The existing guard (`sprint-state-tracker.ts:76-81`) only skips workers that already wrote a `.result` (finished-worker false-positive). The **container-clock false-positive on ACTIVE workers** is uncovered.

**Why the `.hb` mtime is the right signal:** the worker writes its `.hb` through the docker bind-mount, so the **host filesystem** stamps the file's mtime with the **host clock** on every write — independent of the container's clock. Disk-verified: the `.hb` mtime was 2-7s fresh while the in-file `timestamp` was midnight. mtime is directly comparable to the host coordinator's `now()`.

## 2. Design — Approach A (mtime-based worker freshness)

`scanActiveWorkers` derives `lastHeartbeat` from the `.hb` file's **mtime** (host filesystem) instead of the self-reported in-file `timestamp`:

```ts
const hbPath = join(tasksDir, file);
const raw = readFileSync(hbPath, 'utf-8');
const hb = JSON.parse(raw) as { workerId?: unknown; taskId?: unknown };
// ... workerId/taskId validation unchanged ...
out.push({
  id: workerId,
  taskId,
  lastHeartbeat: new Date(statSync(hbPath).mtimeMs).toISOString(), // host-set, clock-skew-proof
});
```

- The in-file `timestamp` is no longer read for freshness (the field may stay in the `.hb` for other display uses; the detector input no longer depends on it).
- `StaleWorkerDetector` is **unchanged** — fixing the data at its source makes the existing comparison correct.
- The `.result`-skip guard (finished workers) is **preserved**.

**Secondary locus — Auditor stale-heartbeat alert.** `auditor.ts:1467` builds agent `lastHeartbeat` from `hb.timestamp` too. The implementer checks the auditor's heartbeat scan (where `scanResult.heartbeats[].timestamp` is produced): if the auditor's stale-agent alert compares that timestamp against host-now, switch that freshness signal to the `.hb` mtime as well (same root). If the auditor uses the timestamp only for display (not staleness), leave it and note so.

## 3. Lossless / constraints

- **Correctly-clocked workers unaffected:** when container and host clocks agree, mtime ≈ `hb.timestamp`, so behaviour is unchanged.
- **Real staleness preserved:** a genuinely hung worker stops writing its `.hb` → mtime ages → still flagged stale after the threshold. The fix removes only the *false* positives.
- **Finished-worker guard preserved** (`.result`-skip).
- **i18n:** internal logic — no user-facing strings.
- **No behaviour change to the detector or heartbeat-write path.**

## 4. Test & proof (hermetic, real-behaviour)

1. **False-positive fixed:** write a `.hb` file whose in-file `timestamp` is a stale/midnight value but whose **mtime is fresh** (utimes/just-written) → `scanActiveWorkers` returns `lastHeartbeat` ≈ now → `StaleWorkerDetector.detect` returns **null** (not flagged). This is the exact Sprint-290 scenario.
2. **Real staleness preserved:** a `.hb` with an **old mtime** (utimes set 11 min ago) → `StaleWorkerDetector` **still flags** it (real hang).
3. **Finished-worker guard intact:** a `.hb` with a sibling `.result` → skipped (no proposal), regardless of mtime.
4. Tests use a tmpdir + real files + `statSync`/`utimesSync` (no mocks of the filesystem) per ADR-087 hermeticity.

## 5. Non-goals (deferred)

- **Docker container clock sync** (TZ/localtime mount) — Approach C; a possible defense-in-depth later, but the mtime signal makes worker-freshness correct regardless.
- **Nervous bug 2** (proposal "unknown" title/message/detectorId) and **bug 3** (Telegram→nervous wiring) — separate fixes; this is bug 1 (the stale-worker false-positive root).

## 6. Files

- `src/orchestra/sprint-state-tracker.ts` — `scanActiveWorkers` mtime (primary).
- `src/monitor/auditor.ts` (+ its heartbeat-scan source) — mtime for the stale-agent freshness signal, if it drives an alert (secondary, implementer-verified).
- Tests: `tests/orchestra/sprint-state-tracker.test.ts` (or the existing one) + a `StaleWorkerDetector` integration assertion.
