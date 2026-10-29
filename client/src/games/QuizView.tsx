import type { QuizPublic } from '@playtogether/shared';
import { useGame } from './useGame';
import { ProgressAvatars } from './common';

const LETTERS = ['A', 'B', 'C', 'D'];

export function QuizView({ pub }: { pub: QuizPublic }) {
  const { priv, act, isParticipant, session, me, pending } = useGame();
  const myChoice = priv?.gameId === 'quiz' ? priv.data.myChoice : null;
  const reveal = pub.reveal;
  const myResult = reveal?.results.find((r) => r.playerId === me);
  const canAnswer = isParticipant && pub.stage === 'question' && myChoice === null;

  return (
    <div className="quiz stack">
      <div className="row between wrap">
        <span className="pill">{pub.category}</span>
        <span className="pill">
          Q{pub.questionIndex + 1}/{pub.total} · {pub.difficulty}
        </span>
      </div>
      <h2 className="question">{pub.prompt}</h2>
      <div className="answers" role="group" aria-label="Answer choices">
        {pub.choices.map((c, i) => {
          const isMine = myChoice === i;
          const isCorrect = reveal?.correctIndex === i;
          const cls = ['answer', `answer-${i}`, isMine ? 'answer-mine' : '', reveal ? (isCorrect ? 'answer-correct' : isMine ? 'answer-wrong' : 'answer-dim') : '', !canAnswer && !reveal && !isMine ? 'answer-dim' : '']
            .filter(Boolean)
            .join(' ');
          return (
            <button key={i} type="button" className={cls} disabled={!canAnswer || pending} onClick={() => act({ type: 'answer', choice: i })} aria-pressed={isMine}>
              <span className="answer-letter" aria-hidden="true">
                {LETTERS[i]}
              </span>
              <span className="answer-text">{c}</span>
              {reveal && <span className="answer-count">{reveal.counts[i]}</span>}
              {reveal && isCorrect && <span className="sr-only">(correct answer)</span>}
            </button>
          );
        })}
      </div>
      {reveal ? (
        <div className={`result-banner ${myResult?.correct ? 'good' : 'bad'}`} aria-live="polite">
          {!isParticipant ? `Correct answer: ${pub.choices[reveal.correctIndex]}` : myResult?.correct ? `✅ Correct! +${myResult.points}` : myChoice === null ? `⏰ Time's up! Answer: ${pub.choices[reveal.correctIndex]}` : `❌ Not quite. Answer: ${pub.choices[reveal.correctIndex]}`}
        </div>
      ) : (
        <>
          {myChoice !== null && <p className="center-text muted">🔒 Answer locked in. Waiting for others…</p>}
          <ProgressAvatars ids={session.participants} doneIds={pub.answeredIds} label="answered" />
        </>
      )}
    </div>
  );
}
