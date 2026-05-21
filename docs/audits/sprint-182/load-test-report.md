# Sprint Load Test Report

Generated: 2026-05-21T10:57:52.070Z
Total entries: 78

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-05-21T10:07:24.125Z | dep-pipeline | 6 |
| 2026-05-21T10:43:15.266Z | dep-pipeline | 6 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 2 | 3.00 | 4.80 | 4.96 | 1.00 | 5.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| hb.stale | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 8 | 3643.50 | 5841.00 | 6546.60 | 3532.00 | 6723.00 |
| result.collected | 22 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 23 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| queue.force_rescan_spawn | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 7 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| fix.rotation.applied | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 1272427.17 | 1775116.77 | 1819800.29 | 713883.18 | 1830971.17 |

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

1. **trace:wait_results** — p99: 1819800.29ms (2 samples)
2. **wave.transition** — p99: 6546.60ms (8 samples)
3. **collision.detected** — p99: 4.96ms (2 samples)
4. **hb.stale** — p99: 1.00ms (2 samples)
5. **result.collected** — p99: 1.00ms (22 samples)
