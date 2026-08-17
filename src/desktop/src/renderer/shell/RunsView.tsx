import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createApiClient,
  type DaemonApiClient,
  type InspectorRunPayload,
  type SprintLiveSnapshotPayload,
} from './api-client.js';
import { translateShellMessage } from './i18n.js';
import { useShellStore } from './session-store.js';

export const MSG = {
  title: 'desktop.shell.runs.title',
  runId: 'desktop.shell.runs.run_id',
  state: 'desktop.shell.runs.state',
  source: 'desktop.shell.runs.source',
  settledAt: 'desktop.shell.runs.settled_at',
  refresh: 'desktop.shell.runs.refresh',
  loading: 'desktop.shell.runs.loading',
  empty: 'desktop.shell.runs.empty',
  error: 'desktop.shell.runs.error',
  authority: 'desktop.shell.runs.authority',
  streamDegraded: 'desktop.shell.runs.stream_degraded',
  notSettled: 'desktop.shell.runs.not_settled',
} as const;

type LoadState = 'loading' | 'ready' | 'error';

export default function RunsView(): React.JSX.Element {
  const strings = useShellStore((state) => state.strings);
  const session = useShellStore((state) => state.session);
  const t = useCallback(
    (key: string): string => translateShellMessage(strings, key),
    [strings],
  );
  const api = useMemo<DaemonApiClient | null>(
    () => (session ? createApiClient(session) : null),
    [session],
  );
  const [runs, setRuns] = useState<InspectorRunPayload[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [liveSnapshot, setLiveSnapshot] = useState<SprintLiveSnapshotPayload | null>(null);
  const [streamDegraded, setStreamDegraded] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    if (!api) return;
    setLoadState('loading');
    try {
      const payload = await api.inspectorRuns();
      setRuns(payload.runs);
      setLoadState('ready');
    } catch {
      setLoadState('error');
    }
  }, [api]);

  useEffect(() => {
    let active = true;
    if (!api) return () => { active = false; };
    setLoadState('loading');
    api.inspectorRuns()
      .then((payload) => {
        if (active) {
          setRuns(payload.runs);
          setLoadState('ready');
        }
      })
      .catch(() => {
        if (active) setLoadState('error');
      });
    return () => { active = false; };
  }, [api]);

  useEffect(() => {
    if (!api) return;
    setStreamDegraded(false);
    return api.subscribeSprintLive(
      (snapshot) => {
        setLiveSnapshot(snapshot);
        setStreamDegraded(false);
      },
      () => setStreamDegraded(true),
    );
  }, [api]);

  const displayedRuns = useMemo(() => runs.map((run) => (
    liveSnapshot?.sprintId === run.runId
      ? { ...run, state: liveSnapshot.lifecycle.lifecycle }
      : run
  )), [liveSnapshot, runs]);

  return (
    <section className="console" aria-labelledby="runs-title">
      <p id="runs-title" className="view-eyebrow">{t(MSG.title)}</p>
      <button type="button" className="btn" disabled={!api || loadState === 'loading'} onClick={() => void refresh()}>
        {t(MSG.refresh)}
      </button>
      {liveSnapshot !== null ? (
        <span className="state-pill">
          {t(MSG.authority)}: {liveSnapshot.lifecycle.lifecycle}
        </span>
      ) : null}
      {streamDegraded ? <p className="shell-notice">{t(MSG.streamDegraded)}</p> : null}
      {loadState === 'loading' ? <p className="shell-muted">{t(MSG.loading)}</p> : null}
      {loadState === 'error' ? <p className="shell-notice">{t(MSG.error)}</p> : null}
      {loadState === 'ready' && displayedRuns.length === 0 ? <p className="shell-muted">{t(MSG.empty)}</p> : null}
      {loadState === 'ready' && displayedRuns.length > 0 ? (
        <ul className="flow-list">
          {displayedRuns.map((run) => (
            <li key={run.runId} className="flow-row">
              <span>
                <span className="shell-muted">{t(MSG.runId)}</span>{' '}
                <code>{run.runId}</code>
              </span>
              <span>
                <span className="shell-muted">{t(MSG.state)}</span>{' '}
                <span className="state-pill">{run.state}</span>
              </span>
              <span><span className="shell-muted">{t(MSG.source)}</span> {run.source}</span>
              <span>
                <span className="shell-muted">{t(MSG.settledAt)}</span>{' '}
                {run.settledAt === null ? t(MSG.notSettled) : <time dateTime={run.settledAt}>{run.settledAt}</time>}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
