import { useMemo } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { normalizeRoomCode } from '@playtogether/shared';
import { sessionStore } from '../lib/session';
import { RoomProvider, useRoom } from '../room/RoomProvider';
import { Lobby } from '../room/Lobby';
import { GameScreen } from '../room/GameScreen';
import { FinalResults } from '../room/FinalResults';
import { Logo, Spinner } from '../components/ui';

export function RoomPage() {
  const { roomId: raw = '' } = useParams();
  const roomId = normalizeRoomCode(raw);
  const creds = useMemo(() => sessionStore.get(roomId), [roomId]);
  if (!creds) return <Navigate to={`/join/${roomId}`} replace />;
  return (
    <RoomProvider creds={creds}>
      <RoomView />
    </RoomProvider>
  );
}

function RoomView() {
  const { status, snapshot, removal, retry, creds } = useRoom();

  if (status === 'unauthorized') {
    return (
      <StatusScreen icon="🔒" title="Session expired">
        <p className="muted">Your access to this room is no longer valid (the room may have restarted or you were removed). Join again with the passcode.</p>
        <Link className="btn btn-primary" to={`/join/${creds.roomId}`}>
          Join again
        </Link>
      </StatusScreen>
    );
  }
  if (status === 'removed' && removal) {
    const icon = removal.reason === 'kicked' ? '🚪' : removal.reason === 'replaced' ? '🗂️' : removal.reason === 'left' ? '👋' : '🏁';
    return (
      <StatusScreen icon={icon} title={removal.reason === 'replaced' ? 'Opened elsewhere' : removal.reason === 'left' ? 'You left the room' : 'Room ended'}>
        <p className="muted">{removal.message}</p>
        <div className="row gap center">
          {removal.reason === 'replaced' && (
            <button className="btn btn-secondary" onClick={() => window.location.reload()}>
              Use this tab instead
            </button>
          )}
          <Link className="btn btn-primary" to="/">
            Back to home
          </Link>
        </div>
      </StatusScreen>
    );
  }
  if (!snapshot) {
    return (
      <StatusScreen icon="🎮" title={status === 'reconnecting' ? 'Reconnecting…' : 'Joining room…'}>
        <Spinner />
        {status === 'offline' && (
          <button className="btn btn-secondary" onClick={retry}>
            Try again
          </button>
        )}
      </StatusScreen>
    );
  }

  const phase = snapshot.phase;
  return (
    <>
      {status !== 'connected' && (
        <div className="conn-banner" role="status">
          <Spinner /> {status === 'offline' ? 'Connection blocked, retrying soon…' : 'Connection lost, reconnecting… your progress is safe.'}
        </div>
      )}
      {phase === 'WAITING_ROOM' ? <Lobby /> : phase === 'FINAL_RESULTS' ? <FinalResults /> : <GameScreen />}
    </>
  );
}

function StatusScreen({ icon, title, children }: { icon: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="page">
      <header className="topbar">
        <Link to="/" aria-label="Home">
          <Logo small />
        </Link>
      </header>
      <main className="container narrow">
        <div className="card stack center-text">
          <div className="big-emoji" aria-hidden="true">
            {icon}
          </div>
          <h1>{title}</h1>
          {children}
        </div>
      </main>
    </div>
  );
}
