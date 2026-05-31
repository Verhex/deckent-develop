# Sprint Load Test Report

Generated: 2026-05-31T19:05:46.749Z
Total entries: 36

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-05-31T18:50:00.879Z | dep-pipeline | 6 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 9 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 9 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 2 | 3688.50 | 3721.35 | 3724.27 | 3652.00 | 3725.00 |
| hb.stale | 9 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 850425.79 | 850425.79 | 850425.79 | 850425.79 | 850425.79 |

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

1. **trace:wait_results** — p99: 850425.79ms (1 samples)
2. **wave.transition** — p99: 3724.27ms (2 samples)
3. **result.collected** — p99: 1.00ms (9 samples)
4. **collect.batch** — p99: 1.00ms (9 samples)
5. **hb.stale** — p99: 1.00ms (9 samples)
