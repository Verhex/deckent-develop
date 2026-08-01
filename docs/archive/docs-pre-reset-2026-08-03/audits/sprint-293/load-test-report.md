---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:439287c6a08e747a2b4259b46f61520ec64c6ff9a17e2d740807abfc18b5a5d4
---

# Sprint Load Test Report

Generated: 2026-06-19T07:30:39.361Z
Total entries: 13

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-19T07:23:09.287Z | dep-pipeline | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| wave.transition | 1 | 10982.00 | 10982.00 | 10982.00 | 10982.00 | 10982.00 |
| result.collected | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 299122.92 | 299122.92 | 299122.92 | 299122.92 | 299122.92 |

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

1. **trace:wait_results** — p99: 299122.92ms (1 samples)
2. **wave.transition** — p99: 10982.00ms (1 samples)
3. **result.collected** — p99: 1.00ms (4 samples)
4. **collect.batch** — p99: 1.00ms (4 samples)
5. **config.cache** — p99: 1.00ms (1 samples)
