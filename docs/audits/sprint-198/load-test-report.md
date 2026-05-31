# Sprint Load Test Report

Generated: 2026-05-31T01:03:11.844Z
Total entries: 92

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-05-31T00:39:32.017Z | dep-pipeline | 6 |
| 2026-05-31T00:51:51.704Z | dep-pipeline | 6 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 2 | 5.00 | 5.00 | 5.00 | 5.00 | 5.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| wave.transition | 2 | 13700.00 | 14978.90 | 15092.58 | 12279.00 | 15121.00 |
| hb.stale | 44 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 18 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 10 | 1.50 | 4.00 | 4.00 | 1.00 | 4.00 |
| queue.force_rescan_spawn | 6 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| fix.rotation.applied | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 703707.75 | 735554.34 | 738385.15 | 668322.65 | 739092.85 |

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

1. **trace:wait_results** — p99: 738385.15ms (2 samples)
2. **wave.transition** — p99: 15092.58ms (2 samples)
3. **collision.detected** — p99: 5.00ms (2 samples)
4. **collect.batch** — p99: 4.00ms (10 samples)
5. **hb.stale** — p99: 1.00ms (44 samples)
