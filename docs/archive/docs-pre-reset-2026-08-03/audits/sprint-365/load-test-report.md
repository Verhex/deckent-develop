# Sprint Load Test Report

Generated: 2026-07-03T05:48:54.544Z
Total entries: 27

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-03T05:19:37.201Z | dep-pipeline | 8 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 9 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 9 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 5 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 1582415.38 | 1582415.38 | 1582415.38 | 1582415.38 | 1582415.38 |

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

1. **trace:wait_results** — p99: 1582415.38ms (1 samples)
2. **result.collected** — p99: 1.00ms (9 samples)
3. **collect.batch** — p99: 1.00ms (9 samples)
4. **config.cache** — p99: 1.00ms (1 samples)
5. **honesty.check** — p99: 1.00ms (5 samples)
