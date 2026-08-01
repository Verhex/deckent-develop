---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:34042afd597b344f8087cc1fc786522a840c0953a205a33d396eaccc0b1b5cec
---

# Sprint Load Test Report

Generated: 2026-06-08T21:51:37.067Z
Total entries: 9

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-08T21:44:37.253Z | dep-pipeline | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| hb.stale | 5 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 2.75 | 2.75 | 2.75 | 2.75 | 2.75 |

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

1. **trace:wait_results** — p99: 2.75ms (1 samples)
2. **hb.stale** — p99: 1.00ms (5 samples)
3. **config.cache** — p99: 1.00ms (1 samples)
4. **wave.start** — p99: 0.00ms (1 samples)
