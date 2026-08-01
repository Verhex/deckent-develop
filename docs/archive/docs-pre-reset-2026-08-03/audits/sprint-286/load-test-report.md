---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:08ec7d95453138ba987c5e08bd61f40e739c4cfb5ea49163ef1a636c1c0effba
---

# Sprint Load Test Report

Generated: 2026-06-14T11:37:14.435Z
Total entries: 766

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-14T10:47:39.018Z | dep-pipeline | 8 |
| 2026-06-14T11:25:57.811Z | dep-pipeline | 8 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 10.00 | 10.00 | 10.00 | 10.00 | 10.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| hb.stale | 643 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 8 | 6673.00 | 10693.55 | 11658.71 | 1514.00 | 11900.00 |
| result.collected | 57 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 48 | 1.00 | 2.00 | 3.53 | 1.00 | 4.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| fix.rotation.applied | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 1408131.95 | 2176073.10 | 2244334.53 | 554864.01 | 2261399.89 |

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

1. **trace:wait_results** — p99: 2244334.53ms (2 samples)
2. **wave.transition** — p99: 11658.71ms (8 samples)
3. **collision.detected** — p99: 10.00ms (1 samples)
4. **collect.batch** — p99: 3.53ms (48 samples)
5. **hb.stale** — p99: 1.00ms (643 samples)
