# Sprint Load Test Report

Generated: 2026-06-27T11:38:21.900Z
Total entries: 7

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-27T11:35:12.504Z | dep-pipeline | 1 |
| 2026-06-27T11:36:09.515Z | dep-pipeline | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 49992.39 | 49992.39 | 49992.39 | 49992.39 | 49992.39 |

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

1. **trace:wait_results** — p99: 49992.39ms (1 samples)
2. **result.collected** — p99: 1.00ms (1 samples)
3. **collect.batch** — p99: 1.00ms (1 samples)
4. **config.cache** — p99: 1.00ms (1 samples)
5. **wave.start** — p99: 0.00ms (2 samples)
