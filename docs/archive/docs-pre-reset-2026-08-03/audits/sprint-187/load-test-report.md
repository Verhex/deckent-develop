---
doc_rank: 50
status: active
last_updated: 2026-06-08
content_hash: sha256:e5e025ee1fafe08c1be8b0a7be977ccbfe178eb3ad9d0fc5752fffb81784f34b
---

# Sprint Load Test Report

Generated: 2026-05-22T13:11:11.757Z
Total entries: 5

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-05-22T13:07:55.484Z | dep-pipeline | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 101472.85 | 101472.85 | 101472.85 | 101472.85 | 101472.85 |

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

1. **trace:wait_results** — p99: 101472.85ms (1 samples)
2. **result.collected** — p99: 1.00ms (1 samples)
3. **collect.batch** — p99: 1.00ms (1 samples)
4. **wave.start** — p99: 0.00ms (1 samples)
