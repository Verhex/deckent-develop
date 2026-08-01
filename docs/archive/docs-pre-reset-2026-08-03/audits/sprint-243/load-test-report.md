---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:946940afb4cd711104055d2d32c06e16bd1bc7af9e8ff6105f5b65cf9104b34e
---

# Sprint Load Test Report

Generated: 2026-06-08T20:47:20.729Z
Total entries: 13

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-08T20:39:58.575Z | dep-pipeline | 1 |
| 2026-06-08T20:44:53.061Z | dep-pipeline | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| hb.stale | 5 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 14724.53 | 27973.75 | 29151.46 | 3.18 | 29445.89 |

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

1. **trace:wait_results** — p99: 29151.46ms (2 samples)
2. **hb.stale** — p99: 1.00ms (5 samples)
3. **config.cache** — p99: 1.00ms (1 samples)
4. **result.collected** — p99: 1.00ms (1 samples)
5. **collect.batch** — p99: 1.00ms (1 samples)
