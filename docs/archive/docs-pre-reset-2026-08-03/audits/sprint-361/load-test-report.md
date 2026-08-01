# Sprint Load Test Report

Generated: 2026-07-02T22:50:18.744Z
Total entries: 47

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-02T22:07:02.396Z | dep-pipeline | 8 |
| 2026-07-02T22:38:57.932Z | dep-pipeline | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 17 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 14 | 1.00 | 2.35 | 2.87 | 1.00 | 3.00 |
| wave.transition | 1 | 3628.00 | 3628.00 | 3628.00 | 3628.00 | 3628.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 9 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 1121043.83 | 1594999.91 | 1637129.34 | 594425.97 | 1647661.70 |

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

1. **trace:wait_results** — p99: 1637129.34ms (2 samples)
2. **wave.transition** — p99: 3628.00ms (1 samples)
3. **collect.batch** — p99: 2.87ms (14 samples)
4. **result.collected** — p99: 1.00ms (17 samples)
5. **config.cache** — p99: 1.00ms (1 samples)
