---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:72a21c88322ef7efcd9c4e4503f6246384a0536dc9e8d2b165f0caa37a0f8c9a
---

# Sprint Load Test Report

Generated: 2026-06-11T14:12:33.557Z
Total entries: 10

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-11T14:00:29.679Z | dep-pipeline | 3 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 594015.02 | 594015.02 | 594015.02 | 594015.02 | 594015.02 |

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

1. **trace:wait_results** — p99: 594015.02ms (1 samples)
2. **result.collected** — p99: 1.00ms (3 samples)
3. **collect.batch** — p99: 1.00ms (3 samples)
4. **config.cache** — p99: 1.00ms (1 samples)
5. **wave.start** — p99: 0.00ms (1 samples)
