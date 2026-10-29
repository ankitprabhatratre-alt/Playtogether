import { GAME_CATALOG, winnerNames, winnersOf } from '@playtogether/shared';
import { useRoom } from './RoomProvider';
import { Avatar, Logo } from '../components/ui';

export function FinalResults() {
  const { snapshot, isHost, emit, creds, playersById } = useRoom();
  const final = snapshot?.session?.final;
  if (!snapshot?.session || !final) return null;
  const meta = GAME_CATALOG[snapshot.session.gameId];
  const top = final.standings.slice(0, 3);
  const podiumOrder = [top[1], top[0], top[2]].filter(Boolean);
  const mine = final.standings.find((s) => s.playerId === creds.playerId);
  const winners = winnersOf(final.standings);
  const names = winnerNames(final.standings);
  const headline = !names ? 'Game over' : winners.length === 1 ? `🏆 ${names} wins!` : `🤝 It's a tie! ${names}`;
  const tiedWithMe = mine ? final.standings.filter((s) => s.rank === mine.rank).length > 1 : false;

  return (
    <div className="page results-page" style={{ ['--accent' as string]: meta.accent }}>
      <header className="topbar">
        <Logo small />
        <span className="pill">
          {meta.emoji} {meta.name}
        </span>
      </header>
      <main className="container narrow stack">
        <div className="center-text">
          <p className="eyebrow">{final.endedEarly ? 'Game ended' : 'Final results'}</p>
          <h1>{headline}</h1>
          {final.note && <p className="muted">{final.note}</p>}
          {mine && (
            <p className="lead">
              You finished {tiedWithMe ? 'tied for ' : ''}<b>#{mine.rank}</b> with <b>{mine.score}</b> points.
            </p>
          )}
        </div>
        {podiumOrder.length > 0 && (
          <div className="podium" aria-hidden="true">
            {podiumOrder.map((s) => {
              const p = playersById.get(s.playerId);
              return (
                <div key={s.playerId} className={`podium-step rank-${s.rank}`}>
                  <Avatar name={s.name} color={p?.color ?? '#666'} size={52} />
                  <b>{s.name}</b>
                  <span>{s.score}</span>
                  <div className="podium-block">{s.rank === 1 ? '🥇' : s.rank === 2 ? '🥈' : '🥉'}</div>
                </div>
              );
            })}
          </div>
        )}
        <section className="card">
          <h2>Leaderboard</h2>
          <ol className="leaderboard">
            {final.standings.map((s) => (
              <li key={s.playerId} className={s.playerId === creds.playerId ? 'me' : ''}>
                <span className="rank">#{s.rank}</span>
                <Avatar name={s.name} color={playersById.get(s.playerId)?.color ?? '#666'} size={30} />
                <span className="sb-name">{s.name}</span>
                <span className="sb-score">{s.score}</span>
              </li>
            ))}
          </ol>
        </section>
        <section className="card center-text">
          {isHost ? (
            <div className="row gap center wrap">
              <button className="btn btn-primary btn-lg" onClick={() => emit('room:start')}>
                🔁 Play {meta.name} again
              </button>
              <button className="btn btn-secondary btn-lg" onClick={() => emit('room:returnToLobby')}>
                🎮 Back to lobby / choose another game
              </button>
            </div>
          ) : (
            <p className="muted">Waiting for the host to start another game…</p>
          )}
        </section>
      </main>
    </div>
  );
}
