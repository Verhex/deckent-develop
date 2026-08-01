---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:d5eae097e9d97b691154f256e86e2c3766f332ac42f52d2f0eac4e78dd2fba5a
---

# Sprint Load Test Report

Generated: 2026-06-19T12:44:20.738Z
Total entries: 128

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-19T12:05:18.219Z | dep-pipeline | 8 |
| 2026-06-19T12:34:05.382Z | dep-pipeline | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 8.00 | 8.00 | 8.00 | 8.00 | 8.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| wave.transition | 13 | 3585.00 | 9135.00 | 14482.20 | 3547.00 | 15819.00 |
| result.collected | 30 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 28 | 1.00 | 1.00 | 2.46 | 1.00 | 3.00 |
| hb.stale | 40 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| queue.ready_dispatch | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 9 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 1051658.63 | 1555385.57 | 1600161.30 | 491962.02 | 1611355.23 |

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

1. **trace:wait_results** — p99: 1600161.30ms (2 samples)
2. **wave.transition** — p99: 14482.20ms (13 samples)
3. **collision.detected** — p99: 8.00ms (1 samples)
4. **collect.batch** — p99: 2.46ms (28 samples)
5. **result.collected** — p99: 1.00ms (30 samples)
