import type { GameStateUnion } from '@playtogether/shared';
import { QuizView } from './QuizView';
import { WordChainView } from './WordChainView';
import { ImpostorView } from './ImpostorView';
import { DrawingView } from './DrawingView';
import { TicTacToeView } from './TicTacToeView';
import { WouldYouRatherView } from './WouldYouRatherView';
import { TruthOrDareView } from './TruthOrDareView';
import { CategoriesView } from './CategoriesView';

export function GameView({ state }: { state: GameStateUnion }) {
  switch (state.gameId) {
    case 'quiz':
      return <QuizView pub={state.public} />;
    case 'wordchain':
      return <WordChainView pub={state.public} />;
    case 'impostor':
      return <ImpostorView pub={state.public} />;
    case 'drawing':
      return <DrawingView pub={state.public} />;
    case 'tictactoe':
      return <TicTacToeView pub={state.public} />;
    case 'wouldyourather':
      return <WouldYouRatherView pub={state.public} />;
    case 'truthordare':
      return <TruthOrDareView pub={state.public} />;
    case 'categories':
      return <CategoriesView pub={state.public} />;
  }
}
