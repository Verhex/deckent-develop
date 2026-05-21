# Sprint Load Test Report

Generated: 2026-05-21T06:23:51.202Z
Total entries: 50

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-05-21T05:58:39.252Z | legacy | 3 |
| 2026-05-21T06:16:25.956Z | legacy | 2 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| hb.stale | 28 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| queue.force_rescan_spawn | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 5 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 5 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 665345.13 | 1020743.94 | 1052334.95 | 270457.56 | 1060232.70 |

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

1. **trace:wait_results** — p99: 1052334.95ms (2 samples)
2. **collision.detected** — p99: 1.00ms (1 samples)
3. **hb.stale** — p99: 1.00ms (28 samples)
4. **queue.force_rescan_spawn** — p99: 1.00ms (2 samples)
5. **result.collected** — p99: 1.00ms (5 samples)
