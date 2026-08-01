---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:184068676f7a761799ad8587524981267136d40a993da1e612b8caf167b3cc8c
---

# Sprint Load Test Report

Generated: 2026-06-03T18:06:47.519Z
Total entries: 52

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-03T17:49:08.330Z | dep-pipeline | 6 |
| 2026-06-03T18:01:46.343Z | dep-pipeline | 2 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| wave.transition | 4 | 3625.50 | 3819.65 | 3837.53 | 2449.00 | 3842.00 |
| hb.stale | 19 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 12 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 10 | 1.00 | 2.10 | 2.82 | 1.00 | 3.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 460019.89 | 710585.05 | 732857.51 | 181614.15 | 738425.62 |

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

1. **trace:wait_results** — p99: 732857.51ms (2 samples)
2. **wave.transition** — p99: 3837.53ms (4 samples)
3. **collect.batch** — p99: 2.82ms (10 samples)
4. **collision.detected** — p99: 1.00ms (1 samples)
5. **hb.stale** — p99: 1.00ms (19 samples)
