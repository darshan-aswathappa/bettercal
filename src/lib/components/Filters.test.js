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

test('the Clear time button is hidden until a window is active', async () => {
  const { rerender } = render(Filters, { ...base, showClearTime: false });
  expect(screen.getByTestId('clear-time')).toHaveAttribute('hidden');

  await rerender({ ...base, showClearTime: true });
  expect(screen.getByTestId('clear-time')).not.toHaveAttribute('hidden');
});
