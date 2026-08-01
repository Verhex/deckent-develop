# Sprint Load Test Report

Generated: 2026-06-27T10:08:57.326Z
Total entries: 30

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-27T09:51:19.214Z | dep-pipeline | 8 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 11 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 11 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 851397.54 | 851397.54 | 851397.54 | 851397.54 | 851397.54 |

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

1. **trace:wait_results** — p99: 851397.54ms (1 samples)
2. **result.collected** — p99: 1.00ms (11 samples)
3. **collect.batch** — p99: 1.00ms (11 samples)
4. **config.cache** — p99: 1.00ms (1 samples)
5. **honesty.check** — p99: 1.00ms (4 samples)
