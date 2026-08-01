---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:9adf946e08f5d88190c385cc61faa66e699b5d4c2a4355f25b1817520d0611f8
---

# Sprint Load Test Report

Generated: 2026-06-09T19:33:47.356Z
Total entries: 37

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-09T19:23:48.690Z | dep-pipeline | 8 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 13 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 13 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 7 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 417968.86 | 417968.86 | 417968.86 | 417968.86 | 417968.86 |

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

1. **trace:wait_results** — p99: 417968.86ms (1 samples)
2. **result.collected** — p99: 1.00ms (13 samples)
3. **collect.batch** — p99: 1.00ms (13 samples)
4. **config.cache** — p99: 1.00ms (1 samples)
5. **honesty.check** — p99: 1.00ms (7 samples)
