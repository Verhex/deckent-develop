---
doc_rank: 50
status: active
last_updated: 2026-06-20
content_hash: sha256:656ef5023d065889d313bd90cfc578c1ecd9321b29f267f8187253f3fab5eea0
---

# Sprint Load Test Report

Generated: 2026-06-20T10:52:40.140Z
Total entries: 59

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-20T10:22:37.659Z | dep-pipeline | 8 |
| 2026-06-20T10:42:37.577Z | dep-pipeline | 8 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 28 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 25 | 1.00 | 1.80 | 2.76 | 1.00 | 3.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 792729.08 | 1107658.39 | 1135652.11 | 442807.63 | 1142650.54 |

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

1. **trace:wait_results** — p99: 1135652.11ms (2 samples)
2. **collect.batch** — p99: 2.76ms (25 samples)
3. **result.collected** — p99: 1.00ms (28 samples)
4. **config.cache** — p99: 1.00ms (1 samples)
5. **wave.start** — p99: 0.00ms (2 samples)
