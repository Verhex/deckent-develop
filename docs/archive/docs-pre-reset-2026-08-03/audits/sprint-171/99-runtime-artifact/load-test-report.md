# Sprint Load Test Report

Generated: 2026-05-15T11:15:22.235Z
Total entries: 200

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-05-15T09:57:12.461Z | legacy | 6 |
| 2026-05-15T11:05:32.120Z | legacy | 2 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| hb.stale | 134 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 31 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 30 | 1.00 | 1.00 | 1.71 | 1.00 | 2.00 |
| trace:wait_results | 2 | 2079519.19 | 3606338.00 | 3742055.23 | 383053.84 | 3775984.54 |

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

1. **trace:wait_results** — p99: 3742055.23ms (2 samples)
2. **collect.batch** — p99: 1.71ms (30 samples)
3. **hb.stale** — p99: 1.00ms (134 samples)
4. **result.collected** — p99: 1.00ms (31 samples)
5. **wave.start** — p99: 0.00ms (2 samples)
