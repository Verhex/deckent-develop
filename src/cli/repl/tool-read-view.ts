import { displayWidth, segmentGraphemes } from './cursor-model.js';
import { clipTerminalCells } from './dual-stream.js';
import type { ToolReadProjection, ToolReadRow } from './tool-read-model.js';
import type { ToolReadLabels } from './tool-read-labels.js';

export interface ToolReadNavState { readonly selectedId: string | null; readonly detailOpen: boolean; readonly page: number; }
export const EMPTY_TOOL_READ_NAV: ToolReadNavState = { selectedId: null, detailOpen: false, page: 0 };
export type ToolReadNavAction = 'up' | 'down' | 'page-up' | 'page-down' | 'open' | 'close';
export interface ToolReadKey { upArrow?: boolean; downArrow?: boolean; pageUp?: boolean; pageDown?: boolean; return?: boolean; escape?: boolean; }

export function mapToolReadKey(input: string, key: ToolReadKey): ToolReadNavAction | null {
  if (key.escape) return 'close';
  if (key.return) return 'open';
  if (key.pageUp) return 'page-up';
  if (key.pageDown) return 'page-down';
  if (key.upArrow || input === 'k') return 'up';
  if (key.downArrow || input === 'j') return 'down';
  return null;
}

export function selectedToolReadId(selectedId: string | null, rows: readonly ToolReadRow[]): string | null {
  return selectedId !== null && rows.some((row) => row.id === selectedId) ? selectedId : (rows[0]?.id ?? null);
}

export function reduceToolReadNav(state: ToolReadNavState, action: ToolReadNavAction, rows: readonly ToolReadRow[], detailPages = 1, listPageRows = 1): ToolReadNavState {
  const selectedId = selectedToolReadId(state.selectedId, rows);
  if (action === 'open') return selectedId === null ? state : { selectedId, detailOpen: true, page: 0 };
  if (action === 'close') return state.detailOpen ? { ...state, detailOpen: false, page: 0 } : state;
  if (state.detailOpen && action === 'page-up') return { ...state, page: Math.max(0, state.page - 1) };
  if (state.detailOpen && action === 'page-down') return { ...state, page: Math.min(Math.max(0, detailPages - 1), state.page + 1) };
  if (!state.detailOpen && action === 'page-up') {
    if (rows.length === 0) return state;
    const index = Math.max(0, rows.findIndex((row) => row.id === selectedId));
    return { ...state, selectedId: rows[Math.max(0, index - Math.max(1, listPageRows))]!.id };
  }
  if (!state.detailOpen && action === 'page-down') {
    if (rows.length === 0) return state;
    const index = Math.max(0, rows.findIndex((row) => row.id === selectedId));
    return { ...state, selectedId: rows[Math.min(rows.length - 1, index + Math.max(1, listPageRows))]!.id };
  }
  if (rows.length === 0) return { ...state, selectedId: null };
  const current = Math.max(0, rows.findIndex((row) => row.id === selectedId));
  const next = action === 'up' ? (current - 1 + rows.length) % rows.length : (current + 1) % rows.length;
  return { selectedId: rows[next]!.id, detailOpen: state.detailOpen, page: 0 };
}

export function toolReadStateLine(model: ToolReadProjection, labels: ToolReadLabels, separator = '·'): string | null {
  if (model.state === 'loading') return labels.loading;
  if (model.state === 'valid') return null;
  if (model.state === 'empty') return labels.empty;
  if (model.state === 'raw') return labels.rawComplete;
  if (model.state === 'partial') return labels.partial + (model.reasonCode ? ` ${separator} ${labels.reason(model.reasonCode)}` : '');
  if (model.state === 'unavailable') return labels.unavailable + (model.reasonCode ? ` ${separator} ${labels.reason(model.reasonCode)}` : '');
  return labels.schemaUnknown + (model.reasonCode ? ` ${separator} ${labels.reason(model.reasonCode)}` : '');
}

/** Printable, cell-bounded list row. Detail retains every field untrimmed. */
export function formatToolReadListRow(row: ToolReadRow, focused: boolean, columns: number, overflow: string, focusMarker: string): string {
  const prefix = focused ? `${focusMarker} ` : '  ';
  return prefix + clipTerminalCells(row.title, Math.max(1, columns - displayWidth(prefix)), overflow);
}

export function toolReadDetailPages(row: ToolReadRow, labels: ToolReadLabels, columns: number, pageRows: number): readonly string[][] {
  const width = Math.max(1, columns - 2);
  const lines = [row.title, ...row.fields.map((field) => labels.field(field.key, field.value))];
  const wrapped: string[] = [];
  for (const line of lines) {
    // Keep the entire source value reachable by splitting by grapheme/display
    // cells rather than terminal-truncating it. The card owns paging, not a
    // hidden re-read. A zero-width control sequence is handled by the display
    // sanitization boundary before this view receives the value.
    let part = '';
    let used = 0;
    for (const grapheme of segmentGraphemes(line)) {
      const cells = displayWidth(grapheme);
      if (part.length > 0 && used + cells > width) {
        wrapped.push(part);
        part = '';
        used = 0;
      }
      part += grapheme;
      used += cells;
    }
    wrapped.push(part);
  }
  const size = Math.max(1, pageRows);
  return Array.from({ length: Math.max(1, Math.ceil(wrapped.length / size)) }, (_, page) => wrapped.slice(page * size, (page + 1) * size));
}
