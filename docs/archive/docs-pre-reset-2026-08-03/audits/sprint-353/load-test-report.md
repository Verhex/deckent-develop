# Sprint Load Test Report

Generated: 2026-07-01T22:59:02.967Z
Total entries: 39

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-01T22:36:51.495Z | dep-pipeline | 8 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 16 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 15 | 1.00 | 1.30 | 1.86 | 1.00 | 2.00 |
| wave.transition | 1 | 3620.00 | 3620.00 | 3620.00 | 3620.00 | 3620.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 1147087.44 | 1147087.44 | 1147087.44 | 1147087.44 | 1147087.44 |

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

1. **trace:wait_results** — p99: 1147087.44ms (1 samples)
2. **wave.transition** — p99: 3620.00ms (1 samples)
3. **collect.batch** — p99: 1.86ms (15 samples)
4. **result.collected** — p99: 1.00ms (16 samples)
5. **config.cache** — p99: 1.00ms (1 samples)
