---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:a47a7e4ff040869ce2858cf8f4f9ba3e84b4ba8f86e1ca185975579e52fe81cd
---

# Sprint Load Test Report

Generated: 2026-06-12T04:45:57.040Z
Total entries: 31

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-06-12T04:22:20.757Z | dep-pipeline | 2 |
| 2026-06-12T04:34:07.077Z | dep-pipeline | 2 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 2 | 2.00 | 2.00 | 2.00 | 2.00 | 2.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| wave.transition | 4 | 3545.50 | 3577.60 | 3579.52 | 3488.00 | 3580.00 |
| hb.stale | 3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 5 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 5 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| config.cache | 1 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| honesty.check | 2 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| fix.rotation.applied | 4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| trace:wait_results | 2 | 635908.28 | 685147.14 | 689523.92 | 581198.43 | 690618.12 |

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

1. **trace:wait_results** — p99: 689523.92ms (2 samples)
2. **wave.transition** — p99: 3579.52ms (4 samples)
3. **collision.detected** — p99: 2.00ms (2 samples)
4. **hb.stale** — p99: 1.00ms (3 samples)
5. **result.collected** — p99: 1.00ms (5 samples)
