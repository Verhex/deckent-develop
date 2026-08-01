---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:d4fd329dae2c27ee74c2c1b5eb18a89e1683bad53861a8e33b09579752c7f18d
---

# Sprint Load Test Report

Generated: 2026-06-09T08:08:09.955Z
Total entries: 11

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-09T08:04:41.586Z | dep-pipeline | 2 |
| 2026-06-09T08:05:22.599Z | dep-pipeline | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 30277.84 | 37175.03 | 37788.12 | 22614.29 | 37941.39 |

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

1. **trace:wait_results** — p99: 37788.12ms (2 samples)
2. **result.collected** — p99: 1.00ms (2 samples)
3. **collect.batch** — p99: 1.00ms (3 samples)
4. **config.cache** — p99: 1.00ms (1 samples)
5. **wave.start** — p99: 0.00ms (2 samples)
