---
name: deckent-terminal-design
description: Use for Deckent CLI/TUI ergonomics, information hierarchy, keyboard interaction, command palette, logs, worker trees, run inspection, ANSI color tiers, TTY behavior, piping, or Terminal/Desktop semantic parity. Do not use for generic CLI backend implementation.
---

# Deckent Terminal Design

## Objective

Make Terminal a first-class control and operator surface, not a reduced Desktop. Load
deckent-design-dna and the relevant product or agentic skill.

Respect current workspace ownership. If implementation output such as src/cli is outside the
active lane, produce the exact design/interaction contract and coordinate before editing it.

## Output modes

Design and test each applicable mode:

| Mode | Contract |
|---|---|
| Interactive TTY | Rich hierarchy, keyboard control and live updates |
| Non-interactive TTY | Stable progress and final result without required input |
| Pipe or redirect | Deterministic machine-safe output; no cursor control |
| NO_COLOR or dumb terminal | Meaning preserved without color or animation |
| Truecolor, 256, 16 color | Honest semantic degradation |
| Narrow or resized viewport | Reflow/truncation with access to full values |
| Lost connection | Last-known state, freshness and recovery are explicit |

Machine-readable output is a separate contract; never decorate it.

## Interaction rules

- Use stable text hierarchy, alignment and whitespace before color.
- Emoji are not interface icons.
- Every status has a textual carrier.
- Keyboard help is discoverable and scoped to the current mode.
- Focus and selection remain visible after streaming updates.
- Pause, cancel, retry and approval shortcuts state their exact target.
- Logs preserve raw content, timestamps and attribution while offering structured navigation.
- Truncation never hides an identifier without a way to reveal or copy it.
- Long operations provide state, elapsed time, freshness and the next safe action.
- Screen updates avoid flicker, scroll theft and inaccessible animation.

## Cross-platform behavior

Account for POSIX shells, PowerShell, Windows Terminal, cmd where supported, WSL, SSH and common
CI environments. Resolve Unicode width, wrapping, alternate-screen behavior, signal handling,
clipboard assumptions and keybinding collisions honestly. Unsupported capability fails explicitly.

## Accessibility and i18n

- Preserve reading order in the output stream.
- Avoid rapid live-region-like churn and decorative spinners.
- Respect reduced animation behavior and color suppression.
- Use the existing message system for all user-visible text.
- Test Turkish glyphs, long translations, RTL-sensitive composition assumptions and narrow widths.
- Never rely on case, punctuation shape or color alone for state.

## Parity contract

Terminal and Desktop share authoritative nouns, lifecycle, permissions, evidence and action
consequences. Their navigation and density may differ. Dashboard remains observability only.

## Verification

Capture representative real-binary sessions for supported color tiers, pipe output, resize,
keyboard paths, failure/recovery and localization. Token changes use design-tokens-pipeline.
Finish with deckent-design-critic.
