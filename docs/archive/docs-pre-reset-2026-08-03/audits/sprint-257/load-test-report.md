---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:7ba0040b1eebf3b46fe90665d21ba76448ff221149b9facd83d7c45dbc3b5410
---

# Sprint Load Test Report

Generated: 2026-06-09T15:30:57.118Z
Total entries: 13

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-09T15:22:00.234Z | dep-pipeline | 2 |
| 2026-06-09T15:27:27.859Z | dep-pipeline | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 207562.24 | 313785.75 | 323227.84 | 89536.13 | 325588.36 |

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

1. **trace:wait_results** — p99: 323227.84ms (2 samples)
2. **result.collected** — p99: 1.00ms (3 samples)
3. **collect.batch** — p99: 1.00ms (3 samples)
4. **config.cache** — p99: 1.00ms (1 samples)
5. **honesty.check** — p99: 1.00ms (1 samples)
