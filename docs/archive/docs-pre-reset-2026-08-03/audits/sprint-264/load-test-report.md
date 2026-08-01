---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:ab80ca41fb4967d77e72a4dae042017f238de7e5505d107e03518e2e5ea93a03
---

# Sprint Load Test Report

Generated: 2026-06-09T23:03:17.796Z
Total entries: 29

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-09T22:47:11.802Z | dep-pipeline | 8 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 12 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 12 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 826335.06 | 826335.06 | 826335.06 | 826335.06 | 826335.06 |

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

1. **trace:wait_results** — p99: 826335.06ms (1 samples)
2. **result.collected** — p99: 1.00ms (12 samples)
3. **collect.batch** — p99: 1.00ms (12 samples)
4. **config.cache** — p99: 1.00ms (1 samples)
5. **honesty.check** — p99: 1.00ms (1 samples)
