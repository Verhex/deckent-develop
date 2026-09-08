import { Box, Text, useInput } from 'ink';
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useInkPalette } from './ink-palette-context.js';
import type { ToolReadProjection } from './tool-read-model.js';
import type { ToolReadLabels } from './tool-read-labels.js';
import {
  EMPTY_TOOL_READ_NAV,
  formatToolReadListRow,
  mapToolReadKey,
  reduceToolReadNav,
  selectedToolReadId,
  toolReadDetailPages,
  toolReadStateLine,
  type ToolReadNavState,
} from './tool-read-view.js';
import { resolveMenuWindow } from './picker.js';

export interface ToolReadCardProps {
  readonly open: boolean;
  readonly model: ToolReadProjection | null;
  readonly labels: ToolReadLabels;
  readonly columns: number;
  readonly rows: number;
  readonly overflow: string;
  readonly ascii: boolean;
  readonly isActive: boolean;
  readonly onClose: () => void;
  /** Bounded opaque raw window for captures too large/partial for JSON parsing. */
  readonly raw?: { readonly text: string; readonly offset: number; readonly totalBytes: number; readonly onPage: (direction: -1 | 1) => void };
  readonly stderrRaw?: ToolReadCardProps['raw'];
}

/**
 * Contextual, immutable read-model card. It receives a completed typed
 * projection only: navigation never polls, re-spawns a CLI command, or reads a
 * content path. The App remains owner of focus lifecycle and invocation truth.
 */
export function ToolReadCard(props: ToolReadCardProps): ReactElement | null {
  const { open, model, labels, columns, rows, overflow, ascii, isActive, onClose, raw, stderrRaw } = props;
  const [nav, setNav] = useState<ToolReadNavState>(EMPTY_TOOL_READ_NAV);
  const navRef = useRef(nav);
  navRef.current = nav;
  const palette = useInkPalette();
  const execution = model?.execution;
  const executionRows = execution ? [{ id: 'read:execution', title: '', titleKind: 'execution' as const, fields: [
    ...(execution.command ? [{ key: 'command', value: execution.command }] : []),
    { key: 'exitCode', value: String(execution.exitCode) },
    { key: 'signal', value: String(execution.signal) },
    { key: 'reason', value: String(execution.reason) },
    ...(execution.stderr ? [{ key: 'stderr.preview', value: execution.stderr }] : []),
    ...(execution.stderrReadReason ? [{ key: 'stderr.readReason', value: execution.stderrReadReason }] : []),
  ] }] : [];
  const observation = model?.observation;
  const captureRows = observation ? [{ id: 'read:capture', title: '', titleKind: 'capture' as const, fields: [
    { key: 'observedAt', value: observation.observedAt },
    { key: 'count', value: model?.count === null || model?.count === undefined ? labels.unknownCount : String(model.count) },
    { key: 'stdout.observedBytes', value: String(observation.stdoutObservedBytes) },
    { key: 'stdout.storedBytes', value: String(observation.stdoutStoredBytes) },
    { key: 'stdout.complete', value: String(observation.stdoutComplete) },
    { key: 'stdout.observedSha256', value: observation.stdoutObservedSha256 },
    { key: 'stdout.storedSha256', value: String(observation.stdoutStoredSha256) },
    { key: 'stderr.observedBytes', value: String(observation.stderrObservedBytes) },
    { key: 'stderr.storedBytes', value: String(observation.stderrStoredBytes) },
    { key: 'stderr.complete', value: String(observation.stderrComplete) },
    { key: 'stderr.observedSha256', value: observation.stderrObservedSha256 },
    { key: 'stderr.storedSha256', value: String(observation.stderrStoredSha256) },
  ] }] : [];
  const readRows = [...(raw ? [{ id: 'raw', title: '', titleKind: 'summary' as const, fields: [{ key: 'bytes', value: raw.text }] }] : (model?.rows ?? [])),
    ...(stderrRaw ? [{ id: 'raw:stderr', title: labels.sectionStderr, fields: [{ key: 'stderr', value: stderrRaw.text }] }] : []), ...captureRows, ...executionRows];
  const snapshotLine = observation ? labels.snapshot.replace('{at}', observation.observedAt).replace('{count}', model?.count === null || model?.count === undefined ? labels.unknownCount : String(model.count)) : null;
  const stateLine = model ? toolReadStateLine(model, labels) : null;
  const executionFailed = execution && (execution.exitCode !== 0 || execution.signal !== null || execution.reason !== null);
  const headerRows = Number(stateLine !== null) + Number(Boolean(executionFailed)) + Number(snapshotLine !== null);
  const selectedId = selectedToolReadId(nav.selectedId, readRows);
  const selectedRaw = selectedId === 'raw' ? raw : selectedId === 'raw:stderr' ? stderrRaw : undefined;
  const selected = readRows.find((row) => row.id === selectedId) ?? null;
  const pageRows = Math.max(1, rows - 7 - headerRows);
  const selectedIndex = Math.max(0, readRows.findIndex((row) => row.id === selectedId));
  const listWindow = resolveMenuWindow(readRows.length, selectedIndex, Math.max(1, rows - 6 - headerRows));
  // Box borders + padding consume four cells before any Text child renders.
  // Navigation changes only the selected page. Re-wrap a complete potentially
  // large detail only when its immutable source, labels or geometry changes.
  const pages = useMemo(() => selected ? toolReadDetailPages(selected, labels, Math.max(1, columns - 4), pageRows) : [[]],
    [model, selectedId, raw?.text, stderrRaw?.text, labels, columns, pageRows]);
  const sectionTitle = (kind: NonNullable<ToolReadProjection['rows'][number]['titleKind']> | undefined): string | undefined =>
    kind === 'authority' ? labels.sectionAuthority : kind === 'summary' ? labels.sectionSummary : kind === 'capture' ? labels.sectionCapture : kind === 'execution' ? labels.sectionExecution
      : kind === 'tsc' || kind === 'vitest' || kind === 'honesty' || kind === 'observability' ? labels.auditSections[kind] : undefined;
  const selectedTitle = sectionTitle(selected?.titleKind) ?? selected?.title;
  const previousRawOffset = useRef<{ id: string | null; offset: number | undefined }>({ id: selectedId, offset: selectedRaw?.offset });
  useEffect(() => {
    const previous = previousRawOffset.current;
    previousRawOffset.current = { id: selectedId, offset: selectedRaw?.offset };
    if (selectedRaw && previous.id === selectedId && previous.offset !== undefined && selectedRaw.offset !== previous.offset) {
      setNav((current) => ({ ...current, page: selectedRaw.offset > previous.offset! ? 0 : Math.max(0, pages.length - 1) }));
    }
  }, [selectedRaw?.offset, selectedId, pages.length]);

  useEffect(() => {
    if (!open) { setNav(EMPTY_TOOL_READ_NAV); return; }
    setNav((current) => ({ ...current, selectedId: selectedToolReadId(current.selectedId, readRows) }));
  }, [open, model]); // model is an immutable one-shot snapshot

  useEffect(() => {
    setNav((current) => current.detailOpen && current.page >= pages.length
      ? { ...current, page: Math.max(0, pages.length - 1) }
      : current);
  }, [columns, rows, pages.length]);

  useInput((input, key) => {
    const action = mapToolReadKey(input, key);
    if (!action) return;
    if (selectedRaw && navRef.current.detailOpen && (action === 'page-up' || action === 'page-down')) {
      const atFirst = navRef.current.page === 0;
      const atLast = navRef.current.page >= pages.length - 1;
      if ((action === 'page-up' && atFirst) || (action === 'page-down' && atLast)) {
        selectedRaw.onPage(action === 'page-up' ? -1 : 1);
        return;
      }
    }
    if (action === 'close' && !navRef.current.detailOpen) { onClose(); return; }
    setNav((current) => reduceToolReadNav(current, action, readRows, pages.length, pageRows));
  }, { isActive: open && isActive });

  if (!open || model === null) return null;
  if (nav.detailOpen && selected) {
    const page = pages[Math.min(nav.page, pages.length - 1)] ?? [];
    return (
      <Box flexDirection="column" borderStyle={ascii ? 'single' : 'round'} borderColor={palette.accent.color} paddingX={1}>
        <Text>{labels.title[model.kind]}</Text>
        {snapshotLine !== null && <Text wrap="truncate">{snapshotLine}</Text>}
        {stateLine !== null && <Text wrap="truncate">{stateLine}</Text>}
        {executionFailed && <Text wrap="truncate">{labels.executionFailed}</Text>}
        {page.map((line, index) => <Text key={`${nav.page}:${index}:${line}`}>{nav.page === 0 && index === 0 && selectedTitle !== undefined ? selectedTitle : line}</Text>)}
        {selectedRaw ? <Text {...palette.muted}>{`${selectedRaw.offset + 1}-${Math.min(selectedRaw.totalBytes, selectedRaw.offset + 8 * 1024)}/${selectedRaw.totalBytes}`}</Text> : pages.length > 1 && <Text {...palette.muted}>{labels.page.replace('{current}', String(nav.page + 1)).replace('{total}', String(pages.length))}</Text>}
        <Text {...palette.muted}>{labels.detailHint}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" borderStyle={ascii ? 'single' : 'round'} borderColor={palette.accent.color} paddingX={1}>
      <Text>{labels.title[model.kind]}</Text>
      {snapshotLine !== null && <Text wrap="truncate">{snapshotLine}</Text>}
      {stateLine !== null && <Text wrap="truncate">{stateLine}</Text>}
      {executionFailed && <Text wrap="truncate">{labels.executionFailed}</Text>}
      {listWindow.lo > 0 && <Text {...palette.muted}>{labels.moreAbove.replace('{n}', String(listWindow.lo))}</Text>}
      {readRows.slice(listWindow.lo, listWindow.hi).map((row) => {
        const focused = row.id === selectedId;
        const title = sectionTitle(row.titleKind) ?? row.title;
        return <Text key={row.id} {...(focused ? palette.focus : {})}>{formatToolReadListRow({ ...row, title }, focused, Math.max(1, columns - 4), overflow, ascii ? '>' : '❯')}</Text>;
      })}
      {listWindow.hi < readRows.length && <Text {...palette.muted}>{labels.moreBelow.replace('{n}', String(readRows.length - listWindow.hi))}</Text>}
      <Text {...palette.muted}>{labels.listHint}</Text>
    </Box>
  );
}
