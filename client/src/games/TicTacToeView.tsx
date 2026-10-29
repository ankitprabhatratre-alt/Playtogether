import type { TicTacToePublic } from '@playtogether/shared';
import { useGame } from './useGame';
import { PlayerChip } from './common';

export function TicTacToeView({ pub }: { pub: TicTacToePublic }) {
  const { act, me, name, phase, pending, session } = useGame();
  const myMark = pub.xPlayerId === me ? 'X' : pub.oPlayerId === me ? 'O' : null;
  const myTurn = pub.stage === 'playing' && myMark === pub.turn;
  const turnPlayer = pub.turn === 'X' ? pub.xPlayerId : pub.oPlayerId;
  const res = pub.result;
  const winnerId = res?.winner ? (res.winner === 'X' ? pub.xPlayerId : pub.oPlayerId) : null;
  const moreMatches = pub.matchNumber < pub.totalMatches;
  const iRequested = pub.rematchRequests.includes(me);

  return (
    <div className="ttt stack">
      <div className="row between wrap">
        <span className="pill">
          Match {pub.matchNumber}/{pub.totalMatches}
        </span>
        {!myMark && <span className="pill">👀 Spectating</span>}
      </div>
      <div className="versus">
        <div className={`vs-player ${pub.turn === 'X' && pub.stage === 'playing' ? 'active' : ''}`}>
          <span className="mark mark-x">X</span>
          <PlayerChip id={pub.xPlayerId} />
        </div>
        <span className="vs">vs</span>
        <div className={`vs-player ${pub.turn === 'O' && pub.stage === 'playing' ? 'active' : ''}`}>
          <span className="mark mark-o">O</span>
          <PlayerChip id={pub.oPlayerId} />
        </div>
      </div>
      <p className="center-text turn-indicator" aria-live="polite">
        {pub.stage === 'playing'
          ? myTurn
            ? `👉 Your move (${myMark})`
            : `${name(turnPlayer)} is thinking…`
          : res?.winner
            ? `🏆 ${name(winnerId)} wins${res.reason === 'timeout' ? ' (opponent ran out of time)' : res.reason === 'forfeit' ? ' by forfeit' : '!'}`
            : '🤝 It\'s a draw!'}
      </p>
      <div className="board" role="group" aria-label="Tic-tac-toe board">
        {pub.board.map((cell, i) => {
          const win = res?.line?.includes(i);
          return (
            <button
              key={i}
              type="button"
              className={`cell ${cell ? `cell-${cell.toLowerCase()}` : ''} ${win ? 'cell-win' : ''}`}
              disabled={!myTurn || cell !== null || pending}
              onClick={() => act({ type: 'move', cell: i })}
              aria-label={`Row ${Math.floor(i / 3) + 1}, column ${(i % 3) + 1}: ${cell ?? 'empty'}`}
            >
              {cell}
            </button>
          );
        })}
      </div>
      {phase === 'ROUND_RESULTS' && myMark && moreMatches && (
        <div className="center-text">
          <button className="btn btn-secondary" disabled={iRequested || pending} onClick={() => act({ type: 'rematch' })}>
            {iRequested ? 'Rematch requested ✓' : '🔁 Request rematch'}
          </button>
          <p className="muted small">{pub.rematchRequests.length}/2 players want a rematch</p>
        </div>
      )}
      <section className="stack-sm">
        <h3 className="small-h">Up next</h3>
        {pub.queue.length === 0 ? <p className="muted small">No one waiting. Same players again!</p> : (
          <ol className="queue">
            {pub.queue.map((id) => (
              <li key={id}>
                <PlayerChip id={id} />
              </li>
            ))}
          </ol>
        )}
      </section>
      <details>
        <summary>Win / loss / draw records</summary>
        <ul className="records">
          {session.participants.map((id) => {
            const r = pub.records[id] ?? { w: 0, l: 0, d: 0 };
            return (
              <li key={id}>
                {name(id)}: {r.w}W · {r.l}L · {r.d}D
              </li>
            );
          })}
        </ul>
      </details>
    </div>
  );
}
