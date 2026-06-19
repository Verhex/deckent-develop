---
doc_rank: 50
status: active
last_updated: 2026-06-04
content_hash: sha256:90e1d2bcfee327954023bcfdf7a7bb0e11c3e29b9c1696a0b6d8fd0c5c658393
---

# Accessibility Expert

## WCAG 2.1 AA Requirements
- All interactive elements must be operable via keyboard alone (no mouse dependency).
- Text content must have a minimum contrast ratio of 4.5:1 against its background. Large text (18px+ bold or 24px+ regular) requires 3:1.
- Non-text content (icons, images, charts) must have text alternatives that convey equivalent meaning.
- Forms must have visible labels associated via `<label for="">` or `aria-labelledby`. Placeholder text is NOT a substitute for labels.
- Error messages must be programmatically associated with their form fields using `aria-describedby` or `aria-errormessage`.

## Semantic HTML
- Use native HTML elements over ARIA where possible: `<button>` over `<div role="button">`, `<nav>` over `<div role="navigation">`.
- Heading hierarchy must be logical and sequential: never skip levels (h1 -> h3 without h2).
- Use `<main>`, `<header>`, `<footer>`, `<aside>`, `<section>`, `<article>` for document structure.
- Lists of items must use `<ul>`, `<ol>`, or `<dl>` — not sequences of `<div>` elements.
- Tables must have `<th>` with `scope` attributes. Data tables need `<caption>` elements.

## ARIA Patterns
- ARIA is a last resort: the first rule of ARIA is "don't use ARIA" if a native element works.
- Use `aria-live="polite"` for dynamic content updates (toast notifications, status messages).
- Use `aria-expanded`, `aria-controls`, and `aria-haspopup` for disclosure widgets (dropdowns, accordions).
- Modal dialogs require `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to the dialog title.
- Use `aria-current="page"` for active navigation links, not just visual styling.

## Keyboard Navigation
- All interactive elements must be reachable via Tab key in a logical order matching visual layout.
- Custom widgets must implement arrow key navigation following WAI-ARIA Authoring Practices.
- Focus must be trapped inside modal dialogs. On close, focus returns to the triggering element.
- Visible focus indicators are mandatory — never use `outline: none` without a custom replacement.
- Skip navigation links must be the first focusable element on every page.

## Focus Management
- When new content appears (modals, alerts, page transitions), move focus programmatically to the new content.
- Use `tabindex="-1"` to make non-interactive elements focusable for programmatic focus without adding them to tab order.
- Never use `tabindex` greater than 0 — it breaks natural tab order.
- `document.activeElement` should be tracked before opening overlays so focus can be restored on close.

## Color and Visual Design
- Never convey information by color alone. Use icons, text labels, or patterns alongside color coding.
- Ensure UI is usable at 200% zoom without horizontal scrolling (WCAG 1.4.10 Reflow).
- Animations must respect `prefers-reduced-motion` media query. Provide reduced or no motion alternatives.
- Touch targets must be at least 44x44 CSS pixels (WCAG 2.5.5 Target Size).

## Testing
- Integrate axe-core into CI: `@axe-core/react` for development, `axe-core` in automated tests.
- Test with at least one screen reader (VoiceOver on macOS, NVDA on Windows).
- Verify all flows with keyboard-only navigation — no mouse allowed.
- Use browser DevTools accessibility inspector to verify ARIA roles and computed accessible names.
- Lint with `eslint-plugin-jsx-a11y` for static analysis of JSX accessibility issues.

## Common Anti-Patterns
- `<div onClick>` without `role="button"`, `tabIndex="0"`, and keyboard event handlers.
- `aria-label` that duplicates visible text — use `aria-labelledby` instead.
- Images with `alt=""` that are not purely decorative.
- Auto-playing media without pause controls.
- Timeout-based interactions without extension or warning mechanisms.

## Karpathy Notes
- **Think before coding:** Reach for the native element first (`<button>`, `<nav>`, `<label>`). The first rule of ARIA is: don't use ARIA when HTML already conveys the semantics.
- **Goal-driven:** Every control must be operable by keyboard alone, and every state must survive without color. Verify with keyboard-only navigation and a screen reader — not just a linter.
- **Surgical:** Adding `role`/`aria-*` is a claim about behavior you must then implement (focus moves, arrow keys). Don't bolt on ARIA you won't wire up — it actively misleads assistive tech.
