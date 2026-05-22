# Sprint Load Test Report

Generated: 2026-05-21T22:12:00.208Z
Total entries: 290

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-05-21T20:55:29.209Z | dep-pipeline | 6 |
| 2026-05-21T20:59:42.594Z | dep-pipeline | 6 |
| 2026-05-21T21:38:31.151Z | dep-pipeline | 6 |
| 2026-05-21T22:08:32.845Z | dep-pipeline | 6 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 4 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| collect.batch | 76 | 1.00 | 5.25 | 6.00 | 1.00 | 6.00 |
| result.collected | 103 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| hb.stale | 67 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| fix.rotation.applied | 25 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 9 | 3683.00 | 20930.40 | 21378.08 | 1799.00 | 21490.00 |
| trace:wait_results | 3 | 246301.62 | 1641036.93 | 1765013.40 | 54436.15 | 1796007.52 |

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

1. **trace:wait_results** — p99: 1765013.40ms (3 samples)
2. **wave.transition** — p99: 21378.08ms (9 samples)
3. **collect.batch** — p99: 6.00ms (76 samples)
4. **result.collected** — p99: 1.00ms (103 samples)
5. **hb.stale** — p99: 1.00ms (67 samples)
