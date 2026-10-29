import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { CategoriesPublic } from '@playtogether/shared';
import { useGame } from './useGame';
import { PlayerChip, ProgressAvatars } from './common';

export function CategoriesView({ pub }: { pub: CategoriesPublic }) {
  const { priv, act, isParticipant, session, pending } = useGame();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const p = priv?.gameId === 'categories' ? priv.data : null;
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setText('');
    setError(null);
    if (pub.stage === 'answering') inputRef.current?.focus();
  }, [pub.round, pub.stage]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return setError('Type an answer.');
    const res = await act({ type: 'answer', text: text.trim() }, true);
    if (!res.ok) setError(res.error);
  };

  return (
    <div className="categories stack">
      <div className="row between wrap">
        <span className="pill">
          Round {pub.round}/{pub.totalRounds}
        </span>
        <span className="pill">{pub.mode === 'strict' ? 'Strict: listed answers only' : 'Lenient: unlisted answers score less'}</span>
      </div>
      <div className="cat-prompt">
        <span className="cat-name">{pub.category}</span>
        <span className="muted">starting with</span>
        <span className="big-letter">{pub.letter}</span>
      </div>
      {pub.stage === 'answering' ? (
        <>
          {p?.myAnswer ? (
            <p className="notice center-text">
              🔒 Locked in: <b>{p.myAnswer}</b>
            </p>
          ) : isParticipant ? (
            <form className="stack" onSubmit={submit}>
              <div className="row gap">
                <input
                  ref={inputRef}
                  value={text}
                  maxLength={40}
                  placeholder={`${pub.category} starting with ${pub.letter}…`}
                  aria-label="Your answer"
                  autoComplete="off"
                  onChange={(e) => (setText(e.target.value), setError(null))}
                />
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
          <ProgressAvatars ids={session.participants} doneIds={pub.submittedIds} label="answered" />
        </>
      ) : (
        pub.reveal && (
          <div className="stack">
            {pub.reveal.answers.length === 0 ? (
              <p className="muted center-text">Nobody answered this round.</p>
            ) : (
              <ol className="cat-answers">
                {pub.reveal.answers.map((a) => (
                  <li key={a.playerId}>
                    <PlayerChip id={a.playerId} />
                    <b>{a.answer}</b>
                    <span className={`badge ${a.verified ? '' : 'badge-muted'}`}>{a.verified ? '✓ verified' : 'unlisted'}</span>
                    <span className="delta">+{a.points}</span>
                  </li>
                ))}
              </ol>
            )}
            {pub.reveal.examples.length > 0 && <p className="muted small center-text">Other answers: {pub.reveal.examples.join(', ')}</p>}
          </div>
        )
      )}
    </div>
  );
}
