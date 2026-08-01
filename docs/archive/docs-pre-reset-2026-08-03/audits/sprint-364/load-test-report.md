# Sprint Load Test Report

Generated: 2026-07-03T03:45:47.696Z
Total entries: 95

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-03T03:14:49.734Z | dep-pipeline | 8 |
| 2026-07-03T03:43:39.893Z | dep-pipeline | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| hb.stale | 59 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 12 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 12 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 1 | 5021.00 | 5021.00 | 5021.00 | 5021.00 | 5021.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| fix.routing.preserved | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 906818.68 | 1720339.45 | 1792652.41 | 2906.71 | 1810730.65 |

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

1. **trace:wait_results** — p99: 1792652.41ms (2 samples)
2. **wave.transition** — p99: 5021.00ms (1 samples)
3. **hb.stale** — p99: 1.00ms (59 samples)
4. **result.collected** — p99: 1.00ms (12 samples)
5. **collect.batch** — p99: 1.00ms (12 samples)
