---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:c6bc9117fc1f1a30df354c6d3c703fa627c59a1f3224a605f495a7eefcaff6fa
---

# Sprint Load Test Report

Generated: 2026-06-01T09:19:03.029Z
Total entries: 51

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-01T09:02:39.260Z | dep-pipeline | 6 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 4.00 | 4.00 | 4.00 | 4.00 | 4.00 |
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| hb.stale | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 9 | 3591.00 | 8737.00 | 11308.20 | 3519.00 | 11951.00 |
| result.collected | 15 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 15 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 5 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 796584.19 | 796584.19 | 796584.19 | 796584.19 | 796584.19 |

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

1. **trace:wait_results** — p99: 796584.19ms (1 samples)
2. **wave.transition** — p99: 11308.20ms (9 samples)
3. **collision.detected** — p99: 4.00ms (1 samples)
4. **hb.stale** — p99: 1.00ms (2 samples)
5. **result.collected** — p99: 1.00ms (15 samples)
