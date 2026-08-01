---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:f099c2391c8c82675f935d223e7cff8d21bb7e9f1857d8d50bf1eb3e47cc3814
---

# Sprint Load Test Report

Generated: 2026-06-15T19:55:03.872Z
Total entries: 17

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-15T19:44:57.126Z | dep-pipeline | 5 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 5 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 5 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 454150.81 | 454150.81 | 454150.81 | 454150.81 | 454150.81 |

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

1. **trace:wait_results** — p99: 454150.81ms (1 samples)
2. **result.collected** — p99: 1.00ms (5 samples)
3. **collect.batch** — p99: 1.00ms (5 samples)
4. **config.cache** — p99: 1.00ms (1 samples)
5. **honesty.check** — p99: 1.00ms (1 samples)
