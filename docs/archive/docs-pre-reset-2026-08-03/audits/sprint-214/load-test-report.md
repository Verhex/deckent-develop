---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:ca00dfcdf7dc5a8261bc5918c706b1010323d7ee006e9907fae8bdda3fd7fab0
---

# Sprint Load Test Report

Generated: 2026-06-01T11:40:10.121Z
Total entries: 85

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-01T10:45:02.197Z | dep-pipeline | 6 |
| 2026-06-01T11:04:50.908Z | dep-pipeline | 6 |
| 2026-06-01T11:33:12.337Z | dep-pipeline | 4 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 3 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 33 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 26 | 1.00 | 2.00 | 5.00 | 1.00 | 6.00 |
| hb.stale | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 8 | 3560.00 | 10705.25 | 12017.05 | 3504.00 | 12345.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 7 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 966310.83 | 1577557.93 | 1631891.00 | 287147.39 | 1645474.27 |

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

1. **trace:wait_results** — p99: 1631891.00ms (2 samples)
2. **wave.transition** — p99: 12017.05ms (8 samples)
3. **collect.batch** — p99: 5.00ms (26 samples)
4. **result.collected** — p99: 1.00ms (33 samples)
5. **hb.stale** — p99: 1.00ms (3 samples)
