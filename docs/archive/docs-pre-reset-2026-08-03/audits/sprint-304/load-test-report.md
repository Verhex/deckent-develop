---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:c2001a34e5a24402749fc404a40b670c37d2928e87fbd92d8be162420c916e3d
---

# Sprint Load Test Report

Generated: 2026-06-19T14:22:58.508Z
Total entries: 8

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-19T14:16:06.130Z | dep-pipeline | 2 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 271866.67 | 271866.67 | 271866.67 | 271866.67 | 271866.67 |

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

1. **trace:wait_results** — p99: 271866.67ms (1 samples)
2. **result.collected** — p99: 1.00ms (2 samples)
3. **collect.batch** — p99: 1.00ms (2 samples)
4. **config.cache** — p99: 1.00ms (1 samples)
5. **wave.start** — p99: 0.00ms (1 samples)
