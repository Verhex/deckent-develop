# Sprint Load Test Report

Generated: 2026-05-31T14:32:43.781Z
Total entries: 58

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-05-31T14:14:59.031Z | dep-pipeline | 5 |
| 2026-05-31T14:27:55.733Z | dep-pipeline | 5 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 2 | 1.50 | 1.95 | 1.99 | 1.00 | 2.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| wave.transition | 5 | 7706.00 | 7903.20 | 7932.64 | 2397.00 | 7940.00 |
| result.collected | 14 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 14 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| hb.stale | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 6 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| fix.rotation.applied | 7 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 494442.66 | 748141.56 | 770692.58 | 212555.00 | 776330.33 |

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

1. **trace:wait_results** — p99: 770692.58ms (2 samples)
2. **wave.transition** — p99: 7932.64ms (5 samples)
3. **collision.detected** — p99: 1.99ms (2 samples)
4. **result.collected** — p99: 1.00ms (14 samples)
5. **collect.batch** — p99: 1.00ms (14 samples)
