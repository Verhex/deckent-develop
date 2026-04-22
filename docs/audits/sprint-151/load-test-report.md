# Sprint Load Test Report

Generated: 2026-04-22T06:59:30.172Z
Total entries: 43

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-04-22T06:03:47.553Z | legacy | 3 |
| 2026-04-22T06:49:56.483Z | legacy | 2 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 6.00 | 6.00 | 6.00 | 6.00 | 6.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 16 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 17 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| hb.stale | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 1438120.48 | 2449690.80 | 2539608.16 | 314153.46 | 2562087.50 |

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

1. **trace:wait_results** — p99: 2539608.16ms (2 samples)
2. **collision.detected** — p99: 6.00ms (1 samples)
3. **result.collected** — p99: 1.00ms (16 samples)
4. **collect.batch** — p99: 1.00ms (17 samples)
5. **honesty.check** — p99: 1.00ms (3 samples)
