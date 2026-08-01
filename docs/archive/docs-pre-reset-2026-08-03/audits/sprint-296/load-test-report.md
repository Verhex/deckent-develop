---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:070b65fb4e00c70606eb87797a60fc7fc5f490287a06ccd8d2aee18318196f74
---

# Sprint Load Test Report

Generated: 2026-06-19T09:06:22.369Z
Total entries: 13

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-19T08:55:44.742Z | dep-pipeline | 4 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 466692.14 | 466692.14 | 466692.14 | 466692.14 | 466692.14 |

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

1. **trace:wait_results** — p99: 466692.14ms (1 samples)
2. **result.collected** — p99: 1.00ms (4 samples)
3. **collect.batch** — p99: 1.00ms (4 samples)
4. **config.cache** — p99: 1.00ms (1 samples)
5. **honesty.check** — p99: 1.00ms (1 samples)
