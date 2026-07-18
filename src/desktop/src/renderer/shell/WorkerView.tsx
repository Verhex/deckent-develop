/**
 * 588/F1 — Worker-Penceresi (plan §2.2): Alperen'in "worker'ları
 * görebileceğim detaylı pencere"si. Bir görev-kartına tıklandığında açılır:
 *
 *   Canlı  — `/api/workers/:id/logs/stream` SSE (`render=human` projeksiyonu:
 *            "AI yazar · insan denetler" — 408-003'ün insan-okur satırları);
 *            otoscroll, N5-akışının ete kemiğe büründüğü yer.
 *   Görev  — task.json: hedef · GO-ölçütleri · yazma-kapsamı.
 *   Plan   — worker'ın .plan dosyası (cap'li, kırpma-işaretli).
 *   Sonuç  — .result: öz-değerlendirme + notlar.
 *
 * Veri = /api/sprint/task/:id (sprint-live-service) — koşu-sonrası arşiv-görev
 * için de aynı pencere. Lazy (react-aria Tabs → node-test-grafiği dışı).
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Tab, TabList, TabPanel, Tabs } from 'react-aria-components';
import { createApiClient, type DaemonApiClient, type SprintTaskDetailPayload } from './api-client.js';
import { useShellStore } from './session-store.js';

export const MSG = {
  back: 'desktop.shell.worker.back',
  tabLive: 'desktop.shell.worker.tab_live',
  tabTask: 'desktop.shell.worker.tab_task',
  tabPlan: 'desktop.shell.worker.tab_plan',
  tabResult: 'desktop.shell.worker.tab_result',
  logUnavailable: 'desktop.shell.worker.log_unavailable',
  goal: 'desktop.shell.runs.goal',
  goCriteria: 'desktop.shell.worker.go_criteria',
  scope: 'desktop.shell.worker.scope',
  noPlan: 'desktop.shell.worker.no_plan',
  noResult: 'desktop.shell.worker.no_result',
  assessment: 'desktop.shell.worker.assessment',
  notFound: 'desktop.shell.worker.not_found',
  hbAge: 'desktop.shell.bridge.hb_age',
  truncated: 'desktop.shell.diff.truncated',
  loading: 'desktop.connection.list_loading',
  loadError: 'desktop.shell.load_error',
} as const;

function useT(): (key: string, vars?: Record<string, string>) => string {
  const strings = useShellStore((s) => s.strings);
  return (key, vars) => {
    const template = strings[key] ?? key;
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (_m, name: string) => vars[name] ?? `{${name}}`);
  };
}

const LIVE_LINE_CAP = 600;

export default function WorkerView(): React.JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const { taskId = '' } = useParams();
  const session = useShellStore((s) => s.session);
  const apiRef = useRef<DaemonApiClient | null>(null);
  if (session && apiRef.current?.session !== session) apiRef.current = createApiClient(session);
  const api = apiRef.current;

  const [detail, setDetail] = useState<SprintTaskDetailPayload | null>(null);
  const [boot, setBoot] = useState<'loading' | 'missing' | 'error' | 'ready'>('loading');
  const [lines, setLines] = useState<string[]>([]);
  const [logMissing, setLogMissing] = useState(false);
  const liveEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!api || taskId.length === 0) return;
    let cancelled = false;
    api.getSprintTask(taskId)
      .then((payload) => { if (!cancelled) { setDetail(payload); setBoot('ready'); } })
      .catch((err: unknown) => {
        if (cancelled) return;
        setBoot((err as { status?: number }).status === 404 || (err as { status?: number }).status === 403 ? 'missing' : 'error');
      });
    return () => { cancelled = true; };
  }, [api, taskId]);

  // Canlı-akış: named-SSE (log_line/log_unavailable), satır-cap'li birikim.
  useEffect(() => {
    if (!api || taskId.length === 0) return;
    const close = api.openWorkerLog(taskId, {
      onLine: (line) => {
        setLogMissing(false);
        setLines((current) => {
          const next = [...current, line];
          return next.length > LIVE_LINE_CAP ? next.slice(next.length - LIVE_LINE_CAP) : next;
        });
      },
      onUnavailable: () => setLogMissing(true),
    });
    return close;
  }, [api, taskId]);

  useEffect(() => {
    liveEndRef.current?.scrollIntoView({ block: 'end' });
  }, [lines]);

  if (boot === 'loading') return <p className="shell-muted">{t(MSG.loading)}</p>;
  if (boot === 'missing') return <p className="shell-notice">{t(MSG.notFound)}</p>;
  if (boot === 'error') return <p className="shell-notice">{t(MSG.loadError)}</p>;

  const task = detail?.task ?? {};
  const goNogo = (task['goNogo'] ?? {}) as Record<string, unknown>;
  const scope = (task['scope'] ?? {}) as Record<string, unknown>;
  const filesWrite = Array.isArray(scope['filesWrite'])
    ? (scope['filesWrite'] as unknown[]).filter((v): v is string => typeof v === 'string')
    : [];
  const result = detail?.result ?? null;

  return (
    <div className="worker">
      <button type="button" className="worker__back" onClick={() => void navigate('/console')}>
        {t(MSG.back)}
      </button>
      <p className="worker__head">
        <code>{taskId}</code>
        {detail?.hb && (
          <span className="worker__hb">
            {detail.hb.status} · {t(MSG.hbAge, { n: String(Math.round(detail.hb.ageMs / 1000)) })}
            {detail.hb.currentAction !== undefined ? ` · ${detail.hb.currentAction}` : ''}
          </span>
        )}
      </p>
      <Tabs className="worker__tabs" defaultSelectedKey="live">
        <TabList aria-label={t(MSG.tabLive)} className="worker__tablist">
          <Tab id="live" className="worker__tab">{t(MSG.tabLive)}</Tab>
          <Tab id="task" className="worker__tab">{t(MSG.tabTask)}</Tab>
          <Tab id="plan" className="worker__tab">{t(MSG.tabPlan)}</Tab>
          <Tab id="result" className="worker__tab">{t(MSG.tabResult)}</Tab>
        </TabList>
        <TabPanel id="live" className="worker__panel">
          {logMissing && lines.length === 0 ? (
            <p className="shell-muted">{t(MSG.logUnavailable)}</p>
          ) : (
            <pre className="worker__live">
              {lines.join('\n')}
              <div ref={liveEndRef} />
            </pre>
          )}
        </TabPanel>
        <TabPanel id="task" className="worker__panel">
          {typeof task['description'] === 'string' && (
            <>
              <p className="shell-muted">{t(MSG.goal)}</p>
              <pre className="worker__text">{task['description']}</pre>
            </>
          )}
          {typeof goNogo['goCriteria'] === 'string' && (
            <>
              <p className="shell-muted">{t(MSG.goCriteria)}</p>
              <pre className="worker__text">{goNogo['goCriteria']}</pre>
            </>
          )}
          {filesWrite.length > 0 && (
            <>
              <p className="shell-muted">{t(MSG.scope)}</p>
              <ul className="worker__scope">
                {filesWrite.map((file) => <li key={file}><code>{file}</code></li>)}
              </ul>
            </>
          )}
        </TabPanel>
        <TabPanel id="plan" className="worker__panel">
          {detail?.plan ? (
            <>
              <pre className="worker__text">{detail.plan.text}</pre>
              {detail.plan.truncated && <p className="shell-muted">{t(MSG.truncated)}</p>}
            </>
          ) : (
            <p className="shell-muted">{t(MSG.noPlan)}</p>
          )}
        </TabPanel>
        <TabPanel id="result" className="worker__panel">
          {result ? (
            <>
              {typeof result['selfAssessment'] === 'string' && (
                <p><span className="shell-muted">{t(MSG.assessment)}:</span> <strong>{result['selfAssessment']}</strong></p>
              )}
              <pre className="worker__text">{JSON.stringify(result, null, 2)}</pre>
            </>
          ) : (
            <p className="shell-muted">{t(MSG.noResult)}</p>
          )}
        </TabPanel>
      </Tabs>
    </div>
  );
}
