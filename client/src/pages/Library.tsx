import { Link, useNavigate } from 'react-router-dom';
import { GAME_LIST } from '@playtogether/shared';
import { GameCard } from '../components/GameCard';
import { Logo } from '../components/ui';

export function Library() {
  const nav = useNavigate();
  return (
    <div className="page">
      <header className="topbar">
        <Link to="/" aria-label="Home">
          <Logo small />
        </Link>
        <Link to="/create" className="btn btn-primary btn-small">
          Create room
        </Link>
      </header>
      <main className="container">
        <h1>Game library</h1>
        <p className="muted">Every game runs on the server in real time. Pick one to start a room with it.</p>
        <div className="game-grid">
          {GAME_LIST.map((g) => (
            <GameCard key={g.id} meta={g} onSelect={() => nav(`/create?game=${g.id}`)} />
          ))}
        </div>
      </main>
    </div>
  );
}
