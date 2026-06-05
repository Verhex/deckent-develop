/* Dashboard.jsx — the default landing view. Mirrors DashboardPage:
   page header + New Sprint CTA, stat row, sprint card with phase timeline +
   segmented progress, and the icon-based worker card grid. */
const MODEL_ICON = { opus: "gem", sonnet: "zap", haiku: "leaf" };
const MODEL_TIER = { opus: "premium", sonnet: "standard", haiku: "economy" };
const ENV_ICON = { docker: "container", tmux: "terminal", subprocess: "square-dashed" };
const PROVIDER_COLOR = { Claude: "#D97757", Codex: "#10A37F", Gemini: "#4285F4" };

function WorkerCard({ w, onKill }) {
  const live = w.status === "EXECUTING";
  return (
    <div className={`wcard ${w.status}`}>
      <div className="statusbar"></div>
      <div className="pad">
        <div className="wcard-head">
          <span className="wid"><Icon name="cpu" />{w.id}</span>
          <span className={`wstatus ${w.status}`}><span className="d"></span>{w.status}</span>
        </div>
        <div className="wprog"><i style={{ width: `${w.progress || 0}%`, background: w.status === "DONE" ? "var(--status-success)" : "var(--accent-blue)" }}></i></div>
        <div className="wmetagrid">
          <div className="wcell"><div className="k">Model</div><div className="v"><Icon name={MODEL_ICON[w.model] || "box"} />{w.model}</div><div className="tier">{MODEL_TIER[w.model] || ""}</div></div>
          <div className="wcell"><div className="k">Provider</div><div className="v"><span className="pbar" style={{ background: PROVIDER_COLOR[w.provider] }}></span>{w.provider}</div><div className="tier">&nbsp;</div></div>
          <div className="wcell"><div className="k">Env</div><div className="v"><Icon name={ENV_ICON[w.backend] || "box"} />{w.backend}</div><div className="tier">&nbsp;</div></div>
        </div>
        <div className="wdiv"></div>
        <div className="wtask"><Icon name="file-code-2" />{w.taskId}</div>
        <div className="wrole"><Icon name="hard-hat" />{w.role}</div>
        {live && w.action && <div className="waction"><Icon name="loader" />{w.action}</div>}
        {w.status === "DONE" && <div className="waction" style={{ color: "#4ade80", fontStyle: "normal" }}><Icon name="check-check" />{w.verdict || "GO"}</div>}
        <div className="wfoot">
          <span className="wstat"><Icon name="clock" />{w.elapsed}</span>
          {live
            ? <span className="wstat beat"><Icon name="activity" />{w.heartbeat}</span>
            : <span className="wstat"><Icon name="git-commit-horizontal" />{w.files || "—"}</span>}
          <span style={{ flex: 1 }}></span>
          {live && <button className="wbtn kill" onClick={() => onKill(w.id)}><Icon name="skull" />Kill</button>}
          <button className="wbtn detail">Detail<Icon name="chevron-right" /></button>
        </div>
      </div>
    </div>
  );
}

function Stat({ num, label, dot, mono }) {
  return (
    <div className="card stat">
      <div className={`num ${mono ? "mono" : ""}`}>{num}</div>
      <div className="lab">{dot && <StatusDot status={dot} />}{label}</div>
    </div>
  );
}

function Dashboard({ sprint, workers, onNewSprint, onKill }) {
  useLucide();
  const done = workers.filter((w) => w.status === "DONE").length;
  const exec = workers.filter((w) => w.status === "EXECUTING").length;
  const total = sprint ? sprint.total : workers.length;
  const donePct = total ? (done / total) * 100 : 0;
  const execPct = total ? (exec / total) * 100 : 0;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-sub">Live sprint orchestration · {workers.length} workers</p>
        </div>
        <Button variant="default" onClick={onNewSprint}><Icon name="plus" /> New sprint</Button>
      </div>

      <div className="stat-grid">
        <Stat num={sprint ? sprint.id.replace("sprint-", "#") : "—"} label="Active sprint" mono />
        <Stat num={`${done}/${total}`} label="Tasks complete" dot="connected" />
        <Stat num={exec} label="Executing now" dot="connecting" />
        <Stat num={sprint ? sprint.phase : "IDLE"} label="Current phase" mono />
      </div>

      <div className="card card-pad" style={{ marginBottom: 24 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <h3 className="card-title">{sprint ? sprint.title : "No active sprint"}</h3>
            <p className="card-desc">{sprint ? sprint.id : "Start a sprint to dispatch workers"}</p>
          </div>
          {sprint && <Badge variant="info">{sprint.phase}</Badge>}
        </div>
        {sprint && (
          <React.Fragment>
            <div style={{ marginTop: 18 }} className="progress">
              <div style={{ width: `${donePct}%`, background: "var(--status-success)" }}></div>
              <div style={{ width: `${execPct}%`, background: "var(--accent-blue)" }}></div>
            </div>
            <p className="section-label" style={{ marginTop: 18 }}>Sprint lifecycle</p>
            <PhaseTimeline currentPhase={sprint.phase} />
          </React.Fragment>
        )}
      </div>

      <p className="section-label">Workers</p>
      {workers.length ? (
        <div className="worker-grid">
          {workers.map((w) => <WorkerCard key={w.id} w={w} onKill={onKill} />)}
        </div>
      ) : (
        <div className="empty">No active workers. Start a sprint to spawn workers.</div>
      )}
    </div>
  );
}

Object.assign(window, { Dashboard, WorkerCard });
