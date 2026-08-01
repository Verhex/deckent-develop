---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:a379a5616a8f4a794e59b4b2f13980ff88e07b260499a67ea097197a273843bf
---

# Sprint Load Test Report

Generated: 2026-06-12T07:18:46.307Z
Total entries: 34

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-12T06:26:50.785Z | dep-pipeline | 1 |
| 2026-06-12T07:07:18.051Z | dep-pipeline | 3 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 2 | 2.00 | 2.90 | 2.98 | 1.00 | 3.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 7 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 7 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 5 | 3570.00 | 6780.00 | 7421.60 | 3511.00 | 7582.00 |
| hb.stale | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| fix.rotation.applied | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 1179878.11 | 1741707.09 | 1791647.44 | 555623.70 | 1804132.53 |

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

1. **trace:wait_results** — p99: 1791647.44ms (2 samples)
2. **wave.transition** — p99: 7421.60ms (5 samples)
3. **collision.detected** — p99: 2.98ms (2 samples)
4. **result.collected** — p99: 1.00ms (7 samples)
5. **collect.batch** — p99: 1.00ms (7 samples)
