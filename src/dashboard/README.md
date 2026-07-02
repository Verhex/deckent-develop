# deckent Dashboard

Vite + React + Tailwind web UI for deckent. Per the 2026-06-29 scope-freeze +
observability pivot (row 211, DASH-1), this app's target role is an
**observation surface** — see
[`docs/guide/dashboard.md`](../../docs/guide/dashboard.md) for the full
page-by-page guide, the disk-verified panel inventory, and current pivot
status.

## Development

```bash
npm install
npm run dev       # Vite dev server
npm run build     # tsc -b && vite build -> dist/
npm run preview   # preview a production build
```

## Structure

- `src/pages/` — one file per route (`nav-items.ts` is the source of truth for
  which routes appear in the left nav, and in which group)
- `src/nav-items.ts` — single source of truth for the nav's `talk` / `watch` /
  `manage` groups; enforced by `src/__tests__/nav-single-source.test.tsx`
- `src/components/` — shared UI, including `ApprovalsPanel.tsx` (a read-only
  view over the runtime-wide `ApprovalBroker` queue — no accept/deny control)
- `src/i18n/` — `en.ts` / `tr.ts` translation dictionaries (`en.ts` is the
  `TranslationKey` source of truth; every `t()` call must resolve against it)

## Testing

From the repo root:

```bash
npm run test:dashboard
```
