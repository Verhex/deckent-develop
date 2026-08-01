---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:a8955404755b5880e8e162159705607a992466e951f2ce42e59e31a26b2e50a4
---

# Sprint Load Test Report

Generated: 2026-06-10T16:25:34.475Z
Total entries: 42

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-10T15:50:21.705Z | dep-pipeline | 6 |
| 2026-06-10T16:21:47.251Z | dep-pipeline | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| hb.stale | 5 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 12 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 12 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 4 | 3465.00 | 6854.25 | 7332.45 | 3454.00 | 7452.00 |
| queue.force_rescan_spawn | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 847501.71 | 1545846.85 | 1607921.98 | 71562.66 | 1623440.76 |

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

1. **trace:wait_results** — p99: 1607921.98ms (2 samples)
2. **wave.transition** — p99: 7332.45ms (4 samples)
3. **collision.detected** — p99: 1.00ms (1 samples)
4. **hb.stale** — p99: 1.00ms (5 samples)
5. **result.collected** — p99: 1.00ms (12 samples)
