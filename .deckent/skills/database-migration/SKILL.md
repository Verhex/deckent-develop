# Database Migration

## Migration Safety
- Every migration must be reversible. Always write both `up` and `down` functions.
- Migrations must be idempotent: running the same migration twice should not fail or corrupt data.
- Never modify a migration that has been applied to any shared environment (staging, production). Create a new migration instead.
- Test migrations against a copy of production data before deploying. Schema changes on large tables can lock and cause downtime.
- Use sequential, timestamped naming: `20240115_001_create_users_table`. Never rename migration files.

## Schema Design
- Use `UUID` or `ULID` for primary keys in distributed systems. Auto-increment IDs are fine for single-database apps.
- Always include `created_at` and `updated_at` timestamps on every table.
- Use `NOT NULL` by default. Allow `NULL` only when the absence of a value has explicit business meaning.
- Use appropriate column types: `TEXT` for variable-length strings, `VARCHAR(n)` when max length is meaningful, `DECIMAL` for money, `TIMESTAMPTZ` for timestamps.
- Normalize to third normal form (3NF) by default. Denormalize only when profiling proves a performance need.

## Relationships and Constraints
- Define foreign keys explicitly with ON DELETE behavior: `CASCADE`, `SET NULL`, `RESTRICT`.
- Use join tables for many-to-many relationships. Include additional columns (e.g., `created_at`, `role`) when the relationship itself has properties.
- Add `UNIQUE` constraints for business-level uniqueness (email, username, slug).
- Use `CHECK` constraints for domain validation (positive prices, valid status enums).

## N+1 Prevention
- Always use eager loading (JOINs or subquery loading) when accessing related data in loops.
- Use `SELECT ... JOIN` or ORM include/populate for known relationship access patterns.
- Monitor query logs in development. Any query executed N times in a loop is a code smell.
- Use DataLoader pattern for GraphQL resolvers to batch and cache database access.

## Transactions
- Wrap multi-table writes in transactions. Use the database's transaction isolation level appropriate for the operation.
- Keep transactions short. Avoid network calls, file I/O, or user interaction inside transactions.
- Use `SERIALIZABLE` isolation only when necessary (financial operations). Default to `READ COMMITTED`.
- Handle deadlocks with retry logic: catch deadlock errors and retry up to 3 times with exponential backoff.

## Index Strategy
- Index all foreign key columns. Databases do not auto-index foreign keys (except some engines).
- Create composite indexes matching your most common query patterns. Column order matters: most selective first.
- Use partial indexes for queries on subsets: `WHERE status = 'active'`.
- Monitor slow query logs and use `EXPLAIN ANALYZE` to verify index usage.
- Remove unused indexes. They slow down writes and consume storage.

## Seed Data
- Keep seed data minimal and focused on development and testing needs.
- Use factory functions (Faker, Factory) for generating realistic test data.
- Seed data scripts must be idempotent: use `INSERT ... ON CONFLICT DO NOTHING` or upsert patterns.
- Separate reference data seeds (countries, currencies) from test data seeds.
