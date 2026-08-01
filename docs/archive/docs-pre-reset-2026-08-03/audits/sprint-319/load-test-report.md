---
doc_rank: 50
status: active
last_updated: 2026-06-24
content_hash: sha256:c3f4958f687f56aefeff4ff12a71f8756b8c190ea68b87c4496150917dbcec9b
---

# Sprint Load Test Report

Generated: 2026-06-24T02:58:24.101Z
Total entries: 46

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-23T22:46:54.743Z | dep-pipeline | 8 |
| 2026-06-24T02:47:58.197Z | dep-pipeline | 5 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 2.00 | 2.00 | 2.00 | 2.00 | 2.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 16 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 16 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 1 | 1727.00 | 1727.00 | 1727.00 | 1727.00 | 1727.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 6 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 8048159.59 | 14819575.23 | 15421478.85 | 524364.43 | 15571954.75 |

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

1. **trace:wait_results** — p99: 15421478.85ms (2 samples)
2. **wave.transition** — p99: 1727.00ms (1 samples)
3. **collision.detected** — p99: 2.00ms (1 samples)
4. **result.collected** — p99: 1.00ms (16 samples)
5. **collect.batch** — p99: 1.00ms (16 samples)
