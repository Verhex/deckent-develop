# Sprint Load Test Report

Generated: 2026-05-20T09:32:12.077Z
Total entries: 244

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-05-20T08:52:28.586Z | dep-pipeline | 8 |
| 2026-05-20T09:22:34.607Z | dep-pipeline | 8 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 2 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| wave.transition | 3 | 76.00 | 77.80 | 77.96 | 27.00 | 78.00 |
| hb.stale | 191 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 22 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 12 | 1.00 | 4.80 | 6.56 | 1.00 | 7.00 |
| honesty.check | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| fix.rotation.applied | 5 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| queue.force_rescan_spawn | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 1122202.06 | 1753552.83 | 1809672.90 | 420701.21 | 1823702.92 |

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

1. **trace:wait_results** — p99: 1809672.90ms (2 samples)
2. **wave.transition** — p99: 77.96ms (3 samples)
3. **collect.batch** — p99: 6.56ms (12 samples)
4. **collision.detected** — p99: 3.00ms (2 samples)
5. **hb.stale** — p99: 1.00ms (191 samples)
