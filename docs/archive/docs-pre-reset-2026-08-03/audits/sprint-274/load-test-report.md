---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:d33ec8201db6a3754c29480e93cb1670f1c7dd5a72ba4f52c2a431f545493ce9
---

# Sprint Load Test Report

Generated: 2026-06-10T19:12:33.873Z
Total entries: 21

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-10T18:58:32.532Z | dep-pipeline | 2 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| hb.stale | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 6 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 6 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 3 | 3508.00 | 10005.10 | 10582.62 | 3505.00 | 10727.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 597092.33 | 597092.33 | 597092.33 | 597092.33 | 597092.33 |

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

1. **trace:wait_results** — p99: 597092.33ms (1 samples)
2. **wave.transition** — p99: 10582.62ms (3 samples)
3. **hb.stale** — p99: 1.00ms (1 samples)
4. **result.collected** — p99: 1.00ms (6 samples)
5. **collect.batch** — p99: 1.00ms (6 samples)
