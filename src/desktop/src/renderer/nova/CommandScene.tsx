/**
 * 589/R1c — «Komuta» ana-sahnesi (Alperen-seçimi NOVA-eli, anayasa §sahne):
 * radial-ÇEKİRDEK (faz-yayı + nabız) + worker YÖRÜNGE-SEGMENTLERİ (ışıma=
 * aktivite, sarı=bayat) + satır-doğuş KIVILCIMLARI → TELEMETRİ-NEHRİ + seçili-
 * worker OSİLOSKOP-izi + ÇALIŞAN komuta-girdisi (chat-stream). Konuşma ve
 * orkestra TEK sahnede (B1-kararı).
 *
 * Motor: api-client (getSprintLive 1sn-poll → R7'de /api/live SSE'ye evrilir;
 * openWorkerLog named-SSE; openChatStream). Renkler CANLI token'lardan
 * (getComputedStyle — kanun-10: literal yok); tüm sahne-matematiği
 * scene-geometry.ts'te pinli. reduced-motion → animasyon-karesi durur,
 * bilgi kalır.
 */
import { useEffect, useRef, useState } from 'react';
import {
  createApiClient,
  type DaemonApiClient,
  type SprintLiveSnapshotPayload,
  type SprintLiveWorkerPayload,
} from '../shell/api-client.js';
import { useShellStore } from '../shell/session-store.js';
import { humanizeLogLine } from '../shell/log-humanize.js';
import { semanticVarName } from '../shell/xterm-theme.js';
import {
  phaseArcFraction, orbitSegments, hitOrbitIndex,
  pulseOnLine, pulseOnHeartbeat, pulseDecay, sparkPosition, STALE_MS,
  type PulseState,
} from './scene-geometry.js';

export const MSG = {
  idle: 'desktop.nova.scene.idle',
  connecting: 'desktop.nova.scene.connecting',
  offline: 'desktop.nova.scene.offline',
  ready: 'desktop.nova.scene.ready',
  you: 'desktop.nova.river.you',
  deckent: 'desktop.nova.river.deckent',
  cmdPlaceholder: 'desktop.nova.cmd.placeholder',
  cmdHint: 'desktop.nova.cmd.hint',
} as const;

function useT(): (key: string) => string {
  const strings = useShellStore((s) => s.strings);
  return (key) => strings[key] ?? key;
}

interface RiverRow { src: string; text: string; tone: 'worker' | 'me' | 'deckent'; colorIndex: number }
interface Spark { taskId: string; t: number }

const RIVER_CAP = 12;
const OSC_SAMPLES = 240;

function cssColor(name: Parameters<typeof semanticVarName>[0]): string {
  return getComputedStyle(document.documentElement).getPropertyValue(semanticVarName(name)).trim();
}

export default function CommandScene(): React.JSX.Element {
  const t = useT();
  const session = useShellStore((s) => s.session);
  const apiRef = useRef<DaemonApiClient | null>(null);
  if (session && apiRef.current?.session !== session) apiRef.current = createApiClient(session);
  const api = apiRef.current;

  const [snap, setSnap] = useState<SprintLiveSnapshotPayload | null>(null);
  const [river, setRiver] = useState<RiverRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [offline, setOffline] = useState(false);

  // Kalıcı sahne-durumu (render-dışı): nabızlar, kıvılcımlar, osiloskop.
  const pulses = useRef(new Map<string, PulseState>());
  const sparks = useRef<Spark[]>([]);
  const feeds = useRef(new Map<string, () => void>());
  const osc = useRef<number[]>(Array.from({ length: OSC_SAMPLES }, () => 0));
  const snapRef = useRef<SprintLiveSnapshotPayload | null>(null);
  const selRef = useRef<string | null>(null);
  selRef.current = selected;

  const pushRiver = (row: RiverRow): void =>
    setRiver((current) => [row, ...current].slice(0, RIVER_CAP));

  // ── canlı-poll (R7'de SSE olur) ──
  useEffect(() => {
    if (!api) return;
    let cancelled = false;
    const tick = async (): Promise<void> => {
      try {
        const next = await api.getSprintLive();
        if (cancelled) return;
        setOffline(false);
        setSnap(next);
        snapRef.current = next;
        for (const worker of next.workers) {
          const p = pulses.current.get(worker.taskId) ?? { level: 0, lastSeq: -1 };
          pulses.current.set(worker.taskId, pulseOnHeartbeat(p, worker.hb?.sequence ?? -1));
          ensureFeed(worker);
        }
      } catch {
        if (!cancelled) setOffline(true);
      }
    };
    const timer = setInterval(() => void tick(), 1_000);
    void tick();
    return () => { cancelled = true; clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  // ── worker-akışları: satır → nabız + kıvılcım + nehir ──
  function ensureFeed(worker: SprintLiveWorkerPayload): void {
    if (!api || feeds.current.has(worker.taskId)) return;
    const close = api.openWorkerLog(worker.taskId, {
      onLine: (raw) => {
        const line = humanizeLogLine(raw);
        const index = (snapRef.current?.workers ?? []).findIndex((w) => w.taskId === worker.taskId);
        pushRiver({ src: worker.taskId, text: line, tone: 'worker', colorIndex: Math.max(0, index) });
        const p = pulses.current.get(worker.taskId) ?? { level: 0, lastSeq: -1 };
        pulses.current.set(worker.taskId, pulseOnLine(p));
        sparks.current.push({ taskId: worker.taskId, t: 0 });
      },
      onUnavailable: () => { /* dürüst-boş: satır gelmeden sahne zaten nefes-modunda */ },
    });
    feeds.current.set(worker.taskId, close);
  }
  useEffect(() => () => { for (const close of feeds.current.values()) close(); }, []);

  // ── komuta: gerçek chat-stream ──
  const transmit = (): void => {
    const message = draft.trim();
    if (!api || message.length === 0) return;
    setDraft('');
    pushRiver({ src: t(MSG.you), text: message, tone: 'me', colorIndex: 0 });
    let buffer = '';
    api.openChatStream(message, {
      onChunk: (chunk) => { buffer += chunk; },
      onDone: (reply) => pushRiver({ src: t(MSG.deckent), text: (reply || buffer).slice(0, 240), tone: 'deckent', colorIndex: 0 }),
      onError: (err) => pushRiver({ src: t(MSG.deckent), text: `⚠ ${err}`, tone: 'deckent', colorIndex: 0 }),
    });
  };

  // ── canvas-sahne ──
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let frameId = 0;
    let tick = 0;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    const draw = (): void => {
      const dp = devicePixelRatio;
      const w = canvas.clientWidth * dp, h = canvas.clientHeight * dp;
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      ctx.clearRect(0, 0, w, h);
      tick += 1;
      const live = snapRef.current;
      const alive = live?.active === true;
      const cx = w / 2, cy = h * 0.44;
      const accent = cssColor('accent') || '#38D3FF';
      const amber = cssColor('caution') || '#E8B34C';
      const ink = cssColor('text') || '#D7E7EE';
      const muted = cssColor('text-muted') || '#6E8A98';
      const breathe = alive ? 1 : 0.55 + 0.25 * Math.sin(tick / 60);

      // ambient-halkalar
      for (let i = 3; i >= 1; i--) {
        ctx.beginPath();
        ctx.arc(cx, cy, (150 + i * 58) * dp * (1 + (alive ? 0.006 : 0.012) * Math.sin(tick / (40 + i * 9))), 0, 7);
        ctx.strokeStyle = accent; ctx.globalAlpha = 0.03 * breathe / i;
        ctx.lineWidth = dp; ctx.stroke(); ctx.globalAlpha = 1;
      }
      // çekirdek + faz-yayı
      const coreR = 72 * dp * (1 + (alive ? 0.02 : 0.045) * Math.sin(tick / 24));
      const glow = ctx.createRadialGradient(cx, cy, coreR * 0.2, cx, cy, coreR * 1.9);
      glow.addColorStop(0, accent); glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.3 * breathe; ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(cx, cy, coreR * 1.9, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(cx, cy, coreR, 0, 7);
      ctx.strokeStyle = accent; ctx.globalAlpha = 0.7; ctx.lineWidth = 1.6 * dp; ctx.stroke(); ctx.globalAlpha = 1;
      const frac = phaseArcFraction(live?.phase ?? null);
      if (frac > 0) {
        ctx.beginPath(); ctx.arc(cx, cy, coreR + 9 * dp, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
        ctx.strokeStyle = accent; ctx.lineWidth = 3 * dp; ctx.lineCap = 'round'; ctx.stroke();
      }
      ctx.fillStyle = ink; ctx.font = `${11 * dp}px "Geist Mono", monospace`; ctx.textAlign = 'center';
      ctx.fillText(live?.phase ?? (alive ? '…' : t(MSG.ready)), cx, cy + 4 * dp);
      if (live?.sprintId) {
        ctx.fillStyle = muted; ctx.font = `${8.5 * dp}px "Geist Mono", monospace`;
        ctx.fillText(live.sprintId, cx, cy + 18 * dp);
      }
      // yörünge-segmentleri
      const workers = live?.workers ?? [];
      const segments = orbitSegments(workers.map((worker) => worker.taskId));
      const R = 128 * dp;
      segments.forEach((segment, index) => {
        const worker = workers[index] as SprintLiveWorkerPayload;
        let p = pulses.current.get(segment.taskId) ?? { level: 0, lastSeq: -1 };
        p = pulseDecay(p); pulses.current.set(segment.taskId, p);
        const stale = (worker.hb?.ageMs ?? 0) > STALE_MS;
        const color = stale ? amber : accent;
        const wobble = (10 * Math.sin(tick / 50 + index)) * dp;
        ctx.beginPath(); ctx.arc(cx, cy, R + wobble, segment.a0, segment.a1);
        ctx.strokeStyle = color; ctx.globalAlpha = 0.3 + 0.65 * p.level;
        ctx.lineWidth = (5 + 9 * p.level) * dp; ctx.lineCap = 'round'; ctx.stroke(); ctx.globalAlpha = 1;
        if (selRef.current === segment.taskId) {
          ctx.beginPath(); ctx.arc(cx, cy, R + wobble, segment.a0, segment.a1);
          ctx.strokeStyle = ink; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.2 * dp; ctx.stroke(); ctx.globalAlpha = 1;
        }
        const lx = cx + Math.cos(segment.mid) * (R + 32 * dp);
        const ly = cy + Math.sin(segment.mid) * (R + 32 * dp);
        ctx.fillStyle = color; ctx.font = `${10 * dp}px "Geist Mono", monospace`;
        ctx.fillText(segment.taskId, lx, ly);
        ctx.fillStyle = muted; ctx.font = `${8.5 * dp}px "Geist Mono", monospace`;
        ctx.fillText(worker.hb ? `${Math.round(worker.hb.ageMs / 1000)}s` : worker.status, lx, ly + 12 * dp);
      });
      // kıvılcımlar → nehir-ağzı
      const mouthY = h - 176 * dp;
      for (let i = sparks.current.length - 1; i >= 0; i--) {
        const spark = sparks.current[i] as Spark;
        spark.t += 0.02;
        const index = segments.findIndex((s) => s.taskId === spark.taskId);
        if (index < 0 || spark.t >= 1) { sparks.current.splice(i, 1); continue; }
        const mid = (segments[index] as { mid: number }).mid;
        const pos = sparkPosition(cx + Math.cos(mid) * R, cy + Math.sin(mid) * R, cx, mouthY, spark.t);
        ctx.beginPath(); ctx.arc(pos.x, pos.y, 2.4 * dp * (1 - spark.t * 0.5), 0, 7);
        ctx.fillStyle = accent; ctx.globalAlpha = 0.8 * pos.alpha; ctx.fill(); ctx.globalAlpha = 1;
      }
      // osiloskop (seçili-worker)
      const sel = selRef.current;
      const level = sel ? (pulses.current.get(sel)?.level ?? 0) : (alive ? 0.05 : 0.02 + 0.02 * Math.sin(tick / 9));
      osc.current.push(level); osc.current.shift();
      const ow = Math.min(560 * dp, w * 0.6), ox = cx - ow / 2, oy = cy + 232 * dp;
      ctx.beginPath();
      osc.current.forEach((value, i) => {
        const x = ox + (i / OSC_SAMPLES) * ow;
        const y = oy - value * 46 * dp * (1 + 0.3 * Math.sin(i / 3 + tick / 5));
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.strokeStyle = accent; ctx.globalAlpha = sel ? 0.85 : 0.3;
      ctx.lineWidth = 1.4 * dp; ctx.stroke(); ctx.globalAlpha = 1;

      if (!reduced) frameId = requestAnimationFrame(draw);
    };
    frameId = requestAnimationFrame(draw);
    if (reduced) { const id = setInterval(draw, 1000); return () => { clearInterval(id); cancelAnimationFrame(frameId); }; }
    return () => cancelAnimationFrame(frameId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    const canvas = canvasRef.current;
    const live = snapRef.current;
    if (!canvas || !live) return;
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2, cy = rect.height * 0.44;
    const index = hitOrbitIndex(e.clientX - rect.left - cx, e.clientY - rect.top - cy, live.workers.length, 92, 190);
    setSelected(index === null ? null : (live.workers[index]?.taskId ?? null));
  };

  return (
    <div className="nova-scene">
      <canvas ref={canvasRef} className="nova-scene__canvas" onClick={onCanvasClick} />
      {!snap?.active && (
        <p className="nova-scene__idle mono">{offline ? t(MSG.offline) : t(MSG.idle)}</p>
      )}
      <ol className="nova-river" aria-live="polite">
        {river.map((row, index) => (
          <li key={`${row.src}-${index}-${row.text.slice(0, 12)}`} className={`nova-river__row nova-river__row--${row.tone}`} data-ci={row.colorIndex % 6}>
            <span className="nova-river__src mono">{row.src}</span>
            <span className="nova-river__txt">{row.text}</span>
          </li>
        ))}
      </ol>
      <form
        className="nova-cmd"
        onSubmit={(e) => { e.preventDefault(); transmit(); }}
      >
        <input
          className="nova-cmd__input mono"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t(MSG.cmdPlaceholder)}
          aria-label={t(MSG.cmdPlaceholder)}
          autoComplete="off"
        />
        <p className="nova-cmd__hint mono">{t(MSG.cmdHint)}</p>
      </form>
    </div>
  );
}
