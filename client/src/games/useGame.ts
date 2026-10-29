import { useCallback, useState } from 'react';
import type { AckResponse } from '@playtogether/shared';
import { useRoom } from '../room/RoomProvider';
import { useToasts } from '../components/Toasts';

/** Common helpers for game views. */
export function useGame() {
  const room = useRoom();
  const toasts = useToasts();
  const [pending, setPending] = useState(false);
  const snapshot = room.snapshot!;
  const session = snapshot.session!;
  const me = room.creds.playerId;
  const isParticipant = session.participants.includes(me);

  /** Send a game action. Errors are toasted unless `quiet` (caller shows them inline). */
  const act = useCallback(
    async (action: { type: string } & Record<string, unknown>, quiet = false): Promise<AckResponse> => {
      setPending(true);
      const res = await room.sendAction(action);
      setPending(false);
      if (!res.ok && !quiet) toasts.push(res.error, 'error');
      return res;
    },
    [room, toasts],
  );

  const name = (id: string | null | undefined) => (id ? (room.playersById.get(id)?.name ?? 'Someone') : '');
  const color = (id: string | null | undefined) => (id ? (room.playersById.get(id)?.color ?? '#666') : '#666');

  return { ...room, snapshot, session, phase: snapshot.phase, me, isParticipant, act, pending, name, color };
}
