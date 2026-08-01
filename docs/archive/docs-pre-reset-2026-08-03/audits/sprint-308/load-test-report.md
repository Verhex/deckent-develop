---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:20f1db036d32f38be803be14dc37b53f5218a0f0018a619ac2bf36d27fcc08d6
---

# Sprint Load Test Report

Generated: 2026-06-19T17:39:59.307Z
Total entries: 30

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-19T17:19:02.738Z | dep-pipeline | 8 |
| 2026-06-19T17:35:32.093Z | dep-pipeline | 1 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 10 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 10 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 547087.38 | 912757.84 | 945261.88 | 140786.86 | 953387.89 |

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

1. **trace:wait_results** — p99: 945261.88ms (2 samples)
2. **result.collected** — p99: 1.00ms (10 samples)
3. **collect.batch** — p99: 1.00ms (10 samples)
4. **config.cache** — p99: 1.00ms (1 samples)
5. **honesty.check** — p99: 1.00ms (4 samples)
