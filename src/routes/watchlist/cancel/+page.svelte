<script>
  import { fmtTime } from '$lib/format.js';

  let { data } = $props();

  let busy = $state(false);
  let done = $state('');
  let error = $state('');

  function windowText(group) {
    if (!group) return '';
    return `${fmtTime(`${group.date} ${group.start_time}`)} – ${fmtTime(`${group.date} ${group.end_time}`)}`;
  }

  async function cancel(all) {
    if (busy) return;
    busy = true;
    error = '';
    try {
      const res = await fetch('/api/watchlist/cancel', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(all ? { token: data.token, all: true } : { id: data.wid, token: data.token }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.ok) throw new Error(payload.error || `Request failed (${res.status})`);
      done = all
        ? `Cancelled ${payload.cancelled} active watchlist${payload.cancelled === 1 ? '' : 's'}.`
        : 'Watchlist cancelled.';
    } catch (err) {
      error = err.message;
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head>
  <title>Cancel watchlist · SnellView</title>
</svelte:head>

<div class="subpage">
  <header class="subpage-head">
    <a class="subpage-back" href="/">← Rooms</a>
    <h1>Cancel watchlist</h1>
  </header>

  {#if done}
    <p class="status" data-testid="cancel-done">{done} <a href="/watchlist">View your watchlist →</a></p>
  {:else if !data.valid}
    <p class="status error">
      This link is invalid or the watchlist is already finished.
      <a href="/watchlist">View your watchlist →</a>
    </p>
  {:else}
    <div class="wl-cancel-card">
      <p>
        <span class="wl-date">{data.entry.group?.date}</span>
        <span class="wl-window">{windowText(data.entry.group)}</span>
        {#if data.entry.group?.style}<span class="wl-chip">{data.entry.group.style}</span>{/if}
        {#if data.entry.group?.capacity}<span class="wl-chip">{data.entry.group.capacity} people</span>{/if}
        <span class="wl-meta">status: {data.entry.status.toLowerCase()}</span>
      </p>
      {#if data.entry.status === 'ACTIVE'}
        <div class="wl-cancel-actions">
          <button class="wl-cancel" onclick={() => cancel(false)} disabled={busy}>
            {busy ? 'Working…' : 'Cancel this watchlist'}
          </button>
          <button class="wl-cancel wl-cancel-all" onclick={() => cancel(true)} disabled={busy}>
            Cancel all my active watchlists
          </button>
        </div>
      {:else}
        <p class="status">This watchlist is no longer active — nothing to cancel.</p>
      {/if}
      {#if error}
        <p class="status error" role="alert">{error}</p>
      {/if}
    </div>
  {/if}
</div>
