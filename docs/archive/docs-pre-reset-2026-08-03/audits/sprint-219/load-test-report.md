---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:18a883ba2c12fbeddc9961663b4e25d56c4fafcf6afea72c620a323155718fa1
---

# Sprint Load Test Report

Generated: 2026-06-02T06:28:18.599Z
Total entries: 48

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-02T05:49:49.063Z | dep-pipeline | 6 |
| 2026-06-02T06:21:01.047Z | dep-pipeline | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| hb.stale | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 16 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 16 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 2 | 3883.50 | 4013.55 | 4025.11 | 3739.00 | 4028.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 7 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 1153094.22 | 1877486.26 | 1941876.66 | 348214.18 | 1957974.26 |

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

1. **trace:wait_results** — p99: 1941876.66ms (2 samples)
2. **wave.transition** — p99: 4025.11ms (2 samples)
3. **hb.stale** — p99: 1.00ms (1 samples)
4. **result.collected** — p99: 1.00ms (16 samples)
5. **collect.batch** — p99: 1.00ms (16 samples)
