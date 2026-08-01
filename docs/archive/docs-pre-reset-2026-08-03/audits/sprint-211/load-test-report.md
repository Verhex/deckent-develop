---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:1d70a66d35fd312bba23ee87ec85d7eff1b2cdd6efc87506a4c243381a0c660a
---

# Sprint Load Test Report

Generated: 2026-06-01T07:19:14.414Z
Total entries: 45

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-01T07:03:08.999Z | dep-pipeline | 6 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| wave.transition | 4 | 3898.50 | 7676.40 | 8180.88 | 3678.00 | 8307.00 |
| result.collected | 16 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 16 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 1 | 771855.86 | 771855.86 | 771855.86 | 771855.86 | 771855.86 |

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

1. **trace:wait_results** — p99: 771855.86ms (1 samples)
2. **wave.transition** — p99: 8180.88ms (4 samples)
3. **collision.detected** — p99: 1.00ms (1 samples)
4. **result.collected** — p99: 1.00ms (16 samples)
5. **collect.batch** — p99: 1.00ms (16 samples)
