# Sprint Load Test Report

Generated: 2026-07-13T20:51:33.490Z
Total entries: 24

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-13T20:15:12.359Z | dep-pipeline | 2 |
| 2026-07-13T20:41:20.927Z | dep-pipeline | 2 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 7 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 7 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| fix.routing.preserved | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 1043390.73 | 1520984.61 | 1563437.40 | 512730.86 | 1574050.60 |

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

1. **trace:wait_results** — p99: 1563437.40ms (2 samples)
2. **result.collected** — p99: 1.00ms (7 samples)
3. **collect.batch** — p99: 1.00ms (7 samples)
4. **honesty.check** — p99: 1.00ms (3 samples)
5. **fix.routing.preserved** — p99: 1.00ms (2 samples)
