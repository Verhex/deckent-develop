# Sprint Load Test Report

Generated: 2026-07-02T13:51:51.910Z
Total entries: 49

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-02T13:16:31.011Z | dep-pipeline | 8 |
| 2026-07-02T13:47:17.051Z | dep-pipeline | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 18 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 15 | 1.00 | 2.00 | 2.00 | 1.00 | 2.00 |
| wave.transition | 1 | 2341.00 | 2341.00 | 2341.00 | 2341.00 | 2341.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 9 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 922793.56 | 1619698.85 | 1681645.99 | 148454.35 | 1697132.77 |

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

1. **trace:wait_results** — p99: 1681645.99ms (2 samples)
2. **wave.transition** — p99: 2341.00ms (1 samples)
3. **collect.batch** — p99: 2.00ms (15 samples)
4. **result.collected** — p99: 1.00ms (18 samples)
5. **config.cache** — p99: 1.00ms (1 samples)
