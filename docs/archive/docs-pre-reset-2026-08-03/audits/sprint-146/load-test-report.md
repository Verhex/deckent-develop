---
doc_rank: 50
status: active
last_updated: 2026-06-08
content_hash: sha256:0b89dabff45f73b05b0168eda409cbcd95ed8e7d5306ea9b74e5ac104fb12155
---

# Sprint Load Test Report

Generated: 2026-04-20T07:59:34.299Z
Total entries: 2020

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

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 22 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 437 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 438 | 1.00 | 1.00 | 2.00 | 1.00 | 3.00 |
| honesty.check | 65 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| hb.stale | 1014 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collision.detected | 10 | 9.00 | 40.70 | 45.74 | 1.00 | 47.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 21 | 1199228.22 | 8598272.62 | 9563044.12 | 539690.26 | 9804237.00 |

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

1. **trace:wait_results** — p99: 9563044.12ms (21 samples)
2. **collision.detected** — p99: 45.74ms (10 samples)
3. **collect.batch** — p99: 2.00ms (438 samples)
4. **result.collected** — p99: 1.00ms (437 samples)
5. **honesty.check** — p99: 1.00ms (65 samples)
