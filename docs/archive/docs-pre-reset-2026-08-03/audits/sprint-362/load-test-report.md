# Sprint Load Test Report

Generated: 2026-07-02T23:42:56.665Z
Total entries: 42

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-02T22:59:00.866Z | dep-pipeline | 8 |
| 2026-07-02T23:24:49.360Z | dep-pipeline | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 14 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 13 | 1.00 | 1.40 | 1.88 | 1.00 | 2.00 |
| wave.transition | 1 | 20.00 | 20.00 | 20.00 | 20.00 | 20.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 7 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| fix.routing.preserved | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 1125846.88 | 1208150.67 | 1215466.56 | 1034398.23 | 1217295.53 |

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

1. **trace:wait_results** — p99: 1215466.56ms (2 samples)
2. **wave.transition** — p99: 20.00ms (1 samples)
3. **collect.batch** — p99: 1.88ms (13 samples)
4. **result.collected** — p99: 1.00ms (14 samples)
5. **config.cache** — p99: 1.00ms (1 samples)
