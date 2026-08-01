---
doc_rank: 50
status: active
last_updated: 2026-06-24
content_hash: sha256:613c0e2ab48a3df9d374969136f374bd7d7f1bffdaa87838a9b008c56637203f
---

# Sprint Load Test Report

Generated: 2026-06-24T08:02:25.397Z
Total entries: 10

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-24T07:58:09.473Z | dep-pipeline | 2 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 1 | 3616.00 | 3616.00 | 3616.00 | 3616.00 | 3616.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 110590.33 | 110590.33 | 110590.33 | 110590.33 | 110590.33 |

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

1. **trace:wait_results** — p99: 110590.33ms (1 samples)
2. **wave.transition** — p99: 3616.00ms (1 samples)
3. **collision.detected** — p99: 1.00ms (1 samples)
4. **result.collected** — p99: 1.00ms (2 samples)
5. **collect.batch** — p99: 1.00ms (2 samples)
