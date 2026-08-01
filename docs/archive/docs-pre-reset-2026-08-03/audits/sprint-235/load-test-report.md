---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:2f92eac1ee0938913fd254533c6eecba652b8f1329b680e5d7af2108f65cd303
---

# Sprint Load Test Report

Generated: 2026-06-06T12:39:38.814Z
Total entries: 8

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-06T12:26:39.760Z | dep-pipeline | 1 |
| 2026-06-06T12:33:09.661Z | dep-pipeline | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 136884.61 | 260077.73 | 271028.23 | 3.37 | 273765.85 |

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

1. **trace:wait_results** — p99: 271028.23ms (2 samples)
2. **config.cache** — p99: 1.00ms (1 samples)
3. **result.collected** — p99: 1.00ms (1 samples)
4. **collect.batch** — p99: 1.00ms (1 samples)
5. **wave.start** — p99: 0.00ms (2 samples)
