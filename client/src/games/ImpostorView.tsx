import { useState, type FormEvent } from 'react';
import type { ImpostorPublic } from '@playtogether/shared';
import { useGame } from './useGame';
import { PlayerChip, ProgressAvatars } from './common';

export function ImpostorView({ pub }: { pub: ImpostorPublic }) {
  const { priv, act, me, name, pending, isParticipant, session } = useGame();
  const [clue, setClue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const p = priv?.gameId === 'impostor' ? priv.data : null;
  const roundPlayers = pub.clues ? pub.clues.map((c) => c.playerId) : null;

  const submitClue = async (e: FormEvent) => {
    e.preventDefault();
    if (!clue.trim()) return setError('Write a short clue first.');
    const res = await act({ type: 'clue', text: clue.trim() }, true);
    if (!res.ok) setError(res.error);
  };

  return (
    <div className="impostor stack">
      <div className="row between wrap">
        <span className="pill">Category: {pub.category}</span>
        <span className="pill">{pub.variant === 'blank' ? 'Blank impostor' : 'Undercover'}</span>
      </div>

      {isParticipant && p && pub.stage !== 'reveal' && (
        <button type="button" className={`secret-card ${p.knownRole === 'impostor' ? 'impostor-card' : ''}`} onClick={() => setHidden((h) => !h)} aria-pressed={hidden}>
          <small>{hidden ? 'Tap to show your secret' : 'Your secret word (tap to hide)'}</small>
          {hidden ? (
            <b>••••••</b>
          ) : p.knownRole === 'impostor' ? (
            <b>🕵️ You are the impostor! Blend in.</b>
          ) : (
            <b>{p.word ?? '—'}</b>
          )}
        </button>
      )}

      {pub.stage === 'clues' && (
        <>
          <h2>Give a one-line clue</h2>
          {p?.myClue ? (
            <p className="notice">
              Your clue: <b>"{p.myClue}"</b>. Waiting for the others…
            </p>
          ) : isParticipant ? (
            <form className="stack" onSubmit={submitClue}>
              <div className="row gap">
                <input value={clue} maxLength={60} placeholder="A hint that shows you know the word…" aria-label="Your clue" onChange={(e) => (setClue(e.target.value), setError(null))} />
                <button className="btn btn-primary" disabled={pending}>
                  Submit
                </button>
              </div>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
            </form>
          ) : null}
          <ProgressAvatars ids={session.participants} doneIds={pub.submittedIds} label="clues in" />
        </>
      )}

      {pub.stage === 'voting' && pub.clues && (
        <>
          <h2>Who is the impostor?</h2>
          <ul className="clue-list">
            {pub.clues.map((c) => {
              const mine = c.playerId === me;
              const voted = p?.myVote === c.playerId;
              return (
                <li key={c.playerId} className={voted ? 'voted' : ''}>
                  <PlayerChip id={c.playerId} />
                  <q>{c.clue ?? '(no clue)'}</q>
                  {isParticipant && !mine && (
                    <button className={`btn btn-small ${voted ? 'btn-primary' : 'btn-secondary'}`} disabled={pending} onClick={() => act({ type: 'vote', targetId: c.playerId })} aria-pressed={voted}>
                      {voted ? '✓ Voted' : 'Vote'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <ProgressAvatars ids={roundPlayers ?? []} doneIds={pub.votedIds} label="voted" />
        </>
      )}

      {pub.stage === 'reveal' && pub.reveal && (
        <div className="stack">
          <div className={`result-banner ${pub.reveal.caught ? 'good' : 'bad'}`}>
            {pub.reveal.caught ? `🎯 Caught! ${name(pub.reveal.impostorId)} was the impostor.` : `🕵️ ${name(pub.reveal.impostorId)} was the impostor and escaped!`}
          </div>
          <div className="row gap wrap center">
            <span className="pill">
              Crew word: <b>{pub.reveal.crewWord}</b>
            </span>
            <span className="pill">
              Impostor word: <b>{pub.reveal.impostorWord ?? '(none, blank)'}</b>
            </span>
          </div>
          <ul className="clue-list">
            {(pub.clues ?? []).map((c) => (
              <li key={c.playerId} className={c.playerId === pub.reveal!.impostorId ? 'is-impostor' : ''}>
                <PlayerChip id={c.playerId} />
                <q>{c.clue ?? '(no clue)'}</q>
                <span className="pill">🗳 {pub.reveal!.tally[c.playerId] ?? 0}</span>
              </li>
            ))}
          </ul>
          <details>
            <summary>Who voted for whom</summary>
            <ul>
              {pub.reveal.votes.map((v) => (
                <li key={v.voterId}>
                  {name(v.voterId)} → {name(v.targetId)}
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </div>
  );
}
