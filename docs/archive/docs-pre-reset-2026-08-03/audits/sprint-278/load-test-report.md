---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:0bde25f814e7885cb11626c4c17e932d5220954f83cde02e9ca469fa5c7e2d6f
---

# Sprint Load Test Report

Generated: 2026-06-10T21:51:37.070Z
Total entries: 35

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-10T21:22:56.192Z | dep-pipeline | 2 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 2.00 | 2.00 | 2.00 | 2.00 | 2.00 |
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 11 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 11 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 4 | 3475.00 | 16179.65 | 17971.13 | 3457.00 | 18419.00 |
| hb.stale | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| queue.ready_dispatch | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 1378753.60 | 1378753.60 | 1378753.60 | 1378753.60 | 1378753.60 |

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

1. **trace:wait_results** — p99: 1378753.60ms (1 samples)
2. **wave.transition** — p99: 17971.13ms (4 samples)
3. **collision.detected** — p99: 2.00ms (1 samples)
4. **result.collected** — p99: 1.00ms (11 samples)
5. **collect.batch** — p99: 1.00ms (11 samples)
