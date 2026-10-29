import { useState } from 'react';
import type { GameMeta, SettingDescriptor } from '@playtogether/shared';

/** Renders host-editable game settings from the shared declarative descriptors. */
export function SettingsForm({ meta, value, onChange, disabled }: { meta: GameMeta; value: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void; disabled?: boolean }) {
  const set = (key: string, v: unknown) => onChange({ ...value, [key]: v });
  if (meta.settings.length === 0) return <p className="muted">This game has no settings.</p>;
  return (
    <div className="settings-grid">
      {meta.settings.map((d) => (
        <Field key={d.key} d={d} v={value[d.key] ?? d.default} set={(v) => set(d.key, v)} disabled={disabled} />
      ))}
    </div>
  );
}

function Field({ d, v, set, disabled }: { d: SettingDescriptor; v: unknown; set: (v: unknown) => void; disabled?: boolean }) {
  const id = `setting-${d.key}`;
  switch (d.type) {
    case 'number': {
      const n = typeof v === 'number' ? v : d.default;
      return (
        <div className="field">
          <label htmlFor={id}>
            {d.label}
            <span className="field-value">
              {n}
              {d.unit ?? ''}
            </span>
          </label>
          <input id={id} type="range" min={d.min} max={d.max} step={d.step ?? 1} value={n} disabled={disabled} onChange={(e) => set(Number(e.target.value))} />
          {d.help && <small className="muted">{d.help}</small>}
        </div>
      );
    }
    case 'select':
      return (
        <div className="field">
          <label htmlFor={id}>{d.label}</label>
          <select id={id} value={String(v)} disabled={disabled} onChange={(e) => set(e.target.value)}>
            {d.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {d.help && <small className="muted">{d.help}</small>}
        </div>
      );
    case 'boolean':
      return (
        <div className="field field-inline">
          <label htmlFor={id} className="switch">
            <input id={id} type="checkbox" checked={Boolean(v)} disabled={disabled} onChange={(e) => set(e.target.checked)} />
            <span className="switch-ui" aria-hidden="true" />
            <span>{d.label}</span>
          </label>
          {d.help && <small className="muted">{d.help}</small>}
        </div>
      );
    case 'multiselect': {
      const arr = Array.isArray(v) ? (v as string[]) : d.default;
      return (
        <fieldset className="field">
          <legend>{d.label}</legend>
          <div className="chips">
            {d.options.map((o) => {
              const on = arr.includes(o.value);
              const lastOne = on && arr.length <= d.minSelected;
              return (
                <button
                  type="button"
                  key={o.value}
                  className={`chip ${on ? 'chip-on' : ''}`}
                  aria-pressed={on}
                  disabled={disabled || lastOne}
                  title={lastOne ? `Select at least ${d.minSelected}` : undefined}
                  onClick={() => set(on ? arr.filter((x) => x !== o.value) : [...arr, o.value])}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </fieldset>
      );
    }
    case 'textlist':
      return <TextList d={d} v={Array.isArray(v) ? (v as string[]) : []} set={set} disabled={disabled} />;
  }
}

function TextList({ d, v, set, disabled }: { d: Extract<SettingDescriptor, { type: 'textlist' }>; v: string[]; set: (v: unknown) => void; disabled?: boolean }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const t = draft.trim().slice(0, d.maxLength);
    if (!t || v.length >= d.maxItems) return;
    set([...v, t]);
    setDraft('');
  };
  return (
    <div className="field">
      <label htmlFor={`setting-${d.key}`}>
        {d.label}
        <span className="field-value">
          {v.length}/{d.maxItems}
        </span>
      </label>
      <div className="row gap">
        <input
          id={`setting-${d.key}`}
          value={draft}
          maxLength={d.maxLength}
          placeholder={d.placeholder}
          disabled={disabled || v.length >= d.maxItems}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="btn btn-small" onClick={add} disabled={disabled || !draft.trim()}>
          Add
        </button>
      </div>
      {v.length > 0 && (
        <ul className="textlist">
          {v.map((t, i) => (
            <li key={i}>
              <span>{t}</span>
              <button type="button" className="icon-btn" aria-label={`Remove "${t}"`} disabled={disabled} onClick={() => set(v.filter((_, j) => j !== i))}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function settingsSummary(meta: GameMeta, value: Record<string, unknown>): string[] {
  return meta.settings
    .filter((d) => d.type === 'number' || d.type === 'select' || d.type === 'boolean')
    .map((d) => {
      const v = value[d.key] ?? d.default;
      if (d.type === 'number') return `${d.label}: ${v}${d.unit ?? ''}`;
      if (d.type === 'boolean') return `${d.label}: ${v ? 'On' : 'Off'}`;
      const opt = (d as Extract<SettingDescriptor, { type: 'select' }>).options.find((o) => o.value === v);
      return `${d.label}: ${opt?.label.split(':')[0].split('(')[0].trim() ?? v}`;
    });
}
