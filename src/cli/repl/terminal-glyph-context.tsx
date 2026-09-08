import { createContext, useContext, type ReactElement, type ReactNode } from 'react';
import { resolveTerminalGlyphs, type TerminalGlyphs } from '../helpers/terminal-glyphs.js';

const DEFAULT_TERMINAL_GLYPHS = resolveTerminalGlyphs(false);

export const TerminalGlyphContext = createContext<TerminalGlyphs>(DEFAULT_TERMINAL_GLYPHS);

export function TerminalGlyphProvider(props: { glyphs: TerminalGlyphs; children: ReactNode }): ReactElement {
  return <TerminalGlyphContext.Provider value={props.glyphs}>{props.children}</TerminalGlyphContext.Provider>;
}

export function useTerminalGlyphs(): TerminalGlyphs {
  return useContext(TerminalGlyphContext);
}
