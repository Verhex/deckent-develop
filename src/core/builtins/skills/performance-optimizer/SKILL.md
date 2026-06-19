---
doc_rank: 50
status: active
last_updated: 2026-06-04
content_hash: sha256:5cf2a67a74a7ce6dd495a31a0a8d9dc54c525a5f7fd438ea327c566aec588631
---

# Performance Optimizer

## Profiling Methodology
- Always measure before optimizing. Premature optimization is the root of all evil.
- Use the right profiling tool: Chrome DevTools (frontend), Node.js --inspect (backend), py-spy/cProfile (Python).
- Profile in conditions close to production: realistic data sizes, concurrent users, network latency.
- Focus on the critical path. Optimizing code that runs once during startup is rarely worth it.
- Benchmark with statistical rigor: multiple runs, percentiles (p50, p95, p99), not just averages.

## Big-O Analysis
- Know the complexity of every algorithm and data structure you use.
- Common pitfalls: nested loops (O(n^2)), repeated string concatenation (O(n^2)), unindexed database queries (O(n)).
- Prefer O(n) or O(n log n) algorithms. If O(n^2) is unavoidable, ensure n is bounded and small.
- Space complexity matters too. An O(n) algorithm that allocates O(n^2) memory can still be slow.
- Use appropriate data structures: Set/Map for lookups (O(1)), sorted arrays for binary search (O(log n)).

## Caching Strategies
- LRU (Least Recently Used): good general-purpose cache. Bounded memory. Use for frequently accessed data.
- TTL (Time-To-Live): good for data that becomes stale. Set TTL based on acceptable staleness.
- Write-through: update cache on every write. Consistent but higher write latency.
- Write-behind: batch cache updates. Lower write latency but risk of data loss.
- Cache invalidation is hard. Prefer TTL expiry over manual invalidation when possible.
- Use multi-level caching: in-memory (fastest, smallest), Redis (shared, larger), CDN (edge, largest).

## Lazy Loading
- Load resources only when needed. Apply to: images, routes, modules, database relations.
- Use dynamic imports (`import()`) for code splitting in JavaScript. Split by route or feature.
- Implement virtual scrolling for long lists (only render visible items).
- Use intersection observer for lazy loading images and below-the-fold content.
- Prefetch resources likely to be needed next (link prefetch, hover intent).

## Memory Optimization
- Identify memory leaks: growing heap over time, objects retained beyond their lifecycle.
- Common leak sources: event listeners not removed, closures holding large scopes, global caches without eviction.
- Use WeakMap/WeakSet for metadata attached to objects that should be garbage collected.
- Stream large files instead of loading entirely into memory. Use Node.js Streams or async iterators.
- Pool expensive objects (database connections, worker threads) instead of creating/destroying repeatedly.

## Database Query Optimization
- Use EXPLAIN ANALYZE to understand query execution plans. Look for sequential scans on large tables.
- Add indexes for columns in WHERE, JOIN, ORDER BY, and GROUP BY clauses.
- Use SELECT only the columns you need. Avoid SELECT *.
- Batch operations: use bulk inserts, batch updates, and batch deletes instead of row-by-row.
- Use connection pooling with appropriate pool size (typically 10-20 connections per application instance).
- Use read replicas for read-heavy workloads. Route writes to primary, reads to replicas.

## Bundle Optimization (Frontend)
- Analyze bundle size with webpack-bundle-analyzer or source-map-explorer.
- Tree-shake unused code. Ensure libraries support ESM for effective tree-shaking.
- Code-split by route. Each route should load only the JavaScript it needs.
- Use compression (gzip, brotli) for all text-based assets.
- Set long cache TTLs with content hashing in filenames for immutable assets.
- Optimize images: use modern formats (WebP, AVIF), responsive sizes, lazy loading.

## Network Performance
- Minimize round trips: batch API calls, use GraphQL for complex data requirements, HTTP/2 multiplexing.
- Use CDN for static assets and cacheable API responses.
- Implement request deduplication: if the same request is in-flight, return the same promise.
- Set appropriate cache headers: Cache-Control, ETag, Last-Modified.
- Compress API responses. Use streaming for large payloads.

## Anti-Patterns to Avoid
- Optimizing before profiling — premature optimization wastes effort on code that isn't the bottleneck. Measure first.
- Benchmarking with averages only — report p50/p95/p99; tail latency is what users feel.
- `SELECT *` and per-row queries in hot paths — fetch needed columns, batch, and index WHERE/JOIN columns.
- Memoizing everything (`React.memo`/`useMemo`) by default — memo has cost; apply it where the profiler shows re-renders.
- Caching without an eviction or TTL policy — an unbounded cache is a memory leak with extra steps.
- Loading large files fully into memory — stream them; an O(n) algorithm with O(n) RAM still OOMs at scale.
- Optimizing startup code that runs once — spend the budget on the critical path that runs N times.

## Karpathy Notes
- **Think before coding:** Profile in production-like conditions and find the one bottleneck before changing anything. Guessing wastes the budget.
- **Goal-driven:** Tie every optimization to a measured number (latency, memory, bundle size). If you can't measure the win, don't ship the complexity.
- **Simplicity first:** The simplest fix is often the biggest — an index, a batch, a cache header — before clever algorithmic rewrites.
