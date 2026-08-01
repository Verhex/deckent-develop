# Sprint Load Test Report

Generated: 2026-07-10T07:25:38.791Z
Total entries: 18

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-10T06:50:51.416Z | dep-pipeline | 3 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 2.00 | 2.00 | 2.00 | 2.00 | 2.00 |
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 5 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 5 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 1 | 7791.00 | 7791.00 | 7791.00 | 7791.00 | 7791.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 1905317.31 | 1905317.31 | 1905317.31 | 1905317.31 | 1905317.31 |

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

1. **trace:wait_results** — p99: 1905317.31ms (1 samples)
2. **wave.transition** — p99: 7791.00ms (1 samples)
3. **collision.detected** — p99: 2.00ms (1 samples)
4. **result.collected** — p99: 1.00ms (5 samples)
5. **collect.batch** — p99: 1.00ms (5 samples)
