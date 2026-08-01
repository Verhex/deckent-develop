---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:1ce9754c179cb6d017afe53114c1fa6e3c44079353e18e017853b544b932c09c
---

# Sprint Load Test Report

Generated: 2026-06-19T21:33:44.702Z
Total entries: 18

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-19T21:22:58.018Z | dep-pipeline | 4 |
| 2026-06-19T21:27:39.786Z | dep-pipeline | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 5 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 5 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 256165.19 | 261487.30 | 261960.38 | 250251.73 | 262078.65 |

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

1. **trace:wait_results** — p99: 261960.38ms (2 samples)
2. **result.collected** — p99: 1.00ms (5 samples)
3. **collect.batch** — p99: 1.00ms (5 samples)
4. **config.cache** — p99: 1.00ms (1 samples)
5. **honesty.check** — p99: 1.00ms (2 samples)
