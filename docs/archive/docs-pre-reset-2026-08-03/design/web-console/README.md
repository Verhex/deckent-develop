# Handoff: deckent Web Console — teal/gold re-theme + interactive terminal

## Overview
This package applies the **deckent brand "logbook" design** to the product's web
dashboard (`deckent web`, `localhost:3100`). It does two things:

1. **Re-themes** the shipped shadcn **dark-zinc + blue** UI into the brand's
   **dark teal/gold** system, with **Hanken Grotesk** (UI) + **IBM Plex Mono**
   (labels/terminal) typography.
2. **Upgrades the terminal dock** into a genuinely interactive web terminal
   (multi-session tabs, a live-streaming log tail, a working command input,
   maximize/collapse).

Status semantics (DONE green, ERROR red, PAUSED amber) are **deliberately kept**.

## About the design files
The files in `reference/` are a **design reference built in HTML** (React via
in-browser Babel, mocked data, CDN libraries) — a prototype of the intended look
and behavior, **not production code to copy verbatim**. Your task is to
**recreate these design decisions in the real dashboard** (`src/dashboard/`,
React + Vite + Tailwind + shadcn/ui) using its existing components and patterns.
In practice this is mostly a **token swap + class updates**, not a rewrite — the
components (sidebar, worker card, phase timeline, terminal dock) already exist in
your repo as `.tsx`.

## Fidelity
**High-fidelity.** Exact colors, fonts, spacing, and interactions are specified
below. Recreate pixel-faithfully using your existing shadcn/Tailwind setup.

---

## Fast path (most of the work)
1. **Fonts** — add to `index.html` `<head>`:
   ```html
   <link rel="preconnect" href="https://fonts.googleapis.com">
   <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
   <link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
   ```
2. **CSS variables** — paste `deckent-theme.css` values into your `.dark { … }`
   block in `src/dashboard/src/index.css` (replaces the blue accent with teal,
   adds `--gold*` + `--brand-*`). shadcn reads `H S% L%`.
3. **Tailwind** — merge `deckent-theme.tailwind.js` into `theme.extend`
   (fontFamily + `brand`/`gold` color scales).
4. **Find/replace** the blue accent across dashboard components (table below).
5. **Add gold** to the three signature spots: active nav left-border, worker
   tier label, active terminal tab.
6. **Terminal** — recreate the interactive behavior (see “Interactions”).

### blue → brand find/replace
| Find | Replace |
|------|---------|
| `blue-500` | `brand-500` |
| `blue-600` (filled CTAs, send btn, user bubble) | `brand-600` |
| `blue-400` / `blue-300` (accent text) | `brand-300` |
| `bg-blue-900` (info badge, bot avatar bg) | `bg-[hsl(var(--brand-bg))]` |
| `text-blue-100` | `text-[hsl(var(--brand-fg))]` |
| `ring-blue-500` / focus ring | `ring-ring` |

---

## Design tokens

### Color — brand & accent (NEW)
| Token | Hex | HSL (`H S% L%`) | Use |
|-------|-----|------------------|-----|
| brand / primary | `#54A89C` | `171 33% 49%` | functional accent: active, filled buttons, progress, EXECUTING, focus ring |
| brand hover | `#3E9384` | `170 41% 41%` | button/hover |
| brand-700 | `#2F7568` | `170 55% 27%` | pressed / deep |
| brand-800 | `#246060` | `180 45% 26%` | deepest teal |
| brand-bg | `#11332D` | `170 50% 13%` | teal-tinted surface: info badge, bot avatar, chips |
| brand-fg | `#BFE6DC` | `165 44% 83%` | teal-tinted light text |
| gold | `#C0B46C` | `51 40% 59%` | active nav border, worker tier label, ornaments |
| gold-soft | `#D6CB8C` | `51 47% 69%` | bright gold (terminal highlight, hover) |
| gold-deep | `#9A8736` | `48 48% 41%` | gold on light |

### Color — neutrals (UNCHANGED, shadcn dark-zinc)
| Token | Hex | HSL |
|-------|-----|-----|
| background | `#09090b` | `240 10% 4%` |
| foreground | `#fafafa` | `0 0% 98%` |
| card / surface | `#18181b` | `240 4% 10%` |
| secondary / muted / border | `#27272a` | `240 4% 16%` |
| muted-foreground | `#a1a1aa` | `240 5% 65%` |

### Color — status (UNCHANGED)
| State | Hex |
|-------|-----|
| success / DONE / GO | `#22C55E` |
| warning / PAUSED | `#EAB308` |
| danger / NO_GO / ERROR | `#EF4444` |
| provider Claude / Codex / Gemini | `#D97757` / `#10A37F` / `#4285F4` |

### Typography
- **UI / body:** `"Hanken Grotesk"`, system-ui fallback. Weights 400/500/600/700/800.
  Headings 700–800, `letter-spacing: -0.02em … -0.03em`.
- **Mono (IDs, sprint refs, commands, terminal, eyebrows, tier labels):**
  `"IBM Plex Mono"`. Weights 400/500/600.
- Scale (rem, root 16px): 2xs .625 · xs .75 · sm .875 (default) · base 1 ·
  lg 1.125 · xl 1.25 · 2xl 1.5 · 3xl 1.875.

### Radius / elevation / motion
- Radius: sm `2px` · md `3px` · lg `4px` · xl `6px` (squared, technical look).
- Shadows: card `0 1px 2px rgba(0,0,0,.4)`; worker card `0 10px 24px -4px rgba(2,2,5,.6)`.
- Motion: `cubic-bezier(.4,0,.2,1)`; fast 150ms · normal 200ms · slow 300ms.
- Hairline gold underglow on sticky bars: `box-shadow: 0 1px 0 rgba(192,180,108,.18)`.

---

## Screens / Views

### 1 · Shell (Sidebar + Topbar + Content + Terminal dock)
- **Layout:** `flex` row. Sidebar **260px** fixed (`border-right`, `--surface` bg).
  Main = `flex-1` column: 48px topbar → scrollable content → terminal dock pinned
  at the bottom. Main is `position: relative` (the maximized dock overlays it).
- **Sidebar:** brand (Decko mascot 40px + `deckent` wordmark, weight 800,
  `-0.03em`) → "AI Agent Orchestrator" sub → sprint pill (mono id + phase badge) →
  Auditor badge (success) → nav groups **Konuş / İzle / Yönet** → footer
  (live dot, EN/TR toggle, theme toggle).
- **Nav link:** 8×12px pad, radius md, mono-ish label, `muted-foreground`.
  Hover `bg rgba(39,39,42,.5)`. **Active: `bg --secondary`, text `--foreground`,
  `border-left: 2px solid hsl(var(--gold))`** ← gold is the active marker.
- **Topbar:** left = mobile menu button (hamburger, ≤860px only) + mono sprint id
  + phase badge (info = teal-tinted); right = status dot + “connected”.

### 2 · Dashboard (default view)
- **Page head:** title "Dashboard" (xl–2xl, 700) + sub "Live sprint
  orchestration · N workers"; right = **New sprint** button (primary/teal filled).
- **Stat row:** 4 cards (`grid-cols-4`, 16px gap → 2 cols ≤860px): Active sprint
  (mono `#221`), Tasks complete (`1/4`, green dot), Executing now (`2`, amber
  dot), Current phase (`EXECUTE`, mono). Number `text-3xl` 700.
- **Sprint card:** title + id + phase badge; **segmented progress bar** (done =
  `--success` green segment, executing = **teal** segment, rest = `--secondary`);
  **Sprint lifecycle** = `PhaseTimeline`.
- **PhaseTimeline:** 8 nodes PLAN→SPAWN→EXECUTE→EVALUATE→FIX→RETRO→DECAY→CLEANUP.
  done = green 16px circle w/ check; **active = teal 20px circle, glow
  `0 0 0 3px rgba(84,168,156,.35)`, pulse**; future = hollow ring. Active cap
  text `#7FCDBE`.
- **Worker grid:** `repeat(auto-fill, minmax(290px,1fr))`, 16px gap (1 col on
  mobile). See Worker Card.

### 3 · Worker Card
- Radius lg, `--surface` bg, border, `shadow-lg`; **2px top status bar**
  (EXECUTING = teal gradient, DONE = green, ERROR = red, PAUSED = amber, IDLE =
  border-strong); hover `translateY(-2px)`.
- Head: mono worker id w/ `cpu` icon + **status chip** (colored dot + label;
  EXECUTING dot teal pulsing).
- Thin **progress bar** (teal; green when DONE).
- **Model / Provider / Environment** 3-col detail grid (1px gaps, hairline). Model
  shows tier label in **gold** (premium/standard/economy). Provider shows a 3px
  color bar (Claude clay / Codex green / Gemini blue).
- Task id (`file-code-2`), role (`hard-hat`). If EXECUTING: italic action line
  with a **spinning `loader` icon**. If DONE: green verdict line (`check-check`).
- Footer: elapsed (`clock`), heartbeat (`activity`, red) or files; **Kill** (only
  while EXECUTING, danger) + **Detail** buttons.

### 4 · Chat view
- `chat-main` (flex-1) + `task-sidebar` 280px (hidden ≤860px). Bot avatar bg =
  `--brand-bg`, icon teal-light; **user bubble = brand-600 (teal)**; slash-command
  bubble = `--brand-bg`/`--brand-fg` mono; bot bubble = `--secondary`. Send button
  = brand-600 teal. Slash-hint command names in teal-light. Slash commands:
  `/status /recall /help /clear`.

### 5 · Terminal dock  ← the headline upgrade
- Pinned bottom of main (`flex-shrink:0`). Dark `#0a0f0e`, **gold hairline top**
  (`box-shadow: 0 -1px 0 rgba(192,180,108,.18)`).
- **Tab bar:** sessions `deckent — start` / `claude (w-221-001)` / `bash`, each
  with a lucide icon. **Active tab:** `bg rgba(84,168,156,.1)`, border
  `rgba(84,168,156,.3)`, icon teal. Right-aligned **tools**: Clear (`eraser`),
  Maximize/Restore (`maximize-2`/`minimize-2`), Hide/Show (`chevron-down/up`).
- **Body:** mono, line-height 1.7, fixed **158px** height + `overflow-y:auto`
  (autoscroll to newest). Line colors: prompt/ok `#5fcaa9`, dim
  `--subtle-foreground`, teal `#7FCDBE`, gold `#D6CB8C`, err `#f0a3a3`.
- **Input row:** `deckent ❯` prompt + text input (caret teal). Placeholder
  “type a command — try “help”, “status”, “recall docker””.

### 6 · New Sprint modal
- Centered overlay (`rgba(0,0,0,.65)` + blur). 520px card, `--surface`, radius xl.
  DIRECTIVES.md `<textarea>` (mono). Footer: ghost Cancel + primary/teal
  “Plan & start”.

---

## Interactions & Behavior
- **Terminal — live tail:** while a session is open, append a plausible log line
  from that session’s pool every ~2.6s (Auditor scans, heartbeats, verdicts);
  cap the buffer (~60 lines) and autoscroll. Pause when collapsed.
- **Terminal — command input:** on Enter, echo `$ <cmd>` then a canned response.
  Implement: `help`, `status`, `workers`, `sprint`, `recall <query>`, `clear`
  (empties the active session), unknown → `command not found … try 'help'`.
  See `reference/Terminal.jsx` (`runCommand`) for exact outputs.
- **Terminal — maximize:** toggles the dock to `position:absolute; height:70vh`
  overlay (body becomes `flex:1`); restore returns to 158px. Collapse hides body
  + input, leaving the tab bar.
- **Sprint simulation (demo):** “New sprint” → seeds a sprint and animates
  PLAN→SPAWN→EXECUTE→EVALUATE with workers spawning and flipping to DONE (timed
  `setTimeout` sequence — see `reference/App.jsx` `launch()`). In the real app
  this is driven by SSE.
- **Kill worker:** sets status → IDLE, clears action/progress.
- **Language toggle EN/TR**, **live-connection dot** (green/amber/red).
- **Animations:** active-node + status-dot pulse (`dpulse` 1.6s), spinning
  `loader` icon (`spin` 1.4s linear), terminal input caret blink.

## Responsive behavior
- **≤860px:** sidebar becomes a fixed off-canvas drawer (`translateX(-100%)`),
  toggled by the topbar hamburger; a scrim overlay closes it; nav click closes it.
  Stat grid → 2 cols; chat task-sidebar hidden; content padding 16px; dock body
  118px.
- **≤520px:** stat grid stays 2-col (tight); worker grid 1 col; terminal shows
  only the active tab.

## State management
- `route` (active view), `navOpen` (mobile drawer), `lang`, `sprint`
  `{id,title,phase,total}`, `workers[]` `{id,model,provider,backend,role,status,
  taskId,elapsed,heartbeat,progress,action,verdict,files}`, modal flag.
- Terminal: per-session `feeds`, active tab, `open`, `max`, input value; a live
  interval appends lines. In production, replace mocked feeds/sim with your SSE
  stream and real command execution.

## Assets (`assets/`)
Brand images used by the console are bundled in `assets/` (so `reference/`
renders standalone — its `../assets/…` paths resolve here):

| File | Used by | Where |
|------|---------|-------|
| `assets/decko-conductor-glow.png` | `reference/Sidebar.jsx` | sidebar brand mark (40px) |
| `assets/favicon.png` | `reference/index.html` | favicon |
| `assets/decko-mascot.png` | (brand, courtesy) | alt mascot / marketing |
| `assets/verhex-logo.png` | (brand, courtesy) | Verhex parent attribution |

In your real app, keep using your existing brand assets — these are provided so
the reference renders and so you can match the exact sidebar mark.

- Icons: **Lucide** (already used by the app). Names referenced: `cpu, gem, zap,
  leaf, container, terminal, square-terminal, bot, hard-hat, file-code-2, loader,
  check-check, clock, activity, skull, chevron-right/-down/-up, eraser,
  maximize-2, minimize-2, menu, plus, message-circle, layout-dashboard, …`.

## Files (in `reference/`)
| File | Role |
|------|------|
| `index.html` | Entry — fonts, tokens, component load order |
| `dashboard.css` | All component/layout classes + the **theme override block** at top |
| `Primitives.jsx` | `Icon`, `Badge`, `Button`, `StatusDot`, `PhaseTimeline` |
| `Sidebar.jsx` | Left nav (brand, sprint pill, groups, footer toggles) |
| `Dashboard.jsx` | Page head, stat row, sprint card, **WorkerCard** grid |
| `Chat.jsx` | Chat history, slash input, notifications, task sidebar |
| `Terminal.jsx` | **Interactive terminal dock** (live tail + command input) |
| `NewSprintModal.jsx` | DIRECTIVES.md modal |
| `App.jsx` | Shell, routing, mobile nav, sprint simulation |

Plus, at the package root:
- `colors_and_type.css` — the base design-system tokens the reference consumes
  (zinc neutrals, status colors, type scale). `reference/index.html` links it.
- `deckent-theme.css` — paste-ready shadcn `.dark` variables (teal/gold).
- `deckent-theme.tailwind.js` — `theme.extend` fonts + brand/gold colors + the
  blue→brand find/replace map.
- `assets/` — brand images used by the reference (see Assets above).

### Preview the reference
The `reference/` bundle is **self-contained** — open `reference/index.html` in a
browser (no build step; React/Babel/Lucide load from CDN). The terminal uses
**clean monospace glyphs only** (no emoji-presentation characters), with
`font-variant-emoji: text` + `white-space: pre-wrap` so columns stay aligned.

## Screenshots (`screens/`)
Hi-fi reference captures of the re-themed console (1920-wide, dark teal/gold):

| File | Shows |
|------|-------|
| `screens/01-dashboard-default.png` | Default Dashboard — sidebar (gold active nav), stat row, and the docked terminal with its command input |
| `screens/02-terminal-maximized.png` | Terminal **maximized** — full live-streaming session log (Auditor scans, heartbeats, verdicts) |
| `screens/03-sprint-lifecycle.png` | Sprint card — **teal** segmented progress + the 8-phase lifecycle timeline (active EXECUTE node glowing teal) |
| `screens/04-chat.png` | Chat view — teal bot avatar, notifications, task-context sidebar, teal send button |

> The worker-card grid is fully specified under **Screens › 3 · Worker Card**
> and rendered in `reference/Dashboard.jsx` (`WorkerCard`).

## Acceptance checklist
- [ ] Fonts: UI = Hanken Grotesk, mono = IBM Plex Mono everywhere.
- [ ] No blue accent remains; functional accent is teal `#54A89C`.
- [ ] Active nav link has a **gold** left border; worker tier labels are gold.
- [ ] Progress (exec segment), EXECUTING worker bar, and active timeline node are teal; DONE is still green.
- [ ] Terminal: tabs switch sessions, log tails live, commands work, maximize/collapse work, autoscrolls.
- [ ] ≤860px: sidebar drawer + hamburger; grids collapse; no horizontal scroll.
- [ ] Status colors (green/red/amber) and provider colors unchanged.
