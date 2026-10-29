import { z } from 'zod';
import { GAME_CATALOG, type GameId, type SettingDescriptor } from './catalog.js';
import { sanitizeText } from './sanitize.js';

function schemaFor(d: SettingDescriptor): z.ZodTypeAny {
  switch (d.type) {
    case 'number':
      return z.number().int().min(d.min).max(d.max);
    case 'select':
      return z.enum(d.options.map((o) => o.value) as [string, ...string[]]);
    case 'boolean':
      return z.boolean();
    case 'multiselect':
      return z
        .array(z.enum(d.options.map((o) => o.value) as [string, ...string[]]))
        .min(d.minSelected)
        .max(d.options.length)
        .transform((arr) => Array.from(new Set(arr)));
    case 'textlist':
      return z
        .array(z.string().max(d.maxLength * 2))
        .max(d.maxItems)
        .transform((arr) =>
          arr.map((s) => sanitizeText(s, d.maxLength)).filter((s) => s.length > 0),
        );
  }
}

const cache = new Map<GameId, z.ZodTypeAny>();

export function settingsSchema(gameId: GameId): z.ZodTypeAny {
  let s = cache.get(gameId);
  if (!s) {
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const d of GAME_CATALOG[gameId].settings) {
      shape[d.key] = schemaFor(d).default(Array.isArray(d.default) ? [...d.default] : d.default);
    }
    s = z.object(shape).strict();
    cache.set(gameId, s);
  }
  return s;
}

export type SettingsResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: string };

/** Validate (and fill defaults for) a game's settings object. Unknown keys are rejected. */
export function parseGameSettings(gameId: GameId, raw: unknown): SettingsResult {
  const res = settingsSchema(gameId).safeParse(raw ?? {});
  if (!res.success) {
    const issue = res.error.issues[0];
    return { ok: false, error: `Invalid setting "${issue?.path.join('.') || '?'}": ${issue?.message ?? 'invalid'}` };
  }
  return { ok: true, value: res.data as Record<string, unknown> };
}
