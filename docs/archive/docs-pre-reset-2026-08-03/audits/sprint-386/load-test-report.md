# Sprint Load Test Report

Generated: 2026-07-08T13:21:40.576Z
Total entries: 326

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-08T10:13:48.143Z | dep-pipeline | 4 |
| 2026-07-08T10:27:06.337Z | dep-pipeline | 4 |
| 2026-07-08T13:06:19.085Z | dep-pipeline | 8 |
| 2026-07-08T13:11:18.403Z | dep-pipeline | 4 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 4 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 15 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 12 | 1.00 | 2.35 | 3.67 | 1.00 | 4.00 |
| hb.stale | 282 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| fix.routing.preserved | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 220513.61 | 248218.30 | 250680.94 | 189730.62 | 251296.60 |

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

1. **trace:wait_results** — p99: 250680.94ms (2 samples)
2. **collect.batch** — p99: 3.67ms (12 samples)
3. **result.collected** — p99: 1.00ms (15 samples)
4. **hb.stale** — p99: 1.00ms (282 samples)
5. **config.cache** — p99: 1.00ms (1 samples)
