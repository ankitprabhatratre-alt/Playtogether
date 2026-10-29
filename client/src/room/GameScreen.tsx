import { useState } from 'react';
import { GAME_CATALOG, type GameStateUnion } from '@playtogether/shared';
import { useRoom } from './RoomProvider';
import { TimerBar, useCountdown } from '../components/Countdown';
import { Avatar, ConfirmButton, Spinner } from '../components/ui';
import { GameView } from '../games/GameView';

export function GameScreen() {
  const { snapshot, isHost, emit, clockOffset, creds, playersById } = useRoom();
  const [showBoard, setShowBoard] = useState(false);
  if (!snapshot?.session) return null;
  const { session, phase } = snapshot;
  const meta = GAME_CATALOG[session.gameId];
  const spectating = !session.participants.includes(creds.playerId);
  const myScore = session.scores[creds.playerId] ?? 0;
  const timer = phase === 'PLAYING' ? { d: session.deadline, t: session.deadlineTotal } : { d: snapshot.phaseDeadline, t: snapshot.phaseDeadlineTotal };

  return (
    <div className="page game-page" style={{ ['--accent' as string]: meta.accent }}>
      <header className="game-bar">
        <div className="game-bar-title">
          <span aria-hidden="true">{meta.emoji}</span>
          <div>
            <b>{meta.name}</b>
            <small>
              {session.totalRounds ? `Round ${session.round} of ${session.totalRounds}` : `Round ${session.round}`}
              {phase === 'ROUND_RESULTS' && ' · results'}
            </small>
          </div>
        </div>
        <div className="row gap">
          {!spectating && (
            <span className="score-chip" aria-label={`Your score ${myScore}`}>
              ⭐ {myScore}
            </span>
          )}
          <button className="btn btn-small btn-ghost board-toggle" onClick={() => setShowBoard((s) => !s)} aria-expanded={showBoard} aria-controls="scoreboard">
            🏆
          </button>
        </div>
      </header>
      <TimerBar deadline={timer.d} total={timer.t} clockOffset={clockOffset} />

      {spectating && <div className="notice spectator">👀 You're spectating this game. You'll play in the next one!</div>}

      <div className="game-layout">
        <main className="game-main">
          {phase === 'GAME_STARTING' ? (
            <Interstitial title="Get ready!" subtitle={meta.howToPlay[0]} deadline={snapshot.phaseDeadline} offset={clockOffset} emoji={meta.emoji} />
          ) : phase === 'NEXT_ROUND' ? (
            <Interstitial title={`Round ${session.round + 1}`} subtitle="Next round starting…" deadline={snapshot.phaseDeadline} offset={clockOffset} emoji="⏭️" />
          ) : session.state ? (
            <GameView state={session.state as GameStateUnion} />
          ) : (
            <Spinner label="Loading game…" />
          )}
        </main>
        <aside id="scoreboard" className={`scoreboard card ${showBoard ? 'open' : ''}`} aria-label="Scoreboard">
          <h2>Scores</h2>
          <ol>
            {[...session.participants]
              .sort((a, b) => (session.scores[b] ?? 0) - (session.scores[a] ?? 0))
              .map((id, i) => {
                const p = playersById.get(id);
                const delta = session.roundDeltas[id] ?? 0;
                return (
                  <li key={id} className={id === creds.playerId ? 'me' : ''}>
                    <span className="rank">{i + 1}</span>
                    <Avatar name={p?.name ?? '?'} color={p?.color ?? '#555'} size={28} online={p?.online ?? false} />
                    <span className="sb-name">
                      {p?.name ?? 'Left'}
                      {!p?.online && <small className="muted"> (offline)</small>}
                    </span>
                    {(phase === 'ROUND_RESULTS' || phase === 'NEXT_ROUND') && delta !== 0 && <span className="delta">+{delta}</span>}
                    <span className="sb-score">{session.scores[id] ?? 0}</span>
                  </li>
                );
              })}
          </ol>
          {isHost && (
            <div className="host-controls">
              <p className="eyebrow">Host controls</p>
              <div className="row gap wrap">
                {(phase === 'ROUND_RESULTS' || phase === 'NEXT_ROUND' || phase === 'GAME_STARTING') && (
                  <button className="btn btn-small btn-secondary" onClick={() => emit('room:next')}>
                    Skip wait ▶
                  </button>
                )}
                <ConfirmButton className="btn btn-small btn-danger" confirmText="End the game now and show final results?" onConfirm={() => emit('room:endGame')}>
                  End game
                </ConfirmButton>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Interstitial({ title, subtitle, deadline, offset, emoji }: { title: string; subtitle: string; deadline: number | null; offset: number; emoji: string }) {
  const remaining = useCountdown(deadline, offset);
  return (
    <div className="interstitial" aria-live="polite">
      <div className="interstitial-emoji" aria-hidden="true">
        {emoji}
      </div>
      <h1>{title}</h1>
      <div className="interstitial-count">{Math.max(1, Math.ceil(remaining / 1000))}</div>
      <p className="muted">{subtitle}</p>
    </div>
  );
}
