---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:5a50d497ebc161ee23885669de376b84fb90e7830e88e1d52dc24b4f4b30b0ee
---

# Sprint Load Test Report

Generated: 2026-06-19T11:51:37.958Z
Total entries: 6

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-19T11:43:49.376Z | dep-pipeline | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 331863.63 | 331863.63 | 331863.63 | 331863.63 | 331863.63 |

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

1. **trace:wait_results** — p99: 331863.63ms (1 samples)
2. **result.collected** — p99: 1.00ms (1 samples)
3. **collect.batch** — p99: 1.00ms (1 samples)
4. **config.cache** — p99: 1.00ms (1 samples)
5. **wave.start** — p99: 0.00ms (1 samples)
