---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:90ab7a33080552590c63139ee587ecb8e2a3babecaa0eea344914f8c8b904cb7
---

# Sprint Load Test Report

Generated: 2026-06-08T19:27:08.020Z
Total entries: 10

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-08T19:18:26.299Z | dep-pipeline | 1 |
| 2026-06-08T19:18:35.395Z | dep-pipeline | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 200759.87 | 381431.21 | 397490.88 | 13.94 | 401505.80 |

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

1. **trace:wait_results** — p99: 397490.88ms (2 samples)
2. **result.collected** — p99: 1.00ms (2 samples)
3. **collect.batch** — p99: 1.00ms (2 samples)
4. **config.cache** — p99: 1.00ms (1 samples)
5. **wave.start** — p99: 0.00ms (2 samples)
