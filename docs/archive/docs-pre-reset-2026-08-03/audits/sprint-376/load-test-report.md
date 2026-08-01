# Sprint Load Test Report

Generated: 2026-07-06T16:54:02.248Z
Total entries: 15

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-06T16:35:19.118Z | dep-pipeline | 3 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 1 | 3681.00 | 3681.00 | 3681.00 | 3681.00 | 3681.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 1016722.52 | 1016722.52 | 1016722.52 | 1016722.52 | 1016722.52 |

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

1. **trace:wait_results** — p99: 1016722.52ms (1 samples)
2. **wave.transition** — p99: 3681.00ms (1 samples)
3. **collision.detected** — p99: 1.00ms (1 samples)
4. **result.collected** — p99: 1.00ms (3 samples)
5. **collect.batch** — p99: 1.00ms (3 samples)
