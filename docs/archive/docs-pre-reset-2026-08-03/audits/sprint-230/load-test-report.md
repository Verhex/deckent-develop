---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:4e529bebe799bf657daf03b594228c4cd99eb1825365b34cc052c7858cd9f883
---

# Sprint Load Test Report

Generated: 2026-06-05T05:53:03.191Z
Total entries: 31

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-05T05:31:08.723Z | dep-pipeline | 6 |
| 2026-06-05T05:42:09.195Z | dep-pipeline | 2 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| hb.stale | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 10 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 10 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 578839.48 | 603661.69 | 605868.11 | 551259.25 | 606419.71 |

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

1. **trace:wait_results** — p99: 605868.11ms (2 samples)
2. **hb.stale** — p99: 1.00ms (2 samples)
3. **result.collected** — p99: 1.00ms (10 samples)
4. **collect.batch** — p99: 1.00ms (10 samples)
5. **config.cache** — p99: 1.00ms (1 samples)
