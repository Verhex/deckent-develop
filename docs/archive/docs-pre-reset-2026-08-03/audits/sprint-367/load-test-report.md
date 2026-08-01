# Sprint Load Test Report

Generated: 2026-07-05T11:09:24.483Z
Total entries: 36

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-05T10:32:54.436Z | dep-pipeline | 8 |
| 2026-07-05T11:01:57.883Z | dep-pipeline | 2 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 10 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 10 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| queue.force_rescan_spawn | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 6 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| fix.routing.preserved | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 879303.98 | 1384596.16 | 1429511.02 | 317868.23 | 1440739.74 |

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

1. **trace:wait_results** — p99: 1429511.02ms (2 samples)
2. **collision.detected** — p99: 1.00ms (1 samples)
3. **result.collected** — p99: 1.00ms (10 samples)
4. **collect.batch** — p99: 1.00ms (10 samples)
5. **queue.force_rescan_spawn** — p99: 1.00ms (1 samples)
