# Sprint Load Test Report

Generated: 2026-05-18T20:28:05.178Z
Total entries: 47

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-05-18T20:11:46.661Z | dep-pipeline | 2 |
| 2026-05-18T20:23:42.724Z | dep-pipeline | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 7 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 7 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| hb.stale | 25 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 3 | 3557.00 | 6727.70 | 7009.54 | 3557.00 | 7080.00 |
| trace:wait_results | 2 | 415941.99 | 698244.19 | 723337.72 | 102272.89 | 729611.10 |

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

1. **trace:wait_results** — p99: 723337.72ms (2 samples)
2. **wave.transition** — p99: 7009.54ms (3 samples)
3. **result.collected** — p99: 1.00ms (7 samples)
4. **collect.batch** — p99: 1.00ms (7 samples)
5. **hb.stale** — p99: 1.00ms (25 samples)
