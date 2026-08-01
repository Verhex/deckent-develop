---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:9bd4d40461d33c88fc0f73931685ef5f2112caffe79b40d0b3ff4da37ecbaaf8
---

# Sprint Load Test Report

Generated: 2026-06-19T11:06:06.525Z
Total entries: 25

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-19T10:50:26.411Z | dep-pipeline | 2 |
| 2026-06-19T11:03:09.778Z | dep-pipeline | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| wave.transition | 3 | 3578.00 | 3640.10 | 3645.62 | 3562.00 | 3647.00 |
| result.collected | 6 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 6 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| queue.ready_dispatch | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 390413.39 | 703876.27 | 731739.64 | 42121.31 | 738705.48 |

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

1. **trace:wait_results** — p99: 731739.64ms (2 samples)
2. **wave.transition** — p99: 3645.62ms (3 samples)
3. **collision.detected** — p99: 1.00ms (1 samples)
4. **result.collected** — p99: 1.00ms (6 samples)
5. **collect.batch** — p99: 1.00ms (6 samples)
