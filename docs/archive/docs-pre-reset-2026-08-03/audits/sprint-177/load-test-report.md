---
doc_rank: 50
status: active
last_updated: 2026-06-08
content_hash: sha256:b44b415eb3a475c946af83ed42671cbc95e75e35b9909f64f0c6b64dafe55a3b
---

# Sprint Load Test Report

Generated: 2026-05-20T10:46:13.683Z
Total entries: 33

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-05-20T10:20:08.586Z | legacy | 6 |
| 2026-05-20T10:42:34.922Z | legacy | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 4.00 | 4.00 | 4.00 | 4.00 | 4.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 7 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 7 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| hb.stale | 5 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| queue.force_rescan_spawn | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 694692.57 | 1283378.50 | 1335706.14 | 40597.09 | 1348788.05 |

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

1. **trace:wait_results** — p99: 1335706.14ms (2 samples)
2. **collision.detected** — p99: 4.00ms (1 samples)
3. **result.collected** — p99: 1.00ms (7 samples)
4. **collect.batch** — p99: 1.00ms (7 samples)
5. **hb.stale** — p99: 1.00ms (5 samples)
