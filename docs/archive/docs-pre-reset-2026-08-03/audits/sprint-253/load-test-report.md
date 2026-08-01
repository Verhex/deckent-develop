---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:e7cd883f8868b940ed0991561711099e5fa0d4cec1a8df23cd64a8ae0c7d941f
---

# Sprint Load Test Report

Generated: 2026-06-09T08:21:16.654Z
Total entries: 15

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-09T08:16:42.909Z | dep-pipeline | 2 |
| 2026-06-09T08:17:42.308Z | dep-pipeline | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| hb.stale | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 66061.88 | 87986.65 | 89935.51 | 41701.04 | 90422.73 |

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

1. **trace:wait_results** — p99: 89935.51ms (2 samples)
2. **result.collected** — p99: 1.00ms (3 samples)
3. **collect.batch** — p99: 1.00ms (3 samples)
4. **hb.stale** — p99: 1.00ms (3 samples)
5. **config.cache** — p99: 1.00ms (1 samples)
