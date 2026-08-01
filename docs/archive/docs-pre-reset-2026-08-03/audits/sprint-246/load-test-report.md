---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:53d436a92803235ccfdf42af8c30d3ddef6538dbf70299dd776e05f0e2592b9a
---

# Sprint Load Test Report

Generated: 2026-06-08T21:35:46.971Z
Total entries: 4

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-08T21:28:49.182Z | dep-pipeline | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 2.64 | 2.64 | 2.64 | 2.64 | 2.64 |

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

1. **trace:wait_results** — p99: 2.64ms (1 samples)
2. **config.cache** — p99: 1.00ms (1 samples)
3. **wave.start** — p99: 0.00ms (1 samples)
