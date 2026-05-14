# Sprint Load Test Report

Generated: 2026-05-13T13:35:40.581Z
Total entries: 6

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-05-13T09:57:47.820Z | legacy | 5 |
| 2026-05-13T09:57:54.804Z | legacy | 5 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 2 | 3.00 | 3.90 | 3.98 | 2.00 | 4.00 |
| wave.start | 2 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |

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

1. **collision.detected** — p99: 3.98ms (2 samples)
2. **wave.start** — p99: 0.00ms (2 samples)
