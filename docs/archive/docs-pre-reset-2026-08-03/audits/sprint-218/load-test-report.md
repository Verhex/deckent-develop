---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:021eb886cdb4d5a080dfe1d3d0442a1538316752276ecbcd5e7e53bf3825e700
---

# Sprint Load Test Report

Generated: 2026-06-01T21:59:33.367Z
Total entries: 39

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-01T21:39:18.028Z | dep-pipeline | 6 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 13 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 13 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 4 | 3844.00 | 4465.55 | 4547.51 | 3729.00 | 4568.00 |
| hb.stale | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 1099899.52 | 1099899.52 | 1099899.52 | 1099899.52 | 1099899.52 |

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

1. **trace:wait_results** — p99: 1099899.52ms (1 samples)
2. **wave.transition** — p99: 4547.51ms (4 samples)
3. **result.collected** — p99: 1.00ms (13 samples)
4. **collect.batch** — p99: 1.00ms (13 samples)
5. **hb.stale** — p99: 1.00ms (2 samples)
