import type { WouldYouRatherPublic } from '@playtogether/shared';
import { useGame } from './useGame';
import { ProgressAvatars } from './common';

export function WouldYouRatherView({ pub }: { pub: WouldYouRatherPublic }) {
  const { priv, act, isParticipant, session, name, pending } = useGame();
  const myVote = priv?.gameId === 'wouldyourather' ? priv.data.myVote : null;
  const r = pub.reveal;
  const option = (key: 'A' | 'B', text: string) => {
    const pct = r ? (key === 'A' ? r.percentA : r.percentB) : 0;
    const count = r ? (key === 'A' ? r.countA : r.countB) : 0;
    const winner = r && ((key === 'A' && r.countA > r.countB) || (key === 'B' && r.countB > r.countA));
    return (
      <button
        type="button"
        className={`wyr-option wyr-${key.toLowerCase()} ${myVote === key ? 'chosen' : ''} ${winner ? 'winner' : ''}`}
        disabled={!isParticipant || pub.stage !== 'voting' || pending}
        onClick={() => act({ type: 'vote', choice: key })}
        aria-pressed={myVote === key}
      >
        {r && <span className="wyr-fill" style={{ height: `${pct}%` }} aria-hidden="true" />}
        <span className="wyr-text">{text}</span>
        {r && (
          <span className="wyr-pct">
            {pct}% <small>({count})</small>
          </span>
        )}
        {myVote === key && <span className="wyr-mine">Your pick</span>}
      </button>
    );
  };
  return (
    <div className="wyr stack">
      <div className="row between wrap">
        <span className="pill">
          Question {pub.index + 1}/{pub.total}
        </span>
        {pub.scoring === 'majority' && <span className="pill">+1 for siding with the majority</span>}
      </div>
      <h2 className="center-text">Would you rather…</h2>
      <div className="wyr-options">
        {option('A', pub.optionA)}
        <span className="wyr-or" aria-hidden="true">
          OR
        </span>
        {option('B', pub.optionB)}
      </div>
      {r ? (
        <p className="center-text muted">
          {r.countA + r.countB} of {session.participants.length} voted
          {r.nonVoterIds.length > 0 && ` · didn't vote: ${r.nonVoterIds.map(name).join(', ')}`}
        </p>
      ) : (
        <>
          {isParticipant && <p className="center-text muted small">{myVote ? 'You can change your mind until everyone has voted.' : 'Votes are anonymous. Only totals are shown.'}</p>}
          <ProgressAvatars ids={session.participants} doneIds={pub.votedIds} label="voted" />
        </>
      )}
    </div>
  );
}
