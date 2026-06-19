---
doc_rank: 50
status: active
last_updated: 2026-06-04
content_hash: sha256:77aedf6d03e7f013f8bccfe3fbeb7e769c9314b7c17edfc33a168c0cbcf7a0a9
---

# GraphQL Expert

## Schema Design
- **Schema-first**: Write `.graphql` SDL files, generate TypeScript types with `graphql-codegen`. Best for teams with frontend/backend split.
- **Code-first**: Define schema in TypeScript using `type-graphql` or `nexus`. Best for full-stack TypeScript projects.
- Design types around business domains, not database tables. The schema is a product API, not a data dump.
- Use clear, consistent naming: `Query.user`, `Mutation.createUser`, `Subscription.userUpdated`.
- Mark fields non-nullable by default. Use nullable only when the field genuinely can be absent.

## Resolver Patterns
- **DataLoader**: Always batch and cache database lookups per request to prevent N+1 queries. Create one DataLoader instance per request context.
- Keep resolvers thin — delegate business logic to service classes, not inline in resolvers.
- Parent resolvers should return only the data they own. Child field resolvers fetch related data on demand.
- Use `@ResolveField()` or field-level resolvers for computed or relational fields.
- Never perform side effects in Query resolvers — they must be read-only and idempotent.

## Pagination
- Use **cursor-based pagination** (Relay Connection spec) for infinite scroll and real-time data. Provides stable ordering.
- Use **offset-based pagination** only for simple, static lists where total count is needed.
- Always return `pageInfo { hasNextPage, hasPreviousPage, startCursor, endCursor }` with connection types.
- Limit maximum `first`/`last` arguments server-side to prevent abuse (e.g., max 100 items per page).

## Error Handling
- Use **union types** for expected errors: `type CreateUserResult = User | ValidationError | DuplicateEmailError`.
- Reserve top-level GraphQL errors for unexpected failures (server errors, auth failures).
- Include a `code` field in error types for programmatic handling by clients.
- Never expose internal error details (stack traces, SQL) in production error responses.

## Subscriptions
- Use **WebSocket transport** (`graphql-ws` protocol) for real-time subscriptions.
- Filter subscription events server-side using `withFilter()` — never send all events to all subscribers.
- Implement connection lifecycle hooks: `onConnect` for auth, `onDisconnect` for cleanup.
- Design subscriptions for specific use cases (order status, notifications) — avoid generic "subscribe to everything" patterns.

## Federation
- Split the schema into **subgraphs** by domain boundary. Each service owns its types and resolvers.
- Use `@key` directive to define entity primary keys for cross-service resolution.
- Extend types from other subgraphs using `extend type` with `@external` fields.
- Gateway (Apollo Router, Apollo Gateway) composes subgraphs into a unified supergraph.
- Test subgraph schemas independently and the composed supergraph in integration tests.

## Code Generation
- Use `@graphql-codegen/cli` to generate TypeScript types, resolver signatures, and client hooks.
- Configure `codegen.ts` with `typescript`, `typescript-resolvers`, and `typescript-operations` plugins.
- Generate types on every schema change — never manually maintain GraphQL-derived types.
- Use `near-operation-file` preset to co-locate generated types with their components.

## Caching
- **Normalized cache** (Apollo Client): Automatically deduplicates entities by `__typename` + `id`.
- Set `@cacheControl` directives on types and fields to define max-age and scope (PUBLIC/PRIVATE).
- Use CDN caching for public queries via persisted queries (APQ) with GET requests.
- Invalidate cache entries explicitly after mutations using `cache.evict()` or `refetchQueries`.

## Input Validation
- Validate inputs at the schema level using custom scalars (`DateTime`, `EmailAddress`, `URL`).
- Use input types (`input CreateUserInput`) — never accept raw JSON or generic `String` for structured data.
- Validate business rules in the service layer, not in resolvers. Return typed errors for invalid input.
- Limit query depth and complexity using `graphql-depth-limit` and `graphql-query-complexity` to prevent abuse.

## Anti-Patterns to Avoid
- Resolvers that query the database per parent row — the classic N+1; batch with a per-request DataLoader.
- Modeling the schema after database tables — design around the client's domain, not your storage layout.
- Returning internal errors (stack traces, SQL) to clients — map expected failures to typed union errors with a `code`.
- Nullable-by-default fields — mark non-null unless absence is genuinely meaningful; nullability is contagious for clients.
- Unbounded `first`/`last` and unlimited query depth — cap page size and apply depth/complexity limits to prevent abuse.
- Side effects in Query resolvers — queries must be read-only and idempotent; mutations own all writes.
- Hand-maintaining types derived from the schema — generate them with `graphql-codegen` on every schema change.

## Karpathy Notes
- **Think before coding:** Design the schema as a product contract first. Adding a field is easy; changing or removing one breaks clients.
- **Simplicity first:** Keep resolvers thin — delegate to services. A resolver that contains business logic is hard to test and reuse.
- **Goal-driven:** Every field a resolver returns should be data it owns. Push relational fetches to field resolvers plus DataLoader.
