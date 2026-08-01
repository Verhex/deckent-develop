---
doc_rank: 50
status: active
last_updated: 2026-06-08
content_hash: sha256:de0c74e854d4e76a2119348098865892cb9ce60be9bbdc4afb0dd61ace3a244b
---

# Sprint Load Test Report

Generated: 2026-05-12T22:26:30.840Z
Total entries: 38

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-05-12T21:04:23.647Z | dep-pipeline | 6 |
| 2026-05-12T21:04:24.143Z | dep-pipeline | 5 |
| 2026-05-12T21:29:18.788Z | dep-pipeline | 5 |
| 2026-05-12T21:29:20.282Z | dep-pipeline | 2 |
| 2026-05-12T22:12:04.378Z | legacy | 3 |
| 2026-05-12T22:24:08.187Z | legacy | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 3 | 3.00 | 3.00 | 3.00 | 2.00 | 3.00 |
| wave.start | 6 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| hb.stale | 14 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 357639.00 | 679512.67 | 708123.66 | 1.59 | 715276.41 |

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

1. **trace:wait_results** — p99: 708123.66ms (2 samples)
2. **collision.detected** — p99: 3.00ms (3 samples)
3. **hb.stale** — p99: 1.00ms (14 samples)
4. **result.collected** — p99: 1.00ms (3 samples)
5. **collect.batch** — p99: 1.00ms (4 samples)
