---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:d0485fcaf0622a0d5418233f8debce01a5f12eae8117e5bb428b1808b6a7038a
---

# Sprint Load Test Report

Generated: 2026-06-01T19:16:33.167Z
Total entries: 11

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-01T19:05:47.110Z | dep-pipeline | 1 |
| 2026-06-01T19:08:34.845Z | dep-pipeline | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 274024.61 | 364571.53 | 372620.15 | 173416.92 | 374632.30 |

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

1. **trace:wait_results** — p99: 372620.15ms (2 samples)
2. **result.collected** — p99: 1.00ms (2 samples)
3. **collect.batch** — p99: 1.00ms (2 samples)
4. **config.cache** — p99: 1.00ms (1 samples)
5. **honesty.check** — p99: 1.00ms (1 samples)
