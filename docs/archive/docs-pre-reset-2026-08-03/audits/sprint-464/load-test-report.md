# Sprint Load Test Report

Generated: 2026-07-29T07:20:31.157Z
Total entries: 9

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-29T07:10:00.514Z | dep-pipeline | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 2 | 1.50 | 1.95 | 1.99 | 1.00 | 2.00 |
| honesty.check | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 478656.31 | 478656.31 | 478656.31 | 478656.31 | 478656.31 |

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

1. **trace:wait_results** — p99: 478656.31ms (1 samples)
2. **collect.batch** — p99: 1.99ms (2 samples)
3. **result.collected** — p99: 1.00ms (3 samples)
4. **honesty.check** — p99: 1.00ms (1 samples)
5. **wave.start** — p99: 0.00ms (1 samples)
