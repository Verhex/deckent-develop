---
doc_rank: 50
status: active
last_updated: 2026-06-08
content_hash: sha256:85b195b2e02c1724fbc816f4703359a73afbf1631eb44196b36e5d28e658acf1
---

# Sprint Load Test Report

Generated: 2026-05-12T09:49:27.061Z
Total entries: 99

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-05-12T09:12:54.716Z | legacy | 6 |
| 2026-05-12T09:17:05.202Z | legacy | 6 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 16 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 16 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| hb.stale | 62 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 982142.05 | 1654789.34 | 1714580.21 | 234756.16 | 1729527.93 |

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

1. **trace:wait_results** — p99: 1714580.21ms (2 samples)
2. **result.collected** — p99: 1.00ms (16 samples)
3. **collect.batch** — p99: 1.00ms (16 samples)
4. **hb.stale** — p99: 1.00ms (62 samples)
5. **wave.start** — p99: 0.00ms (2 samples)
