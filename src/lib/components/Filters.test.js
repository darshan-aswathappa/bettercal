import { test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import Filters from './Filters.svelte';

const base = {
  date: '2026-07-09',
  from: '',
  to: '',
  style: '',
  capacity: '',
  sort: 'name',
  minDate: '2026-07-09',
};

test('clicking a preset button emits its duration', async () => {
  const onPreset = vi.fn();
  render(Filters, { ...base, onPreset });

  await fireEvent.click(screen.getByRole('button', { name: '2h' }));

  expect(onPreset).toHaveBeenCalledWith(120);
});

test('changing the seat-style select emits the chosen value', async () => {
  const onStyle = vi.fn();
  render(Filters, { ...base, onStyle });

  await fireEvent.change(screen.getByDisplayValue('All styles'), {
    target: { value: 'Individual Study' },
  });

  expect(onStyle).toHaveBeenCalledWith('Individual Study');
});

test('changing the sort select emits the chosen key', async () => {
  const onSort = vi.fn();
  render(Filters, { ...base, onSort });

  await fireEvent.change(screen.getByDisplayValue('Name'), {
    target: { value: 'longest' },
  });

  expect(onSort).toHaveBeenCalledWith('longest');
});

test('highlights the preset matching the active window length', () => {
  render(Filters, { ...base, activeMinutes: 60 });

  expect(screen.getByRole('button', { name: '1h' })).toHaveClass('active');
  expect(screen.getByRole('button', { name: '2h' })).not.toHaveClass('active');
});

test('renders the 7-day quick-jump strip anchored at minDate', () => {
  render(Filters, base);

  const strip = screen.getByRole('group', { name: /jump to a day/i });
  expect(strip).toBeInTheDocument();
  // First chip is minDate (Thu Jul 9), shown as "Today".
  expect(screen.getByRole('button', { name: /thu jul 9/i })).toHaveTextContent('Today');
});

test('clicking a day in the strip emits its date via onDate', async () => {
  const onDate = vi.fn();
  render(Filters, { ...base, onDate });

  await fireEvent.click(screen.getByRole('button', { name: /fri jul 10/i }));

  expect(onDate).toHaveBeenCalledWith('2026-07-10');
});

test('the Clear time button is hidden until a window is active', async () => {
  const { rerender } = render(Filters, { ...base, showClearTime: false });
  expect(screen.getByTestId('clear-time')).toHaveAttribute('hidden');

  await rerender({ ...base, showClearTime: true });
  expect(screen.getByTestId('clear-time')).not.toHaveAttribute('hidden');
});

test('classrooms tab swaps seat style for a building dropdown and hides capacity', () => {
  render(Filters, { ...base, tab: 'classrooms', buildings: ['Ryder Hall', 'EXP'] });

  expect(screen.getByDisplayValue('All buildings')).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Ryder Hall' })).toBeInTheDocument();
  expect(screen.queryByDisplayValue('All styles')).not.toBeInTheDocument();
  expect(screen.queryByDisplayValue('Any size')).not.toBeInTheDocument();
});

test('changing the building select emits the chosen value via onStyle', async () => {
  const onStyle = vi.fn();
  render(Filters, { ...base, tab: 'classrooms', buildings: ['Ryder Hall', 'EXP'], onStyle });

  await fireEvent.change(screen.getByDisplayValue('All buildings'), {
    target: { value: 'Ryder Hall' },
  });

  expect(onStyle).toHaveBeenCalledWith('Ryder Hall');
});

test('classrooms tab relabels the eyebrow strip', () => {
  render(Filters, { ...base, tab: 'classrooms', buildings: [] });

  expect(screen.getByText(/Campus-wide/)).toBeInTheDocument();
  expect(screen.getByText('Classrooms')).toBeInTheDocument();
});
