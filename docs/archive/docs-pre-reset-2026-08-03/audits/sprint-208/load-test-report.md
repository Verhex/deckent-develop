---
doc_rank: 50
status: active
last_updated: 2026-05-31
content_hash: sha256:bb89fddfae10abc427884708eb58d1b73c38913c8e7e3c34dc6e9eedd5f7fd9f
---

# Sprint Load Test Report

Generated: 2026-05-31T19:42:33.589Z
Total entries: 42

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-05-31T19:24:52.085Z | dep-pipeline | 6 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| hb.stale | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 16 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 14 | 1.00 | 2.00 | 2.00 | 1.00 | 2.00 |
| wave.transition | 1 | 7671.00 | 7671.00 | 7671.00 | 7671.00 | 7671.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 922142.72 | 922142.72 | 922142.72 | 922142.72 | 922142.72 |

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

1. **trace:wait_results** — p99: 922142.72ms (1 samples)
2. **wave.transition** — p99: 7671.00ms (1 samples)
3. **collect.batch** — p99: 2.00ms (14 samples)
4. **hb.stale** — p99: 1.00ms (3 samples)
5. **result.collected** — p99: 1.00ms (16 samples)
