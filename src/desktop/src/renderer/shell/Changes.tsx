/**
 * 588/F0 — «Changes»: the Desktop leg of the N4 git flow (plan §2.4).
 *
 * incele→mühürle in ONE surface: working-tree status + review diff + the
 * deterministic commit proposal (editable message) + the SEALED commit —
 * all over `/api/git/*` (the SAME git-workflow-service the CLI and the chat
 * tools ride; 587-deseni, üçüncü tüketici). Commit is a control mutation:
 * an adopted daemon with the ratchet off answers 403 → honest band, never a
 * dead button. Lazy view (react-aria stays out of the node test graph).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Form, TextArea, TextField } from 'react-aria-components';
import {
  ApiError,
  createApiClient,
  type DaemonApiClient,
  type GitDiffPayload,
  type GitProposalPayload,
  type GitStatusPayload,
} from './api-client.js';
import { useShellStore } from './session-store.js';

export const MSG = {
  title: 'desktop.shell.nav.changes',
  header: 'runs.commit.header',
  suggested: 'runs.commit.suggested',
  clean: 'runs.commit.clean',
  notGit: 'runs.commit.not_git',
  done: 'runs.commit.done',
  commit: 'desktop.shell.changes.commit',
  gateOff: 'desktop.shell.changes.gate_off',
  diffTitle: 'desktop.shell.diff.title',
  diffTruncated: 'desktop.shell.diff.truncated',
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

type BootState = 'loading' | 'error' | 'ready';

export default function Changes(): React.JSX.Element {
  const t = useT();
  const session = useShellStore((s) => s.session);
  const apiRef = useRef<DaemonApiClient | null>(null);
  if (session && apiRef.current?.session !== session) apiRef.current = createApiClient(session);
  const api = apiRef.current;

  const [boot, setBoot] = useState<BootState>('loading');
  const [status, setStatus] = useState<GitStatusPayload | null>(null);
  const [proposal, setProposal] = useState<GitProposalPayload | null>(null);
  const [diff, setDiff] = useState<GitDiffPayload | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [gateOff, setGateOff] = useState(false);
  const [sealedSha, setSealedSha] = useState<string | null>(null);

  const refresh = useCallback(async (client: DaemonApiClient): Promise<void> => {
    const [nextStatus, nextProposal, nextDiff] = await Promise.all([
      client.getGitStatus(),
      client.getGitProposal(),
      client.getGitDiff(),
    ]);
    setStatus(nextStatus);
    setProposal(nextProposal);
    setDiff(nextDiff);
    setMessage((current) => (current.length > 0 ? current : nextProposal.suggestedMessage));
  }, []);

  useEffect(() => {
    if (!api) return;
    let cancelled = false;
    setBoot('loading');
    refresh(api)
      .then(() => { if (!cancelled) setBoot('ready'); })
      .catch(() => { if (!cancelled) setBoot('error'); });
    return () => { cancelled = true; };
  }, [api, refresh]);

  const seal = async (): Promise<void> => {
    if (!api || busy || message.trim().length === 0) return;
    setBusy(true);
    setSealedSha(null);
    try {
      const outcome = await api.commitGit(message);
      setSealedSha(outcome.sha ?? '');
      setMessage('');
      await refresh(api);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setGateOff(true);
      else setBoot('error');
    } finally {
      setBusy(false);
    }
  };

  if (boot === 'loading') return <p className="shell-muted">{t(MSG.loading)}</p>;
  if (boot === 'error') return <p className="shell-notice">{t(MSG.loadError)}</p>;
  if (status?.note === 'not-a-git-repo') return <p className="shell-notice">{t(MSG.notGit)}</p>;

  const clean = proposal?.note === 'clean' || (proposal?.files.length ?? 0) === 0;
  return (
    <div className="changes">
      <p className="view-eyebrow">{t(MSG.title)}</p>
      {gateOff && <p className="shell-notice">{t(MSG.gateOff)}</p>}
      {sealedSha !== null && (
        <p className="changes__sealed">{t(MSG.done, { sha: sealedSha })}</p>
      )}
      {clean ? (
        <p className="shell-muted">{t(MSG.clean)}</p>
      ) : (
        <>
          <h2 className="changes__header">
            {t(MSG.header, {
              n: String(proposal?.files.length ?? 0),
              ins: String(proposal?.insertions ?? 0),
              del: String(proposal?.deletions ?? 0),
            })}
          </h2>
          <ul className="changes__files">
            {proposal?.files.map((file) => (
              <li key={file.path}>
                <code>{file.path}</code>
                <span className="changes__counts">+{file.insertions} −{file.deletions}</span>
              </li>
            ))}
          </ul>
          <Form
            className="changes__form"
            onSubmit={(e) => {
              e.preventDefault();
              void seal();
            }}
          >
            <p className="shell-muted">{t(MSG.suggested)}</p>
            <TextField aria-label={t(MSG.suggested)} value={message} onChange={setMessage} isDisabled={busy || gateOff}>
              <TextArea className="changes__message" rows={4} />
            </TextField>
            <Button
              type="submit"
              className="btn btn--primary changes__seal"
              isDisabled={busy || gateOff || message.trim().length === 0}
            >
              {t(MSG.commit)}
            </Button>
          </Form>
          {diff && diff.text.length > 0 && (
            <details className="changes__diff" open>
              <summary>{t(MSG.diffTitle, { n: String(proposal?.files.length ?? 0) })}</summary>
              <pre>{diff.text}</pre>
              {diff.truncated && <p className="shell-muted">{t(MSG.diffTruncated)}</p>}
            </details>
          )}
        </>
      )}
    </div>
  );
}
