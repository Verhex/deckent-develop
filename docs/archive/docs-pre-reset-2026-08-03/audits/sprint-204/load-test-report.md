---
doc_rank: 50
status: active
last_updated: 2026-06-08
content_hash: sha256:ea99f7aa43476cc71bab0c27c4a8611529036aeb51344c322874f6522df1c9d4
---

# Sprint Load Test Report

Generated: 2026-05-31T15:15:41.648Z
Total entries: 69

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-05-31T14:56:35.211Z | dep-pipeline | 5 |
| 2026-05-31T15:08:44.923Z | dep-pipeline | 6 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 15 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 15 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| hb.stale | 29 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 2 | 7645.00 | 7675.60 | 7678.32 | 7611.00 | 7679.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 532236.26 | 709974.67 | 725773.64 | 334749.14 | 729723.38 |

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

1. **trace:wait_results** — p99: 725773.64ms (2 samples)
2. **wave.transition** — p99: 7678.32ms (2 samples)
3. **collision.detected** — p99: 1.00ms (1 samples)
4. **result.collected** — p99: 1.00ms (15 samples)
5. **collect.batch** — p99: 1.00ms (15 samples)
