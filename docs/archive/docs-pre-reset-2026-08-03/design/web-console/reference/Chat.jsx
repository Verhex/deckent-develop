/* Chat.jsx — conversational view. Mirrors ChatPage: notification panel,
   message history (bot/user/slash bubbles), slash-hint input, task-context
   sidebar. Replies are canned + faux-streamed for the demo. */
const { useState, useRef, useEffect } = React;

const SLASH = [
  { name: "/help", desc: "Slash command list" },
  { name: "/clear", desc: "Clear the conversation" },
  { name: "/status", desc: "Sprint status" },
  { name: "/recall", desc: "Search memory" },
  { name: "/plan", desc: "Sprint plan" },
];

function cannedReply(msg) {
  const m = msg.toLowerCase();
  if (m.startsWith("/status")) return "sprint-221 · phase EXECUTE · 3 workers active, 1 done. Auditor: clean. No boundary violations.";
  if (m.startsWith("/recall")) return "Recalled 2 entries:\n• ADR-037 — Brain-Auditor-Worker RBAC matrix\n• pattern: docker heartbeat retry on stale hb";
  if (m.startsWith("/plan")) return "Planned 4 scoped tasks from DIRECTIVES.md. Run `deckent start` to dispatch.";
  if (m.includes("test")) return "I'll route a testing task to a Codex worker and gate it GO/NO-GO. Want me to add it to the current sprint?";
  return "On it. I'll plan that as a scoped task, spawn a worker, and report a GO/NO-GO verdict when it lands. Memory from past sprints is in context.";
}

function ChatInput({ onSend, disabled }) {
  const [value, setValue] = useState("");
  const ref = useRef(null);
  const hints = value.startsWith("/") ? SLASH.filter((c) => c.name.startsWith(value.split(/\s/)[0])) : [];
  const submit = () => { const t = value.trim(); if (!t || disabled) return; onSend(t); setValue(""); ref.current?.focus(); };
  return (
    <div>
      {hints.length > 0 && (
        <div className="slash-hint">
          {hints.map((c) => (
            <div className="sh" key={c.name}><span className="name">{c.name}</span><span className="desc">{c.desc}</span></div>
          ))}
        </div>
      )}
      <div className="chat-input">
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
          placeholder="Ask deckent, or type / for commands…"
          disabled={disabled}
        />
        <button className="send-btn" onClick={submit} disabled={disabled || !value.trim()}>
          <Icon name="send" />
        </button>
      </div>
    </div>
  );
}

function Chat({ sprint, workers }) {
  useLucide();
  const [messages, setMessages] = useState([
    { id: 0, role: "assistant", content: "I'm deckent. Describe a goal and I'll plan a sprint, spawn parallel workers, and gate results. Try /status.", ts: Date.now() - 60000 },
  ]);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ block: "end" }); }, [messages]);

  const send = (content) => {
    const isSlash = content.startsWith("/");
    if (content === "/clear") { setMessages([]); return; }
    const userMsg = { id: Date.now(), role: "user", content, ts: Date.now(), isSlash };
    setMessages((p) => [...p, userMsg]);
    if (content === "/help") {
      setMessages((p) => [...p, { id: Date.now() + 1, role: "assistant", content: SLASH.map((c) => `${c.name} — ${c.desc}`).join("\n"), ts: Date.now() }]);
      return;
    }
    setSending(true);
    const full = cannedReply(content);
    const aId = Date.now() + 2;
    setMessages((p) => [...p, { id: aId, role: "assistant", content: "", ts: Date.now() }]);
    let i = 0;
    const tick = setInterval(() => {
      i += 3;
      setMessages((p) => p.map((m) => (m.id === aId ? { ...m, content: full.slice(0, i) } : m)));
      if (i >= full.length) { clearInterval(tick); setSending(false); }
    }, 18);
  };

  const notifs = [
    { id: 1, sev: "info", name: "nervous", msg: "Idle detector armed", ts: Date.now() - 120000 },
    { id: 2, sev: "warning", name: "auditor", msg: "w-221-002 approaching scope edge", ts: Date.now() - 40000 },
  ];
  const active = workers.filter((w) => w.status === "EXECUTING");

  return (
    <div className="chat-wrap">
      <div className="chat-main">
        <div className="chat-head"><Icon name="bot" /><h1>Chat with deckent</h1></div>
        <div className="notif">
          <div className="notif-head"><Icon name="bell" /><span>Notifications</span><Badge variant="secondary" xs>{notifs.length}</Badge></div>
          {notifs.map((n) => (
            <div className="notif-item" key={n.id}>
              <Badge variant={n.sev === "warning" ? "warning" : "info"} xs>{n.sev}</Badge>
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "#d4d4d8", fontWeight: 500 }}>{n.name}</p>
                <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--subtle-foreground)" }}>{n.msg}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="chat-history">
          {messages.map((m) => (
            <div className={`msg-row ${m.role}`} key={m.id}>
              {m.role === "assistant" && <div className="avatar bot"><Icon name="bot" /></div>}
              <div className={`bubble ${m.role === "user" ? (m.isSlash ? "slash" : "user") : "bot"}`}>
                <span style={{ whiteSpace: "pre-wrap" }}>{m.content || "…"}</span>
                <span className="ts">{new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              {m.role === "user" && <div className="avatar user"><Icon name="user" /></div>}
            </div>
          ))}
          <div ref={bottomRef}></div>
        </div>
        <ChatInput onSend={send} disabled={sending} />
      </div>
      <div className="task-sidebar">
        <div className="ts-head"><Icon name="activity" /><span>Task context</span></div>
        <div className="ts-body">
          <div className="ts-row"><span className="k">Sprint</span><span className="v">{sprint.id}</span></div>
          <div className="ts-row"><span className="k">Phase</span><Badge variant="info" xs>{sprint.phase}</Badge></div>
          <div className="ts-row"><span className="k">Progress</span><span className="v">{workers.filter((w) => w.status === "DONE").length}/{sprint.total}</span></div>
          {active.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <span className="k" style={{ fontSize: "var(--text-xs)", fontWeight: 500, color: "var(--muted-foreground)" }}>Active tasks</span>
              {active.map((w) => (
                <div key={w.id} style={{ borderRadius: "var(--radius-md)", background: "rgba(39,39,42,.5)", padding: 8, marginTop: 8 }}>
                  <div className="ts-row"><span className="v">{w.taskId}</span><Badge variant="success" xs>{w.status}</Badge></div>
                  {w.action && <p style={{ margin: "4px 0 0", fontSize: "var(--text-2xs)", color: "var(--subtle-foreground)" }}>{w.action}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Chat });
