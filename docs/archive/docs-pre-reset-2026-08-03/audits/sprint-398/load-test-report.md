# Sprint Load Test Report

Generated: 2026-07-10T13:49:17.405Z
Total entries: 37

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-10T13:12:39.053Z | dep-pipeline | 5 |
| 2026-07-10T13:26:52.389Z | dep-pipeline | 6 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 12 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 11 | 1.00 | 1.50 | 1.90 | 1.00 | 2.00 |
| wave.transition | 1 | 3659.00 | 3659.00 | 3659.00 | 3659.00 | 3659.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| fix.routing.preserved | 6 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 730823.43 | 916272.61 | 932756.98 | 524768.78 | 936878.07 |

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

1. **trace:wait_results** — p99: 932756.98ms (2 samples)
2. **wave.transition** — p99: 3659.00ms (1 samples)
3. **collect.batch** — p99: 1.90ms (11 samples)
4. **result.collected** — p99: 1.00ms (12 samples)
5. **config.cache** — p99: 1.00ms (1 samples)
