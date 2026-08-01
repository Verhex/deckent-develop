---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:52fc483440f9f53e76c77e1b327e19a61c05d03ab278752b4da03baf71b3e829
---

# Sprint Load Test Report

Generated: 2026-06-04T21:06:29.022Z
Total entries: 20

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-04T20:48:36.829Z | dep-pipeline | 2 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| wave.transition | 4 | 3738.50 | 3983.70 | 4010.34 | 3635.00 | 4017.00 |
| result.collected | 5 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 5 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 929031.72 | 929031.72 | 929031.72 | 929031.72 | 929031.72 |

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

1. **trace:wait_results** — p99: 929031.72ms (1 samples)
2. **wave.transition** — p99: 4010.34ms (4 samples)
3. **collision.detected** — p99: 1.00ms (1 samples)
4. **result.collected** — p99: 1.00ms (5 samples)
5. **collect.batch** — p99: 1.00ms (5 samples)
