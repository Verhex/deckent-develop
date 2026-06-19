---
doc_rank: 50
status: active
last_updated: 2026-06-04
content_hash: sha256:2543fb814806b656ad61113771c49ca43022804c3724b2ad48662a4a78c1fa6a
---

# API Builder

## RESTful Design
- Use nouns for resource endpoints: `/users`, `/orders`, `/products`. Never use verbs in paths.
- Use HTTP methods correctly: GET (read), POST (create), PUT (full replace), PATCH (partial update), DELETE (remove).
- Use plural nouns for collection endpoints: `/users` not `/user`.
- Nest resources for relationships: `/users/:userId/orders`. Limit nesting to 2 levels maximum.
- Use query parameters for filtering, sorting, and pagination: `?status=active&sort=-createdAt&page=2&limit=20`.

## HTTP Status Codes
- 200 OK: successful GET, PUT, PATCH, DELETE.
- 201 Created: successful POST that creates a resource. Include Location header.
- 204 No Content: successful DELETE with no response body.
- 400 Bad Request: validation error, malformed input.
- 401 Unauthorized: missing or invalid authentication.
- 403 Forbidden: authenticated but insufficient permissions.
- 404 Not Found: resource does not exist.
- 409 Conflict: duplicate resource or state conflict.
- 422 Unprocessable Entity: semantically invalid input.
- 429 Too Many Requests: rate limit exceeded. Include Retry-After header.
- 500 Internal Server Error: unexpected server failure. Never expose stack traces.

## Error Response Format
- Use a consistent error response structure across all endpoints:
  ```json
  {
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "Human-readable description",
      "details": [{ "field": "email", "message": "Invalid email format" }]
    }
  }
  ```
- Include a machine-readable `code` for programmatic handling.
- Include field-level details for validation errors.

## Input Validation
- Validate all input at the API boundary. Use Zod (TypeScript) or Joi for schema validation.
- Validate path parameters, query parameters, headers, and request body.
- Sanitize string inputs to prevent injection attacks.
- Define maximum lengths for all string fields. Reject oversized payloads early.
- Use middleware for cross-cutting validation (auth, content-type, request size).

## Rate Limiting
- Implement rate limiting on all public endpoints. Use sliding window or token bucket algorithms.
- Return 429 with `Retry-After` header when limit is exceeded.
- Use different limits for authenticated vs anonymous requests.
- Rate limit by IP for anonymous, by user/API key for authenticated.

## API Versioning
- Use URL path versioning: `/v1/users`, `/v2/users`. It is explicit and easy to route.
- Support at most 2 active versions simultaneously. Deprecate older versions with sunset headers.
- Document breaking changes clearly in changelogs.
- Use feature flags for non-breaking additions instead of version bumps.

## OpenAPI / Documentation
- Write OpenAPI 3.0+ specifications for all endpoints.
- Include request/response schemas, examples, and error responses.
- Generate client SDKs from OpenAPI specs where needed.
- Keep specs in sync with implementation using automated validation.

## Middleware Architecture
- Order middleware deliberately: logging, CORS, auth, rate limiting, validation, handler.
- Use error-handling middleware as the final layer to catch and format all errors consistently.
- Keep middleware functions small and focused on a single concern.
- Use CORS with explicit allowed origins. Never use `*` in production.

## Anti-Patterns to Avoid
- Verb in resource paths (`/getUser`, `/createOrder`) — use HTTP method + noun.
- Nesting resources more than 2 levels deep — flattens to `/resource/:id/sub` at most.
- Returning 200 with `{ success: false }` — use correct HTTP status codes.
- Different error formats per endpoint — establish one error schema and use it everywhere.
- Version bumping for non-breaking additions — use feature flags or optional fields instead.
- Premature versioning (`/v1/` from day one) — add versioning when you have an actual breaking change.
- Exposing internal identifiers (DB auto-increment IDs) in URLs — use UUIDs or opaque tokens.
- Skipping input validation on "internal" endpoints — treat every HTTP entry point as a trust boundary.

## Karpathy Notes
- **Simplicity first:** Design the smallest API surface that satisfies the use case. Endpoints are contracts — adding is easy, removing is breaking.
- **Think before coding:** Write the OpenAPI spec (or at least the request/response shapes) before implementing the handler.
- **Goal-driven:** Each endpoint must have a single, clear responsibility. If you're using "and" in the endpoint description, split it.
