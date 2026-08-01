# Sprint Load Test Report

Generated: 2026-07-02T00:26:28.023Z
Total entries: 44

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-02T00:01:06.164Z | dep-pipeline | 8 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 15 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 15 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 1 | 3631.00 | 3631.00 | 3631.00 | 3631.00 | 3631.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 9 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 1439567.96 | 1439567.96 | 1439567.96 | 1439567.96 | 1439567.96 |

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

1. **trace:wait_results** — p99: 1439567.96ms (1 samples)
2. **wave.transition** — p99: 3631.00ms (1 samples)
3. **result.collected** — p99: 1.00ms (15 samples)
4. **collect.batch** — p99: 1.00ms (15 samples)
5. **config.cache** — p99: 1.00ms (1 samples)
