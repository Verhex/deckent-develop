# Sprint Load Test Report

Generated: 2026-07-02T21:57:06.196Z
Total entries: 62

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-02T16:28:01.028Z | dep-pipeline | 8 |
| 2026-07-02T21:42:43.451Z | dep-pipeline | 8 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 26 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 21 | 1.00 | 2.00 | 2.80 | 1.00 | 3.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| fix.rotation.applied | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 3 | 3649.00 | 3755.20 | 3764.64 | 1402.00 | 3767.00 |
| trace:wait_results | 2 | 9977397.63 | 18271598.50 | 19008860.80 | 761618.88 | 19193176.38 |

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

1. **trace:wait_results** — p99: 19008860.80ms (2 samples)
2. **wave.transition** — p99: 3764.64ms (3 samples)
3. **collect.batch** — p99: 2.80ms (21 samples)
4. **result.collected** — p99: 1.00ms (26 samples)
5. **config.cache** — p99: 1.00ms (1 samples)
