# Sprint Load Test Report

Generated: 2026-05-19T23:02:06.131Z
Total entries: 104

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-05-19T21:56:41.538Z | legacy | 6 |
| 2026-05-19T22:32:05.237Z | legacy | 6 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| hb.stale | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 36 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 36 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| queue.force_rescan_spawn | 12 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 13 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 1806508.98 | 1892439.01 | 1900077.23 | 1711031.17 | 1901986.79 |

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

1. **trace:wait_results** — p99: 1900077.23ms (2 samples)
2. **collision.detected** — p99: 1.00ms (1 samples)
3. **hb.stale** — p99: 1.00ms (1 samples)
4. **result.collected** — p99: 1.00ms (36 samples)
5. **collect.batch** — p99: 1.00ms (36 samples)
