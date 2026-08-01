---
doc_rank: 50
status: active
last_updated: 2026-06-08
content_hash: sha256:8f37f3976a5ec8fee6831709e61e865430114193cf89124c60d7e9033e8664e5
---

# Sprint Load Test Report

Generated: 2026-05-23T23:50:55.933Z
Total entries: 81

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-05-23T22:43:05.411Z | dep-pipeline | 3 |
| 2026-05-23T23:18:57.094Z | dep-pipeline | 3 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 2 | 2.00 | 2.90 | 2.98 | 1.00 | 3.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| wave.transition | 12 | 3543.50 | 5321.90 | 6748.38 | 3501.00 | 7105.00 |
| hb.stale | 11 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 17 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 17 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 6 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| fix.rotation.applied | 11 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 1728435.09 | 1730064.21 | 1730209.02 | 1726624.97 | 1730245.22 |

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

1. **trace:wait_results** — p99: 1730209.02ms (2 samples)
2. **wave.transition** — p99: 6748.38ms (12 samples)
3. **collision.detected** — p99: 2.98ms (2 samples)
4. **hb.stale** — p99: 1.00ms (11 samples)
5. **result.collected** — p99: 1.00ms (17 samples)
