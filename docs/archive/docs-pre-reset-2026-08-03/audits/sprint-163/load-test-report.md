---
doc_rank: 50
status: active
last_updated: 2026-06-08
content_hash: sha256:ca769859b21ab3e2ac2cda02e2972573b026aba7304bd78187acbfca3ba89e15
---

# Sprint Load Test Report

Generated: 2026-05-12T23:23:32.395Z
Total entries: 19

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-05-12T23:10:02.676Z | legacy | 6 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 6 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 6 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| hb.stale | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 618198.87 | 618198.87 | 618198.87 | 618198.87 | 618198.87 |

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

1. **trace:wait_results** — p99: 618198.87ms (1 samples)
2. **result.collected** — p99: 1.00ms (6 samples)
3. **collect.batch** — p99: 1.00ms (6 samples)
4. **hb.stale** — p99: 1.00ms (2 samples)
5. **honesty.check** — p99: 1.00ms (2 samples)
