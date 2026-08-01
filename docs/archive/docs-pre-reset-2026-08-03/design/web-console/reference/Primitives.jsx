/* Primitives.jsx — shared atoms for the deckent dashboard kit.
   Mirrors src/dashboard/src/components/ui/* (Badge, Button) + SprintPhaseTimeline. */
const { useEffect, useRef } = React;

/* Re-render Lucide SVGs after React paints. createIcons() converts any
   <i data-lucide="..."> in the document into an <svg>, idempotently. */
function useLucide(dep) {
  useEffect(() => {
    if (window.lucide) window.lucide.createIcons();
  });
}
function Icon({ name, className, style }) {
  return <i data-lucide={name} className={className} style={style}></i>;
}

function Badge({ variant = "default", xs, children, className = "", ...rest }) {
  return (
    <span className={`badge ${variant} ${xs ? "xs" : ""} ${className}`} {...rest}>
      {children}
    </span>
  );
}

function Button({ variant = "default", size, children, className = "", ...rest }) {
  return (
    <button className={`btn ${variant} ${size || ""} ${className}`} {...rest}>
      {children}
    </button>
  );
}

function StatusDot({ status }) {
  return <span className={`dot ${status}`}></span>;
}

const PHASES = ["PLAN", "SPAWN", "EXECUTE", "EVALUATE", "FIX", "RETRO", "DECAY", "CLEANUP"];
const Check = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
    <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function PhaseTimeline({ currentPhase }) {
  const idx = PHASES.indexOf(currentPhase);
  return (
    <div className="timeline">
      {PHASES.map((phase, i) => {
        const done = idx >= 0 && i < idx;
        const active = i === idx;
        const state = active ? "active" : done ? "done" : "future";
        return (
          <div className="row" key={phase} style={{ alignItems: "flex-start" }}>
            <div className="tl-node">
              <div className={`tl-circle ${state}`}>{done && <Check />}</div>
              <span className={`tl-cap ${state}`}>{phase}</span>
            </div>
            {i < PHASES.length - 1 && (
              <div className={`tl-conn ${done ? "done" : "future"}`}></div>
            )}
          </div>
        );
      })}
    </div>
  );
}

Object.assign(window, { useLucide, Icon, Badge, Button, StatusDot, PhaseTimeline, PHASES });
