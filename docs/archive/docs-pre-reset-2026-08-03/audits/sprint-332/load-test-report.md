# Sprint Load Test Report

Generated: 2026-06-27T01:05:26.194Z
Total entries: 47

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-27T00:32:41.088Z | dep-pipeline | 8 |
| 2026-06-27T00:53:49.133Z | dep-pipeline | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 17 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 17 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 7 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 931781.53 | 1215376.89 | 1240585.36 | 616675.58 | 1246887.48 |

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

1. **trace:wait_results** — p99: 1240585.36ms (2 samples)
2. **result.collected** — p99: 1.00ms (17 samples)
3. **collect.batch** — p99: 1.00ms (17 samples)
4. **config.cache** — p99: 1.00ms (1 samples)
5. **honesty.check** — p99: 1.00ms (7 samples)
