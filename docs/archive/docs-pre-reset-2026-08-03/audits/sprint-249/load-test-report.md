---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:e508475075338c4493da6d909c44a77f3913432c17f7f62542672d96f650b00a
---

# Sprint Load Test Report

Generated: 2026-06-09T06:15:32.331Z
Total entries: 194

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-09T05:36:19.998Z | dep-pipeline | 8 |
| 2026-06-09T05:55:48.942Z | dep-pipeline | 6 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 2 | 2.00 | 2.00 | 2.00 | 2.00 | 2.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| wave.transition | 8 | 2090.00 | 7216.20 | 8545.64 | 24.00 | 8878.00 |
| hb.stale | 128 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 21 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 19 | 1.00 | 2.00 | 2.00 | 1.00 | 2.00 |
| queue.force_rescan_spawn | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| fix.rotation.applied | 6 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 1091501.98 | 1120773.80 | 1123375.74 | 1058977.74 | 1124026.22 |

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

1. **trace:wait_results** — p99: 1123375.74ms (2 samples)
2. **wave.transition** — p99: 8545.64ms (8 samples)
3. **collision.detected** — p99: 2.00ms (2 samples)
4. **collect.batch** — p99: 2.00ms (19 samples)
5. **hb.stale** — p99: 1.00ms (128 samples)
