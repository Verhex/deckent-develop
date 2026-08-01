---
doc_rank: 50
status: active
last_updated: 2026-06-08
content_hash: sha256:fc3a00df919a69bd6deff26e9cd71bf3c96685284eb60ce6a80fc605b3100552
---

# Sprint Load Test Report

Generated: 2026-05-20T13:38:39.293Z
Total entries: 59

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-05-20T12:42:59.357Z | legacy | 6 |
| 2026-05-20T13:18:31.463Z | legacy | 4 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 2 | 2.00 | 2.90 | 2.98 | 1.00 | 3.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| hb.stale | 12 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 13 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 13 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| queue.force_rescan_spawn | 6 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 8 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 1462229.86 | 1815484.69 | 1846885.12 | 1069724.49 | 1854735.23 |

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

1. **trace:wait_results** — p99: 1846885.12ms (2 samples)
2. **collision.detected** — p99: 2.98ms (2 samples)
3. **hb.stale** — p99: 1.00ms (12 samples)
4. **result.collected** — p99: 1.00ms (13 samples)
5. **collect.batch** — p99: 1.00ms (13 samples)
