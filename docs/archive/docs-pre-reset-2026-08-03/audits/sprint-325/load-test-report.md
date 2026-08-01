---
doc_rank: 50
status: active
last_updated: 2026-06-26
content_hash: sha256:2ce7a0bd47345351fd8300266ffecbe560c94282167389932771ea113dd92183
---

# Sprint Load Test Report

Generated: 2026-06-26T08:03:45.227Z
Total entries: 14

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-26T07:49:16.115Z | dep-pipeline | 5 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 5 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 5 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 683348.23 | 683348.23 | 683348.23 | 683348.23 | 683348.23 |

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

1. **trace:wait_results** — p99: 683348.23ms (1 samples)
2. **result.collected** — p99: 1.00ms (5 samples)
3. **collect.batch** — p99: 1.00ms (5 samples)
4. **config.cache** — p99: 1.00ms (1 samples)
5. **wave.start** — p99: 0.00ms (1 samples)
