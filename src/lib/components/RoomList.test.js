import { test, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import RoomList from './RoomList.svelte';

const rooms = [
  {
    eid: 1,
    name: 'Group Study 130S',
    grouping: 'Group Study Rooms',
    capacity: 6,
    bookUrl: 'https://libcal/1',
    ranges: [
      { start: '2026-07-09 09:00:00', end: '2026-07-09 12:00:00' },
      { start: '2026-07-09 14:00:00', end: '2026-07-09 15:00:00' },
    ],
  },
  {
    eid: 2,
    name: 'Silent 200',
    grouping: 'Individual Silent Study',
    capacity: null,
    bookUrl: 'https://libcal/2',
    ranges: [{ start: '2026-07-09 10:00:00', end: '2026-07-09 11:00:00' }],
  },
];

test('renders a row per room with name, sub, and a Book link', () => {
  render(RoomList, { rooms, date: '2026-07-09' });

  expect(screen.getByText('Group Study 130S')).toBeInTheDocument();
  expect(screen.getByText('Silent 200')).toBeInTheDocument();
  // null capacity renders an em dash
  expect(screen.getByText(/Individual Silent Study · seats —/)).toBeInTheDocument();

  const bookLinks = screen.getAllByRole('link', { name: /Book/ });
  expect(bookLinks).toHaveLength(2);
  expect(bookLinks[0]).toHaveAttribute('href', 'https://libcal/1?date=2026-07-09');
});

test('each free-range pill is a LibCal link positioned at that range start', () => {
  render(RoomList, { rooms: [rooms[0]], date: '2026-07-09' });

  // rooms[0] has a 09:00 range and a 14:00 range; each pill deep-links to its start.
  const nine = screen.getByRole('link', { name: /9:00/ });
  expect(nine).toHaveAttribute('href', 'https://libcal/1?date=2026-07-09%2009%3A00%3A00');

  const two = screen.getByRole('link', { name: /^2:00/ });
  expect(two).toHaveAttribute('href', 'https://libcal/1?date=2026-07-09%2014%3A00%3A00');
});

test('window-active mode shows a match pill plus the open-range context', () => {
  render(RoomList, {
    rooms: [rooms[0]],
    windowActive: true,
    win: { from: '2026-07-09 10:00:00', to: '2026-07-09 11:00:00' },
    date: '2026-07-09',
  });

  expect(screen.getByText(/✓/)).toBeInTheDocument();
  expect(screen.getByText(/^\s*open /)).toBeInTheDocument();
  // Book link drops the user at the window start, not just the date
  expect(screen.getByRole('link', { name: /Book/ })).toHaveAttribute(
    'href',
    expect.stringContaining('10%3A00%3A00')
  );
});

test('window-active mode spells out the end time to counter LibCal\'s 1h default', () => {
  render(RoomList, {
    rooms: [rooms[0]],
    windowActive: true,
    win: { from: '2026-07-09 10:00:00', to: '2026-07-09 11:00:00' },
    date: '2026-07-09',
  });

  const hint = screen.getByTestId('book-hint');
  expect(hint).toHaveTextContent('11:00'); // the end time the user must set on LibCal
  expect(hint).toHaveTextContent(/default/i);
});

test('open-ended window reserves hint space but keeps it invisible', () => {
  render(RoomList, {
    rooms: [rooms[0]],
    windowActive: true,
    win: { from: '2026-07-09 10:00:00', to: null },
    date: '2026-07-09',
  });

  // Element is in DOM so layout space is reserved, but text is hidden.
  const hint = screen.getByTestId('book-hint');
  expect(hint).toBeInTheDocument();
  expect(hint).toHaveStyle('visibility: hidden');
});

test('shows the empty message with the error class when there are no rooms', () => {
  render(RoomList, { rooms: [], emptyMessage: 'End time must be after start time.', error: true });

  const status = screen.getByTestId('status');
  expect(status).toHaveTextContent('End time must be after start time.');
  expect(status).toHaveClass('error');
});
