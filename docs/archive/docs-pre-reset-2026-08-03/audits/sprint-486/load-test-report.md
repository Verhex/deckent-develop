# Sprint Load Test Report

Generated: 2026-07-31T15:44:48.046Z
Total entries: 61

## Wave Timeline

| Time | Wave | Count |
|------|------|-------|
| 2026-07-31T15:12:07.985Z | dep-pipeline | 8 |

## Percentile Distribution (p50/p95/p99)

| Operation | Count | p50 | p95 | p99 | Min | Max |
|-----------|-------|-----|-----|-----|-----|-----|
| collision.detected | 1 | 5.00 | 5.00 | 5.00 | 5.00 | 5.00 |
| wave.start | 1 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| skill.prompt_generated | 18 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| result.collected | 20 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| collect.batch | 20 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |

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

1. **collision.detected** — p99: 5.00ms (1 samples)
2. **skill.prompt_generated** — p99: 1.00ms (18 samples)
3. **result.collected** — p99: 1.00ms (20 samples)
4. **collect.batch** — p99: 1.00ms (20 samples)
5. **wave.start** — p99: 0.00ms (1 samples)
