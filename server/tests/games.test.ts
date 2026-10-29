import { describe, expect, it } from 'vitest';
import { defaultSettings } from '@playtogether/shared';
import { fakeContext } from './fakeContext.js';
import { quizGame, computePoints, BASE_POINTS, MAX_SPEED_BONUS } from '../src/games/quiz/quiz.js';
import { wordChainGame, checkWord } from '../src/games/wordchain/wordchain.js';
import { ticTacToeGame, evaluateBoard } from '../src/games/tictactoe/tictactoe.js';
import { impostorGame, tallyVotes } from '../src/games/impostor/impostor.js';
import { drawingGame } from '../src/games/drawing/drawing.js';
import { categoriesGame, isVerified } from '../src/games/categories/categories.js';
import { wouldYouRatherGame } from '../src/games/wouldyourather/wouldyourather.js';
import { truthOrDareGame } from '../src/games/truthordare/truthordare.js';
import { AppError } from '../src/util/errors.js';

const settings = (id: Parameters<typeof defaultSettings>[0], extra: Record<string, unknown> = {}) => ({ ...defaultSettings(id), ...extra });

describe('Quiz Battle', () => {
  it('scores correct answers with a bounded speed bonus', () => {
    expect(computePoints(0, 0, 10_000, true)).toBe(BASE_POINTS + MAX_SPEED_BONUS);
    expect(computePoints(10_000, 0, 10_000, true)).toBe(BASE_POINTS);
    expect(computePoints(5_000, 0, 10_000, true)).toBe(BASE_POINTS + 25);
    expect(computePoints(99_999, 0, 10_000, true)).toBe(BASE_POINTS); // late never goes negative
    expect(computePoints(0, 0, 10_000, false)).toBe(BASE_POINTS);
  });

  it('never exposes the correct answer before the reveal, and awards server-side points only', () => {
    const f = fakeContext(settings('quiz', { questionCount: 3 }));
    const g = quizGame.initializeGame(f.ctx);
    g.startGame();
    const pub = g.getPublicState();
    expect(pub.reveal).toBeNull();
    expect(JSON.stringify(pub)).not.toContain('correctIndex');
    g.handlePlayerAction('p1', { type: 'answer', choice: 0 }, 'PLAYING');
    expect(() => g.handlePlayerAction('p1', { type: 'answer', choice: 1 }, 'PLAYING')).toThrow(AppError);
    g.handlePlayerAction('p2', { type: 'answer', choice: 1 }, 'PLAYING');
    expect(f.rounds).toBe(0);
    g.handlePlayerAction('p3', { type: 'answer', choice: 2 }, 'PLAYING'); // everyone answered → reveal
    expect(f.rounds).toBe(1);
    const revealed = g.getPublicState();
    expect(revealed.reveal).not.toBeNull();
    const correct = revealed.reveal!.correctIndex;
    for (const r of revealed.reveal!.results) {
      expect(f.scores.get(r.playerId)).toBe(r.correct ? r.points : 0);
      expect(r.correct).toBe(r.choice === correct);
    }
  });

  it('rejects answers after the timer expired', () => {
    const f = fakeContext(settings('quiz', { questionCount: 3 }));
    const g = quizGame.initializeGame(f.ctx);
    g.startGame();
    f.fireTimer();
    expect(() => g.handlePlayerAction('p1', { type: 'answer', choice: 0 }, 'PLAYING')).toThrow(/closed/);
  });

  it('only waits for online players', () => {
    const f = fakeContext(settings('quiz', { questionCount: 3 }));
    const g = quizGame.initializeGame(f.ctx);
    g.startGame();
    g.handlePlayerAction('p1', { type: 'answer', choice: 0 }, 'PLAYING');
    g.handlePlayerAction('p2', { type: 'answer', choice: 0 }, 'PLAYING');
    f.setOnline('p3', false);
    g.onConnectionChange?.('p3', false);
    expect(f.rounds).toBe(1);
  });
});

describe('Word Chain', () => {
  const base = { requiredLetter: 'a', minLength: 3, used: new Set<string>(['apple']), dictionary: new Set(['apple', 'ant', 'arrow', 'axe']) };
  it('validates words', () => {
    expect(checkWord('Arrow', base)).toEqual({ ok: true, word: 'arrow' });
    expect(checkWord('', base).ok).toBe(false);
    expect(checkWord('apple', base).ok).toBe(false); // duplicate
    expect(checkWord('bat', base).ok).toBe(false); // wrong letter
    expect(checkWord('ax', base).ok).toBe(false); // too short
    expect(checkWord('a-b', base).ok).toBe(false); // symbols
    expect(checkWord('azzz', base).ok).toBe(false); // not in dictionary
    expect(checkWord('azzz', { ...base, dictionary: null }).ok).toBe(true); // basic mode
  });

  it('enforces turns and eliminates on timeout', () => {
    const f = fakeContext(settings('wordchain', { validation: 'basic', rounds: 1 }));
    const g = wordChainGame.initializeGame(f.ctx);
    g.startGame();
    const s = g.getPublicState();
    const current = s.currentPlayerId!;
    const other = ['p1', 'p2', 'p3'].find((p) => p !== current)!;
    expect(() => g.handlePlayerAction(other, { type: 'submit', word: `${s.requiredLetter}xyz` }, 'PLAYING')).toThrow(/not your turn/);
    g.handlePlayerAction(current, { type: 'submit', word: `${s.requiredLetter}bcd` }, 'PLAYING');
    expect(f.scores.get(current)).toBe(10);
    const s2 = g.getPublicState();
    expect(s2.requiredLetter).toBe('d');
    expect(s2.currentPlayerId).not.toBe(current);
    f.fireTimer(); // second player times out
    expect(g.getPublicState().eliminated).toContain(s2.currentPlayerId);
    f.fireTimer(); // third player times out → only one left → round ends
    expect(f.rounds).toBe(1);
    expect(g.getPublicState().roundWinnerId).toBe(current);
  });
});

describe('Tic-Tac-Toe', () => {
  it('detects wins and draws', () => {
    expect(evaluateBoard(['X', 'X', 'X', null, 'O', 'O', null, null, null]).winner).toBe('X');
    expect(evaluateBoard(['O', 'X', 'X', null, 'O', 'X', null, null, 'O']).line).toEqual([0, 4, 8]);
    const draw = evaluateBoard(['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X']);
    expect(draw.winner).toBeNull();
    expect(draw.full).toBe(true);
  });

  it('validates moves server-side and awards the winner', () => {
    const f = fakeContext(settings('tictactoe'));
    const g = ticTacToeGame.initializeGame(f.ctx);
    g.startGame();
    const { xPlayerId: x, oPlayerId: o, queue } = g.getPublicState();
    const spectator = queue[0];
    expect(() => g.handlePlayerAction(o, { type: 'move', cell: 0 }, 'PLAYING')).toThrow(/not your turn/);
    expect(() => g.handlePlayerAction(spectator, { type: 'move', cell: 0 }, 'PLAYING')).toThrow(/spectating/);
    g.handlePlayerAction(x, { type: 'move', cell: 0 }, 'PLAYING');
    expect(() => g.handlePlayerAction(o, { type: 'move', cell: 0 }, 'PLAYING')).toThrow(/taken/);
    g.handlePlayerAction(o, { type: 'move', cell: 3 }, 'PLAYING');
    g.handlePlayerAction(x, { type: 'move', cell: 1 }, 'PLAYING');
    g.handlePlayerAction(o, { type: 'move', cell: 4 }, 'PLAYING');
    g.handlePlayerAction(x, { type: 'move', cell: 2 }, 'PLAYING');
    expect(g.getPublicState().result).toMatchObject({ winner: 'X', line: [0, 1, 2] });
    expect(f.scores.get(x)).toBe(3);
    expect(f.rounds).toBe(1);
    // Winner stays, challenger from the queue comes in.
    g.advanceGame();
    const next = g.getPublicState();
    expect([next.xPlayerId, next.oPlayerId]).toContain(x);
    expect([next.xPlayerId, next.oPlayerId]).toContain(spectator);
  });

  it('forfeits on move timeout and supports rematches', () => {
    const f = fakeContext(settings('tictactoe'), ['a', 'b']);
    const g = ticTacToeGame.initializeGame(f.ctx);
    g.startGame();
    const { xPlayerId: x, oPlayerId: o } = g.getPublicState();
    f.fireTimer(); // X runs out of time
    expect(g.getPublicState().result).toMatchObject({ winner: 'O', reason: 'timeout' });
    expect(() => g.handlePlayerAction(x, { type: 'rematch' }, 'PLAYING')).toThrow();
    g.handlePlayerAction(x, { type: 'rematch' }, 'ROUND_RESULTS');
    g.handlePlayerAction(o, { type: 'rematch' }, 'ROUND_RESULTS');
    expect(f.skipped).toBe(1);
    g.advanceGame();
    expect(g.getPublicState().xPlayerId).toBe(o); // swapped
  });
});

describe('Impostor', () => {
  it('treats ties as "not caught"', () => {
    expect(tallyVotes(new Map([['a', 'x'], ['b', 'y']])).top).toBeNull();
    expect(tallyVotes(new Map([['a', 'x'], ['b', 'x'], ['c', 'y']])).top).toBe('x');
  });

  it('keeps roles and words private until the reveal', () => {
    const f = fakeContext(settings('impostor', { variant: 'different-word' }), ['a', 'b', 'c', 'd']);
    const g = impostorGame.initializeGame(f.ctx);
    g.startGame();
    const pub = g.getPublicState();
    expect(pub.reveal).toBeNull();
    expect(pub.clues).toBeNull();
    const privs = ['a', 'b', 'c', 'd'].map((id) => ({ id, ...g.getPrivateStateForPlayer(id) }));
    const words = new Map<string, number>();
    privs.forEach((p) => words.set(p.word!, (words.get(p.word!) ?? 0) + 1));
    expect(words.size).toBe(2);
    const impostor = privs.find((p) => words.get(p.word!) === 1)!;
    // Undercover variant: nobody is told their role.
    expect(privs.every((p) => p.knownRole === null)).toBe(true);
    const json = JSON.stringify(pub);
    for (const p of privs) expect(json).not.toContain(p.word!);
    expect(json).not.toContain(`"impostorId"`);

    // Clue containing your own word is rejected.
    const crew = privs.find((p) => p.id !== impostor.id)!;
    expect(() => g.handlePlayerAction(crew.id, { type: 'clue', text: `It is a ${crew.word}` }, 'PLAYING')).toThrow(/secret word/);
    for (const p of privs) g.handlePlayerAction(p.id, { type: 'clue', text: 'something vague' }, 'PLAYING');
    expect(g.getPublicState().stage).toBe('voting');
    expect(() => g.handlePlayerAction('a', { type: 'vote', targetId: 'a' }, 'PLAYING')).toThrow(/yourself/);
    // Everyone (except the impostor) votes for the impostor.
    for (const p of privs) {
      const target = p.id === impostor.id ? privs.find((q) => q.id !== impostor.id)!.id : impostor.id;
      g.handlePlayerAction(p.id, { type: 'vote', targetId: target }, 'PLAYING');
    }
    const r = g.getPublicState().reveal!;
    expect(r.impostorId).toBe(impostor.id);
    expect(r.caught).toBe(true);
    for (const p of privs) expect(f.scores.get(p.id)).toBe(p.id === impostor.id ? 0 : 2);
  });

  it('tells the impostor their role in the blank variant', () => {
    const f = fakeContext(settings('impostor', { variant: 'blank' }), ['a', 'b', 'c']);
    const g = impostorGame.initializeGame(f.ctx);
    g.startGame();
    const privs = ['a', 'b', 'c'].map((id) => g.getPrivateStateForPlayer(id));
    expect(privs.filter((p) => p.knownRole === 'impostor' && p.word === null)).toHaveLength(1);
    expect(privs.filter((p) => p.knownRole === null && p.word)).toHaveLength(2);
  });
});

describe('Draw & Guess', () => {
  it('hides the word, accepts strokes only from the drawer, and scores guesses', () => {
    const f = fakeContext(settings('drawing', { wordChoices: 3 }));
    const g = drawingGame.initializeGame(f.ctx);
    g.startGame();
    const pub = g.getPublicState();
    const drawer = pub.drawerId;
    const guessers = ['p1', 'p2', 'p3'].filter((p) => p !== drawer);
    const choices = g.getPrivateStateForPlayer(drawer).wordChoices!;
    expect(choices).toHaveLength(3);
    expect(g.getPrivateStateForPlayer(guessers[0]).wordChoices).toBeNull();
    expect(() => g.handlePlayerAction(guessers[0], { type: 'chooseWord', index: 0 }, 'PLAYING')).toThrow();
    g.handlePlayerAction(drawer, { type: 'chooseWord', index: 1 }, 'PLAYING');
    const word = choices[1];
    expect(JSON.stringify(g.getPublicState())).not.toContain(`"${word}"`);
    const seg = { strokeId: 's1', color: '#000000', size: 4, points: [0, 0, 100, 100] };
    g.handleStroke!(guessers[0], seg);
    expect(f.strokes).toHaveLength(0);
    g.handleStroke!(drawer, seg);
    expect(f.strokes).toHaveLength(1);
    expect(() => g.handlePlayerAction(drawer, { type: 'guess', text: word }, 'PLAYING')).toThrow(/drawer cannot guess/);
    g.handlePlayerAction(guessers[0], { type: 'guess', text: 'definitely wrong' }, 'PLAYING');
    g.handlePlayerAction(guessers[0], { type: 'guess', text: word.toUpperCase() }, 'PLAYING');
    expect(f.scores.get(guessers[0])).toBe(100);
    expect(f.scores.get(drawer)).toBe(25);
    expect(g.getPrivateStateForPlayer(guessers[0]).word).toBe(word);
    expect(g.getPrivateStateForPlayer(guessers[1]).word).toBeNull();
    g.handlePlayerAction(guessers[1], { type: 'guess', text: word }, 'PLAYING');
    expect(f.rounds).toBe(1); // everyone guessed
    expect(g.getPublicState().reveal?.word).toBe(word);
  });
});

describe('Rapid Categories', () => {
  it('verifies answers with simple plural tolerance', () => {
    expect(isVerified('animals', 'tiger')).toBe(true);
    expect(isVerified('animals', 'tigers')).toBe(true);
    expect(isVerified('animals', 'the tiger')).toBe(true);
    expect(isVerified('animals', 'toaster')).toBe(false);
  });

  it('rejects wrong letters, duplicates across players, and unlisted answers in strict mode', () => {
    const f = fakeContext(settings('categories', { categories: ['animals'], mode: 'strict' }));
    const g = categoriesGame.initializeGame(f.ctx);
    g.startGame();
    const { letter } = g.getPublicState();
    const L = letter.toLowerCase();
    const other = L === 'z' ? 'a' : 'z';
    expect(() => g.handlePlayerAction('p1', { type: 'answer', text: `${other}ebra` }, 'PLAYING')).toThrow(/start with/);
    expect(() => g.handlePlayerAction('p1', { type: 'answer', text: `${L}qqqqq` }, 'PLAYING')).toThrow(/strict/);
    const listed = ['aardvark', 'baboon', 'camel', 'deer', 'eagle', 'falcon', 'gazelle', 'hamster', 'ibis', 'jaguar', 'kangaroo', 'lemur', 'meerkat', 'newt', 'ocelot', 'panda', 'quail', 'rabbit', 'salmon', 'tapir', 'urchin', 'vulture', 'walrus', 'yak', 'zebra'].find((w) => w[0] === L)!;
    g.handlePlayerAction('p1', { type: 'answer', text: listed }, 'PLAYING');
    expect(() => g.handlePlayerAction('p2', { type: 'answer', text: listed }, 'PLAYING')).toThrow(/already claimed/);
    expect(() => g.handlePlayerAction('p1', { type: 'answer', text: listed }, 'PLAYING')).toThrow(/already locked/);
    expect(f.scores.get('p1')).toBe(0); // points are only awarded at the reveal
    f.fireTimer();
    expect(f.scores.get('p1')).toBe(16);
  });
});

describe('Would You Rather', () => {
  it('reveals only aggregates and awards the majority', () => {
    const f = fakeContext(settings('wouldyourather'));
    const g = wouldYouRatherGame.initializeGame(f.ctx);
    g.startGame();
    g.handlePlayerAction('p1', { type: 'vote', choice: 'A' }, 'PLAYING');
    g.handlePlayerAction('p2', { type: 'vote', choice: 'A' }, 'PLAYING');
    expect(g.getPublicState().reveal).toBeNull();
    expect(g.getPrivateStateForPlayer('p1').myVote).toBe('A');
    g.handlePlayerAction('p3', { type: 'vote', choice: 'B' }, 'PLAYING');
    const r = g.getPublicState().reveal!;
    expect(r).toMatchObject({ countA: 2, countB: 1, percentA: 67, percentB: 33 });
    expect(JSON.stringify(g.getPublicState())).not.toMatch(/"p1":"A"/);
    expect([f.scores.get('p1'), f.scores.get('p2'), f.scores.get('p3')]).toEqual([1, 1, 0]);
  });
});

describe('Truth or Dare', () => {
  it('only lets the current player (or host) act and awards completed dares', () => {
    const f = fakeContext(settings('truthordare'));
    const g = truthOrDareGame.initializeGame(f.ctx);
    g.startGame();
    const cur = g.getPublicState().currentPlayerId;
    expect(cur).toBe('p1');
    expect(() => g.handlePlayerAction('p3', { type: 'choose', choice: 'dare' }, 'PLAYING')).toThrow(/not your turn/);
    g.handlePlayerAction('p1', { type: 'choose', choice: 'dare' }, 'PLAYING');
    expect(g.getPublicState().prompt).toBeTruthy();
    g.handlePlayerAction('p1', { type: 'complete' }, 'PLAYING');
    expect(f.scores.get('p1')).toBe(2);
    expect(g.getPublicState().currentPlayerId).toBe('p2');
    // Host (p1) may skip on behalf of others.
    g.handlePlayerAction('p1', { type: 'skip' }, 'PLAYING');
    expect(g.getPublicState().currentPlayerId).toBe('p3');
    expect(f.scores.get('p2')).toBe(0);
  });
});
