---
doc_rank: 50
status: active
last_updated: 2026-06-22
content_hash: sha256:60971fd8e4b7e06ff4c5839b9b72667f055cba5f9252d0d92db3be431e48416b
---

# Sprint Load Test Report

Generated: 2026-06-22T11:43:43.935Z
Total entries: 12

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-22T11:39:30.595Z | dep-pipeline | 4 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 37801.21 | 37801.21 | 37801.21 | 37801.21 | 37801.21 |

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

1. **trace:wait_results** — p99: 37801.21ms (1 samples)
2. **result.collected** — p99: 1.00ms (4 samples)
3. **collect.batch** — p99: 1.00ms (4 samples)
4. **config.cache** — p99: 1.00ms (1 samples)
5. **wave.start** — p99: 0.00ms (1 samples)
