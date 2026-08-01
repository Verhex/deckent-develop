---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:c6b3d7757e59dfc0acaacbb2158a067181efb682ffd6a297b86b8bc1b4b99a36
---

# Sprint Load Test Report

Generated: 2026-06-19T08:23:30.085Z
Total entries: 23

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-19T08:07:12.449Z | dep-pipeline | 4 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 8 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 8 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 3 | 3576.00 | 7181.40 | 7501.88 | 3568.00 | 7582.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 788178.71 | 788178.71 | 788178.71 | 788178.71 | 788178.71 |

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

1. **trace:wait_results** — p99: 788178.71ms (1 samples)
2. **wave.transition** — p99: 7501.88ms (3 samples)
3. **result.collected** — p99: 1.00ms (8 samples)
4. **collect.batch** — p99: 1.00ms (8 samples)
5. **config.cache** — p99: 1.00ms (1 samples)
