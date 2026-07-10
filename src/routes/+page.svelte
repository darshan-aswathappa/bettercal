<script>
  import { onMount, untrack } from 'svelte';
  import { browser } from '$app/environment';
  import Filters from '$lib/components/Filters.svelte';
  import FreeNow from '$lib/components/FreeNow.svelte';
  import RoomList from '$lib/components/RoomList.svelte';
  import { todayStr, windowLabel } from '$lib/format.js';
  import { rangeCoversWindow } from '$lib/slots.js';
  import {
    applyFilters,
    getWindow,
    windowErrorMessage,
    readFilterParams,
    buildFilterQuery,
  } from '$lib/filters.js';
  import { sortRooms, DEFAULT_SORT } from '$lib/sort.js';
  import { computePreset, activeMinutesFor } from '$lib/presets.js';
  import { loadFavorites, saveFavorites, toggleFavorite, pinFavoritesFirst } from '$lib/favorites.js';

  let { data } = $props();

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  let date = $state(untrack(() => data.date));
  let from = $state('');
  let to = $state('');
  let style = $state('');
  let capacity = $state('');
  let sort = $state(DEFAULT_SORT);
  let availability = $state(untrack(() => data.initial));
  let loadError = $state(untrack(() => data.error));
  let loading = $state(false);
  let now = $state(new Date());
  let favorites = $state([]);

  const rooms = $derived(availability?.rooms ?? []);
  const filtered = $derived(applyFilters(rooms, { style, capacity }));
  const win = $derived(getWindow({ date, from, to }));
  const windowActive = $derived(win != null);
  const invalidWindow = $derived(windowActive && win.invalid);
  const activeMinutes = $derived(activeMinutesFor(from, to));

  // Recompute "today" whenever the clock ticks so a session left open overnight
  // eventually rolls over.
  const isToday = $derived.by(() => {
    void now;
    return date === todayStr();
  });
  const dateLabel = $derived(isToday ? 'today' : `on ${date}`);

  const windowMatches = $derived.by(() => {
    if (!windowActive || win.invalid) return [];
    return filtered
      .map((room) => ({
        ...room,
        ranges: room.ranges.filter((r) => rangeCoversWindow(r, win.from, win.to)),
      }))
      .filter((room) => room.ranges.length > 0);
  });

  const displayRooms = $derived(
    pinFavoritesFirst(
      sortRooms(
        invalidWindow ? [] : windowActive ? windowMatches : filtered.filter((r) => r.ranges.length > 0),
        sort
      ),
      favorites
    )
  );

  // Room count for the heading badge — only meaningful once availability has
  // loaded and the window (if any) is valid.
  const showCount = $derived(!!availability && !loadError && !invalidWindow);

  const emptyMessage = $derived(
    invalidWindow
      ? windowErrorMessage(win.reason)
      : windowActive
        ? 'No rooms are free for that whole time window. Try a shorter window or a different time.'
        : 'No free slots match these filters for this date.'
  );

  const heading = $derived(
    invalidWindow
      ? 'Free slots'
      : windowActive
        ? `Rooms free ${windowLabel(win)} ${dateLabel}`
        : isToday
          ? 'Free slots today'
          : `Free slots on ${date}`
  );

  const updatedLabel = $derived(
    availability
      ? `updated ${new Date(availability.generatedAt).toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit',
        })}`
      : ''
  );

  async function refetch() {
    loading = true;
    loadError = null;
    try {
      const res = await fetch(`/api/availability?date=${encodeURIComponent(date)}`);
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        throw new Error(payload.error || `Request failed (${res.status})`);
      }
      availability = payload;
    } catch (err) {
      loadError = `Could not load availability: ${err.message}`;
    } finally {
      loading = false;
    }
  }

  // Guards the URL-sync effect so it can't overwrite the incoming query string
  // before onMount has restored filter state from it (a shared link would
  // otherwise be wiped on load).
  let hydrated = false;

  // Keep the address bar shareable without adding history entries.
  $effect(() => {
    // Read deps unconditionally so the effect re-runs once onMount seeds state.
    const qs = buildFilterQuery({ date, from, to, style, capacity, sort }, todayStr());
    if (!browser || !hydrated) return;
    history.replaceState(history.state, '', qs ? `?${qs}` : location.pathname);
  });

  function onDate(value) {
    date = value || todayStr();
    refetch();
  }

  function onPreset(minutes) {
    const next = computePreset(minutes, from, new Date());
    from = next.from;
    to = next.to;
  }

  function onClearTime() {
    from = '';
    to = '';
  }

  function onToggleFavorite(room) {
    favorites = toggleFavorite(favorites, room);
  }

  // Persist favorites whenever they change — but only after onMount has restored
  // them, so the initial empty state can't clobber a returning user's storage.
  $effect(() => {
    const ids = favorites; // track
    if (!browser || !hydrated) return;
    saveFavorites(localStorage, ids);
  });

  onMount(() => {
    // Restore starred rooms from a previous visit.
    favorites = loadFavorites(localStorage);

    // Restore filter state from a shared/bookmarked link.
    const params = new URLSearchParams(location.search);
    const seeded = readFilterParams(params);
    from = seeded.from;
    to = seeded.to;
    style = seeded.style;
    capacity = seeded.capacity;
    sort = seeded.sort;

    // The SSR payload used the server's "today"; reconcile with the browser's.
    const urlDate = params.get('date');
    const resolved =
      urlDate && DATE_RE.test(urlDate) && urlDate >= todayStr() ? urlDate : todayStr();
    if (resolved !== date) {
      date = resolved;
      refetch();
    }

    // URL has now been read; allow the sync effect to write from here on.
    hydrated = true;

    const id = setInterval(() => {
      now = new Date();
      refetch();
    }, 60_000);
    return () => clearInterval(id);
  });
</script>

<Filters
  {date}
  {from}
  {to}
  {style}
  {capacity}
  {sort}
  minDate={todayStr()}
  {activeMinutes}
  showClearTime={windowActive}
  {onDate}
  onFrom={(v) => (from = v)}
  onTo={(v) => (to = v)}
  onStyle={(v) => (style = v)}
  onCapacity={(v) => (capacity = v)}
  onSort={(v) => (sort = v)}
  {onPreset}
  {onClearTime}
/>

<main>
  {#if !windowActive}
    <FreeNow rooms={filtered} {now} {isToday} {date} />
  {/if}

  <section>
    <div class="section-head">
      <h2>{heading}</h2>
      {#if showCount}
        <span class="count" data-testid="room-count">{displayRooms.length}</span>
      {/if}
      <span class="meta">{updatedLabel}</span>
    </div>

    {#if loadError}
      <p class="status error">{loadError}</p>
    {:else if loading && !availability}
      <p class="status">Loading availability…</p>
    {:else}
      <RoomList
        rooms={displayRooms}
        windowActive={windowActive && !invalidWindow}
        {win}
        {date}
        {emptyMessage}
        error={invalidWindow}
        {favorites}
        {onToggleFavorite}
      />
    {/if}
  </section>
</main>
