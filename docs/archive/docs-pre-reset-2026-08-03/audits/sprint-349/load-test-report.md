# Sprint Load Test Report

Generated: 2026-07-01T21:03:01.919Z
Total entries: 50

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-01T18:58:12.028Z | dep-pipeline | 5 |
| 2026-07-01T18:58:12.266Z | dep-pipeline | 5 |
| 2026-07-01T19:24:51.481Z | dep-pipeline | 5 |
| 2026-07-01T20:51:42.100Z | dep-pipeline | 5 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 4 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| config.cache | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 6 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 5 | 1.00 | 1.80 | 1.96 | 1.00 | 2.00 |
| honesty.check | 6 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| hb.stale | 20 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 370628.17 | 504385.06 | 516274.56 | 222009.40 | 519246.94 |

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

1. **trace:wait_results** — p99: 516274.56ms (2 samples)
2. **collect.batch** — p99: 1.96ms (5 samples)
3. **config.cache** — p99: 1.00ms (3 samples)
4. **result.collected** — p99: 1.00ms (6 samples)
5. **honesty.check** — p99: 1.00ms (6 samples)
