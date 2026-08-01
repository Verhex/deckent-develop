# Sprint Load Test Report

Generated: 2026-07-02T15:24:25.647Z
Total entries: 40

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-02T15:00:16.021Z | dep-pipeline | 8 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 16 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 12 | 1.00 | 2.00 | 2.00 | 1.00 | 2.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 8 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 1201181.75 | 1201181.75 | 1201181.75 | 1201181.75 | 1201181.75 |

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

1. **trace:wait_results** — p99: 1201181.75ms (1 samples)
2. **collect.batch** — p99: 2.00ms (12 samples)
3. **result.collected** — p99: 1.00ms (16 samples)
4. **config.cache** — p99: 1.00ms (1 samples)
5. **honesty.check** — p99: 1.00ms (8 samples)
