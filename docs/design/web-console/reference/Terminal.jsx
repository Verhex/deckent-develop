/* Terminal.jsx — interactive dockable web terminal.
   Multi-session tabs, live-streaming log tail, a working command input
   (help / status / recall / clear / start), collapse + maximize. */
const { useState, useEffect, useRef, useCallback } = React;

const SESSIONS = {
  deckent: {
    label: "deckent — start", icon: "square-terminal",
    base: [
      { t: "prompt", txt: "$ deckent start" },
      { t: "dim", txt: "✓ loaded DIRECTIVES.md — 4 tasks" },
      { t: "teal", txt: "[Brain] PLAN  → scoped 4 tasks, assigned tiers" },
      { t: "teal", txt: "[Brain] SPAWN → 3 workers (docker · tmux · tmux)" },
      { t: "gold", txt: "[w-221-001] opus     · architect      · EXECUTING" },
      { t: "gold", txt: "[w-221-002] sonnet   · refactorer     · EXECUTING" },
      { t: "gold", txt: "[w-221-003] opus     · api-builder    · EXECUTING" },
      { t: "dim", txt: "[Auditor] scan #14 — heartbeats OK, 0 scope violations" },
      { t: "ok", txt: "[w-221-001] ✓ DONE  GO — 6 tests passed, 2 files" },
    ],
    live: [
      { t: "dim", txt: "[Auditor] scan #§ — heartbeats OK, 0 violations" },
      { t: "gold", txt: "[w-221-002] sonnet   · refactorer     · heartbeat ✓ §s" },
      { t: "teal", txt: "[Brain] EVAL  → task-221-002 verdict pending" },
      { t: "ok", txt: "[w-221-003] ✓ DONE  GO — 3 tests passed, 2 files" },
      { t: "dim", txt: "[Memory] persisted 2 decisions → .brain/memory.db" },
    ],
  },
  claude: {
    label: "claude (w-221-001)", icon: "bot",
    base: [
      { t: "dim", txt: "● claude-code · w-221-001 · architect" },
      { t: "plain", txt: "Reading src/memory/ … 6 files" },
      { t: "teal", txt: "⏺ Edit  src/memory/fts5.ts  (+48 −6)" },
      { t: "teal", txt: "⏺ Write tests/memory.fts5.test.ts  (+92)" },
      { t: "ok", txt: "✓ 6 tests passed in 1.8s" },
    ],
    live: [
      { t: "plain", txt: "Thinking… resolving fts5 tokenizer config" },
      { t: "teal", txt: "⏺ Edit  src/memory/decay.ts  (+12 −3)" },
      { t: "dim", txt: "context: 41k / 200k tokens" },
    ],
  },
  bash: {
    label: "bash", icon: "terminal",
    base: [
      { t: "prompt", txt: "$ git status" },
      { t: "plain", txt: "On branch sprint/memory-v2" },
      { t: "ok", txt: "  modified:  src/memory/fts5.ts" },
      { t: "ok", txt: "  modified:  src/api/recall.ts" },
    ],
    live: [],
  },
};

const CLS = { prompt: "term-prompt", dim: "term-dim", teal: "term-teal", gold: "term-gold", ok: "term-prompt", err: "term-err", plain: "" };

function runCommand(raw) {
  const cmd = raw.trim();
  const echo = { t: "prompt", txt: "$ " + cmd };
  const [name, ...args] = cmd.split(/\s+/);
  switch (name) {
    case "": return [];
    case "help": return [echo,
      { t: "plain", txt: "commands: status · workers · recall <q> · sprint · clear · help" }];
    case "status": return [echo,
      { t: "teal", txt: "sprint-221 · phase EXECUTE · 1/4 tasks complete" },
      { t: "gold", txt: "2 workers executing · auditor active · 0 violations" }];
    case "workers": return [echo,
      { t: "gold", txt: "w-221-001 opus   architect   DONE" },
      { t: "gold", txt: "w-221-002 sonnet refactorer  EXECUTING 48%" },
      { t: "gold", txt: "w-221-003 opus   api-builder EXECUTING 62%" },
      { t: "dim", txt: "w-221-004 haiku  doc-writer  IDLE" }];
    case "sprint": return [echo,
      { t: "teal", txt: "Memory V2 — FTS5 search + decay  (sprint-221)" },
      { t: "dim", txt: "started 4m ago · provider mix: Claude · Codex · Gemini" }];
    case "recall": return [echo,
      args.length
        ? { t: "dim", txt: `FTS5 recall "${args.join(" ")}" — 3 hits` }
        : { t: "err", txt: "usage: recall <query>" },
      ...(args.length ? [
        { t: "plain", txt: "  · decision: docker heartbeat = 5s grace window" },
        { t: "plain", txt: "  · pattern:  retry NO_GO workers with prior context" },
      ] : [])];
    case "clear": return "CLEAR";
    default: return [echo, { t: "err", txt: `deckent: command not found: ${name} — try 'help'` }];
  }
}

function Terminal() {
  useLucide();
  const [open, setOpen] = useState(true);
  const [max, setMax] = useState(false);
  const [active, setActive] = useState("deckent");
  const [feeds, setFeeds] = useState(() =>
    Object.fromEntries(Object.entries(SESSIONS).map(([k, v]) => [k, v.base.slice()])));
  const [input, setInput] = useState("");
  const bodyRef = useRef(null);
  const tick = useRef(15);

  // live tail — append a plausible log line every few seconds on the active tab
  useEffect(() => {
    if (!open) return;
    const pool = SESSIONS[active].live;
    if (!pool.length) return;
    const iv = setInterval(() => {
      const pick = pool[Math.floor(Math.random() * pool.length)];
      tick.current += 1;
      const line = { t: pick.t, txt: pick.txt.replace(/§/g, tick.current) };
      setFeeds((f) => {
        const next = f[active].concat(line);
        return { ...f, [active]: next.length > 60 ? next.slice(-60) : next };
      });
    }, 2600);
    return () => clearInterval(iv);
  }, [active, open]);

  // autoscroll to newest
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [feeds, active, open, max]);

  const submit = useCallback((e) => {
    e.preventDefault();
    const res = runCommand(input);
    setInput("");
    if (res === "CLEAR") { setFeeds((f) => ({ ...f, [active]: [] })); return; }
    if (res.length) setFeeds((f) => ({ ...f, [active]: f[active].concat(res) }));
  }, [input, active]);

  const tabs = Object.entries(SESSIONS);

  return (
    <div className={`dock ${open ? "" : "collapsed"} ${max ? "max" : ""}`}>
      <div className="dock-tabs">
        {tabs.map(([id, s]) => (
          <div key={id} className={`dock-tab ${active === id ? "active" : ""}`}
               onClick={() => { setActive(id); setOpen(true); }}>
            <Icon name={s.icon} /> {s.label}
          </div>
        ))}
        <div className="dock-tools">
          <button className="dock-btn" title="Clear" onClick={() => setFeeds((f) => ({ ...f, [active]: [] }))}><Icon name="eraser" /></button>
          <button className="dock-btn" title={max ? "Restore" : "Maximize"} onClick={() => { setMax((m) => !m); setOpen(true); }}><Icon name={max ? "minimize-2" : "maximize-2"} /></button>
          <button className="dock-btn" title={open ? "Hide" : "Show"} onClick={() => setOpen((o) => !o)}><Icon name={open ? "chevron-down" : "chevron-up"} /></button>
        </div>
      </div>
      {open && (
        <React.Fragment>
          <div className="dock-body" ref={bodyRef}>
            {feeds[active].map((l, i) => <div key={i}><span className={CLS[l.t] || ""}>{l.txt}</span></div>)}
          </div>
          <form className="dock-input" onSubmit={submit}>
            <span className="term-prompt">deckent ❯</span>
            <input value={input} onChange={(e) => setInput(e.target.value)} spellCheck="false" autoComplete="off"
                   placeholder="type a command — try “help”, “status”, “recall docker”" />
          </form>
        </React.Fragment>
      )}
    </div>
  );
}

Object.assign(window, { Terminal });
