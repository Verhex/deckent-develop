# Sprint Load Test Report

Generated: 2026-06-28T13:20:59.950Z
Total entries: 40

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-28T12:59:40.859Z | dep-pipeline | 12 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 2.00 | 2.00 | 2.00 | 2.00 | 2.00 |
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 13 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 21 | 1.00 | 2.00 | 2.80 | 1.00 | 3.00 |
| wave.transition | 1 | 3541.00 | 3541.00 | 3541.00 | 3541.00 | 3541.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 686831.43 | 686831.43 | 686831.43 | 686831.43 | 686831.43 |

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

1. **trace:wait_results** — p99: 686831.43ms (1 samples)
2. **wave.transition** — p99: 3541.00ms (1 samples)
3. **collect.batch** — p99: 2.80ms (21 samples)
4. **collision.detected** — p99: 2.00ms (1 samples)
5. **result.collected** — p99: 1.00ms (13 samples)
