# Sprint Load Test Report

Generated: 2026-07-02T06:42:54.023Z
Total entries: 46

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-02T06:14:54.966Z | dep-pipeline | 8 |
| 2026-07-02T06:37:38.771Z | dep-pipeline | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 17 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 16 | 1.00 | 1.25 | 1.85 | 1.00 | 2.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 7 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 674840.25 | 1124359.47 | 1164316.73 | 175374.44 | 1174306.05 |

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

1. **trace:wait_results** — p99: 1164316.73ms (2 samples)
2. **collect.batch** — p99: 1.85ms (16 samples)
3. **result.collected** — p99: 1.00ms (17 samples)
4. **config.cache** — p99: 1.00ms (1 samples)
5. **honesty.check** — p99: 1.00ms (7 samples)
