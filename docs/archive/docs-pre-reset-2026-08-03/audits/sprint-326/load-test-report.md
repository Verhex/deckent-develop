---
doc_rank: 50
status: active
last_updated: 2026-06-26
content_hash: sha256:e973fac29a2f1508ff76e3efc452156a7061ae40cee5ff70427b17963bd63793
---

# Sprint Load Test Report

Generated: 2026-06-26T11:22:02.164Z
Total entries: 42

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-26T10:39:57.826Z | dep-pipeline | 5 |
| 2026-06-26T11:11:39.631Z | dep-pipeline | 6 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| result.collected | 15 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 15 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| wave.transition | 3 | 3631.00 | 7411.00 | 7747.00 | 3601.00 | 7831.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 1162983.34 | 1776831.37 | 1831395.64 | 480929.97 | 1845036.71 |

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

1. **trace:wait_results** — p99: 1831395.64ms (2 samples)
2. **wave.transition** — p99: 7747.00ms (3 samples)
3. **result.collected** — p99: 1.00ms (15 samples)
4. **collect.batch** — p99: 1.00ms (15 samples)
5. **config.cache** — p99: 1.00ms (1 samples)
