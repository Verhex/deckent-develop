---
doc_rank: 50
status: active
last_updated: 2026-06-08
content_hash: sha256:d252005d2df85da04824291df8e9246f2871b18c61724a76115eccfe1c6d2554
---

# Sprint Load Test Report

Generated: 2026-05-21T12:36:36.471Z
Total entries: 39

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-05-21T12:10:18.567Z | dep-pipeline | 6 |
| 2026-05-21T12:27:57.310Z | dep-pipeline | 3 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 2.00 | 2.00 | 2.00 | 2.00 | 2.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| hb.stale | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 1 | 7242.00 | 7242.00 | 7242.00 | 7242.00 | 7242.00 |
| result.collected | 13 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 13 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 703534.85 | 1013884.68 | 1041471.33 | 358701.71 | 1048367.99 |

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

1. **trace:wait_results** — p99: 1041471.33ms (2 samples)
2. **wave.transition** — p99: 7242.00ms (1 samples)
3. **collision.detected** — p99: 2.00ms (1 samples)
4. **hb.stale** — p99: 1.00ms (3 samples)
5. **result.collected** — p99: 1.00ms (13 samples)
