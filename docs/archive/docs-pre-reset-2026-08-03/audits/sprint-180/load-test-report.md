---
doc_rank: 50
status: active
last_updated: 2026-06-08
content_hash: sha256:18fd8aecc62a95a07b069208f783416afd437c2b96178657263f92f4bf6c47cd
---

# Sprint Load Test Report

Generated: 2026-05-20T17:11:22.317Z
Total entries: 60

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-05-20T16:21:15.921Z | legacy | 6 |
| 2026-05-20T16:50:56.691Z | legacy | 6 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 2.00 | 2.00 | 2.00 | 2.00 | 2.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| hb.stale | 5 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 19 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 20 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| queue.force_rescan_spawn | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 9 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 1454812.52 | 1779569.39 | 1808436.67 | 1093971.56 | 1815653.49 |

## File Lock Histogram

| Bucket (ms) | Count |
|-------------|-------|
| <=0 | 0 |
| 0-10 | 0 |
| 10-50 | 0 |
| 50-100 | 0 |
| 100-500 | 0 |
| 500-1000 | 0 |
| 1000-5000 | 0 |
| >5000 | 0 |

## Critical Path Analysis

Top 5 slowest operations by p99:

1. **trace:wait_results** — p99: 1808436.67ms (2 samples)
2. **collision.detected** — p99: 2.00ms (1 samples)
3. **hb.stale** — p99: 1.00ms (5 samples)
4. **result.collected** — p99: 1.00ms (19 samples)
5. **collect.batch** — p99: 1.00ms (20 samples)
