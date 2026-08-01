---
doc_rank: 50
status: active
last_updated: 2026-06-08
content_hash: sha256:d74e1537415776927c2dd52c104f7855a1f2fd0d1806d1e9dc364c3d09ecea03
---

# Sprint Load Test Report

Generated: 2026-05-31T11:39:35.279Z
Total entries: 28

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-05-31T11:03:43.660Z | dep-pipeline | 6 |
| 2026-05-31T11:29:53.336Z | dep-pipeline | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| wave.transition | 2 | 3251.50 | 3520.15 | 3544.03 | 2953.00 | 3550.00 |
| result.collected | 7 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 7 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| queue.force_rescan_spawn | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 1046761.19 | 1529792.22 | 1572728.32 | 510060.04 | 1583462.34 |

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

1. **trace:wait_results** — p99: 1572728.32ms (2 samples)
2. **wave.transition** — p99: 3544.03ms (2 samples)
3. **collision.detected** — p99: 1.00ms (1 samples)
4. **result.collected** — p99: 1.00ms (7 samples)
5. **collect.batch** — p99: 1.00ms (7 samples)
