# Sprint Load Test Report

Generated: 2026-06-27T09:20:51.693Z
Total entries: 39

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-27T08:56:14.319Z | dep-pipeline | 8 |
| 2026-06-27T09:16:37.791Z | dep-pipeline | 2 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 14 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 14 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 5 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 618744.87 | 1072770.88 | 1113128.74 | 114271.53 | 1123218.21 |

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

1. **trace:wait_results** — p99: 1113128.74ms (2 samples)
2. **result.collected** — p99: 1.00ms (14 samples)
3. **collect.batch** — p99: 1.00ms (14 samples)
4. **config.cache** — p99: 1.00ms (1 samples)
5. **honesty.check** — p99: 1.00ms (5 samples)
