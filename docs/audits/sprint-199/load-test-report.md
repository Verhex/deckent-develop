# Sprint Load Test Report

Generated: 2026-05-31T02:40:33.296Z
Total entries: 99

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-05-31T02:00:30.460Z | dep-pipeline | 6 |
| 2026-05-31T02:07:57.917Z | dep-pipeline | 6 |
| 2026-05-31T02:32:42.451Z | dep-pipeline | 6 |
| 2026-05-31T02:39:24.923Z | dep-pipeline | 4 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 4 | 3.50 | 5.00 | 5.00 | 1.00 | 5.00 |
| wave.start | 4 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 22 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 22 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 9 | 3637.00 | 9766.80 | 11177.36 | 3551.00 | 11530.00 |
| hb.stale | 10 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| queue.force_rescan_spawn | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 7 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| fix.rotation.applied | 13 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 1750558.11 | 1924232.37 | 1939670.08 | 1557586.72 | 1943529.51 |

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

1. **trace:wait_results** — p99: 1939670.08ms (2 samples)
2. **wave.transition** — p99: 11177.36ms (9 samples)
3. **collision.detected** — p99: 5.00ms (4 samples)
4. **result.collected** — p99: 1.00ms (22 samples)
5. **collect.batch** — p99: 1.00ms (22 samples)
