/**
 * SSOT: src/desktop/src/shared/desktop-api.ts — sync: scripts/lint-desktop-api-sync.mjs
 *
 * Hand-mirrored, minimal ambient declaration of `window.deckentDesktop` for the
 * dashboard sub-package. The dashboard is a separate tsc/Vite build unit from
 * src/desktop (its own tsconfig + node_modules) and cannot import across that
 * boundary, so this file re-declares the `DeckentDesktopApi` surface by hand
 * instead. scripts/lint-desktop-api-sync.mjs diffs the top-level member names
 * of `DeckentDesktopApi` in both files on every run and fails on drift —
 * change src/desktop/src/shared/desktop-api.ts FIRST, then mirror the change
 * here (member names + shape only; nested payload types may stay widened).
 */

declare global {
  interface DeckentDesktopApi {
    isDesktop: true;
    connections: {
      list(): Promise<unknown[]>;
      add(profile: unknown): Promise<unknown>;
      remove(id: string): Promise<void>;
      connect(id: string): Promise<unknown>;
      disconnect(id: string): Promise<void>;
    };
    daemon: {
      onStatus(cb: (event: unknown) => void): () => void;
    };
    app: {
      getVersion(): Promise<string>;
      openExternal(url: string): Promise<void>;
      getStrings(): Promise<Record<string, string>>;
    };
    window: {
      minimize(): void;
      maximize(): void;
      close(): void;
    };
  }

  interface Window {
    deckentDesktop?: DeckentDesktopApi;
  }
}

export {};
