# Sprint Load Test Report

Generated: 2026-06-27T00:02:05.283Z
Total entries: 44

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-26T23:38:32.307Z | dep-pipeline | 8 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 16 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 16 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 2 | 3646.50 | 3654.15 | 3654.83 | 3638.00 | 3655.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 6 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 1258432.32 | 1258432.32 | 1258432.32 | 1258432.32 | 1258432.32 |

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

1. **trace:wait_results** — p99: 1258432.32ms (1 samples)
2. **wave.transition** — p99: 3654.83ms (2 samples)
3. **result.collected** — p99: 1.00ms (16 samples)
4. **collect.batch** — p99: 1.00ms (16 samples)
5. **config.cache** — p99: 1.00ms (1 samples)
