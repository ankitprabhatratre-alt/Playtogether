import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { GAME_CATALOG, LIMITS, formatRoomCode, isValidRoomCode, normalizeRoomCode, type RoomPreview } from '@playtogether/shared';
import { api, ApiRequestError } from '../lib/api';
import { sessionStore } from '../lib/session';
import { Logo, Spinner } from '../components/ui';

/** Manual entry: /join */
export function JoinByCode() {
  const nav = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const c = normalizeRoomCode(code);
    if (!isValidRoomCode(c)) return setError('Room codes are 8 characters, like ABCD-EFGH.');
    nav(`/join/${c}`);
  };
  return (
    <div className="page">
      <header className="topbar">
        <Link to="/" aria-label="Home">
          <Logo small />
        </Link>
      </header>
      <main className="container narrow">
        <form className="card stack join-card" onSubmit={submit}>
          <h1>Join a room</h1>
          <p className="muted">Enter the room code your host shared. You'll need the passcode next.</p>
          <div className="field">
            <label htmlFor="code">Room code</label>
            <input
              id="code"
              className="code-input"
              autoFocus
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              value={code}
              placeholder="ABCD-EFGH"
              maxLength={12}
              onChange={(e) => {
                setError(null);
                const n = normalizeRoomCode(e.target.value).slice(0, 8);
                setCode(n.length > 4 ? `${n.slice(0, 4)}-${n.slice(4)}` : n);
              }}
            />
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn btn-primary btn-lg" type="submit">
            Continue →
          </button>
        </form>
      </main>
    </div>
  );
}

/** Invitation link: /join/:roomId */
export function JoinRoom() {
  const { roomId: raw = '' } = useParams();
  const roomId = normalizeRoomCode(raw);
  const nav = useNavigate();
  const [preview, setPreview] = useState<RoomPreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState(() => localStorage.getItem('pt:lastName') ?? '');
  const [passcode, setPasscode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remembered = sessionStore.remembered(roomId);

  useEffect(() => {
    // Already in this room in this tab → straight to the room.
    if (sessionStore.get(roomId)) {
      nav(`/room/${roomId}`, { replace: true });
      return;
    }
    if (!isValidRoomCode(roomId)) {
      setLoadError('That invitation link is not valid.');
      return;
    }
    api
      .previewRoom(roomId)
      .then(setPreview)
      .catch((e) => setLoadError(e instanceof ApiRequestError ? e.message : 'Could not load the room.'));
  }, [roomId, nav]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError('Please enter a display name.');
    if (!passcode) return setError('Please enter the room passcode.');
    setBusy(true);
    try {
      const creds = await api.joinRoom(roomId, { name: name.trim(), passcode });
      localStorage.setItem('pt:lastName', name.trim());
      sessionStore.save(creds);
      sessionStore.savePasscode(roomId, passcode);
      nav(`/room/${roomId}`, { replace: true });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not join the room.');
      setBusy(false);
    }
  };

  const rejoin = () => {
    sessionStore.adopt(roomId);
    nav(`/room/${roomId}`, { replace: true });
  };

  const game = preview ? GAME_CATALOG[preview.selectedGame] : null;

  return (
    <div className="page">
      <header className="topbar">
        <Link to="/" aria-label="Home">
          <Logo small />
        </Link>
      </header>
      <main className="container narrow">
        {loadError ? (
          <div className="card stack center-text">
            <div className="big-emoji" aria-hidden="true">
              🔍
            </div>
            <h1>Room unavailable</h1>
            <p className="muted">{loadError}</p>
            <div className="row gap center">
              <Link className="btn btn-secondary" to="/join">
                Enter a code
              </Link>
              <Link className="btn btn-primary" to="/create">
                Create a room
              </Link>
            </div>
          </div>
        ) : !preview ? (
          <div className="card center-text">
            <Spinner label="Finding room…" />
          </div>
        ) : (
          <form className="card stack join-card" onSubmit={submit}>
            <p className="eyebrow">You're invited to</p>
            <h1>{preview.name}</h1>
            <div className="join-meta">
              <span className="pill">Code {formatRoomCode(preview.roomId)}</span>
              {game && (
                <span className="pill" style={{ ['--accent' as string]: game.accent }}>
                  {game.emoji} {game.name}
                </span>
              )}
              <span className="pill">
                👥 {preview.playerCount}/{preview.maxPlayers}
              </span>
              {preview.hostName && <span className="pill">Host: {preview.hostName}</span>}
            </div>
            {preview.phase !== 'WAITING_ROOM' && <p className="notice">A game is in progress. You can join now and spectate until the next game.</p>}
            {remembered && (
              <div className="rejoin">
                <span>
                  You were in this room as <b>{remembered.name}</b>.
                </span>
                <button type="button" className="btn btn-secondary btn-small" onClick={rejoin}>
                  Rejoin as {remembered.name}
                </button>
              </div>
            )}
            <div className="field">
              <label htmlFor="name">Your display name</label>
              <input id="name" value={name} maxLength={LIMITS.nameMax} onChange={(e) => setName(e.target.value)} autoComplete="nickname" placeholder="e.g. Arjun" />
            </div>
            <div className="field">
              <label htmlFor="pass">Room passcode</label>
              <input id="pass" type="password" value={passcode} maxLength={LIMITS.passcodeMax} onChange={(e) => setPasscode(e.target.value)} autoComplete="off" placeholder="Ask your host" />
            </div>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="btn btn-primary btn-lg" type="submit" disabled={busy || preview.playerCount >= preview.maxPlayers}>
              {busy ? <Spinner label="Joining…" /> : preview.playerCount >= preview.maxPlayers ? 'Room is full' : 'Join room'}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
