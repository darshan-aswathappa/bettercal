<script>
  import { onMount } from 'svelte';
  import {
    getOrCreateToken,
    loadEmail,
    saveEmail,
    newRequestId,
    joinWatchlist,
  } from '$lib/watchlist-client.js';
  import { fmtTime } from '$lib/format.js';

  let { date, win, style, capacity } = $props();

  let email = $state('');
  let token = $state(null);
  let requestId = $state(newRequestId());
  let submitting = $state(false);
  let joined = $state(false);
  let dedup = $state(false);
  let error = $state('');

  onMount(() => {
    token = getOrCreateToken(localStorage);
    email = loadEmail(localStorage);
  });

  // A different window/filter combination is a different intent: new
  // idempotency key, clear any previous result. Retries of the SAME
  // submission (double-click, network timeout) keep the same requestId.
  $effect(() => {
    void date;
    void win?.from;
    void win?.to;
    void style;
    void capacity;
    requestId = newRequestId();
    joined = false;
    error = '';
  });

  // win.from / win.to are "YYYY-MM-DD HH:mm:ss"; the API takes "HH:mm".
  const hhmm = (ts) => ts?.slice(11, 16) ?? '';

  async function submit(event) {
    event.preventDefault();
    if (submitting || !token) return;
    submitting = true;
    error = '';
    try {
      const result = await joinWatchlist({
        requestId,
        email: email.trim(),
        token,
        date,
        from: hhmm(win.from),
        to: hhmm(win.to),
        style: style || '',
        capacity: capacity || '',
      });
      dedup = result.dedup;
      joined = true;
      saveEmail(localStorage, email.trim());
    } catch (err) {
      error = err.message;
    } finally {
      submitting = false;
    }
  }
</script>

<div class="watchlist-cta" data-testid="watchlist-cta">
  {#if !win?.to}
    <p class="wl-hint">
      Set an end time and SnellView can watch this window for you — you'll get an email if a
      matching room opens up.
    </p>
  {:else if joined}
    <p class="wl-success" data-testid="watchlist-joined">
      {dedup ? 'You are already watching this window.' : 'Watching this window.'}
      We'll email you if a room opens up (until 30 minutes before start).
      <a href="/watchlist">View your watchlist →</a>
    </p>
  {:else}
    <p class="wl-lead">
      Want {fmtTime(win.from)} – {fmtTime(win.to)}? Join the watchlist and we'll email you if a
      matching room frees up.
    </p>
    <form class="wl-form" onsubmit={submit}>
      <input
        class="wl-email"
        type="email"
        required
        maxlength="254"
        placeholder="you@northeastern.edu"
        aria-label="Email for watchlist notifications"
        bind:value={email}
      />
      <button class="wl-join" type="submit" disabled={submitting}>
        {submitting ? 'Joining…' : 'Join Watchlist'}
      </button>
    </form>
    {#if error}
      <p class="wl-error" role="alert">{error}</p>
    {/if}
  {/if}
</div>
