# Sprint Load Test Report

Generated: 2026-07-25T23:46:37.375Z
Total entries: 6

## Wave Timeline

No wave data recorded.

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| hb.stale | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 866647.33 | 866647.33 | 866647.33 | 866647.33 | 866647.33 |

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

1. **trace:wait_results** — p99: 866647.33ms (1 samples)
2. **hb.stale** — p99: 1.00ms (2 samples)
3. **result.collected** — p99: 1.00ms (1 samples)
4. **collect.batch** — p99: 1.00ms (1 samples)
5. **honesty.check** — p99: 1.00ms (1 samples)
