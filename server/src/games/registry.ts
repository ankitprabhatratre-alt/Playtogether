import type { GameId } from '@playtogether/shared';
import type { GameDefinition } from './types.js';
import { quizGame } from './quiz/quiz.js';
import { wordChainGame } from './wordchain/wordchain.js';
import { impostorGame } from './impostor/impostor.js';
import { drawingGame } from './drawing/drawing.js';
import { ticTacToeGame } from './tictactoe/tictactoe.js';
import { wouldYouRatherGame } from './wouldyourather/wouldyourather.js';
import { truthOrDareGame } from './truthordare/truthordare.js';
import { categoriesGame } from './categories/categories.js';

/** Every game in the shared catalog must have a server implementation here. */
export const GAME_REGISTRY: { [K in GameId]: GameDefinition<K> } = {
  quiz: quizGame,
  wordchain: wordChainGame,
  impostor: impostorGame,
  drawing: drawingGame,
  tictactoe: ticTacToeGame,
  wouldyourather: wouldYouRatherGame,
  truthordare: truthOrDareGame,
  categories: categoriesGame,
};
