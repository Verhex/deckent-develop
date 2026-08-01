/* NewSprintModal.jsx — mirrors NewSprintModal.tsx: a DIRECTIVES.md editor in a
   dialog. On launch it seeds a fresh sprint (PLAN phase) in the parent. */
const { useState } = React;

const SAMPLE_DIRECTIVES = `# DIRECTIVES — Sprint 222

## Goal: Ship OAuth login with session refresh.

## Task 1: OAuth provider + callback
- Model: opus
- Effort: high
- Skills: typescript-expert, security-specialist
- Scope: src/auth/

## Task 2: Session refresh middleware
- Model: sonnet
- Skills: api-builder
- Scope: src/middleware/`;

function NewSprintModal({ onClose, onLaunch }) {
  useLucide();
  const [val, setVal] = useState(SAMPLE_DIRECTIVES);
  const [title, setTitle] = useState("OAuth login + session refresh");
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>New sprint</h2>
        <p className="sub">Describe your goals. Brain plans tasks, spawns workers, and gates results.</p>
        <label>Sprint title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ width: "100%", boxSizing: "border-box", background: "transparent", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", color: "var(--foreground)", fontFamily: "inherit", fontSize: "var(--text-sm)", padding: "9px 12px", marginBottom: 16, outline: "none" }}
        />
        <label>DIRECTIVES.md</label>
        <textarea value={val} onChange={(e) => setVal(e.target.value)} spellCheck="false"></textarea>
        <div className="modal-foot">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="blue" onClick={() => onLaunch(title)}>
            <Icon name="rocket" /> Plan &amp; start
          </Button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { NewSprintModal });
