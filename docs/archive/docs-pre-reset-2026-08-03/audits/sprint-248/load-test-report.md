---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:4f9f438f51d98da0f2955abe0b630bf5ee9133a993f0fed1932359bb9a239892
---

# Sprint Load Test Report

Generated: 2026-06-09T05:10:20.733Z
Total entries: 9

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-09T05:07:18.742Z | dep-pipeline | 2 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| hb.stale | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 39103.11 | 39103.11 | 39103.11 | 39103.11 | 39103.11 |

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

1. **trace:wait_results** — p99: 39103.11ms (1 samples)
2. **result.collected** — p99: 1.00ms (2 samples)
3. **collect.batch** — p99: 1.00ms (2 samples)
4. **hb.stale** — p99: 1.00ms (1 samples)
5. **config.cache** — p99: 1.00ms (1 samples)
