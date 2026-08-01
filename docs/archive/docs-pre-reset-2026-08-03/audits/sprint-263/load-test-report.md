---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:c55c3ff46601dd796730966f42199db7ffa07a1be6bcc6bbbaa755389ff4c813
---

# Sprint Load Test Report

Generated: 2026-06-09T20:22:13.646Z
Total entries: 11

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-09T20:13:06.762Z | dep-pipeline | 3 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 429267.58 | 429267.58 | 429267.58 | 429267.58 | 429267.58 |

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

1. **trace:wait_results** — p99: 429267.58ms (1 samples)
2. **result.collected** — p99: 1.00ms (3 samples)
3. **collect.batch** — p99: 1.00ms (3 samples)
4. **config.cache** — p99: 1.00ms (1 samples)
5. **honesty.check** — p99: 1.00ms (1 samples)
