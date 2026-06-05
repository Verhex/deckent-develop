/* Sidebar.jsx — fixed left navigation. Mirrors Layout.tsx SidebarContent:
   brand + sprint pill + auditor badge + nav groups (Konuş/İzle/Yönet) +
   live SSE dot + language/theme toggles. */
const NAV_GROUPS = [
  { label: "Konuş", items: [{ to: "chat", label: "Chat", icon: "message-circle" }] },
  {
    label: "İzle",
    items: [
      { to: "dashboard", label: "Dashboard", icon: "layout-dashboard" },
      { to: "status", label: "Status", icon: "activity" },
      { to: "history", label: "History", icon: "history" },
      { to: "evolution", label: "Evolution", icon: "git-branch" },
    ],
  },
  {
    label: "Yönet",
    items: [
      { to: "memory", label: "Memory", icon: "brain" },
      { to: "config", label: "Config", icon: "sliders-horizontal" },
    ],
  },
];

function Sidebar({ route, onNavigate, sprint, lang, onToggleLang, sse }) {
  useLucide();
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark"><img src="../assets/decko-conductor-glow.png" alt="Deckent" /></span>
        <h1>deckent</h1>
      </div>
      <p className="brand-sub">AI Agent Orchestrator</p>

      {sprint && (
        <div className="sprint-pill">
          <span className="sid">{sprint.id}</span>
          <Badge variant="info" xs>{sprint.phase}</Badge>
        </div>
      )}
      <div className="sprint-pill" style={{ marginTop: -6 }}>
        <span className="sid" style={{ color: "var(--subtle-foreground)" }}>Auditor:</span>
        <Badge variant="success" xs>active</Badge>
      </div>

      <nav className="nav-links">
        {NAV_GROUPS.map((g) => (
          <div className="nav-group" key={g.label}>
            <p className="nav-eyebrow">{g.label}</p>
            <div className="nav-links">
              {g.items.map((it) => (
                <div
                  key={it.to}
                  className={`nav-link ${route === it.to ? "active" : ""}`}
                  onClick={() => onNavigate(it.to)}
                >
                  <Icon name={it.icon} />
                  {it.label}
                </div>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="sidebar-foot">
        <div className="foot-row">
          <StatusDot status={sse} />
          <span style={{ fontSize: "var(--text-xs)", color: "var(--subtle-foreground)" }}>
            {sse === "connected" ? "Live" : sse === "connecting" ? "Connecting" : "Offline"}
          </span>
        </div>
        <button className="foot-btn" onClick={onToggleLang}>
          <Icon name="globe" /> {lang === "en" ? "TR" : "EN"}
        </button>
        <button className="foot-btn">
          <Icon name="sun" /> Light
        </button>
      </div>
    </aside>
  );
}

Object.assign(window, { Sidebar });
