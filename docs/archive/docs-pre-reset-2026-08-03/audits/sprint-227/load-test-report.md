---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:4a792331453626b51b1b2a9021c826a20500a54beb547282cc68bde381452713
---

# Sprint Load Test Report

Generated: 2026-06-04T12:52:24.527Z
Total entries: 16

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-04T12:33:57.701Z | dep-pipeline | 3 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 1 | 3592.00 | 3592.00 | 3592.00 | 3592.00 | 3592.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 928614.90 | 928614.90 | 928614.90 | 928614.90 | 928614.90 |

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

1. **trace:wait_results** — p99: 928614.90ms (1 samples)
2. **wave.transition** — p99: 3592.00ms (1 samples)
3. **result.collected** — p99: 1.00ms (4 samples)
4. **collect.batch** — p99: 1.00ms (4 samples)
5. **config.cache** — p99: 1.00ms (1 samples)
