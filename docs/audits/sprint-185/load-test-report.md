# Sprint Load Test Report

Generated: 2026-05-21T17:02:04.976Z
Total entries: 77

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-05-21T13:41:34.430Z | dep-pipeline | 6 |
| 2026-05-21T16:30:30.976Z | dep-pipeline | 6 |
| 2026-05-21T16:49:14.685Z | dep-pipeline | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 3 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 8 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 8 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| hb.stale | 54 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 881382.91 | 1107993.86 | 1128137.06 | 629592.96 | 1133172.86 |

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

1. **trace:wait_results** — p99: 1128137.06ms (2 samples)
2. **result.collected** — p99: 1.00ms (8 samples)
3. **collect.batch** — p99: 1.00ms (8 samples)
4. **hb.stale** — p99: 1.00ms (54 samples)
5. **wave.start** — p99: 0.00ms (3 samples)
