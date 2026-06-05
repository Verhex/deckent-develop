/* App.jsx — interactive shell for the deckent dashboard kit.
   Ties Sidebar + Dashboard + Chat + Terminal + NewSprintModal together with a
   small sprint simulation (PLAN→SPAWN→EXECUTE, workers flipping to DONE). */
const { useState, useCallback, useRef } = React;

const INITIAL_SPRINT = { id: "sprint-221", title: "Memory V2 — FTS5 search + decay", phase: "EXECUTE", total: 4 };
const INITIAL_WORKERS = [
  { id: "w-221-001", model: "opus", provider: "Claude", backend: "tmux", role: "architect", status: "DONE", taskId: "task-221-001", elapsed: "3m 48s", heartbeat: "1m", progress: 100, verdict: "GO · 6 tests passed", files: "2 files" },
  { id: "w-221-002", model: "sonnet", provider: "Codex", backend: "docker", role: "refactorer", status: "EXECUTING", taskId: "task-221-002", elapsed: "1m 30s", heartbeat: "3s", progress: 48, action: "Refactoring memory.ts → fts5 adapter" },
  { id: "w-221-003", model: "opus", provider: "Gemini", backend: "docker", role: "api-builder", status: "EXECUTING", taskId: "task-221-003", elapsed: "1m 12s", heartbeat: "4s", progress: 62, action: "Writing src/api/recall.ts…" },
  { id: "w-221-004", model: "haiku", provider: "Claude", backend: "subprocess", role: "doc-writer", status: "IDLE", taskId: "task-221-004", elapsed: "—", heartbeat: "—", progress: 0 },
];

function Placeholder({ title, icon, note }) {
  useLucide();
  return (
    <div>
      <div className="page-head"><div><h1 className="page-title">{title}</h1><p className="page-sub">{note}</p></div></div>
      <div className="empty"><Icon name={icon} style={{ width: 28, height: 28, opacity: .5 }} /><p style={{ marginTop: 10 }}>This surface is part of the live product. Wired views: Dashboard &amp; Chat.</p></div>
    </div>
  );
}

function App() {
  const [route, setRoute] = useState("dashboard");
  const [navOpen, setNavOpen] = useState(false);
  const [lang, setLang] = useState("en");
  const [sprint, setSprint] = useState(INITIAL_SPRINT);
  const [workers, setWorkers] = useState(INITIAL_WORKERS);
  const [modal, setModal] = useState(false);
  const timers = useRef([]);

  const onKill = useCallback((id) => {
    setWorkers((ws) => ws.map((w) => (w.id === id ? { ...w, status: "IDLE", action: undefined, progress: 0, elapsed: "—", heartbeat: "—" } : w)));
  }, []);

  const launch = useCallback((title) => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setModal(false);
    setRoute("dashboard");
    setSprint({ id: "sprint-222", title, phase: "PLAN", total: 2 });
    setWorkers([]);
    const seq = [
      [500, () => setSprint((s) => ({ ...s, phase: "SPAWN" }))],
      [520, () => setWorkers([
        { id: "w-222-001", model: "opus", provider: "Claude", backend: "docker", role: "security-auditor", status: "EXECUTING", taskId: "task-222-001", elapsed: "2s", heartbeat: "1s", progress: 6, action: "Scaffolding src/auth/oauth.ts" },
        { id: "w-222-002", model: "sonnet", provider: "Codex", backend: "tmux", role: "api-builder", status: "EXECUTING", taskId: "task-222-002", elapsed: "2s", heartbeat: "1s", progress: 4, action: "Adding refresh middleware" },
      ])],
      [1400, () => setSprint((s) => ({ ...s, phase: "EXECUTE" }))],
      [1500, () => setWorkers((ws) => ws.map((w) => ({ ...w, elapsed: "18s", progress: w.id.endsWith("001") ? 55 : 40 })))],
      [3000, () => setWorkers((ws) => ws.map((w) => (w.id === "w-222-001" ? { ...w, status: "DONE", progress: 100, action: undefined, verdict: "GO · 4 tests passed", files: "3 files", heartbeat: "5s", elapsed: "42s" } : { ...w, progress: 78, elapsed: "42s" })))],
      [4400, () => { setWorkers((ws) => ws.map((w) => (w.status === "EXECUTING" ? { ...w, status: "DONE", progress: 100, action: undefined, verdict: "GO · 3 tests passed", files: "2 files", elapsed: "1m 04s" } : w))); setSprint((s) => ({ ...s, phase: "EVALUATE" })); }],
    ];
    seq.forEach(([d, fn]) => timers.current.push(setTimeout(fn, d)));
  }, []);

  let view;
  if (route === "dashboard") view = <Dashboard sprint={sprint} workers={workers} onNewSprint={() => setModal(true)} onKill={onKill} />;
  else if (route === "chat") view = <Chat sprint={sprint} workers={workers} />;
  else if (route === "status") view = <Dashboard sprint={sprint} workers={workers} onNewSprint={() => setModal(true)} onKill={onKill} />;
  else {
    const meta = {
      memory: { title: "Memory", icon: "brain", note: "Cross-sprint SQLite + FTS5 recall" },
      config: { title: "Config", icon: "sliders-horizontal", note: "Project & provider configuration" },
      history: { title: "History", icon: "history", note: "Past sprints & retrospectives" },
      evolution: { title: "Evolution", icon: "git-branch", note: "Agent promotion / demotion pipeline" },
    }[route] || { title: "deckent", icon: "layout-dashboard", note: "" };
    view = <Placeholder {...meta} />;
  }

  const isChat = route === "chat";

  const navigate = useCallback((r) => { setRoute(r); setNavOpen(false); }, []);

  return (
    <div className={`shell${navOpen ? " nav-open" : ""}`}>
      <Sidebar route={route} onNavigate={navigate} sprint={sprint} lang={lang} onToggleLang={() => setLang((l) => (l === "en" ? "tr" : "en"))} sse="connected" />
      <div className="nav-scrim" onClick={() => setNavOpen(false)}></div>
      <div className="main">
        <header className="topbar">
          <div className="row">
            <button className="menu-btn" onClick={() => setNavOpen(true)} aria-label="Menu"><Icon name="menu" /></button>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)", fontWeight: 600 }}>{sprint.id}</span>
            <Badge variant="info" xs>{sprint.phase}</Badge>
          </div>
          <div className="row">
            <StatusDot status="connected" />
            <span style={{ fontSize: "var(--text-xs)", color: "var(--subtle-foreground)" }}>connected</span>
          </div>
        </header>
        <div className="content" style={isChat ? { padding: 24, overflow: "hidden" } : {}}>{view}</div>
        {!isChat && <Terminal />}
      </div>
      {modal && <NewSprintModal onClose={() => setModal(false)} onLaunch={launch} />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
