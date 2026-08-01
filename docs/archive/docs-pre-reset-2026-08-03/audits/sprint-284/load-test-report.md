---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:2b4d3fb3763e581205709121750db933730366635e0e6d30364f3dfebe8c6cbd
---

# Sprint Load Test Report

Generated: 2026-06-12T05:50:43.750Z
Total entries: 27

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-12T05:11:32.407Z | dep-pipeline | 1 |
| 2026-06-12T05:47:04.604Z | dep-pipeline | 2 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 2.00 | 2.00 | 2.00 | 2.00 | 2.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| wave.transition | 4 | 5568.00 | 7620.45 | 7622.49 | 3495.00 | 7623.00 |
| result.collected | 6 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 6 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| hb.stale | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 942126.82 | 1717733.66 | 1786676.49 | 80341.44 | 1803912.20 |

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

1. **trace:wait_results** — p99: 1786676.49ms (2 samples)
2. **wave.transition** — p99: 7622.49ms (4 samples)
3. **collision.detected** — p99: 2.00ms (1 samples)
4. **result.collected** — p99: 1.00ms (6 samples)
5. **collect.batch** — p99: 1.00ms (6 samples)
