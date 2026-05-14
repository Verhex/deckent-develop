# Sprint Load Test Report

Generated: 2026-05-14T10:09:40.283Z
Total entries: 10

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-05-13T13:47:09.911Z | legacy | 6 |
| 2026-05-13T13:47:13.619Z | legacy | 6 |
| 2026-05-14T08:03:12.372Z | legacy | 6 |
| 2026-05-14T08:03:19.652Z | legacy | 6 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 4 | 7.50 | 15.55 | 15.91 | 1.00 | 16.00 |
| wave.start | 4 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |

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

1. **collision.detected** — p99: 15.91ms (4 samples)
2. **wave.start** — p99: 0.00ms (4 samples)
