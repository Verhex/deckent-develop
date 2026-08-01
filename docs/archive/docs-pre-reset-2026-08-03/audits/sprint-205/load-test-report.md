---
doc_rank: 50
status: active
last_updated: 2026-06-08
content_hash: sha256:3877bcf6eeab4e70f9c7d68b6cadf62793ee5c73914e546f599815f499178137
---

# Sprint Load Test Report

Generated: 2026-05-31T15:58:01.223Z
Total entries: 36

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-05-31T15:44:54.833Z | dep-pipeline | 6 |
| 2026-05-31T15:50:47.523Z | dep-pipeline | 3 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 12 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 12 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 2 | 3762.00 | 3780.90 | 3782.58 | 3741.00 | 3783.00 |
| hb.stale | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 341460.78 | 360026.94 | 361677.27 | 320831.72 | 362089.85 |

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

1. **trace:wait_results** — p99: 361677.27ms (2 samples)
2. **wave.transition** — p99: 3782.58ms (2 samples)
3. **result.collected** — p99: 1.00ms (12 samples)
4. **collect.batch** — p99: 1.00ms (12 samples)
5. **hb.stale** — p99: 1.00ms (3 samples)
