---
doc_rank: 50
status: active
last_updated: 2026-06-04
content_hash: sha256:5f49f50480cd97ea74ba3b438da4fcd33d892a74330ca5e03e0242837ea88c62
---

# Frontend Design

## Tailwind Utility-First Patterns
- Compose UI from utility classes instead of writing custom CSS. Extract component classes only when a pattern repeats 3+ times.
- Use `@apply` sparingly and only in component-level CSS files. Prefer inline utilities in JSX/HTML for colocation.
- Group utilities by concern: layout (`flex`, `grid`, `gap`), spacing (`p-`, `m-`), typography (`text-`, `font-`), color (`bg-`, `text-`, `border-`).
- Use arbitrary values `[...]` only when the design token system does not cover the value. Prefer extending the theme config.

## Responsive Breakpoints
- Design mobile-first: write base styles for mobile, then add `sm:`, `md:`, `lg:`, `xl:` overrides.
- Standard breakpoints: `sm` (640px), `md` (768px), `lg` (1024px), `xl` (1280px), `2xl` (1536px).
- Use `container` with `mx-auto` and responsive padding for consistent max-width layouts.
- Test at each breakpoint boundary. Common failures: text overflow, truncated buttons, collapsed grid columns.

## Design Token System
- Define colors, spacing, typography, and shadows in `tailwind.config.ts` under `theme.extend`.
- Use semantic color names (`primary`, `secondary`, `destructive`, `muted`) instead of raw color values.
- Maintain a consistent spacing scale. Prefer the default 4px grid (1 = 4px, 2 = 8px, 4 = 16px).
- Define font families and sizes as tokens: `fontFamily: { sans: [...], mono: [...] }`.

## CSS Grid vs Flexbox
- Use **Flexbox** for one-dimensional layouts: navbars, card rows, inline elements, centering.
- Use **CSS Grid** for two-dimensional layouts: page layouts, dashboards, image galleries, form grids.
- Prefer `grid-cols-{n}` with `gap-{n}` for equal-width columns. Use `grid-cols-[...]` for custom track sizes.
- For responsive grids, use `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` pattern.

## Micro-Animations
- Use Tailwind transitions: `transition-all duration-200 ease-in-out` for hover/focus state changes.
- Keep durations short: 150-300ms for UI feedback, 300-500ms for content transitions, 500ms+ for page transitions.
- Use `@keyframes` for complex multi-step animations. Define them in `tailwind.config.ts` under `theme.extend.keyframes`.
- Respect `prefers-reduced-motion`: wrap animations in `motion-safe:` or use `motion-reduce:` to disable.

## Dark Mode Strategy
- Use Tailwind `dark:` variant with `darkMode: "class"` strategy for user-controlled toggling.
- Define dark mode colors as semantic tokens: `bg-background dark:bg-background` where background resolves to different values.
- Test contrast ratios in both modes. WCAG AA requires 4.5:1 for normal text, 3:1 for large text.
- Store theme preference in `localStorage` and apply the `dark` class before first render to prevent flash.

## Visual Hierarchy
- Establish hierarchy through size, weight, color, and spacing -- not just font size alone.
- Use consistent heading scales: `text-4xl` > `text-2xl` > `text-xl` > `text-lg` > `text-base`.
- Apply muted colors (`text-muted-foreground`) for secondary information, strong colors for primary actions.
- Use whitespace generously. Dense UIs feel overwhelming. Group related elements with spacing, separate groups with larger gaps.

## Component Patterns
- Build from atoms up: Button, Input, Badge, then Card, Form, then Page layouts.
- Use consistent border radius: `rounded-md` for cards, `rounded-lg` for modals, `rounded-full` for avatars/pills.
- Apply focus-visible rings (`focus-visible:ring-2 ring-ring ring-offset-2`) for keyboard accessibility.
- Use `sr-only` class for screen-reader-only labels on icon-only buttons.

## Anti-Patterns to Avoid
- `@apply` everywhere to recreate traditional CSS files — it defeats utility-first colocation; reserve it for genuinely repeated component classes.
- Arbitrary values (`[17px]`) scattered instead of theme tokens — extend `tailwind.config` so the scale stays consistent.
- Desktop-first styles patched with `max-*` overrides — design mobile-first and layer `sm:`/`md:`/`lg:` upward.
- `outline: none` / removing focus rings for looks — keyboard users lose all orientation; provide a visible `focus-visible` ring.
- Conveying state by color alone — add an icon or text so colorblind users and dark mode still parse it.
- Animations with no `prefers-reduced-motion` guard — wrap them in `motion-safe:` to respect the OS setting.
- Raw hex colors inline instead of semantic tokens (`primary`, `muted`) — themes and dark mode break without the token layer.

## Karpathy Notes
- **Think before coding:** Commit to an aesthetic direction (and the token scale that expresses it) before writing markup — retrofitting consistency is expensive.
- **Simplicity first:** Compose from utilities and existing tokens. Extract a component class only when the same pattern repeats 3+ times.
- **Goal-driven:** Every visual choice serves hierarchy or usability. Decoration that fights legibility or accessibility is a regression, not polish.
