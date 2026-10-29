import { useEffect, useState } from 'react';

/** Remaining ms until a server-time deadline, using the measured clock offset. */
export function useCountdown(deadline: number | null, clockOffset: number): number {
  const calc = () => (deadline === null ? 0 : Math.max(0, deadline - (Date.now() + clockOffset)));
  const [remaining, setRemaining] = useState(calc);
  useEffect(() => {
    setRemaining(calc());
    if (deadline === null) return;
    const id = setInterval(() => setRemaining(calc()), 100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline, clockOffset]);
  return remaining;
}

export function TimerBar({ deadline, total, clockOffset, label }: { deadline: number | null; total: number | null; clockOffset: number; label?: string }) {
  const remaining = useCountdown(deadline, clockOffset);
  if (deadline === null || !total) return null;
  const pct = Math.max(0, Math.min(100, (remaining / total) * 100));
  const secs = Math.ceil(remaining / 1000);
  const urgent = secs <= 5;
  return (
    <div className={`timer ${urgent ? 'timer-urgent' : ''}`} role="timer" aria-label={`${label ?? 'Time left'}: ${secs} seconds`}>
      <div className="timer-track">
        <div className="timer-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="timer-num" aria-hidden="true">
        {secs}s
      </span>
    </div>
  );
}
