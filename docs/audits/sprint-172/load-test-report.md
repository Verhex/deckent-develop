# Sprint Load Test Report

Generated: 2026-05-18T05:36:38.415Z
Total entries: 77

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-05-18T04:27:40.386Z | legacy | 6 |
| 2026-05-18T05:03:41.549Z | legacy | 6 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 2 | 4.50 | 7.65 | 7.93 | 1.00 | 8.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| hb.stale | 23 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 17 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 17 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| queue.force_rescan_spawn | 9 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 1841688.03 | 1965776.93 | 1976807.06 | 1703811.47 | 1979564.59 |

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

1. **trace:wait_results** — p99: 1976807.06ms (2 samples)
2. **collision.detected** — p99: 7.93ms (2 samples)
3. **hb.stale** — p99: 1.00ms (23 samples)
4. **result.collected** — p99: 1.00ms (17 samples)
5. **collect.batch** — p99: 1.00ms (17 samples)
