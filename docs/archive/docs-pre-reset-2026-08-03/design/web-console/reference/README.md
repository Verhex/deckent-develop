# deckent — Web Console (Dashboard UI Kit)

A high-fidelity, interactive recreation of the **deckent** web dashboard
(`deckent web`, `localhost:3100`) — the project's "terminal" surface. It mirrors
the shipped React + Vite + Tailwind app under `src/dashboard/` in the deckent
repo, re-skinned into the brand's **dark teal/gold** system (Hanken Grotesk +
IBM Plex Mono). Cosmetic, not production code, but pixel-faithful and
click-through.

> Lives at `dashboard/` in the project root (moved from `ui_kits/dashboard/`).
> Tokens come from `../colors_and_type.css`.

## Run it
Open `index.html`. No build step — React + Babel + Lucide load from CDN.

## What's interactive
- **Navigate** the sidebar (Konuş / İzle / Yönet groups). **Dashboard** and
  **Chat** are fully wired; Status reuses the dashboard; other routes show a
  labelled placeholder.
- **New sprint** → opens the DIRECTIVES.md modal → on "Plan & start" it seeds a
  fresh sprint and **animates the lifecycle** (PLAN → SPAWN → EXECUTE →
  EVALUATE) with workers spawning and flipping to DONE.
- **Kill** a running worker → it drops to IDLE.
- **Chat** → type a message (or a slash command like `/status`, `/recall`,
  `/help`, `/clear`) for a faux-streamed reply; live notification panel + task
  context sidebar.
- **Terminal dock** → an **interactive web terminal**: multi-session tabs
  (`deckent start` / `claude` / `bash`), a **live-streaming log tail**, a working
  **command input** (`help`, `status`, `workers`, `recall <q>`, `sprint`,
  `clear`), plus **maximize** and **collapse**.
- **Language toggle** (EN/TR) and live-connection dot in the sidebar footer.

## Files
| File | Role |
|------|------|
| `index.html` | Entry — loads tokens, styles, and all components |
| `dashboard.css` | All component/layout classes (consumes `../../colors_and_type.css`) |
| `Primitives.jsx` | `Icon` (Lucide), `Badge`, `Button`, `StatusDot`, `PhaseTimeline` |
| `Sidebar.jsx` | Fixed left nav: brand, sprint pill, nav groups, footer toggles |
| `Dashboard.jsx` | Page header, stat row, sprint card, **WorkerCard** grid |
| `Chat.jsx` | Chat history, slash input, notifications, task-context sidebar |
| `Terminal.jsx` | Dockable tabbed terminal panel |
| `NewSprintModal.jsx` | DIRECTIVES.md editor dialog |
| `App.jsx` | Shell + routing + sprint simulation |

## Fidelity notes
- The shipped product is a **shadcn dark-zinc** theme with a **blue-500** accent.
  This kit re-skins that into the brand's **dark teal/gold** system: the
  functional accent is brand **teal** (`#54A89C`), active nav and tier labels pick
  up **gold**, and the type is **Hanken Grotesk + IBM Plex Mono**. Status
  semantics (DONE green, ERROR red, PAUSED amber) are preserved.
- The **WorkerCard** here is an *upgraded* take requested during review: it
  replaces the product's emoji glyphs with **Lucide icons** and adds an explicit
  **Model / Provider / Environment** detail grid. (The shipped app uses emoji
  status glyphs — see the repo's `WorkerCard.tsx`.)
- Components are simplified cosmetic versions; data is mocked. For exact
  behavior, read the originals in `src/dashboard/src/components/`.
