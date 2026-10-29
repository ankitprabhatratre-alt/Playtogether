import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GAME_CATALOG, GAME_LIST, LIMITS, formatRoomCode, type GameId } from '@playtogether/shared';
import { useRoom } from './RoomProvider';
import { PlayerList } from './PlayerList';
import { QRCode } from '../components/QRCode';
import { GameCard } from '../components/GameCard';
import { SettingsForm, settingsSummary } from '../components/SettingsForm';
import { ConfirmButton, Logo } from '../components/ui';
import { useToasts } from '../components/Toasts';
import { copyText, inviteUrl } from '../lib/util';
import { sessionStore } from '../lib/session';

export function Lobby() {
  const { snapshot, isHost, emit, creds } = useRoom();
  const toasts = useToasts();
  const nav = useNavigate();
  const [editing, setEditing] = useState(false);
  const [showPass, setShowPass] = useState(false);
  if (!snapshot) return null;
  const meta = GAME_CATALOG[snapshot.selectedGame];
  const url = inviteUrl(snapshot.room.id);
  const passcode = sessionStore.passcode(snapshot.room.id);
  const online = snapshot.players.filter((p) => p.online).length;
  const need = meta.minPlayers - online;
  const tooMany = online > meta.maxPlayers;
  const canStart = need <= 0 && !tooMany;

  const copy = async (text: string, what: string) => toasts.push((await copyText(text)) ? `${what} copied!` : `Could not copy ${what.toLowerCase()}`, 'success');
  const share = async () => {
    const text = `Join my PlayTogether room "${snapshot.room.name}"!`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'PlayTogether', text, url });
      } catch {
        /* cancelled */
      }
    } else copy(url, 'Invitation link');
  };

  const leave = async () => {
    const res = await emit('room:leave');
    if (res.ok) {
      sessionStore.clear(creds.roomId);
      nav('/');
    }
  };

  return (
    <div className="page lobby">
      <header className="topbar">
        <Logo small />
        <div className="row gap">
          <ConfirmButton className="btn btn-ghost btn-small" confirmText="Leave this room? You can rejoin with the passcode." onConfirm={leave}>
            Leave
          </ConfirmButton>
          {isHost && (
            <ConfirmButton className="btn btn-danger btn-small" confirmText="Close the room for everyone?" onConfirm={() => emit('room:close')}>
              Close room
            </ConfirmButton>
          )}
        </div>
      </header>
      <main className="container lobby-grid">
        <section className="card lobby-head">
          <p className="eyebrow">Waiting room</p>
          <h1>{snapshot.room.name}</h1>
          <div className="room-code" aria-label={`Room code ${formatRoomCode(snapshot.room.id)}`}>
            {formatRoomCode(snapshot.room.id)}
          </div>
        </section>

        <section className="card invite" aria-labelledby="invite-h">
          <h2 id="invite-h">Invite friends</h2>
          <div className="invite-body">
            <QRCode value={url} />
            <div className="stack invite-actions">
              <div className="invite-url" title={url}>
                {url}
              </div>
              <div className="row gap wrap">
                <button className="btn btn-primary btn-small" onClick={() => copy(url, 'Invitation link')}>
                  🔗 Copy invitation link
                </button>
                <button className="btn btn-secondary btn-small" onClick={share}>
                  📤 Share
                </button>
              </div>
              <div className="passcode-row">
                <span className="muted">Passcode:</span>
                {passcode ? (
                  <>
                    <code>{showPass ? passcode : '•'.repeat(Math.min(passcode.length, 10))}</code>
                    <button className="btn btn-tiny btn-ghost" onClick={() => setShowPass((s) => !s)} aria-pressed={showPass}>
                      {showPass ? 'Hide' : 'Show'}
                    </button>
                    <button className="btn btn-tiny" onClick={() => copy(passcode, 'Passcode')}>
                      Copy passcode
                    </button>
                  </>
                ) : (
                  <span className="muted">Ask the host (not stored on this device)</span>
                )}
              </div>
              <small className="muted">The link opens this room, but the passcode is still required to join.</small>
            </div>
          </div>
        </section>

        <section className="card players-card" aria-labelledby="players-h">
          <div className="row between">
            <h2 id="players-h">Players</h2>
            <span className="pill">
              {online} online · {snapshot.players.length}/{snapshot.room.maxPlayers}
            </span>
          </div>
          <PlayerList manage />
          {snapshot.players.length === 1 && <p className="muted small">Nobody else here yet. Share the link and passcode!</p>}
        </section>

        <section className="card game-card-lobby" aria-labelledby="game-h" style={{ ['--accent' as string]: meta.accent }}>
          <div className="row between">
            <h2 id="game-h">Selected game</h2>
            {isHost && !editing && (
              <button className="btn btn-small btn-secondary" onClick={() => setEditing(true)}>
                Change game / settings
              </button>
            )}
          </div>
          {editing && isHost ? (
            <GameEditor onDone={() => setEditing(false)} />
          ) : (
            <>
              <div className="selected-game">
                <span className="game-emoji big" aria-hidden="true">
                  {meta.emoji}
                </span>
                <div>
                  <h3>{meta.name}</h3>
                  <p className="muted">{meta.tagline}</p>
                </div>
              </div>
              <ul className="summary">
                {settingsSummary(meta, snapshot.gameSettings).map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
              <details className="how">
                <summary>How to play</summary>
                <ul>
                  {meta.howToPlay.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </details>
            </>
          )}
        </section>

        <section className="card start-card">
          {isHost ? (
            <>
              <button className="btn btn-primary btn-xl full" disabled={!canStart || editing} onClick={() => emit('room:start')}>
                ▶ Start {meta.name}
              </button>
              <p className="muted center-text small" aria-live="polite">
                {editing
                  ? 'Save your settings first.'
                  : need > 0
                    ? `Waiting for ${need} more player${need === 1 ? '' : 's'} (needs ${meta.minPlayers}+ online).`
                    : tooMany
                      ? `${meta.name} supports up to ${meta.maxPlayers} players.`
                      : `Ready! ${online} player${online === 1 ? '' : 's'} will play.`}
              </p>
            </>
          ) : (
            <div className="waiting">
              <span className="dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <p>
                Waiting for <b>{snapshot.players.find((p) => p.isHost)?.name ?? 'the host'}</b> to start the game…
              </p>
            </div>
          )}
        </section>

        {snapshot.history.length > 0 && (
          <section className="card history">
            <h2>Played in this room</h2>
            <ul>
              {snapshot.history.map((h, i) => (
                <li key={i}>
                  {GAME_CATALOG[h.gameId].emoji} {GAME_CATALOG[h.gameId].name}: {h.winnerName ? `🏆 ${h.winnerName}` : 'no winner'}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}

function GameEditor({ onDone }: { onDone: () => void }) {
  const { snapshot, emit } = useRoom();
  const [gameId, setGameId] = useState<GameId>(snapshot!.selectedGame);
  const [settings, setSettings] = useState<Record<string, unknown>>(snapshot!.gameSettings);
  const [roomName, setRoomName] = useState(snapshot!.room.name);
  const [maxPlayers, setMaxPlayers] = useState(snapshot!.room.maxPlayers);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (gameId !== snapshot!.selectedGame) setSettings({});
    else setSettings(snapshot!.gameSettings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);
  const meta = GAME_CATALOG[gameId];
  const save = async () => {
    setSaving(true);
    const res = await emit('room:updateSettings', { gameId, gameSettings: settings, roomName, maxPlayers });
    setSaving(false);
    if (res.ok) onDone();
  };
  return (
    <div className="stack">
      <div className="game-grid compact">
        {GAME_LIST.map((g) => (
          <GameCard key={g.id} meta={g} compact selected={g.id === gameId} onSelect={() => setGameId(g.id)} />
        ))}
      </div>
      <h3>
        {meta.emoji} {meta.name} settings
      </h3>
      <SettingsForm meta={meta} value={settings} onChange={setSettings} />
      <details>
        <summary>Room settings</summary>
        <div className="settings-grid">
          <div className="field">
            <label htmlFor="rn">Room name</label>
            <input id="rn" value={roomName} maxLength={LIMITS.roomNameMax} onChange={(e) => setRoomName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="mp">
              Maximum players <span className="field-value">{maxPlayers}</span>
            </label>
            <input id="mp" type="range" min={LIMITS.maxPlayersMin} max={LIMITS.maxPlayersMax} value={maxPlayers} onChange={(e) => setMaxPlayers(Number(e.target.value))} />
          </div>
        </div>
      </details>
      <div className="row gap end">
        <button className="btn btn-ghost" onClick={onDone} disabled={saving}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
