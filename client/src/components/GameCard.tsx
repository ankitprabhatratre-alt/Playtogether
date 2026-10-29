import type { GameMeta } from '@playtogether/shared';

export function GameCard({ meta, selected, onSelect, compact }: { meta: GameMeta; selected?: boolean; onSelect?: () => void; compact?: boolean }) {
  const ready = meta.status === 'ready';
  const players = meta.minPlayers === meta.maxPlayers ? `${meta.minPlayers}` : `${meta.minPlayers}–${meta.maxPlayers}`;
  const body = (
    <>
      <div className="game-card-top">
        <span className="game-emoji" aria-hidden="true">
          {meta.emoji}
        </span>
        {!ready && <span className="badge badge-muted">Coming soon</span>}
        {selected && <span className="badge">Selected</span>}
      </div>
      <h3>{meta.name}</h3>
      <p className="game-tagline">{meta.tagline}</p>
      {!compact && <p className="game-desc">{meta.description}</p>}
      <div className="game-meta">
        <span title="Players">👥 {players}</span>
        <span title="Estimated playtime">
          ⏱ {meta.estMinutes[0]}–{meta.estMinutes[1]} min
        </span>
      </div>
    </>
  );
  const style = { ['--accent' as string]: meta.accent };
  if (!onSelect || !ready) {
    return (
      <div className={`game-card ${ready ? '' : 'game-card-disabled'}`} style={style} aria-disabled={!ready}>
        {body}
      </div>
    );
  }
  return (
    <button type="button" className={`game-card ${selected ? 'game-card-selected' : ''}`} style={style} onClick={onSelect} aria-pressed={selected}>
      {body}
    </button>
  );
}
