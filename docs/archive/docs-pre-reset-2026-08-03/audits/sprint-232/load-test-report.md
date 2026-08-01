---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:ff5dedda87217f1b4dabdc28e5ca714fc06c2a7a84f96e9299a02bd86d7453f1
---

# Sprint Load Test Report

Generated: 2026-06-05T12:04:14.166Z
Total entries: 22

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-05T11:41:14.168Z | dep-pipeline | 5 |
| 2026-06-05T11:53:14.924Z | dep-pipeline | 2 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 7 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 7 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 629160.80 | 684528.33 | 689449.89 | 567641.33 | 690680.28 |

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

1. **trace:wait_results** — p99: 689449.89ms (2 samples)
2. **result.collected** — p99: 1.00ms (7 samples)
3. **collect.batch** — p99: 1.00ms (7 samples)
4. **config.cache** — p99: 1.00ms (1 samples)
5. **honesty.check** — p99: 1.00ms (2 samples)
