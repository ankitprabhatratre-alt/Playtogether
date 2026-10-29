import { Avatar } from '../components/ui';
import { useRoom } from '../room/RoomProvider';

/** Row of participant avatars, marking who has done something (answered, voted…). */
export function ProgressAvatars({ ids, doneIds, label }: { ids: string[]; doneIds: string[]; label: string }) {
  const { playersById } = useRoom();
  const done = ids.filter((id) => doneIds.includes(id)).length;
  return (
    <div className="progress-avatars" aria-label={`${done} of ${ids.length} ${label}`}>
      <div className="row wrap gap-sm">
        {ids.map((id) => {
          const p = playersById.get(id);
          const ok = doneIds.includes(id);
          return (
            <span key={id} className={`pa ${ok ? 'pa-done' : ''}`} title={`${p?.name ?? '?'}${ok ? ' ✓' : ''}`}>
              <Avatar name={p?.name ?? '?'} color={p?.color ?? '#555'} size={30} online={p?.online ?? false} />
              {ok && <i aria-hidden="true">✓</i>}
            </span>
          );
        })}
      </div>
      <small className="muted">
        {done}/{ids.length} {label}
      </small>
    </div>
  );
}

export function PlayerChip({ id }: { id: string }) {
  const { playersById, creds } = useRoom();
  const p = playersById.get(id);
  return (
    <span className="player-chip">
      <Avatar name={p?.name ?? '?'} color={p?.color ?? '#555'} size={22} online={p?.online ?? false} />
      {p?.name ?? 'Someone'}
      {id === creds.playerId && <span className="tag">you</span>}
    </span>
  );
}
