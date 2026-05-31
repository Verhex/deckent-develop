# Sprint Load Test Report

Generated: 2026-05-26T11:34:52.593Z
Total entries: 84

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-05-26T09:12:28.115Z | dep-pipeline | 3 |
| 2026-05-26T09:25:54.079Z | dep-pipeline | 3 |
| 2026-05-26T11:06:30.307Z | dep-pipeline | 3 |
| 2026-05-26T11:25:49.743Z | dep-pipeline | 3 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 2 | 2.50 | 2.95 | 2.99 | 2.00 | 3.00 |
| wave.start | 4 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| wave.transition | 5 | 7231.00 | 11040.60 | 11064.92 | 3524.00 | 11071.00 |
| hb.stale | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 29 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 22 | 1.00 | 2.95 | 3.00 | 1.00 | 3.00 |
| config.cache | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 6 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| fix.rotation.applied | 7 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 3 | 601584.25 | 1114675.10 | 1160283.17 | 470232.06 | 1171685.19 |

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

1. **trace:wait_results** — p99: 1160283.17ms (3 samples)
2. **wave.transition** — p99: 11064.92ms (5 samples)
3. **collect.batch** — p99: 3.00ms (22 samples)
4. **collision.detected** — p99: 2.99ms (2 samples)
5. **hb.stale** — p99: 1.00ms (1 samples)
