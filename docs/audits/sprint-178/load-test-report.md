# Sprint Load Test Report

Generated: 2026-05-20T11:55:18.182Z
Total entries: 46

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-05-20T11:18:53.640Z | legacy | 6 |
| 2026-05-20T11:41:49.221Z | legacy | 4 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 11 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 11 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| hb.stale | 15 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| queue.force_rescan_spawn | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 1017139.74 | 1348576.00 | 1378037.00 | 648877.23 | 1385402.25 |

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

1. **trace:wait_results** — p99: 1378037.00ms (2 samples)
2. **collision.detected** — p99: 1.00ms (1 samples)
3. **result.collected** — p99: 1.00ms (11 samples)
4. **collect.batch** — p99: 1.00ms (11 samples)
5. **hb.stale** — p99: 1.00ms (15 samples)
