---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:f5fbe2e26acb63679c7c41a5446b64cf2bc2929c8968b3ddd0adeffc8966eaf8
---

# Sprint Load Test Report

Generated: 2026-06-11T06:31:44.696Z
Total entries: 21

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-11T04:37:53.785Z | dep-pipeline | 4 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 7 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 8 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 3 | 3478.00 | 7084.30 | 7404.86 | 3453.00 | 7485.00 |
| hb.stale | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |

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

1. **wave.transition** — p99: 7404.86ms (3 samples)
2. **result.collected** — p99: 1.00ms (7 samples)
3. **collect.batch** — p99: 1.00ms (8 samples)
4. **hb.stale** — p99: 1.00ms (1 samples)
5. **wave.start** — p99: 0.00ms (1 samples)
