---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:21dfa2546cb3859fa83587c499acbd43c553c0def72cd7c8ab109e2291ee3467
---

# Sprint Load Test Report

Generated: 2026-06-15T05:59:37.921Z
Total entries: 16

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-15T05:50:15.481Z | dep-pipeline | 5 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| hb.stale | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 5 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 5 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 439641.77 | 439641.77 | 439641.77 | 439641.77 | 439641.77 |

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

1. **trace:wait_results** — p99: 439641.77ms (1 samples)
2. **hb.stale** — p99: 1.00ms (2 samples)
3. **result.collected** — p99: 1.00ms (5 samples)
4. **collect.batch** — p99: 1.00ms (5 samples)
5. **config.cache** — p99: 1.00ms (1 samples)
