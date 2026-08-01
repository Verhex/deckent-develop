# Sprint Load Test Report

Generated: 2026-07-05T13:30:14.408Z
Total entries: 22

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-05T12:40:44.527Z | dep-pipeline | 7 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 7 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 7 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 2814982.15 | 2814982.15 | 2814982.15 | 2814982.15 | 2814982.15 |

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

1. **trace:wait_results** — p99: 2814982.15ms (1 samples)
2. **result.collected** — p99: 1.00ms (7 samples)
3. **collect.batch** — p99: 1.00ms (7 samples)
4. **config.cache** — p99: 1.00ms (1 samples)
5. **honesty.check** — p99: 1.00ms (4 samples)
