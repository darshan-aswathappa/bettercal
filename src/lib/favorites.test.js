import { test, expect } from 'vitest';
import {
  roomId,
  hasFavorite,
  toggleFavorite,
  pinFavoritesFirst,
  loadFavorites,
  saveFavorites,
  FAVORITES_KEY,
} from './favorites.js';

const roomA = { eid: 1, name: 'Group Study 130S' };
const roomB = { eid: 2, name: 'Silent 200' };
const roomNoEid = { name: 'Named Only' };

// A minimal in-memory Storage stand-in for the localStorage-backed helpers.
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test('roomId prefers the numeric eid, coerced to a string', () => {
  expect(roomId(roomA)).toBe('1');
});

test('roomId falls back to the name when there is no eid', () => {
  expect(roomId(roomNoEid)).toBe('Named Only');
});

test('hasFavorite matches on the room id', () => {
  expect(hasFavorite(['1', '2'], roomA)).toBe(true);
  expect(hasFavorite(['2'], roomA)).toBe(false);
});

test('toggleFavorite adds a missing room without mutating the input', () => {
  const ids = ['2'];
  const next = toggleFavorite(ids, roomA);

  expect(next).toEqual(['2', '1']);
  expect(ids).toEqual(['2']); // original untouched
});

test('toggleFavorite removes an already-favorited room', () => {
  expect(toggleFavorite(['1', '2'], roomA)).toEqual(['2']);
});

test('pinFavoritesFirst floats favorites up while preserving order within groups', () => {
  const rooms = [roomA, roomB, roomNoEid];
  const pinned = pinFavoritesFirst(rooms, ['2']);

  expect(pinned.map((r) => r.name)).toEqual(['Silent 200', 'Group Study 130S', 'Named Only']);
  // does not mutate the source array
  expect(rooms.map((r) => r.name)).toEqual(['Group Study 130S', 'Silent 200', 'Named Only']);
});

test('pinFavoritesFirst is a no-op ordering when nothing is favorited', () => {
  const rooms = [roomA, roomB];
  expect(pinFavoritesFirst(rooms, [])).toEqual(rooms);
});

test('loadFavorites reads and parses a stored id array', () => {
  const storage = fakeStorage({ [FAVORITES_KEY]: JSON.stringify(['1', '3']) });
  expect(loadFavorites(storage)).toEqual(['1', '3']);
});

test('loadFavorites returns an empty array when nothing is stored', () => {
  expect(loadFavorites(fakeStorage())).toEqual([]);
});

test('loadFavorites tolerates corrupt JSON and non-array payloads', () => {
  expect(loadFavorites(fakeStorage({ [FAVORITES_KEY]: 'not json' }))).toEqual([]);
  expect(loadFavorites(fakeStorage({ [FAVORITES_KEY]: '{"a":1}' }))).toEqual([]);
});

test('loadFavorites keeps only string ids from a mixed array', () => {
  const storage = fakeStorage({ [FAVORITES_KEY]: JSON.stringify(['1', 2, null, 'x']) });
  expect(loadFavorites(storage)).toEqual(['1', 'x']);
});

test('loadFavorites is safe when no storage is available', () => {
  expect(loadFavorites(null)).toEqual([]);
});

test('saveFavorites round-trips through loadFavorites', () => {
  const storage = fakeStorage();
  saveFavorites(storage, ['1', '2']);
  expect(loadFavorites(storage)).toEqual(['1', '2']);
});

test('saveFavorites is safe when no storage is available', () => {
  expect(() => saveFavorites(null, ['1'])).not.toThrow();
});
