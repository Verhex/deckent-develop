---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:8746935c8ba7960ab5dfb2f5ec4ff8cfd5a9caf326f0edb551be3c8237334a2c
---

# Sprint Load Test Report

Generated: 2026-06-09T23:22:52.205Z
Total entries: 18

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-09T23:12:46.910Z | dep-pipeline | 6 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 6 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 6 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 486271.04 | 486271.04 | 486271.04 | 486271.04 | 486271.04 |

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

1. **trace:wait_results** — p99: 486271.04ms (1 samples)
2. **result.collected** — p99: 1.00ms (6 samples)
3. **collect.batch** — p99: 1.00ms (6 samples)
4. **config.cache** — p99: 1.00ms (1 samples)
5. **honesty.check** — p99: 1.00ms (2 samples)
