# Sprint Load Test Report

Generated: 2026-07-03T07:18:16.867Z
Total entries: 31

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-03T07:11:43.344Z | dep-pipeline | 8 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| hb.stale | 9 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 8 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 6 | 1.00 | 2.50 | 2.90 | 1.00 | 3.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 223872.30 | 223872.30 | 223872.30 | 223872.30 | 223872.30 |

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

1. **trace:wait_results** — p99: 223872.30ms (1 samples)
2. **collect.batch** — p99: 2.90ms (6 samples)
3. **hb.stale** — p99: 1.00ms (9 samples)
4. **result.collected** — p99: 1.00ms (8 samples)
5. **config.cache** — p99: 1.00ms (1 samples)
