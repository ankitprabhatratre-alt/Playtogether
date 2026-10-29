import type { PlayerPublic } from '@playtogether/shared';
import { Avatar } from '../components/ui';
import { useRoom } from './RoomProvider';

export function PlayerList({ manage }: { manage?: boolean }) {
  const { snapshot, creds, isHost, emit } = useRoom();
  if (!snapshot) return null;
  return (
    <ul className="player-list">
      {snapshot.players.map((p: PlayerPublic) => (
        <li key={p.id} className={`player ${p.online ? '' : 'player-offline'}`}>
          <Avatar name={p.name} color={p.color} online={p.online} />
          <div className="player-info">
            <span className="player-name">
              {p.name}
              {p.id === creds.playerId && <span className="tag">you</span>}
              {p.isHost && (
                <span className="tag tag-host" title="Host">
                  👑 host
                </span>
              )}
            </span>
            <span className={`status-dot ${p.online ? 'on' : 'off'}`}>{p.online ? 'Online' : 'Offline'}</span>
          </div>
          {manage && isHost && p.id !== creds.playerId && (
            <div className="player-actions">
              <button type="button" className="btn btn-tiny btn-ghost" onClick={() => emit('room:transferHost', { playerId: p.id })} title={`Make ${p.name} the host`} aria-label={`Make ${p.name} the host`}>
                👑
              </button>
              <button type="button" className="btn btn-tiny btn-ghost danger" onClick={() => emit('room:kick', { playerId: p.id })} title={`Remove ${p.name}`} aria-label={`Remove ${p.name}`}>
                ✕
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
