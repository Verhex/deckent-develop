---
doc_rank: 50
status: active
last_updated: 2026-06-08
content_hash: sha256:6dcc72735452a33ab5e79c9ddcc95550d1cbd64ef16d81b8d4b75c444ca92d08
---

# Sprint Load Test Report

Generated: 2026-05-14T18:21:26.195Z
Total entries: 23

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-05-14T18:05:07.107Z | legacy | 3 |
| 2026-05-14T18:16:56.409Z | legacy | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| hb.stale | 7 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| queue.force_rescan_spawn | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 433346.71 | 719625.56 | 745072.57 | 115259.10 | 751434.32 |

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

1. **trace:wait_results** — p99: 745072.57ms (2 samples)
2. **collision.detected** — p99: 1.00ms (1 samples)
3. **result.collected** — p99: 1.00ms (4 samples)
4. **collect.batch** — p99: 1.00ms (4 samples)
5. **hb.stale** — p99: 1.00ms (7 samples)
