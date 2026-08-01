---
doc_rank: 50
status: active
last_updated: 2026-06-08
content_hash: sha256:905b03bda5abf6c6b8b26668cfb449e2136f925d63eb1c6899402d2b95497642
---

# Sprint Load Test Report

Generated: 2026-05-24T14:07:14.721Z
Total entries: 6

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-05-24T14:05:32.370Z | dep-pipeline | 1 |
| 2026-05-24T14:05:41.128Z | dep-pipeline | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| collect.batch | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 4999.55 | 4999.55 | 4999.55 | 4999.55 | 4999.55 |

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

1. **trace:wait_results** — p99: 4999.55ms (1 samples)
2. **collect.batch** — p99: 1.00ms (1 samples)
3. **config.cache** — p99: 1.00ms (1 samples)
4. **wave.start** — p99: 0.00ms (2 samples)
