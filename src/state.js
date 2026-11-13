export const STORAGE_KEY = 'sansa.temple.v1';
export const MAX_WISHES = 50;
export const MAX_WISH_LENGTH = 80;

export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function initialState() {
  return { incense: 0, bells: 0, meditationSeconds: 0, daily: {}, wishes: [], mode: 'day', rain: false, sound: false, volume: 0.35 };
}

function safeCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function normalizeState(value) {
  const defaults = initialState();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults;
  const daily = {};
  if (value.daily && typeof value.daily === 'object') {
    Object.entries(value.daily).filter(([key]) => /^\d{4}-\d{2}-\d{2}$/.test(key)).sort().slice(-90).forEach(([key, count]) => {
      daily[key] = safeCount(count);
    });
  }
  const wishes = Array.isArray(value.wishes) ? value.wishes.filter((wish) =>
    wish && typeof wish.text === 'string' && wish.text.trim() && typeof wish.id === 'string' && Number.isFinite(wish.createdAt)
  ).slice(0, MAX_WISHES).map((wish) => ({
    id: wish.id.slice(0, 100), text: wish.text.trim().slice(0, MAX_WISH_LENGTH), createdAt: wish.createdAt,
  })) : [];
  return {
    incense: safeCount(value.incense),
    bells: safeCount(value.bells),
    meditationSeconds: safeCount(value.meditationSeconds),
    daily,
    wishes,
    mode: ['day', 'dusk', 'night'].includes(value.mode) ? value.mode : defaults.mode,
    rain: typeof value.rain === 'boolean' ? value.rain : defaults.rain,
    sound: typeof value.sound === 'boolean' ? value.sound : defaults.sound,
    volume: typeof value.volume === 'number' && Number.isFinite(value.volume) ? Math.min(1, Math.max(0, value.volume)) : defaults.volume,
  };
}

export function readState(storage) {
  try {
    return normalizeState(JSON.parse(storage.getItem(STORAGE_KEY)));
  } catch {
    return initialState();
  }
}

export function writeState(storage, state) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function offerIncense(state, date = new Date()) {
  const key = dateKey(date);
  return normalizeState({ ...state, incense: state.incense + 1, daily: { ...state.daily, [key]: (state.daily[key] || 0) + 1 } });
}

export function createWishId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  // IDs are only local record identifiers, not security tokens.
  return `wish-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function addWish(state, text, now = Date.now(), id = createWishId()) {
  const clean = String(text).trim().slice(0, MAX_WISH_LENGTH);
  if (!clean) return state;
  return { ...state, wishes: [{ id, text: clean, createdAt: now }, ...state.wishes].slice(0, MAX_WISHES) };
}

// Apply only this tab's changes to the latest saved state instead of overwriting it.
export function mergeStateChanges(baseline, local, latest) {
  const merged = { ...latest };
  for (const key of ['incense', 'bells', 'meditationSeconds']) {
    merged[key] = Math.max(0, latest[key] + local[key] - baseline[key]);
  }
  merged.daily = { ...latest.daily };
  for (const key of new Set([...Object.keys(baseline.daily), ...Object.keys(local.daily)])) {
    const change = (local.daily[key] || 0) - (baseline.daily[key] || 0);
    if (change) merged.daily[key] = Math.max(0, (merged.daily[key] || 0) + change);
  }
  const baselineIds = new Set(baseline.wishes.map((wish) => wish.id));
  const localIds = new Set(local.wishes.map((wish) => wish.id));
  const removedIds = new Set([...baselineIds].filter((id) => !localIds.has(id)));
  const additions = local.wishes.filter((wish) => !baselineIds.has(wish.id));
  const byId = new Map([...additions, ...latest.wishes.filter((wish) => !removedIds.has(wish.id))].map((wish) => [wish.id, wish]));
  merged.wishes = [...byId.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_WISHES);
  for (const key of ['mode', 'rain', 'sound', 'volume']) {
    if (local[key] !== baseline[key]) merged[key] = local[key];
  }
  return normalizeState(merged);
}

export function formatDuration(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}
