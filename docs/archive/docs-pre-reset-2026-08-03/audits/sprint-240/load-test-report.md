---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:4168f0fb6c28e95393148cb968d81ce391ab62409cc57e8a1b701d03ecf48b2a
---

# Sprint Load Test Report

Generated: 2026-06-08T19:50:50.143Z
Total entries: 6

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-08T19:38:23.954Z | dep-pipeline | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 634279.10 | 634279.10 | 634279.10 | 634279.10 | 634279.10 |

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

1. **trace:wait_results** — p99: 634279.10ms (1 samples)
2. **result.collected** — p99: 1.00ms (1 samples)
3. **collect.batch** — p99: 1.00ms (1 samples)
4. **config.cache** — p99: 1.00ms (1 samples)
5. **wave.start** — p99: 0.00ms (1 samples)
