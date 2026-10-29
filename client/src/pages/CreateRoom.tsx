import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { GAME_CATALOG, GAME_LIST, LIMITS, defaultSettings, isGameId, type GameId } from '@playtogether/shared';
import { api, ApiRequestError } from '../lib/api';
import { sessionStore } from '../lib/session';
import { GameCard } from '../components/GameCard';
import { SettingsForm } from '../components/SettingsForm';
import { Logo, Spinner } from '../components/ui';

const STEPS = ['You & your room', 'Choose a game', 'Settings & passcode'];

export function CreateRoom() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const initialGame = params.get('game');
  const [step, setStep] = useState(0);
  const [hostName, setHostName] = useState(() => localStorage.getItem('pt:lastName') ?? '');
  const [roomName, setRoomName] = useState('');
  const [gameId, setGameId] = useState<GameId>(isGameId(initialGame) && GAME_CATALOG[initialGame].status === 'ready' ? initialGame : 'quiz');
  const [settings, setSettings] = useState<Record<string, unknown>>(() => defaultSettings(gameId));
  const [passcode, setPasscode] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [maxPlayers, setMaxPlayers] = useState(8);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meta = GAME_CATALOG[gameId];
  const nameOk = hostName.trim().length > 0 && hostName.trim().length <= LIMITS.nameMax;
  const passOk = passcode.trim().length >= LIMITS.passcodeMin && passcode.length <= LIMITS.passcodeMax;

  const chooseGame = (id: GameId) => {
    setGameId(id);
    setSettings(defaultSettings(id));
    setMaxPlayers((m) => Math.min(Math.max(m, GAME_CATALOG[id].minPlayers), LIMITS.maxPlayersMax));
  };

  const next = (e?: FormEvent) => {
    e?.preventDefault();
    setError(null);
    if (step === 0 && !nameOk) return setError('Please enter your display name (max 20 characters).');
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!passOk) return setError(`Passcode must be ${LIMITS.passcodeMin}–${LIMITS.passcodeMax} characters.`);
    setBusy(true);
    try {
      const creds = await api.createRoom({ roomName: roomName.trim(), hostName: hostName.trim(), passcode, gameId, gameSettings: settings, maxPlayers });
      localStorage.setItem('pt:lastName', hostName.trim());
      sessionStore.save(creds);
      sessionStore.savePasscode(creds.roomId, passcode);
      nav(`/room/${creds.roomId}`, { replace: true });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not create the room.');
      setBusy(false);
    }
  };

  const suggestPasscode = () => {
    const words = ['mango', 'tiger', 'rocket', 'pixel', 'chai', 'lotus', 'comet', 'banjo', 'zebra', 'maple'];
    const w = words[Math.floor(Math.random() * words.length)];
    setPasscode(`${w}${Math.floor(100 + Math.random() * 900)}`);
    setShowPass(true);
  };

  return (
    <div className="page">
      <header className="topbar">
        <Link to="/" aria-label="Home">
          <Logo small />
        </Link>
        <Link to="/join" className="btn btn-ghost btn-small">
          Join instead
        </Link>
      </header>
      <main className="container narrow">
        <h1>Create a room</h1>
        <ol className="wizard-steps" aria-label="Progress">
          {STEPS.map((s, i) => (
            <li key={s} className={i === step ? 'active' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}>
              <button type="button" onClick={() => i < step && setStep(i)} disabled={i > step}>
                <b>{i < step ? '✓' : i + 1}</b> <span>{s}</span>
              </button>
            </li>
          ))}
        </ol>

        {step === 0 && (
          <form className="card stack" onSubmit={next}>
            <div className="field">
              <label htmlFor="hostName">Your display name</label>
              <input id="hostName" autoFocus value={hostName} maxLength={LIMITS.nameMax} placeholder="e.g. Priya" onChange={(e) => setHostName(e.target.value)} autoComplete="nickname" />
            </div>
            <div className="field">
              <label htmlFor="roomName">
                Room name <span className="muted">(optional)</span>
              </label>
              <input id="roomName" value={roomName} maxLength={LIMITS.roomNameMax} placeholder={hostName ? `${hostName.trim()}'s room` : 'Friday Game Night'} onChange={(e) => setRoomName(e.target.value)} />
            </div>
            {error && <p className="error" role="alert">{error}</p>}
            <div className="row end">
              <button className="btn btn-primary" type="submit">
                Next: choose a game →
              </button>
            </div>
          </form>
        )}

        {step === 1 && (
          <div className="stack">
            <div className="game-grid">
              {GAME_LIST.map((g) => (
                <GameCard key={g.id} meta={g} compact selected={g.id === gameId} onSelect={() => chooseGame(g.id)} />
              ))}
            </div>
            <div className="row between sticky-actions">
              <button className="btn btn-ghost" type="button" onClick={() => setStep(0)}>
                ← Back
              </button>
              <button className="btn btn-primary" type="button" onClick={() => next()}>
                Next: {meta.emoji} {meta.name} settings →
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <form className="stack" onSubmit={submit}>
            <section className="card stack">
              <h2>
                {meta.emoji} {meta.name}
              </h2>
              <SettingsForm meta={meta} value={settings} onChange={setSettings} />
            </section>
            <section className="card stack">
              <h2>Room access</h2>
              <div className="field">
                <label htmlFor="passcode">Room passcode</label>
                <div className="row gap">
                  <input
                    id="passcode"
                    type={showPass ? 'text' : 'password'}
                    value={passcode}
                    minLength={LIMITS.passcodeMin}
                    maxLength={LIMITS.passcodeMax}
                    placeholder={`At least ${LIMITS.passcodeMin} characters`}
                    onChange={(e) => setPasscode(e.target.value)}
                    autoComplete="new-password"
                  />
                  <button type="button" className="btn btn-small btn-ghost" onClick={() => setShowPass((s) => !s)} aria-pressed={showPass}>
                    {showPass ? 'Hide' : 'Show'}
                  </button>
                  <button type="button" className="btn btn-small" onClick={suggestPasscode}>
                    Suggest
                  </button>
                </div>
                <small className="muted">Friends need the invitation link and this passcode to join. It is stored hashed on the server.</small>
              </div>
              <div className="field">
                <label htmlFor="maxPlayers">
                  Maximum players <span className="field-value">{maxPlayers}</span>
                </label>
                <input id="maxPlayers" type="range" min={Math.max(2, meta.minPlayers)} max={LIMITS.maxPlayersMax} value={maxPlayers} onChange={(e) => setMaxPlayers(Number(e.target.value))} />
              </div>
            </section>
            {error && <p className="error" role="alert">{error}</p>}
            <div className="row between sticky-actions">
              <button className="btn btn-ghost" type="button" onClick={() => setStep(1)} disabled={busy}>
                ← Back
              </button>
              <button className="btn btn-primary btn-lg" type="submit" disabled={busy || !passOk}>
                {busy ? <Spinner label="Creating…" /> : 'Create & Invite 🚀'}
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
