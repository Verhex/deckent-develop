---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:49cfc01a6679e1129456cfb03882a1ee6e18d8869a519eb6001d0496dd36c947
---

# Sprint Load Test Report

Generated: 2026-06-05T10:37:19.734Z
Total entries: 17

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-05T10:26:20.907Z | dep-pipeline | 4 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| hb.stale | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 535224.78 | 535224.78 | 535224.78 | 535224.78 | 535224.78 |

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

1. **trace:wait_results** — p99: 535224.78ms (1 samples)
2. **hb.stale** — p99: 1.00ms (1 samples)
3. **result.collected** — p99: 1.00ms (4 samples)
4. **collect.batch** — p99: 1.00ms (4 samples)
5. **config.cache** — p99: 1.00ms (1 samples)
