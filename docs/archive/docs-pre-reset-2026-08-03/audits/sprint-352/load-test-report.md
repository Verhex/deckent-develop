# Sprint Load Test Report

Generated: 2026-07-01T22:32:21.125Z
Total entries: 66

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-01T21:36:22.095Z | dep-pipeline | 8 |
| 2026-07-01T22:10:11.967Z | dep-pipeline | 8 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 19 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 18 | 1.00 | 1.15 | 1.83 | 1.00 | 2.00 |
| config.cache | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 18 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collision.detected | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 2 | 3633.00 | 3651.00 | 3652.60 | 3613.00 | 3653.00 |
| trace:wait_results | 2 | 910560.66 | 1115421.54 | 1133631.40 | 682937.45 | 1138183.86 |

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

1. **trace:wait_results** — p99: 1133631.40ms (2 samples)
2. **wave.transition** — p99: 3652.60ms (2 samples)
3. **collect.batch** — p99: 1.83ms (18 samples)
4. **result.collected** — p99: 1.00ms (19 samples)
5. **config.cache** — p99: 1.00ms (2 samples)
