---
doc_rank: 50
status: active
last_updated: 2026-06-08
content_hash: sha256:dc85fcfbb9c90848e9a2270a8588da670f2a7c9913f52bfa4d4e3e91a9a15fea
---

# Sprint Load Test Report

Generated: 2026-05-12T17:40:40.399Z
Total entries: 15

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-05-12T14:15:33.573Z | dep-pipeline | 6 |
| 2026-05-12T14:15:34.570Z | dep-pipeline | 6 |
| 2026-05-12T14:21:01.232Z | dep-pipeline | 6 |
| 2026-05-12T14:21:01.248Z | dep-pipeline | 6 |
| 2026-05-12T15:45:44.430Z | dep-pipeline | 6 |
| 2026-05-12T15:45:45.344Z | dep-pipeline | 6 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 6 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 |
| wave.start | 6 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |

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

1. **collision.detected** — p99: 3.00ms (6 samples)
2. **wave.start** — p99: 0.00ms (6 samples)
