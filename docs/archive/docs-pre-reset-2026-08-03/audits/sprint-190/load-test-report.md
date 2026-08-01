---
doc_rank: 50
status: active
last_updated: 2026-06-08
content_hash: sha256:8040e3e3cd3528ddf1bc31504e16db6b6ec96f2de00b786a9de6d8659796b3a8
---

# Sprint Load Test Report

Generated: 2026-05-23T20:11:18.763Z
Total entries: 244

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-05-23T19:14:50.984Z | dep-pipeline | 6 |
| 2026-05-23T19:50:31.469Z | dep-pipeline | 6 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 2 | 3.50 | 4.85 | 4.97 | 2.00 | 5.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| wave.transition | 13 | 3588.00 | 11798.60 | 12918.92 | 3544.00 | 13199.00 |
| result.collected | 23 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 23 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| hb.stale | 139 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| queue.force_rescan_spawn | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 8 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| fix.rotation.applied | 26 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 1544203.78 | 1844980.83 | 1871716.57 | 1210007.06 | 1878400.50 |

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

1. **trace:wait_results** — p99: 1871716.57ms (2 samples)
2. **wave.transition** — p99: 12918.92ms (13 samples)
3. **collision.detected** — p99: 4.97ms (2 samples)
4. **result.collected** — p99: 1.00ms (23 samples)
5. **collect.batch** — p99: 1.00ms (23 samples)
