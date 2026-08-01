---
doc_rank: 50
status: active
last_updated: 2026-06-26
content_hash: sha256:35a48c238966d947091e00ea41c5037691c9e7bbbba512e8c75ed03db2c5c4ea
---

# Sprint Load Test Report

Generated: 2026-06-26T17:34:00.237Z
Total entries: 19

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-26T17:09:09.280Z | dep-pipeline | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 6 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 6 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 1 | 20245.00 | 20245.00 | 20245.00 | 20245.00 | 20245.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 1396825.97 | 1396825.97 | 1396825.97 | 1396825.97 | 1396825.97 |

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

1. **trace:wait_results** — p99: 1396825.97ms (1 samples)
2. **wave.transition** — p99: 20245.00ms (1 samples)
3. **result.collected** — p99: 1.00ms (6 samples)
4. **collect.batch** — p99: 1.00ms (6 samples)
5. **config.cache** — p99: 1.00ms (1 samples)
