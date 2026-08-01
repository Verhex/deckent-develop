# Sprint Load Test Report

Generated: 2026-07-10T06:29:31.917Z
Total entries: 51

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-10T05:39:29.630Z | dep-pipeline | 5 |
| 2026-07-10T06:15:39.867Z | dep-pipeline | 7 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 15 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 15 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 2 | 5744.50 | 7620.55 | 7787.31 | 3660.00 | 7829.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 5 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| fix.routing.preserved | 7 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 1395812.22 | 2049037.53 | 2107102.00 | 670006.31 | 2121618.12 |

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

1. **trace:wait_results** — p99: 2107102.00ms (2 samples)
2. **wave.transition** — p99: 7787.31ms (2 samples)
3. **result.collected** — p99: 1.00ms (15 samples)
4. **collect.batch** — p99: 1.00ms (15 samples)
5. **config.cache** — p99: 1.00ms (1 samples)
