---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:21f18ed383c81cf1052dda09818ba865451ca9779898dc1c5b7cca1e104c3d96
---

# Sprint Load Test Report

Generated: 2026-05-31T23:15:30.215Z
Total entries: 47

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-05-31T22:32:02.928Z | dep-pipeline | 6 |
| 2026-05-31T22:58:11.803Z | dep-pipeline | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| hb.stale | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 15 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 15 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 4 | 3978.50 | 5456.40 | 5663.28 | 3807.00 | 5715.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 1291342.73 | 1568830.93 | 1593496.55 | 983022.52 | 1599662.95 |

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

1. **trace:wait_results** — p99: 1593496.55ms (2 samples)
2. **wave.transition** — p99: 5663.28ms (4 samples)
3. **collision.detected** — p99: 1.00ms (1 samples)
4. **hb.stale** — p99: 1.00ms (2 samples)
5. **result.collected** — p99: 1.00ms (15 samples)
