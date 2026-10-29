import { Link } from 'react-router-dom';
import { GAME_LIST } from '@playtogether/shared';
import { Logo } from '../components/ui';

export function Landing() {
  return (
    <div className="page landing">
      <header className="topbar">
        <Logo />
        <nav className="row gap">
          <Link to="/games" className="btn btn-ghost btn-small">
            Games
          </Link>
          <Link to="/join" className="btn btn-ghost btn-small">
            Join room
          </Link>
        </nav>
      </header>
      <main>
        <section className="hero">
          <div className="hero-floaters" aria-hidden="true">
            {GAME_LIST.map((g, i) => (
              <span key={g.id} style={{ ['--i' as string]: i }}>
                {g.emoji}
              </span>
            ))}
          </div>
          <h1>
            Party games for <span className="grad">everyone</span>, on every device.
          </h1>
          <p className="lead">Create a private room, share the link, and play together in real time. No accounts, no downloads, just a name and a passcode.</p>
          <div className="hero-cta">
            <Link to="/create" className="btn btn-primary btn-xl">
              🎉 Play With Friends
            </Link>
            <Link to="/join" className="btn btn-secondary btn-xl">
              I have a room code
            </Link>
          </div>
          <ol className="steps" aria-label="How it works">
            <li>
              <b>1</b> Create a room
            </li>
            <li>
              <b>2</b> Pick a game
            </li>
            <li>
              <b>3</b> Share link + passcode
            </li>
            <li>
              <b>4</b> Play together!
            </li>
          </ol>
        </section>
        <section className="section">
          <h2>{GAME_LIST.filter((g) => g.status === 'ready').length} games ready to play</h2>
          <div className="mini-games">
            {GAME_LIST.map((g) => (
              <Link key={g.id} to={`/create?game=${g.id}`} className="mini-game" style={{ ['--accent' as string]: g.accent }}>
                <span aria-hidden="true">{g.emoji}</span>
                <b>{g.name}</b>
                <small>
                  {g.minPlayers}–{g.maxPlayers} players
                </small>
              </Link>
            ))}
          </div>
        </section>
      </main>
      <footer className="footer muted">PlayTogether · Rooms are private and protected by a passcode.</footer>
    </div>
  );
}
