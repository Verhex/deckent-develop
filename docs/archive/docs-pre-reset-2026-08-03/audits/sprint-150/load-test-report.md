---
doc_rank: 50
status: active
last_updated: 2026-06-08
content_hash: sha256:f04a1a35b89f855b67e70985fc68fbc1404da78ac3691e0eaa21e2da35ac7d9d
---

# Sprint Load Test Report

Generated: 2026-04-21T11:58:13.593Z
Total entries: 2303

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-04-12T18:14:35.035Z | legacy | 4 |
| 2026-04-12T19:02:20.508Z | legacy | 4 |
| 2026-04-13T19:23:43.947Z | legacy | 3 |
| 2026-04-13T20:01:01.475Z | legacy | 3 |
| 2026-04-14T05:13:57.009Z | legacy | 3 |
| 2026-04-14T05:35:02.034Z | legacy | 1 |
| 2026-04-14T10:01:03.514Z | legacy | 3 |
| 2026-04-14T10:40:33.943Z | legacy | 2 |
| 2026-04-15T06:17:37.662Z | legacy | 3 |
| 2026-04-15T12:16:04.290Z | legacy | 3 |
| 2026-04-16T13:53:38.153Z | legacy | 3 |
| 2026-04-16T14:55:18.007Z | legacy | 3 |
| 2026-04-16T17:05:50.741Z | legacy | 3 |
| 2026-04-16T19:47:38.839Z | legacy | 3 |
| 2026-04-17T07:50:07.924Z | legacy | 3 |
| 2026-04-17T09:21:32.811Z | legacy | 1 |
| 2026-04-17T12:35:31.663Z | legacy | 3 |
| 2026-04-17T14:10:23.541Z | legacy | 3 |
| 2026-04-20T05:00:15.821Z | legacy | 3 |
| 2026-04-20T06:18:55.903Z | legacy | 3 |
| 2026-04-20T06:57:32.445Z | legacy | 3 |
| 2026-04-20T07:45:25.213Z | legacy | 1 |
| 2026-04-20T09:39:15.467Z | legacy | 3 |
| 2026-04-20T10:23:28.572Z | legacy | 1 |
| 2026-04-20T13:58:32.389Z | legacy | 3 |
| 2026-04-20T14:45:26.318Z | legacy | 1 |
| 2026-04-20T21:04:24.526Z | legacy | 4 |
| 2026-04-21T10:37:44.205Z | legacy | 3 |
| 2026-04-21T11:43:46.947Z | legacy | 3 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 29 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 556 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 556 | 1.00 | 1.00 | 2.00 | 1.00 | 3.00 |
| honesty.check | 81 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| hb.stale | 1023 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collision.detected | 13 | 8.00 | 38.60 | 45.32 | 1.00 | 47.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 28 | 1353300.37 | 7345330.84 | 9478626.62 | 63620.71 | 9804237.00 |

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

1. **trace:wait_results** — p99: 9478626.62ms (28 samples)
2. **collision.detected** — p99: 45.32ms (13 samples)
3. **collect.batch** — p99: 2.00ms (556 samples)
4. **result.collected** — p99: 1.00ms (556 samples)
5. **honesty.check** — p99: 1.00ms (81 samples)
