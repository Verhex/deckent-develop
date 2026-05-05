# Sprint Load Test Report

Generated: 2026-04-24T13:01:44.803Z
Total entries: 64

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-04-24T12:16:30.912Z | legacy | 6 |
| 2026-04-24T12:51:36.398Z | legacy | 6 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 27 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 27 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 1204778.48 | 1744858.00 | 1792865.06 | 604690.14 | 1804866.83 |

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

1. **trace:wait_results** — p99: 1792865.06ms (2 samples)
2. **collision.detected** — p99: 1.00ms (2 samples)
3. **result.collected** — p99: 1.00ms (27 samples)
4. **collect.batch** — p99: 1.00ms (27 samples)
5. **honesty.check** — p99: 1.00ms (3 samples)
