# Sprint Load Test Report

Generated: 2026-05-22T23:44:06.172Z
Total entries: 168

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-05-22T23:01:11.739Z | dep-pipeline | 6 |
| 2026-05-22T23:29:53.408Z | dep-pipeline | 6 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 6.00 | 6.00 | 6.00 | 6.00 | 6.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| wave.transition | 8 | 3597.00 | 6365.75 | 7109.15 | 2321.00 | 7295.00 |
| hb.stale | 103 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 23 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 21 | 1.00 | 1.00 | 2.60 | 1.00 | 3.00 |
| honesty.check | 6 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| fix.rotation.applied | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 1289559.46 | 1727784.77 | 1766738.13 | 802642.46 | 1776476.47 |

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

1. **trace:wait_results** — p99: 1766738.13ms (2 samples)
2. **wave.transition** — p99: 7109.15ms (8 samples)
3. **collision.detected** — p99: 6.00ms (1 samples)
4. **collect.batch** — p99: 2.60ms (21 samples)
5. **hb.stale** — p99: 1.00ms (103 samples)
