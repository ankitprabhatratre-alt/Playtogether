/**
 * Game catalog: metadata + declarative settings descriptors.
 * The same descriptors drive the host settings UI (client) and the
 * server-side settings validation (see settings.ts), so they can never drift.
 */

export const GAME_IDS = [
  'quiz',
  'wordchain',
  'impostor',
  'drawing',
  'tictactoe',
  'wouldyourather',
  'truthordare',
  'categories',
] as const;

export type GameId = (typeof GAME_IDS)[number];

export function isGameId(v: unknown): v is GameId {
  return typeof v === 'string' && (GAME_IDS as readonly string[]).includes(v);
}

interface SettingBase {
  key: string;
  label: string;
  help?: string;
}
export interface NumberSetting extends SettingBase {
  type: 'number';
  min: number;
  max: number;
  step?: number;
  unit?: string;
  default: number;
}
export interface SelectSetting extends SettingBase {
  type: 'select';
  options: { value: string; label: string }[];
  default: string;
}
export interface BooleanSetting extends SettingBase {
  type: 'boolean';
  default: boolean;
}
export interface MultiSelectSetting extends SettingBase {
  type: 'multiselect';
  options: { value: string; label: string }[];
  minSelected: number;
  default: string[];
}
export interface TextListSetting extends SettingBase {
  type: 'textlist';
  maxItems: number;
  maxLength: number;
  placeholder?: string;
  default: string[];
}
export type SettingDescriptor =
  | NumberSetting
  | SelectSetting
  | BooleanSetting
  | MultiSelectSetting
  | TextListSetting;

export interface GameMeta {
  id: GameId;
  name: string;
  emoji: string;
  tagline: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  estMinutes: [number, number];
  /** 'ready' = fully implemented & playable. Anything else must not be selectable. */
  status: 'ready' | 'coming-soon';
  accent: string;
  howToPlay: string[];
  settings: SettingDescriptor[];
}

export const QUIZ_CATEGORIES = [
  { value: 'general', label: 'General Knowledge' },
  { value: 'science', label: 'Science' },
  { value: 'technology', label: 'Technology' },
  { value: 'movies', label: 'Movies & TV' },
  { value: 'sports', label: 'Sports' },
  { value: 'geography', label: 'Geography' },
];

export const RAPID_CATEGORIES = [
  { value: 'animals', label: 'Animals' },
  { value: 'countries', label: 'Countries' },
  { value: 'food', label: 'Fruits & Vegetables' },
  { value: 'colors', label: 'Colors' },
  { value: 'sports', label: 'Sports & Games' },
  { value: 'jobs', label: 'Jobs & Professions' },
  { value: 'cities', label: 'World Cities' },
  { value: 'instruments', label: 'Musical Instruments' },
  { value: 'kitchen', label: 'Things in a Kitchen' },
];

export const TOD_CATEGORIES = [
  { value: 'family', label: 'Family-friendly' },
  { value: 'friends', label: 'Friends & Party (clean)' },
  { value: 'classroom', label: 'Classroom' },
];

export const GAME_CATALOG: Record<GameId, GameMeta> = {
  quiz: {
    id: 'quiz',
    name: 'Quiz Battle',
    emoji: '🧠',
    tagline: 'Fastest correct answer wins',
    description:
      'Multiple-choice trivia across six categories. Everyone gets the same question at the same moment — answer privately, earn speed bonuses, climb the leaderboard.',
    minPlayers: 1,
    maxPlayers: 16,
    estMinutes: [5, 12],
    status: 'ready',
    accent: '#7c5cff',
    howToPlay: [
      'Read the question and tap one of the four answers before the timer ends.',
      'Correct answers earn 100 points, plus up to 50 bonus points for speed (if enabled).',
      'The correct answer is revealed once everyone answers or time runs out.',
    ],
    settings: [
      { key: 'questionCount', label: 'Questions', type: 'number', min: 3, max: 30, default: 10 },
      { key: 'timePerQuestion', label: 'Time per question', type: 'number', min: 10, max: 60, step: 5, unit: 's', default: 20 },
      {
        key: 'difficulty',
        label: 'Difficulty',
        type: 'select',
        options: [
          { value: 'mixed', label: 'Mixed' },
          { value: 'easy', label: 'Easy' },
          { value: 'medium', label: 'Medium' },
          { value: 'hard', label: 'Hard' },
        ],
        default: 'mixed',
      },
      { key: 'categories', label: 'Categories', type: 'multiselect', options: QUIZ_CATEGORIES, minSelected: 1, default: QUIZ_CATEGORIES.map((c) => c.value) },
      { key: 'speedBonus', label: 'Speed bonus', type: 'boolean', default: true, help: 'Faster correct answers earn up to +50.' },
    ],
  },
  wordchain: {
    id: 'wordchain',
    name: 'Word Chain',
    emoji: '🔗',
    tagline: 'Last letter starts the next word',
    description:
      'Take turns saying a word that starts with the last letter of the previous word. No repeats, beat the clock, be the last one standing.',
    minPlayers: 2,
    maxPlayers: 12,
    estMinutes: [5, 10],
    status: 'ready',
    accent: '#00c2a8',
    howToPlay: [
      'On your turn, type a word that starts with the highlighted letter.',
      'Words can only be used once per round. Invalid words are rejected — you can retry until the timer ends.',
      'Run out of time and you are out for the round. Last player standing earns a bonus.',
    ],
    settings: [
      { key: 'rounds', label: 'Rounds', type: 'number', min: 1, max: 5, default: 2 },
      { key: 'turnTime', label: 'Turn time', type: 'number', min: 8, max: 40, unit: 's', default: 15 },
      { key: 'minLength', label: 'Minimum word length', type: 'number', min: 2, max: 6, default: 3 },
      {
        key: 'validation',
        label: 'Word validation',
        type: 'select',
        options: [
          { value: 'dictionary', label: 'Dictionary (ENABLE, ~172k English words)' },
          { value: 'basic', label: 'Basic (letters only, honour system)' },
        ],
        default: 'dictionary',
        help: 'Dictionary mode accepts only words in the ENABLE list: no proper nouns, abbreviations or non-English words.',
      },
      { key: 'maxWords', label: 'Max words per round', type: 'number', min: 10, max: 80, step: 5, default: 30 },
    ],
  },
  impostor: {
    id: 'impostor',
    name: 'Impostor',
    emoji: '🕵️',
    tagline: 'One of you has a different word',
    description:
      'Everyone gets the same secret word — except the impostor. Give a one-line clue, read everyone\'s clues, then vote out who you think is faking it.',
    minPlayers: 3,
    maxPlayers: 12,
    estMinutes: [6, 15],
    status: 'ready',
    accent: '#ff5c8a',
    howToPlay: [
      'Check your secret word privately. Don\'t say it out loud!',
      'Write a short clue that proves you know the word without giving it away.',
      'When clues are revealed, vote for the player you think is the impostor.',
      'Crew members who vote correctly score +2. If the impostor escapes, they score +3.',
    ],
    settings: [
      { key: 'rounds', label: 'Rounds', type: 'number', min: 1, max: 10, default: 3 },
      {
        key: 'variant',
        label: 'Variant',
        type: 'select',
        options: [
          { value: 'different-word', label: 'Undercover: impostor gets a similar word (doesn\'t know they\'re the impostor)' },
          { value: 'blank', label: 'Blank: impostor knows their role, sees only the category' },
        ],
        default: 'different-word',
      },
      { key: 'clueTime', label: 'Clue time', type: 'number', min: 20, max: 120, step: 5, unit: 's', default: 45 },
      { key: 'voteTime', label: 'Vote time', type: 'number', min: 15, max: 90, step: 5, unit: 's', default: 30 },
    ],
  },
  drawing: {
    id: 'drawing',
    name: 'Draw & Guess',
    emoji: '🎨',
    tagline: 'Sketch it, they guess it',
    description:
      'One player draws a secret word on a live shared canvas while everyone else races to guess it from their own device. The drawer rotates every turn.',
    minPlayers: 2,
    maxPlayers: 12,
    estMinutes: [6, 15],
    status: 'ready',
    accent: '#ffb547',
    howToPlay: [
      'When it\'s your turn to draw, pick one of the offered words and draw it. No letters!',
      'Everyone else types guesses. Earlier correct guesses earn more points.',
      'The drawer earns points for every player who guesses correctly.',
    ],
    settings: [
      { key: 'cycles', label: 'Turns per player', type: 'number', min: 1, max: 3, default: 1 },
      { key: 'drawTime', label: 'Drawing time', type: 'number', min: 30, max: 180, step: 10, unit: 's', default: 80 },
      { key: 'wordChoices', label: 'Word choices for drawer', type: 'number', min: 1, max: 3, default: 3 },
      {
        key: 'difficulty',
        label: 'Word difficulty',
        type: 'select',
        options: [
          { value: 'mixed', label: 'Mixed' },
          { value: 'easy', label: 'Easy' },
          { value: 'medium', label: 'Medium' },
          { value: 'hard', label: 'Hard' },
        ],
        default: 'mixed',
      },
      { key: 'hints', label: 'Letter hints over time', type: 'boolean', default: true },
    ],
  },
  tictactoe: {
    id: 'tictactoe',
    name: 'Tic-Tac-Toe Arena',
    emoji: '❌',
    tagline: 'Winner stays on, everyone else spectates',
    description:
      'Classic 3×3 duels with a match queue. Two players face off while the rest of the room spectates live. Winner stays, loser goes to the back of the line.',
    minPlayers: 2,
    maxPlayers: 16,
    estMinutes: [3, 10],
    status: 'ready',
    accent: '#3fa7ff',
    howToPlay: [
      'Two players are called up from the queue. X moves first.',
      'Get three in a row to win (+3). A draw gives both +1. Running out of time forfeits the match.',
      'After a match, both players can request a rematch; otherwise the winner stays and the next challenger steps up.',
    ],
    settings: [
      { key: 'matches', label: 'Matches', type: 'number', min: 1, max: 20, default: 5 },
      { key: 'moveTime', label: 'Time per move', type: 'number', min: 5, max: 60, step: 5, unit: 's', default: 15 },
      {
        key: 'rotation',
        label: 'Queue rule',
        type: 'select',
        options: [
          { value: 'winner-stays', label: 'Winner stays on' },
          { value: 'rotate', label: 'Both players rotate out' },
        ],
        default: 'winner-stays',
      },
    ],
  },
  wouldyourather: {
    id: 'wouldyourather',
    name: 'Would You Rather?',
    emoji: '🤔',
    tagline: 'Two choices, one room, zero easy answers',
    description:
      'Everyone sees the same dilemma and votes privately. Results are revealed together as percentages — see where your group really stands.',
    minPlayers: 2,
    maxPlayers: 16,
    estMinutes: [4, 10],
    status: 'ready',
    accent: '#a855f7',
    howToPlay: [
      'Pick one of the two options. Your individual vote stays anonymous.',
      'Results are revealed when everyone has voted or the timer ends.',
      'With "Majority" scoring, you earn +1 for siding with the majority.',
    ],
    settings: [
      { key: 'questionCount', label: 'Questions', type: 'number', min: 3, max: 30, default: 10 },
      { key: 'timePerQuestion', label: 'Time per question', type: 'number', min: 10, max: 60, step: 5, unit: 's', default: 20 },
      {
        key: 'scoring',
        label: 'Scoring',
        type: 'select',
        options: [
          { value: 'majority', label: 'Majority: +1 for siding with most players' },
          { value: 'none', label: 'Just for fun (no points)' },
        ],
        default: 'majority',
      },
    ],
  },
  truthordare: {
    id: 'truthordare',
    name: 'Truth or Dare',
    emoji: '🎲',
    tagline: 'Family-friendly prompts, your turn!',
    description:
      'Take turns choosing truth or dare from family-friendly prompt packs. Skips are always allowed, nobody is ever forced to share private information or do anything unsafe.',
    minPlayers: 2,
    maxPlayers: 16,
    estMinutes: [10, 25],
    status: 'ready',
    accent: '#ff7a45',
    howToPlay: [
      'When it\'s your turn, choose Truth or Dare. A random prompt appears for everyone.',
      'Do it, then tap "Done" (+1 for truth, +2 for dare). Not comfortable? Tap "Skip", no questions asked.',
      'The host can move the game along at any time.',
    ],
    settings: [
      { key: 'cycles', label: 'Turns per player', type: 'number', min: 1, max: 5, default: 2 },
      { key: 'categories', label: 'Prompt packs', type: 'multiselect', options: TOD_CATEGORIES, minSelected: 1, default: ['family', 'friends'] },
      { key: 'customTruths', label: 'Custom truths (optional)', type: 'textlist', maxItems: 20, maxLength: 140, placeholder: 'What is your favourite family tradition?', default: [] },
      { key: 'customDares', label: 'Custom dares (optional)', type: 'textlist', maxItems: 20, maxLength: 140, placeholder: 'Do your best robot dance for 10 seconds.', default: [] },
    ],
  },
  categories: {
    id: 'categories',
    name: 'Rapid Categories',
    emoji: '⚡',
    tagline: 'Category + letter. Go!',
    description:
      'A category and a starting letter appear. Race to submit a valid answer before anyone else takes it. Answers are checked against built-in word lists.',
    minPlayers: 1,
    maxPlayers: 16,
    estMinutes: [4, 10],
    status: 'ready',
    accent: '#22c55e',
    howToPlay: [
      'Type an answer that fits the category and starts with the letter.',
      'Each answer can only be claimed once. If someone beat you to it, try another!',
      'Answers found in the built-in list are "verified" and score more. Faster = more points.',
    ],
    settings: [
      { key: 'rounds', label: 'Rounds', type: 'number', min: 3, max: 15, default: 6 },
      { key: 'roundTime', label: 'Round time', type: 'number', min: 15, max: 60, step: 5, unit: 's', default: 30 },
      {
        key: 'mode',
        label: 'Validation',
        type: 'select',
        options: [
          { value: 'lenient', label: 'Lenient: unlisted answers allowed for fewer points' },
          { value: 'strict', label: 'Strict: only answers in the built-in list count' },
        ],
        default: 'lenient',
      },
      { key: 'categories', label: 'Categories', type: 'multiselect', options: RAPID_CATEGORIES, minSelected: 1, default: RAPID_CATEGORIES.map((c) => c.value) },
    ],
  },
};

export const GAME_LIST: GameMeta[] = GAME_IDS.map((id) => GAME_CATALOG[id]);

export function defaultSettings(gameId: GameId): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const s of GAME_CATALOG[gameId].settings) {
    out[s.key] = Array.isArray(s.default) ? [...s.default] : s.default;
  }
  return out;
}
