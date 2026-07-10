import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import CopyLink from './CopyLink.svelte';

let writeText;

beforeEach(() => {
  vi.useFakeTimers();
  writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test('renders a button labelled "Copy link" by default', () => {
  render(CopyLink, { getUrl: () => 'https://example.test/?sort=longest' });
  expect(screen.getByTestId('copy-link')).toHaveTextContent(/copy link/i);
});

test('clicking writes the current URL to the clipboard and confirms', async () => {
  render(CopyLink, { getUrl: () => 'https://example.test/?sort=longest' });

  await fireEvent.click(screen.getByTestId('copy-link'));

  expect(writeText).toHaveBeenCalledWith('https://example.test/?sort=longest');
  await waitFor(() => expect(screen.getByTestId('copy-link')).toHaveTextContent(/copied/i));
});

test('the confirmation reverts to "Copy link" after a short delay', async () => {
  render(CopyLink, { getUrl: () => 'https://example.test/' });

  await fireEvent.click(screen.getByTestId('copy-link'));
  await waitFor(() => expect(screen.getByTestId('copy-link')).toHaveTextContent(/copied/i));

  vi.advanceTimersByTime(2500);
  await waitFor(() => expect(screen.getByTestId('copy-link')).toHaveTextContent(/copy link/i));
});

test('a clipboard failure leaves the label unchanged instead of throwing', async () => {
  writeText.mockRejectedValueOnce(new Error('denied'));
  render(CopyLink, { getUrl: () => 'https://example.test/' });

  await fireEvent.click(screen.getByTestId('copy-link'));

  expect(screen.getByTestId('copy-link')).toHaveTextContent(/copy link/i);
});
