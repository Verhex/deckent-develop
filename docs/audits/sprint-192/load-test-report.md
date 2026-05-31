# Sprint Load Test Report

Generated: 2026-05-24T10:34:27.452Z
Total entries: 56

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-05-24T09:40:35.757Z | dep-pipeline | 3 |
| 2026-05-24T10:16:50.456Z | dep-pipeline | 3 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 2 | 4.00 | 5.80 | 5.96 | 2.00 | 6.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| wave.transition | 2 | 9095.00 | 10809.50 | 10961.90 | 7190.00 | 11000.00 |
| hb.stale | 7 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 14 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 12 | 1.00 | 1.90 | 2.78 | 1.00 | 3.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 8 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| fix.rotation.applied | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| queue.force_rescan_spawn | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 1327786.15 | 1753986.41 | 1791870.88 | 854230.29 | 1801342.00 |

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

1. **trace:wait_results** — p99: 1791870.88ms (2 samples)
2. **wave.transition** — p99: 10961.90ms (2 samples)
3. **collision.detected** — p99: 5.96ms (2 samples)
4. **collect.batch** — p99: 2.78ms (12 samples)
5. **hb.stale** — p99: 1.00ms (7 samples)
