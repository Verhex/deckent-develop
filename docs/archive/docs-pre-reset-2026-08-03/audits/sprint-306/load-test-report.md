---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:65a2b50077aafd87fe945e34eab6fe48fd51cb5807ce4fe78e7e7fed2cd27962
---

# Sprint Load Test Report

Generated: 2026-06-19T16:14:22.163Z
Total entries: 41

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-19T15:35:36.660Z | dep-pipeline | 8 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 5.00 | 5.00 | 5.00 | 5.00 | 5.00 |
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| wave.transition | 6 | 3621.50 | 9006.00 | 10435.60 | 3586.00 | 10793.00 |
| result.collected | 13 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 13 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 1869988.64 | 1869988.64 | 1869988.64 | 1869988.64 | 1869988.64 |

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

1. **trace:wait_results** — p99: 1869988.64ms (1 samples)
2. **wave.transition** — p99: 10435.60ms (6 samples)
3. **collision.detected** — p99: 5.00ms (1 samples)
4. **result.collected** — p99: 1.00ms (13 samples)
5. **collect.batch** — p99: 1.00ms (13 samples)
