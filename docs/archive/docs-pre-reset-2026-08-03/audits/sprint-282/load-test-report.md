---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:91ce57813fd9b4f0457b5d431091421af6bc0dc162abba4776d4b14ed0308b2a
---

# Sprint Load Test Report

Generated: 2026-06-11T19:26:18.360Z
Total entries: 31

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-11T18:35:57.588Z | dep-pipeline | 2 |
| 2026-06-11T19:16:23.921Z | dep-pipeline | 2 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 5.00 | 5.00 | 5.00 | 5.00 | 5.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 9 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 9 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 4 | 3586.00 | 7053.25 | 7536.25 | 1887.00 | 7657.00 |
| queue.ready_dispatch | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 1194235.75 | 1828873.04 | 1885285.24 | 489083.20 | 1899388.29 |

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

1. **trace:wait_results** — p99: 1885285.24ms (2 samples)
2. **wave.transition** — p99: 7536.25ms (4 samples)
3. **collision.detected** — p99: 5.00ms (1 samples)
4. **result.collected** — p99: 1.00ms (9 samples)
5. **collect.batch** — p99: 1.00ms (9 samples)
