# Monorepo Expert

## Workspace Structure
- Organize with `packages/` for shared libraries and `apps/` for deployable applications.
- Each package must have its own `package.json` with explicit `name`, `version`, and `exports` fields.
- Use `internal` prefix for packages not published to npm: `@org/internal-utils`.
- Keep shared configuration (tsconfig, eslint, prettier) in a `packages/config-*` package.
- Root `package.json` should only contain workspace-level dev dependencies and scripts.

## Dependency Graph Management
- Internal dependencies must use `workspace:*` protocol (pnpm) or `*` with workspace resolution.
- Never create circular dependencies between packages — use a layered architecture (core -> shared -> apps).
- Visualize the dependency graph regularly: `turbo run build --graph` or `nx graph`.
- Leaf packages (no internal dependents) can iterate faster; core packages need stricter review.
- Use `depcheck` or similar tools to detect unused dependencies in each package.

## Build Caching
- **Turborepo**: Configure `turbo.json` with correct `inputs` and `outputs` for each task. Cache invalidates on input changes.
- **Nx**: Use computation caching with `nx.json` target defaults. Enable remote cache for CI with Nx Cloud.
- Define `outputs` precisely — over-broad outputs (e.g., `dist/**`) reduce cache hit rates.
- Hash environment variables that affect build output using `globalEnv` or `env` in task config.
- Enable remote caching for CI pipelines — local caching alone provides limited benefit in teams.

## Task Orchestration
- Define task dependencies in `turbo.json` or `nx.json`: `build` depends on `^build` (topological).
- Parallelize independent tasks: lint and test can run concurrently across packages.
- Use `--filter` (Turborepo) or `--affected` (Nx) to run tasks only for changed packages.
- CI should run affected tasks only — full rebuilds waste time and cache.
- Set `concurrency` limits appropriately for CI runners to avoid OOM kills.

## Package Versioning
- Use `changesets` for coordinated versioning and changelog generation across packages.
- Each PR that changes a package must include a changeset file describing the change type (major/minor/patch).
- Publish packages atomically — all changed packages in a single release to avoid version skew.
- Use `fixed` versioning mode for tightly coupled packages, `independent` for loosely coupled ones.

## Shared Configuration
- Create `@org/tsconfig` with base configs: `base.json`, `react.json`, `node.json`. Packages extend these.
- Centralize ESLint config in a shared package with preset configs per environment.
- Share Vitest/Jest config via a base config package — individual packages override only when necessary.
- Prettier config should live at the root level — one formatting standard for the entire repo.

## Boundary Enforcement
- Use `eslint-plugin-boundaries` to enforce import restrictions between architectural layers.
- Define element types (app, feature, shared, core) and allowed dependency directions.
- Apps can import from features and shared; features can import from shared; shared imports only from core.
- CI must fail on boundary violations — this prevents architectural erosion over time.
- Document the dependency policy in a root-level ARCHITECTURE.md file.

## CI/CD Considerations
- Use workspace-aware package managers (pnpm, Yarn Berry, npm workspaces) for correct hoisting.
- Cache `node_modules` and build outputs in CI using the package manager's built-in caching.
- Deploy apps independently — a change in `app-a` should not trigger `app-b` deployment.
- Use Docker multi-stage builds with `--filter` to create minimal images per app.

## Anti-Patterns to Avoid
- Circular dependencies between packages — enforce a layered graph (core → shared → apps); cycles break caching and builds.
- Over-broad `outputs` (`dist/**`) in turbo/nx config — imprecise outputs tank cache-hit rates.
- Full rebuilds in CI instead of affected-only — run `--filter`/`--affected` so unchanged packages stay cached.
- Internal deps via fixed versions instead of `workspace:*` — you get version skew and stale local linking.
- Duplicated tsconfig/eslint/prettier per package — centralize in a shared config package; one standard.
- Publishing changed packages non-atomically — release them together or consumers hit version mismatch.
- No boundary enforcement — without `eslint-plugin-boundaries`, layer violations creep in until the graph is spaghetti.

## Karpathy Notes
- **Think before coding:** Define the dependency direction (who may import whom) before adding packages — retrofitting boundaries is painful.
- **Simplicity first:** Add a shared package only when 3+ packages need it. A premature `@org/utils` becomes a dumping ground.
- **Goal-driven:** Caching and `--affected` exist to make CI fast. Configure `inputs`/`outputs` precisely or the speedup evaporates.
