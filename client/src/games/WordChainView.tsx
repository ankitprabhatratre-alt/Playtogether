import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { WordChainPublic } from '@playtogether/shared';
import { useGame } from './useGame';
import { PlayerChip } from './common';

export function WordChainView({ pub }: { pub: WordChainPublic }) {
  const { act, me, name, color, session, pending } = useGame();
  const [word, setWord] = useState('');
  const [error, setError] = useState<string | null>(null);
  const myTurn = pub.stage === 'turn' && pub.currentPlayerId === me;
  const inputRef = useRef<HTMLInputElement>(null);
  const chainRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (myTurn) inputRef.current?.focus();
    setError(null);
  }, [myTurn, pub.chain.length]);
  useEffect(() => {
    chainRef.current?.scrollTo({ left: chainRef.current.scrollWidth, behavior: 'smooth' });
  }, [pub.chain.length]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!word.trim()) return setError('Type a word first.');
    const res = await act({ type: 'submit', word: word.trim() }, true);
    if (res.ok) setWord('');
    else setError(res.error);
  };

  const ev = pub.lastEvent;
  const evText = ev ? (ev.kind === 'accepted' ? `${name(ev.playerId)} played "${ev.word}"` : ev.kind === 'timeout' ? `⏰ ${name(ev.playerId)} ran out of time and is out!` : `📴 ${name(ev.playerId)} is offline and was skipped.`) : null;

  return (
    <div className="wordchain stack">
      <div className="row between wrap">
        <span className="pill">Round {pub.round}</span>
        <span className="pill" title={pub.validation === 'dictionary' ? 'Words are checked against the ENABLE English word list (no proper nouns or abbreviations).' : 'Any letters-only word is accepted. Honour system!'}>
          {pub.validation === 'dictionary' ? '📖 Dictionary check' : '🤝 Basic check'} · min {pub.minLength} letters
        </span>
      </div>
      {pub.stage === 'turn' ? (
        <>
          <div className="big-letter-wrap">
            <span className="muted">Next word starts with</span>
            <div className="big-letter">{pub.requiredLetter.toUpperCase()}</div>
            <div className={`turn-indicator ${myTurn ? 'mine' : ''}`} aria-live="polite">
              {myTurn ? '👉 Your turn!' : `${name(pub.currentPlayerId)}'s turn`}
            </div>
          </div>
          {myTurn && (
            <form className="row gap" onSubmit={submit}>
              <input
                ref={inputRef}
                value={word}
                onChange={(e) => {
                  setWord(e.target.value);
                  setError(null);
                }}
                placeholder={`A word starting with "${pub.requiredLetter.toUpperCase()}"`}
                aria-label="Your word"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={40}
              />
              <button className="btn btn-primary" disabled={pending}>
                Play
              </button>
            </form>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {evText && <p className="muted center-text">{evText}</p>}
        </>
      ) : (
        <div className="result-banner good">{pub.roundWinnerId ? `🏆 ${name(pub.roundWinnerId)} is the last one standing!` : 'Round over: maximum words reached!'}</div>
      )}
      <section>
        <h3 className="small-h">The chain ({pub.chain.length})</h3>
        {pub.chain.length === 0 ? (
          <p className="muted">No words yet.</p>
        ) : (
          <ol className="chain" ref={chainRef}>
            {pub.chain.map((c, i) => (
              <li key={i} style={{ borderColor: color(c.playerId) }} title={name(c.playerId)}>
                {c.word}
              </li>
            ))}
          </ol>
        )}
      </section>
      <section className="row wrap gap-sm">
        {session.participants.map((id) => (
          <span key={id} className={pub.eliminated.includes(id) ? 'eliminated' : pub.currentPlayerId === id ? 'active-chip' : ''}>
            <PlayerChip id={id} />
          </span>
        ))}
      </section>
    </div>
  );
}
