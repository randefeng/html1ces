import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, normalizeState, offerIncense, addWish, dateKey, readState, writeState, mergeStateChanges, createWishId, formatDuration, MAX_WISHES, STORAGE_KEY } from '../src/state.js';

test('uses local calendar date and records daily incense without mutating the original', () => {
  const before = initialState();
  const date = new Date(2026, 10, 13, 23, 59);
  assert.equal(dateKey(date), '2026-11-13');
  const after = offerIncense(offerIncense(before, date), date);
  assert.equal(before.incense, 0);
  assert.equal(after.incense, 2);
  assert.equal(after.daily['2026-11-13'], 2);
});

test('invalid stored data is sanitized, with bounded history and preferences', () => {
  const state = normalizeState({ incense: -5, bells: '10', meditationSeconds: Infinity, volume: 4, sound: 'true', rain: 'true', mode: 'invalid', wishes: [null, {}], daily: { broken: 6, '2026-11-13': -2 } });
  assert.equal(state.incense, 0);
  assert.equal(state.bells, 0);
  assert.equal(state.meditationSeconds, 0);
  assert.equal(state.volume, 1);
  assert.equal(state.mode, 'day');
  assert.equal(state.sound, false);
  assert.equal(state.rain, false);
  assert.deepEqual(state.wishes, []);
  assert.deepEqual(state.daily, { '2026-11-13': 0 });
  assert.deepEqual(normalizeState(null), initialState());
  assert.deepEqual(normalizeState([]), initialState());
});

test('storage errors do not break the game', () => {
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
  assert.deepEqual(readState(broken), initialState());
  assert.deepEqual(readState(null), initialState());
  assert.equal(writeState(broken, initialState()), false);
  assert.deepEqual(readState({ getItem: () => 'not JSON' }), initialState());
});

test('valid storage round trips', () => {
  const data = new Map();
  const storage = { getItem: (key) => data.get(key), setItem: (key, value) => data.set(key, value) };
  const state = offerIncense(initialState());
  assert.equal(writeState(storage, state), true);
  assert.ok(data.has(STORAGE_KEY));
  assert.deepEqual(readState(storage), state);
});

test('wishes trim whitespace, reject blanks and bound both length and count', () => {
  const before = initialState();
  assert.equal(addWish(before, '  ', 1, 'blank'), before);
  let state = addWish(before, '  平安  ', 1, 'one');
  assert.equal(state.wishes[0].text, '平安');
  state = addWish(state, '愿'.repeat(100), 2, 'two');
  assert.equal(state.wishes[0].text.length, 80);
  for (let i = 0; i < 60; i++) state = addWish(state, `心愿 ${i}`, 3 + i, `id-${i}`);
  assert.equal(state.wishes.length, MAX_WISHES);
  assert.equal(state.wishes[0].text, '心愿 59');
  assert.equal(before.wishes.length, 0);
});

test('HTML-like wish text remains plain data', () => {
  const text = '<img src=x onerror=alert(1)>';
  assert.equal(addWish(initialState(), text, 1, 'html').wishes[0].text, text);
});

test('local IDs remain available without crypto.randomUUID', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true });
  try {
    assert.match(createWishId(), /^wish-/);
    assert.equal(new Set(Array.from({ length: 100 }, () => createWishId())).size, 100);
  } finally { Object.defineProperty(globalThis, 'crypto', descriptor); }
});

test('merging stale tabs preserves both new offerings and wishes', () => {
  const baseline = initialState();
  const date = new Date(2026, 10, 13);
  const local = addWish(offerIncense(baseline, date), '本地心愿', 1, 'local');
  const latest = addWish(offerIncense(baseline, date), '另一页心愿', 2, 'remote');
  const merged = mergeStateChanges(baseline, local, latest);
  assert.equal(merged.incense, 2);
  assert.equal(merged.daily['2026-11-13'], 2);
  assert.deepEqual(merged.wishes.map((wish) => wish.id), ['remote', 'local']);
  assert.equal(mergeStateChanges(merged, merged, merged).incense, 2);
});

test('merging removes deleted wishes without erasing remote additions or preferences', () => {
  const baseline = addWish(initialState(), '旧心愿', 1, 'old');
  const local = { ...baseline, wishes: [], volume: 0.2 };
  const latest = { ...addWish(baseline, '新心愿', 2, 'new'), mode: 'night' };
  const merged = mergeStateChanges(baseline, local, latest);
  assert.deepEqual(merged.wishes.map((wish) => wish.id), ['new']);
  assert.equal(merged.volume, 0.2);
  assert.equal(merged.mode, 'night');
});

test('duration formatting handles minute boundaries', () => {
  assert.equal(formatDuration(180), '03:00');
  assert.equal(formatDuration(59.9), '00:59');
  assert.equal(formatDuration(600), '10:00');
  assert.equal(formatDuration(-1), '00:00');
});
