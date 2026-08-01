---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:773af56ea9c341d76ff3dddf86e31b37a76967a26f3e2351782fa61d299a3af6
---

# Sprint Load Test Report

Generated: 2026-06-09T17:25:14.864Z
Total entries: 48

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-09T17:11:00.783Z | dep-pipeline | 8 |
| 2026-06-09T17:22:22.827Z | dep-pipeline | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 17 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 16 | 1.00 | 1.25 | 1.85 | 1.00 | 2.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 9 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 334036.05 | 587821.55 | 610380.26 | 52052.17 | 616019.94 |

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

1. **trace:wait_results** — p99: 610380.26ms (2 samples)
2. **collect.batch** — p99: 1.85ms (16 samples)
3. **result.collected** — p99: 1.00ms (17 samples)
4. **config.cache** — p99: 1.00ms (1 samples)
5. **honesty.check** — p99: 1.00ms (9 samples)
