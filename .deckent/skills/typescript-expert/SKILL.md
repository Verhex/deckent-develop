# TypeScript Expert

## Strict Mode
- Always enable `strict: true` in tsconfig.json. This includes strictNullChecks, noImplicitAny, strictFunctionTypes, and all other strict family options.
- Never use `// @ts-ignore` or `// @ts-expect-error` without a preceding comment explaining why the suppression is necessary.
- Prefer `unknown` over `any` in all cases. If `any` is absolutely required, document the reason.

## Type Design
- Prefer `interface` over `type` for public API contracts. Interfaces support declaration merging and produce clearer error messages.
- Use `type` for unions, intersections, mapped types, and internal utility types.
- Use discriminated unions for state machines and variant types. Always include a `kind` or `type` literal field as the discriminant.
- Avoid `enum` in favor of `as const` objects with derived union types. Enums have runtime overhead and unexpected behavior with reverse mappings.

## Utility Types
- Use `Partial<T>` for optional update payloads, `Required<T>` for strict construction.
- Use `Pick<T, K>` and `Omit<T, K>` to create focused sub-types from larger interfaces.
- Use `Record<K, V>` for dictionary-like structures with known key types.
- Use `Readonly<T>` and `ReadonlyArray<T>` for immutable data structures.
- Use `Extract<T, U>` and `Exclude<T, U>` for narrowing union types.
- Use `ReturnType<T>` and `Parameters<T>` to derive types from function signatures.

## Generics
- Name generic parameters descriptively when there are multiple: `<TInput, TOutput>` over `<T, U>`.
- Constrain generics with `extends` to communicate requirements: `<T extends Record<string, unknown>>`.
- Provide default generic parameters where appropriate: `<T = string>`.
- Avoid deeply nested generics (max 3 levels). Extract intermediate types for readability.

## Error Handling
- Define typed error classes extending `Error`. Include a `code` property for programmatic handling.
- Use `Result<T, E>` pattern (union of `{ ok: true; value: T }` and `{ ok: false; error: E }`) for recoverable errors.
- Reserve `throw` for truly exceptional, unrecoverable situations.
- Always type catch blocks: `catch (error: unknown)` and narrow with type guards.

## Module System
- Use ESM imports exclusively (`import/export`). Never use `require()`.
- Use barrel exports (`index.ts`) sparingly -- only for public API surfaces. Internal modules import directly.
- Prefer named exports over default exports for better refactoring support and tree-shaking.
- Keep import paths relative within the package. Use path aliases only for cross-package imports.

## Code Organization
- One type/interface per concern. Avoid god-interfaces with 20+ properties.
- Co-locate types with their implementation. Shared types go in a dedicated `types.ts`.
- Use `satisfies` operator for type-safe object literals that preserve narrow types.
- Prefer `const` assertions for literal types: `as const`.
