# Sprint Load Test Report

Generated: 2026-07-03T01:36:23.413Z
Total entries: 164

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-03T01:04:06.492Z | dep-pipeline | 8 |
| 2026-07-03T01:26:57.406Z | dep-pipeline | 2 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| hb.stale | 119 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 15 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 15 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 7 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| fix.routing.preserved | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 788745.17 | 1067813.93 | 1092620.04 | 478668.76 | 1098821.57 |

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

1. **trace:wait_results** — p99: 1092620.04ms (2 samples)
2. **hb.stale** — p99: 1.00ms (119 samples)
3. **result.collected** — p99: 1.00ms (15 samples)
4. **collect.batch** — p99: 1.00ms (15 samples)
5. **config.cache** — p99: 1.00ms (1 samples)
