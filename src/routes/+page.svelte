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
    readFilterParams,
    buildFilterQuery,
  } from '$lib/filters.js';
  import { computePreset, activeMinutesFor } from '$lib/presets.js';

  let { data } = $props();

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  let date = $state(untrack(() => data.date));
  let from = $state('');
  let to = $state('');
  let style = $state('');
  let capacity = $state('');
  let availability = $state(untrack(() => data.initial));
  let loadError = $state(untrack(() => data.error));
  let loading = $state(false);
  let now = $state(new Date());

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
    invalidWindow ? [] : windowActive ? windowMatches : filtered.filter((r) => r.ranges.length > 0)
  );

  const emptyMessage = $derived(
    invalidWindow
      ? 'End time must be after start time.'
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

  // Keep the address bar shareable without adding history entries.
  $effect(() => {
    if (!browser) return;
    const qs = buildFilterQuery({ date, from, to, style, capacity }, todayStr());
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

  onMount(() => {
    // Restore filter state from a shared/bookmarked link.
    const params = new URLSearchParams(location.search);
    const seeded = readFilterParams(params);
    from = seeded.from;
    to = seeded.to;
    style = seeded.style;
    capacity = seeded.capacity;

    // The SSR payload used the server's "today"; reconcile with the browser's.
    const urlDate = params.get('date');
    const resolved =
      urlDate && DATE_RE.test(urlDate) && urlDate >= todayStr() ? urlDate : todayStr();
    if (resolved !== date) {
      date = resolved;
      refetch();
    }

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
  minDate={todayStr()}
  {activeMinutes}
  showClearTime={windowActive}
  {onDate}
  onFrom={(v) => (from = v)}
  onTo={(v) => (to = v)}
  onStyle={(v) => (style = v)}
  onCapacity={(v) => (capacity = v)}
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
      />
    {/if}
  </section>
</main>
