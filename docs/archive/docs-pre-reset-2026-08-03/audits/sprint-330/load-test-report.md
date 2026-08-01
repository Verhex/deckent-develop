# Sprint Load Test Report

Generated: 2026-06-26T23:07:11.276Z
Total entries: 76

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-26T21:59:45.702Z | dep-pipeline | 4 |
| 2026-06-26T22:55:46.095Z | dep-pipeline | 6 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 26 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 27 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 11 | 3697.00 | 12090.00 | 15446.80 | 3635.00 | 16286.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 5 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 2032414.94 | 3346206.01 | 3462987.44 | 572647.07 | 3492182.80 |

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

1. **trace:wait_results** — p99: 3462987.44ms (2 samples)
2. **wave.transition** — p99: 15446.80ms (11 samples)
3. **collision.detected** — p99: 1.00ms (1 samples)
4. **result.collected** — p99: 1.00ms (26 samples)
5. **collect.batch** — p99: 1.00ms (27 samples)
