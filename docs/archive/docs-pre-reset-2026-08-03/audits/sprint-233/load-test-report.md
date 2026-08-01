---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:e418a8b2e6247cbfdf6c4c2c8793cdf7d42fe68a746413592cdfdcdc42c37ebc
---

# Sprint Load Test Report

Generated: 2026-06-06T11:10:03.418Z
Total entries: 9

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-06T10:49:14.823Z | dep-pipeline | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 1 | 3669.00 | 3669.00 | 3669.00 | 3669.00 | 3669.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 1152516.42 | 1152516.42 | 1152516.42 | 1152516.42 | 1152516.42 |

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

1. **trace:wait_results** — p99: 1152516.42ms (1 samples)
2. **wave.transition** — p99: 3669.00ms (1 samples)
3. **result.collected** — p99: 1.00ms (2 samples)
4. **collect.batch** — p99: 1.00ms (2 samples)
5. **config.cache** — p99: 1.00ms (1 samples)
