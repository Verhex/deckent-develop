// src/cli/repl/ink-palette-context.tsx
// ═══ TERMINAL-READABILITY-001 — the Ink palette as React context ═══
//
// run.tsx resolves the tier ONCE from the color gate (helpers/theme.ts) and
// provides the palette; every card reads it with `useInkPalette()`. The default
// value is the ansi16 (host-theme-mapped) palette so a component rendered
// without a provider — tests, the ink probe — still takes named colors only;
// under a suppressed gate the Ink color env (FORCE_COLOR=0, terminal-surface.ts)
// makes chalk drop them, and run.tsx provides the 'none' palette explicitly.

import { createContext, useContext, type ReactElement, type ReactNode } from 'react';
import { resolveInkPalette, type InkPalette } from './ink-palette.js';

const DEFAULT_PALETTE = resolveInkPalette('ansi16');

/** Exported for class components (an error boundary reads it via `contextType`). */
export const InkPaletteContext = createContext<InkPalette>(DEFAULT_PALETTE);

export interface InkPaletteProviderProps {
  palette: InkPalette;
  children: ReactNode;
}

export function InkPaletteProvider({ palette, children }: InkPaletteProviderProps): ReactElement {
  return <InkPaletteContext.Provider value={palette}>{children}</InkPaletteContext.Provider>;
}

/** The role palette for the tier the surface admitted. */
export function useInkPalette(): InkPalette {
  return useContext(InkPaletteContext);
}
