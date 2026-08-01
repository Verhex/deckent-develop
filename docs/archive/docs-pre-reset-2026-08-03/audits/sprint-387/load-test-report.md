# Sprint Load Test Report

Generated: 2026-07-08T17:29:03.223Z
Total entries: 90

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-08T16:39:50.000Z | dep-pipeline | 8 |
| 2026-07-08T17:26:44.037Z | dep-pipeline | 3 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 2.00 | 2.00 | 2.00 | 2.00 | 2.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 30 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 24 | 1.00 | 2.85 | 3.77 | 1.00 | 4.00 |
| wave.transition | 3 | 3671.00 | 3743.00 | 3749.40 | 3662.00 | 3751.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 26 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 1395659.62 | 2651719.61 | 2763369.39 | 37.41 | 2791281.83 |

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

1. **trace:wait_results** — p99: 2763369.39ms (2 samples)
2. **wave.transition** — p99: 3749.40ms (3 samples)
3. **collect.batch** — p99: 3.77ms (24 samples)
4. **collision.detected** — p99: 2.00ms (1 samples)
5. **result.collected** — p99: 1.00ms (30 samples)
