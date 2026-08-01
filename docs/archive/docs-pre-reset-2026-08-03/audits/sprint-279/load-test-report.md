---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:6379c007554c225c67285f352c881974df60223fd800bb2c23a0a13b8e377c40
---

# Sprint Load Test Report

Generated: 2026-06-10T22:19:54.079Z
Total entries: 33

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-10T21:56:43.413Z | dep-pipeline | 6 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| hb.stale | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 11 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 11 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 4 | 3486.00 | 9673.15 | 10546.63 | 3464.00 | 10765.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 1071195.94 | 1071195.94 | 1071195.94 | 1071195.94 | 1071195.94 |

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

1. **trace:wait_results** — p99: 1071195.94ms (1 samples)
2. **wave.transition** — p99: 10546.63ms (4 samples)
3. **hb.stale** — p99: 1.00ms (1 samples)
4. **result.collected** — p99: 1.00ms (11 samples)
5. **collect.batch** — p99: 1.00ms (11 samples)
