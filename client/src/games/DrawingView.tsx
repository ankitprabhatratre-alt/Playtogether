import { useCallback, useEffect, useRef, useState, type FormEvent, type PointerEvent as RPointerEvent } from 'react';
import type { DrawingPublic, StrokeSegment } from '@playtogether/shared';
import { useGame } from './useGame';
import { ProgressAvatars } from './common';

const COLORS = ['#111111', '#e11d48', '#f97316', '#eab308', '#22c55e', '#0ea5e9', '#6366f1', '#a855f7', '#8b5a2b', '#ffffff'];
const SIZES = [4, 10, 22];
const RES = 10000; // normalized coordinate space
const FLUSH_MS = 40; // ~25 segment messages per second while drawing
const ASPECT = 4 / 3;

function drawSegment(ctx: CanvasRenderingContext2D, seg: StrokeSegment, w: number, h: number) {
  const pts = seg.points;
  if (pts.length < 2) return;
  ctx.strokeStyle = seg.color;
  ctx.fillStyle = seg.color;
  ctx.lineWidth = (seg.size * w) / 800;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (pts.length === 2) {
    ctx.beginPath();
    ctx.arc((pts[0] / RES) * w, (pts[1] / RES) * h, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo((pts[0] / RES) * w, (pts[1] / RES) * h);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo((pts[i] / RES) * w, (pts[i + 1] / RES) * h);
  ctx.stroke();
}

export function DrawingView({ pub }: { pub: DrawingPublic }) {
  const { priv, act, me, name, pending, isParticipant, canvas, sendStroke, session } = useGame();
  const p = priv?.gameId === 'drawing' ? priv.data : null;
  const isDrawer = pub.drawerId === me;
  const canDraw = isDrawer && pub.stage === 'drawing';
  const [guess, setGuess] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(SIZES[1]);
  const feedRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight });
  }, [pub.feed.length]);

  const submitGuess = async (e: FormEvent) => {
    e.preventDefault();
    if (!guess.trim()) return;
    const res = await act({ type: 'guess', text: guess.trim() });
    if (res.ok) setGuess('');
  };

  return (
    <div className="drawing">
      <div className="drawing-head">
        <span className="pill">
          Turn {pub.turn}/{pub.totalTurns}
        </span>
        {pub.stage === 'drawing' && (
          <div className="hint" aria-label={isDrawer || p?.word ? `Word: ${p?.word}` : `Hint: ${pub.wordLength} letters`}>
            {isDrawer || p?.word ? <b>{p?.word}</b> : <span className="hint-letters">{pub.hint}</span>}
            <small className="muted">
              {' '}
              ({pub.wordLength} letters)
            </small>
          </div>
        )}
        <span className="pill">🎨 {isDrawer ? 'You are drawing' : `${name(pub.drawerId)} is drawing`}</span>
      </div>

      {pub.stage === 'choosing' && (
        <div className="card center-text stack">
          {isDrawer && p?.wordChoices ? (
            <>
              <h2>Choose a word to draw</h2>
              <div className="row gap center wrap">
                {p.wordChoices.map((w, i) => (
                  <button key={w} className="btn btn-primary btn-lg" disabled={pending} onClick={() => act({ type: 'chooseWord', index: i })}>
                    {w}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <h2>{name(pub.drawerId)} is choosing a word…</h2>
          )}
        </div>
      )}

      {pub.stage !== 'choosing' && (
        <div className="drawing-body">
          <div className="canvas-col">
            <Canvas enabled={canDraw} color={color} size={size} store={canvas} onSegment={sendStroke} />
            {canDraw && (
              <div className="tools" role="toolbar" aria-label="Drawing tools">
                <div className="row wrap gap-sm">
                  {COLORS.map((c) => (
                    <button key={c} type="button" className={`swatch ${c === color ? 'on' : ''}`} style={{ background: c }} aria-label={c === '#ffffff' ? 'Eraser (white)' : `Colour ${c}`} aria-pressed={c === color} onClick={() => setColor(c)} />
                  ))}
                </div>
                <div className="row gap-sm">
                  {SIZES.map((s) => (
                    <button key={s} type="button" className={`size-btn ${s === size ? 'on' : ''}`} aria-label={`Brush size ${s}`} aria-pressed={s === size} onClick={() => setSize(s)}>
                      <i style={{ width: s / 1.5 + 4, height: s / 1.5 + 4 }} />
                    </button>
                  ))}
                  <button type="button" className="btn btn-small btn-ghost" onClick={() => act({ type: 'undo' })}>
                    ↶ Undo
                  </button>
                  <button type="button" className="btn btn-small btn-ghost" onClick={() => act({ type: 'clear' })}>
                    🗑 Clear
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="guess-col">
            {pub.stage === 'reveal' && pub.reveal && (
              <div className="result-banner good">
                The word was <b>{pub.reveal.word}</b>
              </div>
            )}
            <ul className="feed" ref={feedRef} aria-live="polite">
              {pub.feed.map((f) => (
                <li key={f.id} className={`feed-${f.kind}`}>
                  {f.kind === 'guess' ? (
                    <>
                      <b>{name(f.playerId)}:</b> {f.text}
                    </>
                  ) : (
                    f.text
                  )}
                </li>
              ))}
            </ul>
            {pub.stage === 'drawing' && isParticipant && !isDrawer && (
              p?.guessedCorrectly ? (
                <p className="notice">🎉 You got it! Waiting for others…</p>
              ) : (
                <form className="row gap" onSubmit={submitGuess}>
                  <input value={guess} onChange={(e) => setGuess(e.target.value)} placeholder="Type your guess…" aria-label="Your guess" maxLength={50} autoComplete="off" />
                  <button className="btn btn-primary" disabled={pending}>
                    Guess
                  </button>
                </form>
              )
            )}
            {pub.stage === 'drawing' && <ProgressAvatars ids={session.participants.filter((id) => id !== pub.drawerId)} doneIds={pub.guessedIds} label="guessed" />}
          </div>
        </div>
      )}
    </div>
  );
}

interface CanvasProps {
  enabled: boolean;
  color: string;
  size: number;
  store: { segments: StrokeSegment[]; push(s: StrokeSegment): void; subscribe(l: (e: { type: 'segment'; segment: StrokeSegment } | { type: 'replace' }) => void): () => void };
  onSegment: (seg: StrokeSegment) => void;
}

/**
 * Shared canvas. Strokes are streamed as small batched segments of normalized points
 * (never full images). Each new segment starts with the previous segment's last point
 * so lines stay continuous for viewers.
 */
function Canvas({ enabled, color, size, store, onSegment }: CanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dims = useRef({ w: 0, h: 0 });
  const stroke = useRef<{ id: string; pending: number[]; last: [number, number] | null; timer: number | null; sent: boolean } | null>(null);

  const redraw = useCallback(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const { w, h } = dims.current;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    const dpr = c.width / Math.max(1, w);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const s of store.segments) drawSegment(ctx, s, w, h);
  }, [store]);

  // Size canvas to its container (crisp on high-DPI screens) and redraw.
  useEffect(() => {
    const wrap = wrapRef.current;
    const c = canvasRef.current;
    if (!wrap || !c) return;
    const resize = () => {
      const w = wrap.clientWidth;
      const h = w / ASPECT;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      dims.current = { w, h };
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      c.style.height = `${h}px`;
      redraw();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [redraw]);

  useEffect(
    () =>
      store.subscribe((e) => {
        if (e.type === 'replace') return redraw();
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx) drawSegment(ctx, e.segment, dims.current.w, dims.current.h);
      }),
    [store, redraw],
  );

  const toNorm = (e: RPointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * RES);
    const y = Math.round(Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) * RES);
    return [x, y];
  };

  const flush = (final = false) => {
    const s = stroke.current;
    if (!s) return;
    // Need at least one new point beyond the carried-over one; a lone tap is sent once as a dot.
    if (s.pending.length < 4 && !(final && !s.sent && s.pending.length === 2)) return;
    s.sent = true;
    const seg: StrokeSegment = { strokeId: s.id, color, size, points: s.pending };
    store.push(seg); // draw locally right away
    onSegment(seg);
    const lx = s.pending[s.pending.length - 2];
    const ly = s.pending[s.pending.length - 1];
    s.pending = [lx, ly];
  };

  const down = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (!enabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = toNorm(e);
    stroke.current = { id: Math.random().toString(36).slice(2, 12), pending: [...pt], last: pt, timer: window.setInterval(() => flush(), FLUSH_MS), sent: false };
  };
  const move = (e: RPointerEvent<HTMLCanvasElement>) => {
    const s = stroke.current;
    if (!enabled || !s) return;
    const pt = toNorm(e);
    if (s.last && Math.abs(pt[0] - s.last[0]) + Math.abs(pt[1] - s.last[1]) < 12) return; // drop sub-pixel jitter
    s.pending.push(pt[0], pt[1]);
    s.last = pt;
    if (s.pending.length >= 360) flush();
  };
  const up = () => {
    const s = stroke.current;
    if (!s) return;
    if (s.timer) clearInterval(s.timer);
    flush(true);
    stroke.current = null;
  };

  useEffect(() => () => up(), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={wrapRef} className={`canvas-wrap ${enabled ? 'can-draw' : ''}`}>
      <canvas ref={canvasRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} aria-label={enabled ? 'Drawing canvas: draw here' : 'Shared drawing canvas'} role="img" />
    </div>
  );
}
