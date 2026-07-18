/**
 * DT-1 (583 tasarım-turu) — «Telsiz» (watch radio): the Desktop's REAL chat.
 *
 * The honest empty state grows into the thing it promised: the operator talks
 * to deckent from the bridge over the daemon's EXISTING chat contract
 * (`GET /api/chat/stream` SSE — chunk* then one done/error — with the
 * non-streaming `POST /api/chat` as fallback/probe). Distinct from the
 * Console's «Emir» order line by design: Emir starts WORK (RunFlow), the
 * Telsiz carries CONVERSATION (questions, guidance, status talk).
 *
 * Gate honesty (SURF-7 ratchet): `/api/chat*` sits behind the
 * control-mutations gate. A Desktop-SPAWNED daemon opens it via the env twin
 * (daemon-lifecycle.ts); an adopted daemon that answers 403 gets an honest
 * precondition band — never a dead input.
 *
 * a11y (DT-2): the input/submit are react-aria-components (the D4-0-locked
 * library, worn for real) — focus ring rides the shared `focus-ring` token.
 *
 * Loaded via React.lazy from Shell.tsx (node-env tests import Shell DOM-free;
 * react-aria stays out of that graph). The transcript FOLD is pure and
 * exported for hermetic pins (radioSend/radioChunk/radioDone/radioError).
 */
import { useRef, useState } from 'react';
import { Button, Form, Input, TextField } from 'react-aria-components';
import { ApiError, type DaemonApiClient, createApiClient } from './api-client.js';
import { radioSend, radioChunk, radioDone, radioError, type RadioMessage } from './radio-fold.js';
import { useShellStore } from './session-store.js';

export const MSG = {
  eyebrow: 'desktop.shell.chat.eyebrow',
  emptyHint: 'desktop.shell.radio.empty_hint',
  placeholder: 'desktop.shell.radio.placeholder',
  send: 'desktop.shell.radio.send',
  roleOperator: 'desktop.shell.radio.role_operator',
  roleDeckent: 'desktop.shell.radio.role_deckent',
  gateOff: 'desktop.shell.radio.gate_off',
  failed: 'desktop.shell.radio.failed',
  loadError: 'desktop.shell.load_error',
} as const;

// ─── View ───────────────────────────────────────────────────────────────────

function useT(): (key: string, vars?: Record<string, string>) => string {
  const strings = useShellStore((s) => s.strings);
  return (key, vars) => {
    const template = strings[key] ?? key;
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (_m, name: string) => vars[name] ?? `{${name}}`);
  };
}

export default function Telsiz(): React.JSX.Element {
  const t = useT();
  const session = useShellStore((s) => s.session);
  const apiRef = useRef<DaemonApiClient | null>(null);
  const [messages, setMessages] = useState<RadioMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [gateOff, setGateOff] = useState(false);
  const closeRef = useRef<(() => void) | null>(null);

  if (session && apiRef.current?.session !== session) apiRef.current = createApiClient(session);
  const api = apiRef.current;

  const transmit = (text: string): void => {
    if (!api || busy) return;
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    setDraft('');
    setBusy(true);
    setMessages((list) => radioSend(list, trimmed));
    let sawFrame = false;
    closeRef.current = api.openChatStream(trimmed, {
      onChunk: (chunk) => {
        sawFrame = true;
        setMessages((list) => radioChunk(list, chunk));
      },
      onDone: (reply) => {
        sawFrame = true;
        setMessages((list) => radioDone(list, reply));
        setBusy(false);
      },
      onError: (message) => {
        if (!sawFrame && message === 'stream disconnected') {
          // Transport died before ANY server frame — probe the non-streaming
          // endpoint for the REAL status (a 403 = the control-mutations gate).
          void api.sendChat(trimmed)
            .then((reply) => setMessages((list) => radioDone(list, reply)))
            .catch((err: unknown) => {
              if (err instanceof ApiError && err.status === 403) {
                setGateOff(true);
                setMessages((list) => list.slice(0, -2)); // withdraw the attempt honestly
              } else {
                setMessages((list) => radioError(list, t(MSG.failed, {
                  message: err instanceof Error ? err.message : String(err),
                })));
              }
            })
            .finally(() => setBusy(false));
          return;
        }
        setMessages((list) => radioError(list, t(MSG.failed, { message })));
        setBusy(false);
      },
    });
  };

  return (
    <div className="radio">
      <p className="view-eyebrow">{t(MSG.eyebrow)}</p>
      {gateOff && <p className="shell-notice">{t(MSG.gateOff)}</p>}
      {messages.length === 0 && !gateOff && (
        <p className="shell-muted radio__hint">{t(MSG.emptyHint)}</p>
      )}
      <ol className="radio__transcript">
        {messages.map((message, index) => (
          <li
            key={index}
            className={
              `radio__line radio__line--${message.role}` +
              (message.failed === true ? ' radio__line--failed' : '')
            }
          >
            <span className="radio__role">
              {t(message.role === 'operator' ? MSG.roleOperator : MSG.roleDeckent)}
            </span>
            <span className="radio__text">
              {message.text}
              {message.pending === true && <span className="radio__carrier" aria-hidden="true">▂</span>}
            </span>
          </li>
        ))}
      </ol>
      <Form
        className="radio__form"
        onSubmit={(e) => {
          e.preventDefault();
          transmit(draft);
        }}
      >
        <TextField
          className="radio__field"
          aria-label={t(MSG.placeholder)}
          value={draft}
          onChange={setDraft}
          isDisabled={!api || busy || gateOff}
        >
          <Input className="radio__input" placeholder={t(MSG.placeholder)} />
        </TextField>
        <Button
          type="submit"
          className="btn btn--primary radio__send"
          isDisabled={!api || busy || gateOff || draft.trim().length === 0}
        >
          {t(MSG.send)}
        </Button>
      </Form>
    </div>
  );
}
