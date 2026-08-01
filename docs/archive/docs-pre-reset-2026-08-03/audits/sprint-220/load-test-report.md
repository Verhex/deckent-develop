---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:115f79b0a00b14d153d1dec290c7e368f0c544f37b42ddd8563e54dcce2a99ca
---

# Sprint Load Test Report

Generated: 2026-06-02T07:26:18.894Z
Total entries: 50

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-02T07:01:30.973Z | dep-pipeline | 6 |
| 2026-06-02T07:22:23.945Z | dep-pipeline | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 18 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 18 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 2 | 3603.50 | 3612.95 | 3613.79 | 3593.00 | 3614.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 6 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 638058.24 | 1115383.62 | 1157812.54 | 107696.72 | 1168419.77 |

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

1. **trace:wait_results** — p99: 1157812.54ms (2 samples)
2. **wave.transition** — p99: 3613.79ms (2 samples)
3. **result.collected** — p99: 1.00ms (18 samples)
4. **collect.batch** — p99: 1.00ms (18 samples)
5. **config.cache** — p99: 1.00ms (1 samples)
