---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:2170f09c6796dedbf918a466d1d2e5e5e9a85269b8a54128907a230061a16bbb
---

# Sprint Load Test Report

Generated: 2026-06-02T22:25:58.206Z
Total entries: 21

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-02T22:06:46.632Z | dep-pipeline | 5 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| wave.transition | 1 | 3822.00 | 3822.00 | 3822.00 | 3822.00 | 3822.00 |
| result.collected | 6 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 6 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 1052526.91 | 1052526.91 | 1052526.91 | 1052526.91 | 1052526.91 |

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

1. **trace:wait_results** — p99: 1052526.91ms (1 samples)
2. **wave.transition** — p99: 3822.00ms (1 samples)
3. **result.collected** — p99: 1.00ms (6 samples)
4. **collect.batch** — p99: 1.00ms (6 samples)
5. **config.cache** — p99: 1.00ms (1 samples)
