---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:0366b3d762e0133deff08221ac02ee524f5420be946e7cd2a63b7977990030fd
---

# Sprint Load Test Report

Generated: 2026-06-10T19:39:37.593Z
Total entries: 26

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-10T19:27:39.986Z | dep-pipeline | 4 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 |
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| wave.transition | 4 | 3506.50 | 3548.40 | 3553.68 | 3446.00 | 3555.00 |
| result.collected | 8 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 8 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| queue.ready_dispatch | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 429588.14 | 429588.14 | 429588.14 | 429588.14 | 429588.14 |

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

1. **trace:wait_results** — p99: 429588.14ms (1 samples)
2. **wave.transition** — p99: 3553.68ms (4 samples)
3. **collision.detected** — p99: 3.00ms (1 samples)
4. **result.collected** — p99: 1.00ms (8 samples)
5. **collect.batch** — p99: 1.00ms (8 samples)
