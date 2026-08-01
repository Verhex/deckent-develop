---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:0a48debb6643e03a98ad6340847b78feb92f28356b69aed78fcc73d103c0617d
---

# Sprint Load Test Report

Generated: 2026-06-02T09:23:22.015Z
Total entries: 53

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-02T09:00:28.206Z | dep-pipeline | 6 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 |
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| wave.transition | 4 | 3898.50 | 10661.80 | 11586.76 | 3514.00 | 11818.00 |
| result.collected | 17 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 17 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| hb.stale | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| queue.force_rescan_spawn | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 7 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 1184876.22 | 1184876.22 | 1184876.22 | 1184876.22 | 1184876.22 |

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

1. **trace:wait_results** — p99: 1184876.22ms (1 samples)
2. **wave.transition** — p99: 11586.76ms (4 samples)
3. **collision.detected** — p99: 3.00ms (1 samples)
4. **result.collected** — p99: 1.00ms (17 samples)
5. **collect.batch** — p99: 1.00ms (17 samples)
