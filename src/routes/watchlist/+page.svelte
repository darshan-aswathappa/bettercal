<script>
  import { onMount } from 'svelte';
  import { getOrCreateToken, listWatchlists, cancelWatchlist } from '$lib/watchlist-client.js';
  import { fmtTime } from '$lib/format.js';

  let token = $state(null);
  let entries = $state([]);
  let loading = $state(true);
  let loadError = $state('');
  let cancelling = $state(null); // watchlist id mid-cancel
  let now = $state(new Date());

  const SECTIONS = [
    { status: 'ACTIVE', title: 'Active' },
    { status: 'FOUND', title: 'Room found' },
    { status: 'EXPIRED', title: 'Expired' },
    { status: 'CANCELLED', title: 'Cancelled' },
  ];

  const byStatus = $derived.by(() => {
    const groups = { ACTIVE: [], FOUND: [], EXPIRED: [], CANCELLED: [] };
    for (const e of entries) (groups[e.status] ?? groups.CANCELLED).push(e);
    return groups;
  });

  function windowText(group) {
    if (!group) return '';
    const start = `${group.date} ${group.start_time}`;
    const end = `${group.date} ${group.end_time}`;
    return `${fmtTime(start)} – ${fmtTime(end)}`;
  }

  // Polling stops 30 min before the slot; the entry stays ACTIVE until the
  // window end passes. Label that in-between state honestly.
  function closingSoon(entry) {
    return (
      entry.status === 'ACTIVE' &&
      entry.group?.poll_cutoff_at &&
      now > new Date(entry.group.poll_cutoff_at)
    );
  }

  async function refresh() {
    loading = true;
    loadError = '';
    try {
      entries = await listWatchlists(token);
    } catch (err) {
      loadError = err.message;
    } finally {
      loading = false;
    }
  }

  async function cancel(entry) {
    if (cancelling) return;
    cancelling = entry.id;
    try {
      await cancelWatchlist(entry.id, token);
      await refresh();
    } catch (err) {
      loadError = err.message;
    } finally {
      cancelling = null;
    }
  }

  onMount(() => {
    token = getOrCreateToken(localStorage);
    refresh();
    const id = setInterval(() => (now = new Date()), 60_000);
    return () => clearInterval(id);
  });
</script>

<svelte:head>
  <title>Your watchlist · SnellView</title>
</svelte:head>

<div class="subpage">
  <header class="subpage-head">
    <a class="subpage-back" href="/">← Rooms</a>
    <h1>Your watchlist</h1>
    <p class="subpage-sub">
      We check LibCal for each window below and email you the moment a matching room opens —
      watching stops 30 minutes before the slot starts.
    </p>
  </header>

  {#if loading}
    <p class="status">Loading your watchlist…</p>
  {:else if loadError}
    <p class="status error">{loadError}</p>
  {:else if entries.length === 0}
    <p class="status" data-testid="watchlist-empty">
      Nothing here yet. Search for a room on the
      <a href="/">main page</a> — when a window is fully booked you can watch it from there.
    </p>
  {:else}
    {#each SECTIONS as section (section.status)}
      {#if byStatus[section.status].length > 0}
        <section class="wl-section">
          <h2>{section.title}</h2>
          <ul class="wl-list">
            {#each byStatus[section.status] as entry (entry.id)}
              <li class="wl-row" data-testid="watchlist-row">
                <div class="wl-row-main">
                  <span class="wl-date">{entry.group?.date}</span>
                  <span class="wl-window">{windowText(entry.group)}</span>
                  {#if entry.group?.style}<span class="wl-chip">{entry.group.style}</span>{/if}
                  {#if entry.group?.capacity}<span class="wl-chip">{entry.group.capacity} people</span>{/if}
                  {#if closingSoon(entry)}<span class="wl-chip wl-chip-warn">closing soon</span>{/if}
                </div>
                <div class="wl-row-side">
                  {#if entry.status === 'FOUND' && entry.notified_at}
                    <span class="wl-meta">emailed {fmtTime(entry.notified_at.replace('T', ' ').slice(0, 19))}</span>
                  {/if}
                  {#if entry.status === 'ACTIVE'}
                    <button
                      class="wl-cancel"
                      onclick={() => cancel(entry)}
                      disabled={cancelling === entry.id}
                    >
                      {cancelling === entry.id ? 'Cancelling…' : 'Cancel'}
                    </button>
                  {/if}
                </div>
              </li>
            {/each}
          </ul>
        </section>
      {/if}
    {/each}
  {/if}
</div>
