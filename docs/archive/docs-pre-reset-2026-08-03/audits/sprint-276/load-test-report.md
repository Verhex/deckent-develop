---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:e93d449863b1fadd598105b7c5dbd240234fc82c64db5ffc6abc42afbe4fc69d
---

# Sprint Load Test Report

Generated: 2026-06-10T20:17:36.904Z
Total entries: 40

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-10T19:49:58.066Z | dep-pipeline | 4 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 2.00 | 2.00 | 2.00 | 2.00 | 2.00 |
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| wave.transition | 7 | 3558.00 | 7620.10 | 7628.02 | 3503.00 | 7630.00 |
| result.collected | 12 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 12 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| hb.stale | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 1310776.44 | 1310776.44 | 1310776.44 | 1310776.44 | 1310776.44 |

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

1. **trace:wait_results** — p99: 1310776.44ms (1 samples)
2. **wave.transition** — p99: 7628.02ms (7 samples)
3. **collision.detected** — p99: 2.00ms (1 samples)
4. **result.collected** — p99: 1.00ms (12 samples)
5. **collect.batch** — p99: 1.00ms (12 samples)
