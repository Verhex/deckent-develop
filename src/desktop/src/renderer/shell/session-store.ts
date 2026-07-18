/**
 * D4-3 — zustand UI-state store (approved stack, locked 5.0.14 at D4-0):
 * holds the live DaemonSession the shell's transport client is built from.
 * Server-state (flows/events/approvals) is TanStack Query's job — this store
 * carries only the session identity + the strings map handed over from the
 * plain-DOM bootstrap, so any component can read them without prop-drilling.
 */
import { create } from 'zustand';
import type { DaemonSession } from '../../shared/desktop-api.js';
import type { RadioMessage } from './radio-fold.js';

export interface ShellState {
  session: DaemonSession | null;
  strings: Record<string, string>;
  setSession(session: DaemonSession | null): void;
  setStrings(strings: Record<string, string>): void;
  // KABUL Gün-1 pürüz-4 (Alperen canlı-bulgu): route-değişimi lazy-view'ları
  // unmount eder — Telsiz-transkripti ve Makine-Dairesi sekme-seçimi YEREL
  // state'te kalınca siliniyordu ("kaldığım yerden devam etmiyor"). İkisi de
  // store'da yaşar: görünüme dönünce kaldığın yerden (PTY içeriği zaten
  // sunucu-taraflı ring-buffer replay'iyle geri gelir, inv#4).
  radioMessages: readonly RadioMessage[];
  setRadioMessages(update: (list: readonly RadioMessage[]) => readonly RadioMessage[]): void;
  engineActiveId: string | null;
  setEngineActiveId(id: string | null): void;
}

export const useShellStore = create<ShellState>((set) => ({
  session: null,
  strings: {},
  setSession: (session) => set({ session }),
  setStrings: (strings) => set({ strings }),
  radioMessages: [],
  setRadioMessages: (update) => set((s) => ({ radioMessages: update(s.radioMessages) })),
  engineActiveId: null,
  setEngineActiveId: (engineActiveId) => set({ engineActiveId }),
}));
