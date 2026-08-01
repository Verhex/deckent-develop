# Sprint Load Test Report

Generated: 2026-07-01T23:59:25.046Z
Total entries: 42

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-01T23:32:17.561Z | dep-pipeline | 8 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 15 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 13 | 1.00 | 2.00 | 2.00 | 1.00 | 2.00 |
| wave.transition | 2 | 2777.00 | 3604.10 | 3677.62 | 1858.00 | 3696.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 8 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 1543495.38 | 1543495.38 | 1543495.38 | 1543495.38 | 1543495.38 |

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

1. **trace:wait_results** — p99: 1543495.38ms (1 samples)
2. **wave.transition** — p99: 3677.62ms (2 samples)
3. **collect.batch** — p99: 2.00ms (13 samples)
4. **result.collected** — p99: 1.00ms (15 samples)
5. **config.cache** — p99: 1.00ms (1 samples)
