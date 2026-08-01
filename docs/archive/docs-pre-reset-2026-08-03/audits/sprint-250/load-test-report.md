---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:e023c2fba19af9bb75a55fdb7b9be14807242d3378369663fa3461ce6bd13f5f
---

# Sprint Load Test Report

Generated: 2026-06-09T06:52:33.652Z
Total entries: 8

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-09T06:44:32.932Z | dep-pipeline | 4 |
| 2026-06-09T06:49:54.352Z | dep-pipeline | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 17755.49 | 33732.17 | 35152.32 | 3.61 | 35507.36 |

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

1. **trace:wait_results** — p99: 35152.32ms (2 samples)
2. **config.cache** — p99: 1.00ms (1 samples)
3. **result.collected** — p99: 1.00ms (1 samples)
4. **collect.batch** — p99: 1.00ms (1 samples)
5. **wave.start** — p99: 0.00ms (2 samples)
