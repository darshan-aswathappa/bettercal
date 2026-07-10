import { test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import DateStrip from './DateStrip.svelte';

const base = {
  startDate: '2026-07-09', // Thursday
  selected: '2026-07-09',
};

test('renders a chip for each of the seven rolling days', () => {
  render(DateStrip, base);

  const chips = screen.getAllByRole('button');
  expect(chips).toHaveLength(7);
  // First chip is today (Thu 9) — shown as "Today", full weekday in the label.
  expect(chips[0]).toHaveTextContent('9');
  expect(chips[0]).toHaveAccessibleName(/thu jul 9/i);
  expect(chips[6]).toHaveAccessibleName(/wed jul 15/i);
});

test('marks the selected day with aria-pressed and the selected class', () => {
  render(DateStrip, { ...base, selected: '2026-07-11' });

  const selected = screen.getByRole('button', { pressed: true });
  expect(selected).toHaveTextContent('11');
  expect(selected).toHaveClass('selected');
});

test('labels the first day as Today for orientation', () => {
  render(DateStrip, base);
  expect(screen.getByText('Today')).toBeInTheDocument();
});

test('clicking a day emits its date', async () => {
  const onSelect = vi.fn();
  render(DateStrip, { ...base, onSelect });

  await fireEvent.click(screen.getByRole('button', { name: /jul 10/i }));

  expect(onSelect).toHaveBeenCalledWith('2026-07-10');
});

test('honours a custom day count', () => {
  render(DateStrip, { ...base, days: 3 });
  expect(screen.getAllByRole('button')).toHaveLength(3);
});
