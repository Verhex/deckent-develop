---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:e1f501f7544275b57fbcaef595bf053f161c6bbd7042e28cdcdfad9fce35a2e9
---

# Sprint Load Test Report

Generated: 2026-06-10T07:21:05.061Z
Total entries: 20

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-10T07:11:02.448Z | dep-pipeline | 5 |
| 2026-06-10T07:19:24.729Z | dep-pipeline | 4 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 8 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 6 | 1.00 | 3.25 | 3.85 | 1.00 | 4.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 218961.69 | 416006.29 | 433521.37 | 23.24 | 437900.14 |

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

1. **trace:wait_results** — p99: 433521.37ms (2 samples)
2. **collect.batch** — p99: 3.85ms (6 samples)
3. **result.collected** — p99: 1.00ms (8 samples)
4. **config.cache** — p99: 1.00ms (1 samples)
5. **wave.start** — p99: 0.00ms (2 samples)
