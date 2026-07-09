import { test, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import FreeNow from './FreeNow.svelte';

const now = new Date('2026-07-09T10:00:00');

const rooms = [
  {
    eid: 1,
    name: 'Ends at noon',
    capacity: 6,
    bookUrl: 'https://libcal/1',
    ranges: [{ start: '2026-07-09 09:00:00', end: '2026-07-09 12:00:00' }],
  },
  {
    eid: 2,
    name: 'Ends at eleven',
    capacity: 2,
    bookUrl: 'https://libcal/2',
    ranges: [{ start: '2026-07-09 09:30:00', end: '2026-07-09 11:00:00' }],
  },
  {
    eid: 3,
    name: 'Not free now',
    capacity: 4,
    bookUrl: 'https://libcal/3',
    ranges: [{ start: '2026-07-09 14:00:00', end: '2026-07-09 15:00:00' }],
  },
];

test('lists rooms free at now, longest-remaining first', () => {
  render(FreeNow, { rooms, now, isToday: true, date: '2026-07-09' });

  expect(screen.getByText('2')).toBeInTheDocument(); // count of currently-free rooms
  const cards = screen.getAllByRole('link');
  expect(cards).toHaveLength(2);
  // "Ends at noon" (free until 12:00) sorts before "Ends at eleven" (until 11:00)
  expect(cards[0]).toHaveTextContent('Ends at noon');
  expect(cards[1]).toHaveTextContent('Ends at eleven');
  expect(screen.queryByText('Not free now')).not.toBeInTheDocument();
});

test('is hidden when the selected date is not today', () => {
  render(FreeNow, { rooms, now, isToday: false, date: '2026-07-10' });
  expect(screen.getByTestId('free-now')).toHaveAttribute('hidden');
});

test('shows the terminal-style empty message when nothing is free now', () => {
  render(FreeNow, { rooms: [rooms[2]], now, isToday: true, date: '2026-07-09' });
  expect(screen.getByText(/Nothing free at this moment/)).toBeInTheDocument();
});
