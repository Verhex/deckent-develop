---
doc_rank: 50
status: active
last_updated: 2026-06-20
content_hash: sha256:141413ca1e667fdb50fc44f050d53f7ffcca225dc6c824ec42011df51ef06685
---

# Sprint Load Test Report

Generated: 2026-06-20T11:25:04.495Z
Total entries: 68

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-20T10:56:58.969Z | dep-pipeline | 8 |
| 2026-06-20T11:12:31.827Z | dep-pipeline | 8 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 27 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 26 | 1.00 | 1.00 | 1.75 | 1.00 | 2.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| fix.rotation.applied | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 4 | 3577.50 | 3583.40 | 3583.88 | 3561.00 | 3584.00 |
| trace:wait_results | 2 | 760902.61 | 895223.69 | 907163.34 | 611656.98 | 910148.25 |

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

1. **trace:wait_results** — p99: 907163.34ms (2 samples)
2. **wave.transition** — p99: 3583.88ms (4 samples)
3. **collect.batch** — p99: 1.75ms (26 samples)
4. **result.collected** — p99: 1.00ms (27 samples)
5. **config.cache** — p99: 1.00ms (1 samples)
