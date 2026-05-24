# React Specialist

## Component Design
- Use functional components exclusively. Class components are legacy and should be migrated.
- Keep components small and focused. If a component exceeds 150 lines, split it into sub-components.
- Name components with PascalCase. Name files matching the component: `UserProfile.tsx`.
- Prefer composition over inheritance. Use children prop and render props for flexible composition.
- Co-locate component, styles, tests, and types in the same directory.

## Hooks
- Extract reusable logic into custom hooks prefixed with `use`: `useAuth`, `useDebounce`, `useFetch`.
- Follow the Rules of Hooks: only call at top level, only call in React functions.
- Use `useState` for simple local state. Use `useReducer` for complex state transitions with multiple sub-values.
- Use `useEffect` sparingly. Prefer derived state (computed during render) over effects that sync state.
- Always include a cleanup function in effects that create subscriptions, timers, or event listeners.
- Use `useRef` for mutable values that do not trigger re-renders (DOM refs, interval IDs, previous values).

## React 18+ Patterns
- Use `Suspense` with lazy-loaded components for code splitting: `React.lazy(() => import('./HeavyComponent'))`.
- Use `useTransition` for non-urgent state updates that should not block the UI.
- Use `useDeferredValue` for expensive computations derived from frequently changing values.
- Use `useId` for generating unique IDs for accessibility attributes.
- Prefer server components where supported for data fetching (Next.js App Router, React Server Components).

## Performance
- Use `React.memo` only when profiling reveals unnecessary re-renders. Do not memo everything by default.
- Use `useMemo` for expensive computations. Use `useCallback` for stable function references passed to memoized children.
- Avoid creating new objects/arrays in render. Lift stable references outside the component or memoize them.
- Use virtualization (react-window, TanStack Virtual) for long lists (100+ items).
- Profile with React DevTools Profiler before optimizing. Measure, do not guess.

## State Management
- Start with local state (`useState`/`useReducer`). Lift state up only when siblings need it.
- Use React Context for low-frequency global state (theme, locale, auth). Not for high-frequency updates.
- For complex global state, use dedicated libraries: Zustand (simple), Jotai (atomic), or TanStack Query (server state).
- Never store derived data in state. Compute it during render from source state.

## Testing
- Use React Testing Library. Test behavior, not implementation details.
- Query by role, label, or text -- not by test IDs or class names.
- Use `userEvent` over `fireEvent` for realistic interaction simulation.
- Test custom hooks with `renderHook` from `@testing-library/react`.
- Write integration tests for user flows. Unit test complex logic extracted into hooks/utilities.

## Anti-Patterns to Avoid
- Prop drilling beyond 2 levels. Use context or composition instead.
- Storing server data in local state. Use TanStack Query, SWR, or equivalent.
- `useEffect` for data fetching without cleanup or race condition handling.
- Mutating state directly. Always create new references.
- Index as key in dynamic lists. Use stable unique identifiers.
- `React.memo` on every component preemptively — profile first, optimize second.
- Derived state in `useState` — compute during render from source state, no effect needed.
- Custom hook that wraps a single built-in hook with no added logic — just use the built-in.
- Context for high-frequency updates (mouse position, scroll) — causes full subtree re-renders.
- `useEffect` with an empty dependency array as a "run once" trick — it re-runs on remount in Strict Mode.

## Karpathy Notes
- **Simplicity first:** useState → useReducer → Context → external store. Move right only when the left cannot handle it.
- **Think before coding:** Sketch the component tree and data flow before writing JSX. Identify which components own which state.
- **Surgical changes:** A new hook should solve a problem that cannot be solved inline. If the hook body is shorter than its name + call, inline it.
