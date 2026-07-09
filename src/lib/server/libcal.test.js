import { test, expect } from 'vitest';
import { parseRooms } from './libcal.js';

// Minimal shape of the `resources.push({...})` blocks embedded in the LibCal
// reserve page. The real page has many; these exercise the parsing branches.
const html = `
  <script>
  var resources = [];
  resources.push({
    eid: 167013,
    gid: 41305,
    lid: 7009,
    capacity: 6,
    title: "Group Study 091 (Capacity 6)",
    grouping: "Group Study Rooms",
    url: "/space/167013"
  });
  resources.push({
    eid: 167020,
    gid: 41306,
    lid: 7009,
    capacity: 1,
    title: "Silent Study 200 \\u2014 Quiet",
    grouping: "Individual Silent Study",
    url: "/space/167020"
  });
  resources.push({
    eid: 999,
    lid: 8000,
    capacity: 4,
    title: "Other Library Room",
    grouping: "Group Study Rooms"
  });
  </script>
`;

test('parses room blocks and strips the "(Capacity N)" suffix from the title', () => {
  const rooms = parseRooms(html);
  const first = rooms.find((r) => r.eid === 167013);

  expect(first).toEqual({
    eid: 167013,
    gid: 41305,
    name: 'Group Study 091',
    grouping: 'Group Study Rooms',
    capacity: 6,
    bookUrl: 'https://northeastern.libcal.com/space/167013',
  });
});

test('decodes \\uXXXX escapes in titles', () => {
  const rooms = parseRooms(html);
  const silent = rooms.find((r) => r.eid === 167020);
  expect(silent.name).toBe('Silent Study 200 — Quiet');
});

test('excludes rooms from other libraries (lid !== 7009)', () => {
  const rooms = parseRooms(html);
  expect(rooms.some((r) => r.eid === 999)).toBe(false);
});

test('returns an empty list when the markup has no resource blocks', () => {
  expect(parseRooms('<html><body>nothing here</body></html>')).toEqual([]);
});
