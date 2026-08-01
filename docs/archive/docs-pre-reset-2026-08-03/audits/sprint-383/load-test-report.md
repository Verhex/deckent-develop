# Sprint Load Test Report

Generated: 2026-07-08T05:55:34.194Z
Total entries: 25

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-08T05:43:18.043Z | dep-pipeline | 8 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 8 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 8 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 5 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 520786.96 | 520786.96 | 520786.96 | 520786.96 | 520786.96 |

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

1. **trace:wait_results** — p99: 520786.96ms (1 samples)
2. **result.collected** — p99: 1.00ms (8 samples)
3. **collect.batch** — p99: 1.00ms (8 samples)
4. **config.cache** — p99: 1.00ms (1 samples)
5. **honesty.check** — p99: 1.00ms (5 samples)
