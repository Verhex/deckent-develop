---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:1b1441f9e56b20e0dc65e11e039e93c95f5c0372092ddf28faed03c929fe6d78
---

# Sprint Load Test Report

Generated: 2026-06-01T18:36:03.026Z
Total entries: 52

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-01T18:16:26.928Z | dep-pipeline | 6 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 2.00 | 2.00 | 2.00 | 2.00 | 2.00 |
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| hb.stale | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 9 | 3723.00 | 7953.00 | 10132.20 | 2577.00 | 10677.00 |
| result.collected | 14 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 14 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 7 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 1046795.62 | 1046795.62 | 1046795.62 | 1046795.62 | 1046795.62 |

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

1. **trace:wait_results** — p99: 1046795.62ms (1 samples)
2. **wave.transition** — p99: 10132.20ms (9 samples)
3. **collision.detected** — p99: 2.00ms (1 samples)
4. **hb.stale** — p99: 1.00ms (3 samples)
5. **result.collected** — p99: 1.00ms (14 samples)
