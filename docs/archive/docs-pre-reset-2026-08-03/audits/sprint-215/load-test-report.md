---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:d4b657580ff7d3fece16f6dfb3f1aa24ef6003a8bb8054df0ca01cbf624d97ce
---

# Sprint Load Test Report

Generated: 2026-06-01T16:13:45.261Z
Total entries: 108

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-01T15:45:04.551Z | dep-pipeline | 6 |
| 2026-06-01T16:07:44.880Z | dep-pipeline | 2 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| wave.transition | 8 | 3526.00 | 6457.05 | 7626.61 | 3168.00 | 7919.00 |
| result.collected | 24 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 24 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| hb.stale | 40 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 5 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 787371.86 | 1277096.68 | 1320627.78 | 243233.18 | 1331510.55 |

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

1. **trace:wait_results** — p99: 1320627.78ms (2 samples)
2. **wave.transition** — p99: 7626.61ms (8 samples)
3. **collision.detected** — p99: 1.00ms (1 samples)
4. **result.collected** — p99: 1.00ms (24 samples)
5. **collect.batch** — p99: 1.00ms (24 samples)
