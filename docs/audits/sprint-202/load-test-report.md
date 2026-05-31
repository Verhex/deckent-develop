# Sprint Load Test Report

Generated: 2026-05-31T14:02:58.273Z
Total entries: 42

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-05-31T13:06:57.832Z | dep-pipeline | 3 |
| 2026-05-31T13:42:50.746Z | dep-pipeline | 3 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 4.00 | 4.00 | 4.00 | 4.00 | 4.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 7 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 7 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 2 | 7354.00 | 7559.20 | 7577.44 | 7126.00 | 7582.00 |
| hb.stale | 15 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 1514653.18 | 1828197.86 | 1856068.50 | 1166270.20 | 1863036.16 |

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

1. **trace:wait_results** — p99: 1856068.50ms (2 samples)
2. **wave.transition** — p99: 7577.44ms (2 samples)
3. **collision.detected** — p99: 4.00ms (1 samples)
4. **result.collected** — p99: 1.00ms (7 samples)
5. **collect.batch** — p99: 1.00ms (7 samples)
