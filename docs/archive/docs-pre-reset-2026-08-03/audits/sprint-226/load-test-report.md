---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:7e374ec99a05a0f13a649ecb5be4e7749b3f6bc06a4bd4159fd8816c7639c789
---

# Sprint Load Test Report

Generated: 2026-06-04T11:29:47.460Z
Total entries: 23

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-04T11:08:02.543Z | dep-pipeline | 5 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| hb.stale | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 7 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 7 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 2 | 3631.50 | 3695.85 | 3701.57 | 3560.00 | 3703.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 1104611.63 | 1104611.63 | 1104611.63 | 1104611.63 | 1104611.63 |

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

1. **trace:wait_results** — p99: 1104611.63ms (1 samples)
2. **wave.transition** — p99: 3701.57ms (2 samples)
3. **hb.stale** — p99: 1.00ms (1 samples)
4. **result.collected** — p99: 1.00ms (7 samples)
5. **collect.batch** — p99: 1.00ms (7 samples)
