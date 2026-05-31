# Sprint Load Test Report

Generated: 2026-05-26T17:30:38.705Z
Total entries: 40

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-05-26T17:15:59.380Z | dep-pipeline | 3 |
| 2026-05-26T17:26:55.651Z | dep-pipeline | 3 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| hb.stale | 15 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 8 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 8 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 410844.59 | 645492.96 | 666350.59 | 150124.19 | 671565.00 |

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

1. **trace:wait_results** — p99: 666350.59ms (2 samples)
2. **hb.stale** — p99: 1.00ms (15 samples)
3. **result.collected** — p99: 1.00ms (8 samples)
4. **collect.batch** — p99: 1.00ms (8 samples)
5. **config.cache** — p99: 1.00ms (1 samples)
