# Sprint Load Test Report

Generated: 2026-07-05T12:11:02.046Z
Total entries: 28

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-05T11:51:55.005Z | dep-pipeline | 7 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| queue.force_rescan_spawn | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 8 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 8 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 1 | 3632.00 | 3632.00 | 3632.00 | 3632.00 | 3632.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 5 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 960605.50 | 960605.50 | 960605.50 | 960605.50 | 960605.50 |

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

1. **trace:wait_results** — p99: 960605.50ms (1 samples)
2. **wave.transition** — p99: 3632.00ms (1 samples)
3. **collision.detected** — p99: 1.00ms (1 samples)
4. **queue.force_rescan_spawn** — p99: 1.00ms (1 samples)
5. **result.collected** — p99: 1.00ms (8 samples)
