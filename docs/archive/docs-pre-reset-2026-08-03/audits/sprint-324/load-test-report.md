---
doc_rank: 50
status: active
last_updated: 2026-06-26
content_hash: sha256:c9cca2eaf0ebd35c3fc5a484496a57ada0d2d9dd3aa1fbeb8b81936753a038e2
---

# Sprint Load Test Report

Generated: 2026-06-26T06:20:08.906Z
Total entries: 26

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-26T06:06:44.606Z | dep-pipeline | 8 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 9 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 9 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 597594.01 | 597594.01 | 597594.01 | 597594.01 | 597594.01 |

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

1. **trace:wait_results** — p99: 597594.01ms (1 samples)
2. **result.collected** — p99: 1.00ms (9 samples)
3. **collect.batch** — p99: 1.00ms (9 samples)
4. **config.cache** — p99: 1.00ms (1 samples)
5. **honesty.check** — p99: 1.00ms (4 samples)
