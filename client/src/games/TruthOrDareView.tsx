import type { TruthOrDarePublic } from '@playtogether/shared';
import { useGame } from './useGame';
import { PlayerChip } from './common';

export function TruthOrDareView({ pub }: { pub: TruthOrDarePublic }) {
  const { act, me, name, isHost, pending, phase } = useGame();
  const mine = pub.currentPlayerId === me;
  const canControl = (mine || isHost) && phase === 'PLAYING';
  return (
    <div className="tod stack">
      <div className="row between wrap">
        <span className="pill">
          Turn {pub.turn}/{pub.totalTurns}
        </span>
        <span className="pill">Round {pub.cycle}</span>
      </div>
      {pub.stage === 'reveal' ? (
        <div className="result-banner good">Round {pub.cycle} complete! 🎉</div>
      ) : (
        <>
          <div className="center-text">
            <p className="muted">Current player</p>
            <div className="tod-current">
              <PlayerChip id={pub.currentPlayerId} />
            </div>
            <p className="turn-indicator" aria-live="polite">
              {mine ? '👉 Your turn!' : pub.stage === 'choosing' ? `${name(pub.currentPlayerId)} is choosing…` : `${name(pub.currentPlayerId)} got a ${pub.choice}!`}
            </p>
          </div>
          {pub.stage === 'choosing' ? (
            <div className="tod-choices">
              <button className="tod-btn truth" disabled={!canControl || pending} onClick={() => act({ type: 'choose', choice: 'truth' })}>
                💬 Truth
              </button>
              <button className="tod-btn dare" disabled={!canControl || pending} onClick={() => act({ type: 'choose', choice: 'dare' })}>
                🔥 Dare
              </button>
            </div>
          ) : (
            <div className={`prompt-card ${pub.choice}`} aria-live="polite">
              <small>
                {pub.choice === 'truth' ? '💬 Truth' : '🔥 Dare'} · {pub.promptCategory}
              </small>
              <p>{pub.prompt}</p>
            </div>
          )}
          {canControl && (
            <div className="row gap center wrap">
              {pub.stage === 'prompt' && (
                <button className="btn btn-primary" disabled={pending} onClick={() => act({ type: 'complete' })}>
                  ✅ Done (+{pub.choice === 'dare' ? 2 : 1})
                </button>
              )}
              <button className="btn btn-ghost" disabled={pending} onClick={() => act({ type: 'skip' })}>
                ⏭ Skip{!mine ? ' (host)' : ''}
              </button>
            </div>
          )}
          <p className="muted small center-text">Skipping is always okay. No one has to share anything private or do anything they're uncomfortable with.</p>
        </>
      )}
      {pub.history.length > 0 && (
        <section>
          <h3 className="small-h">Recent turns</h3>
          <ul className="history-list">
            {pub.history.map((h, i) => (
              <li key={i}>
                <b>{name(h.playerId)}</b> · {h.choice} · {h.outcome === 'done' ? '✅' : '⏭ skipped'}
                <div className="muted small">{h.prompt}</div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
