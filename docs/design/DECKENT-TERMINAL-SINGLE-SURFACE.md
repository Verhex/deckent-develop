# Deckent Terminal Causal Workline + Work Ledger Contract

> Status: Causal Workline with contextual Work Ledger accepted; platform-feasibility contract active · 2026-08-25
>
> Surface: Terminal
>
> Scope: product, interaction and visual target only; no `src/cli` implementation claim
>
> Prototype: `docs/design/prototypes/terminal-single-surface-directions.html`
>
> Platform matrix: `docs/design/DECKENT-TERMINAL-PLATFORM-MATRIX.md`

## 1. Decision boundary

Terminal has one stable operator surface. Basic and Advanced are Desktop-only disclosure modes.
Terminal does not acquire density modes, parallel shells or a simplified/expert switch.

Ask, Run and Control are authority postures. They may change which commands are admissible after
the production risk gate is wired, but they do not change layout, navigation or information
density. TTY, pipe, NO_COLOR, color depth and viewport width are environment conditions for this
same surface, not product modes.

Feasibility is part of the design, not a later implementation concern. A region or interaction is
invalid unless it maps to available Terminal primitives and has an honest behavior for macOS,
Linux, Windows native, WSL, remote multiplexers and non-interactive output. Unsupported
capabilities dependency-bind or remove the behavior; the visual study cannot overrule the runtime.

## 2. User job

The Terminal must let a developer or expert operator answer and act on five questions without
leaving the causal work stream:

1. Which tenant, workspace, environment and object am I controlling?
2. What is running now, what materially changed and how fresh is that knowledge?
3. Which decision or intervention has the highest operational priority?
4. What exact action, scope, authority, consequence and recovery limit am I accepting?
5. Which evidence proves the result and where is the durable record?

The same surface covers software delivery and governed business operations. Domain language may
change; lifecycle, authority, evidence and intervention semantics do not.

## 3. Single-surface anatomy

The target has five stable regions in one reading order:

1. **Scope line** — product, tenant/workspace/environment, connection freshness and authority
   posture. It replaces separate mode and health blocks.
2. **Work anchor** — selected outcome, exact progress, current phase and last material change.
   It replaces a generic ready/spinner row and keeps the business outcome visible.
3. **Causal stream** — user intent, plan, policy, operation, side effect, evidence and settlement
   remain attributable in native scrollback. Routine events recede; exceptions change wording and
   position, not merely color.
4. **Focus rail** — exactly one selected object or highest-priority pending decision. Approval,
   plan preview, run detail and recovery use one anatomy rather than stacking component-specific
   cards. Additional pending items appear only as an exact count and open through the same rail.
5. **Composer line** — pinned input, context references, command discovery and the one current
   keyboard hint. Provider, model, token usage and session identity appear here only when material
   or explicitly requested.

The focus rail is a logical region, not necessarily a permanent right pane. At wide widths it may
sit beside the stream; at narrow widths it occupies the stream region and returns to the preserved
selection on Escape.

The causal stream has one contextual alternate lens: **Work Ledger**. `/runs --follow` temporarily
replaces the bounded dynamic stream/focus region with a live, stable-identity work index. It does
not erase settled native scrollback, open a second shell or create another input owner. Selecting a
row returns to Workline focused on that canonical work identity; Escape returns without changing
selection.

## 4. Shared focus-rail contract

Every focus item begins with identity, current condition and age, then shows the facts required for
the available decision.

### Approval

- requestor and responsible principal;
- proposed action and affected resource;
- tenant/workspace/environment and bounded scope;
- source policy and effective authority;
- expiry, risk and timeout/default outcome;
- downstream consequence and known rollback/reconciliation limit;
- safe, redacted arguments;
- approve-once, deny and details. A longer grant is a separate governed flow.

### Plan preview

- intended outcome and exact task/work-item count;
- gate, policy and topology verdicts as separate textual facts;
- scope/collision findings before approval;
- plan digest and evidence source;
- approve, reject or revise. Starting execution remains a separately attributable transition.

### Run or work item

- canonical identity, intent, lifecycle and freshness;
- exact progress and responsible worker/principal;
- current operation, next expected transition and evidence state;
- pause-at-boundary, cancel-with-partial-effects, retry-from-checkpoint or reconcile only when the
  runtime exposes that exact capability.

Only one focus item owns input. Closing or changing the view never claims to pause or cancel work.

## 5. Accepted composition and retained direction evidence

All candidates preserve the same objects, actions and single-surface rule.

### A — Causal Workline core

The causal stream remains the dominant surface. A compact work anchor sits above it; one horizontal
decision dock appears immediately above the composer when attention is required. Details expand
in place and push older stream content into native scrollback.

- **Strengths:** closest to Terminal's natural reading model; preserves current Ink `<Static>`
  scrollback; lowest cognitive and implementation discontinuity; calm at idle; strong causal chain.
- **Risk:** dense approval detail can become tall on narrow terminals; the dock needs disciplined
  summarization and an explicit details step.
- **Long-session behavior:** completed output remains native scrollback; only partial output, focus
  and composer redraw.

### B — Focus Workspace

At wide widths the stream occupies the main column and the selected object occupies a stable right
column. Narrow widths replace the stream region with the focused object until Escape.

- **Strengths:** strongest persistent object context and enterprise inspection; good for long-lived
  incidents or approvals.
- **Risk:** risks reproducing Desktop-pane density and reducing usable log width; more resize and
  focus complexity.
- **Long-session behavior:** stable selection survives live reordering; the right column must never
  steal scroll or input.

### C — Work Ledger lens

The same bounded dynamic region becomes a compact multi-run ledger only when explicitly opened.
Selecting a row returns to Workline with that canonical identity focused; Enter may first reveal
bounded detail when the decision requires review. Conversation and settled output remain in native
scrollback rather than competing beside the ledger.

- **Strengths:** strongest many-run scanning and operations control; efficient for expert fleets.
- **Risk:** a fleet-scale ledger needs filtering, pagination and canonical query authority not yet
  proven end to end; the first admitted lens is bounded to active and attention-requiring work.
- **Long-session behavior:** bounded rows and inline expansion avoid card stacks, but the ledger
  cannot replace raw log/evidence scrollback.

### Owner decision — A+C accepted

**Causal Workline with contextual Work Ledger** is the accepted Terminal grammar, subject to the
platform-feasibility contract. A remains the default causal shell; C is promoted from a standalone
candidate into the `/runs --follow` lens inside that shell. They are never simultaneous permanent
panes. B remains comparison evidence only. This composition adds fleet/work scanning without
inventing a Terminal dashboard, changing product mode or splitting input ownership.

## 6. Interaction contract

| Intent | Target behavior |
|---|---|
| Enter a goal or instruction | Composer submits one attributable user turn |
| Discover commands | `/` opens a localized, context-filtered command list; full catalog is searchable |
| Reference context | `@` selects scoped project files/resources; expansion limits remain explicit |
| Open Work Ledger | `/runs --follow` replaces the bounded dynamic region with active and attention-requiring work; settled scrollback remains intact |
| Navigate Work Ledger | Arrow/J-K moves a stable canonical identity across live refresh; row index is never selection authority |
| Activate ledger selection | Enter returns to Workline focused on the selected identity, or opens its bounded review when required |
| Leave Work Ledger | Escape returns to Workline without changing work state or claiming cancellation |
| Select stream or run item | Arrow/J-K navigation moves a stable focus identity, not a transient row index |
| Open focused detail | Enter conditionally replaces the bounded dynamic region; no floating or CSS-style overlay is implied |
| Return | Escape closes detail or returns focus; it does not cancel execution |
| Interrupt | A dedicated interrupt gesture names the exact turn/process and is shown only when a real abort seam exists |
| Approve | A visible key opens the complete bounded approval review before accepting; no pointer-only or one-key decision from an unseen summary |
| Pause/cancel/retry | Names boundary, side effects, checkpoint and race condition before mutation |
| Inspect raw evidence | Details reveal raw/time/attribution without replacing the stable final record |

Keyboard hints are contextual. The interface does not print every shortcut permanently.

## 7. Visual language

- Production Terminal never selects or ships a font. It inherits the operator's configured
  monospace face; Geist Mono is used only by the HTML reference capture.
- Typography, whitespace and column alignment establish hierarchy before color.
- Production Terminal never forces a graphite or dark background. It uses the terminal's default
  background and only capability-resolved foreground semantic roles. The prototype's oxide accent
  is a reference meaning, not a guaranteed color value.
- Expected progress is quiet. Approval, stale knowledge, partial side effects and contradicted
  evidence change the sentence and focus order.
- No rounded status pills, generic card stack, gradients, glow, emoji icons or decorative spinner.
- Every semantic color has a word, marker and stable position equivalent. Unicode line glyphs are
  optional decoration with an ASCII fallback, never structural meaning.

## 8. Environment behavior

The normative capability and evidence matrix is
`docs/design/DECKENT-TERMINAL-PLATFORM-MATRIX.md`. Shell names do not imply Terminal capability;
the same PowerShell, cmd or Bash process can run under materially different hosts.

- **Wide TTY:** stream plus optional focus column; one input owner.
- **Narrow/resized TTY:** one column; focused detail temporarily occupies the stream region;
  identifiers wrap or expose a copy/reveal path, never silently disappear.
- **Non-interactive TTY:** stable progress records and final outcome; no required key input.
- **Pipe/redirect:** deterministic undecorated records; no cursor control, animation or focus state.
- **NO_COLOR/dumb:** identical wording and markers without ANSI dependence.
- **16/256/truecolor:** semantic roles degrade to the available tier without changing meaning.
- **Disconnected/stale:** last-known timestamp, affected scope and recovery action remain visible.

## 9. Prototype boundary

The HTML is an interactive design-review instrument, not a browser implementation proposal. Its
outer direction, scenario, width, background and glyph controls are reviewer tooling outside the
product surface. DOM buttons remain clickable only so a reviewer can traverse states; their visible
labels describe the primary Terminal key or slash-command path. CSS positioning represents a
conditional replacement of the bounded Ink dynamic region, never a floating window, mouse
requirement or alternate-screen dependency. Its bundled font and background exist only to make
captures reproducible.

## 10. Grounded capability map

Current source already proves stable scrollback, pinned input, streaming, queued input, approval
events and decisions, plan preview, `/runs --follow` in the shared dynamic region, stable `flowId`
selection across live reorder, list/detail navigation, bounded run decisions, session resume, `@`
references, TTY/non-TTY branching and localization seams. The accepted A+C design re-composes those
capabilities; it does not claim new backend authority.

The following are implementation blockers for an honest production surface:

1. `/interrupt` and Escape currently clear pending input but do not abort the active provider turn.
2. Ask/Run/Control's risk ladder exists as a state machine, but the App does not call its full
   action gate; Ask and Run therefore do not yet provide the promised authority distinction.
3. The slash catalog carries a large hardcoded Turkish description surface and incomplete
   category/risk tagging; it must become localized and context-filterable.
4. Approval's collapsed render omits requestor, scope, expiry, default outcome, consequence and
   rollback/reconciliation limits.
5. Queue preview uses a fixed character ceiling instead of terminal width/display cells.
6. Approval, plan, inbox, live footer, phase anchor and provider footer are separate vertical
   layers; stdin ownership is safe, but cognitive priority is still component-order driven.
7. Terminal semantic colors are component-local literals rather than a generated token projection.
8. The current inbox is bounded to a local cross-process scan; enterprise history search,
   pagination and multi-tenant query authority are not yet production-proven.

No prototype interaction may be reported as production-wired until these exact paths have real
binary evidence.

## 11. Acceptance evidence for implementation

- accepted Causal Workline + Work Ledger region-to-Ink primitive map;
- en/tr rendered parity and no hardcoded user-facing strings;
- 120, 80 and 40-column captures; dynamic resize with stable focus;
- truecolor, ANSI-256, ANSI-16, NO_COLOR/dumb and redirected output captures;
- real active-turn interrupt proof or an honestly unavailable control;
- approval review containing all required authority and consequence fields;
- multi-run reordering with selection identity preserved;
- disconnect, stale, expiry, denial, partial side effect and recovery cases;
- real-binary keyboard, screen-reader reading-order and long-session scrollback evidence;
- design-token drift and Terminal/Desktop semantic-parity checks.
