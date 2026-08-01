---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:d556cf61afb9b11bbeb78c07f9e4ecd57070ff309c2df26283d1d67ceb7744cb
---

# Sprint Load Test Report

Generated: 2026-06-09T13:58:44.801Z
Total entries: 36

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-09T13:38:33.416Z | dep-pipeline | 3 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| hb.stale | 30 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |

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

1. **hb.stale** — p99: 1.00ms (30 samples)
2. **result.collected** — p99: 1.00ms (2 samples)
3. **collect.batch** — p99: 1.00ms (2 samples)
4. **wave.start** — p99: 0.00ms (1 samples)
