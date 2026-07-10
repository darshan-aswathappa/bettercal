<script>
  import { SORT_OPTIONS } from '$lib/sort.js';
  import { STYLES } from '$lib/filters.js';
  import DateStrip from './DateStrip.svelte';

  const PRESETS = [
    { minutes: 30, label: '30m' },
    { minutes: 60, label: '1h' },
    { minutes: 120, label: '2h' },
    { minutes: 180, label: '3h' },
  ];

  let {
    date,
    from,
    to,
    style,
    capacity,
    sort,
    minDate,
    activeMinutes = null,
    showClearTime = false,
    onDate,
    onFrom,
    onTo,
    onStyle,
    onCapacity,
    onSort,
    onPreset,
    onClearTime,
  } = $props();
</script>

<div class="utility-strip">
  <span class="eyebrow">Northeastern University · Snell Library</span>
  <span class="eyebrow eyebrow-accent">Study Rooms</span>
</div>

<header class="topbar">
  <div class="brand">
    <div class="brand-lockup">
      <svg
        class="brand-logo"
        width="28"
        height="28"
        viewBox="0 0 28 28"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <rect x="0" y="0" width="12" height="12" fill="#D41B2C" />
        <rect x="16" y="0" width="12" height="12" stroke="#D41B2C" stroke-width="1.5" />
        <rect x="0" y="16" width="12" height="12" stroke="#D41B2C" stroke-width="1.5" />
        <rect x="16" y="16" width="12" height="12" fill="#D41B2C" />
      </svg>
      <h1>SnellView</h1>
    </div>
    <p class="tagline">Free study room slots, at a glance</p>
  </div>

  <div class="filters">
    <DateStrip startDate={minDate} selected={date} onSelect={onDate} />
    <label>
      <span>Date</span>
      <input type="date" min={minDate} value={date} onchange={(e) => onDate(e.currentTarget.value)} />
    </label>
    <label>
      <span>From</span>
      <input type="time" step="900" value={from} oninput={(e) => onFrom(e.currentTarget.value)} />
    </label>
    <label>
      <span>To</span>
      <input type="time" step="900" value={to} oninput={(e) => onTo(e.currentTarget.value)} />
    </label>

    <div class="presets" role="group" aria-label="Quick duration presets">
      <span>Need it for</span>
      <div class="preset-buttons">
        {#each PRESETS as p (p.minutes)}
          <button
            type="button"
            class="preset"
            class:active={p.minutes === activeMinutes}
            data-minutes={p.minutes}
            onclick={() => onPreset(p.minutes)}>{p.label}</button
          >
        {/each}
      </div>
    </div>

    <button
      type="button"
      class="clear-time"
      data-testid="clear-time"
      hidden={!showClearTime}
      onclick={() => onClearTime()}>Clear time</button
    >

    <label>
      <span>Seat style</span>
      <select value={style} onchange={(e) => onStyle(e.currentTarget.value)}>
        <option value="">All styles</option>
        {#each STYLES as s (s)}
          <option value={s}>{s}</option>
        {/each}
      </select>
    </label>
    <label>
      <span>Capacity</span>
      <select value={capacity} onchange={(e) => onCapacity(e.currentTarget.value)}>
        <option value="">Any size</option>
        <option value="1-4">1–4 people</option>
        <option value="5-8">5–8 people</option>
      </select>
    </label>
    <label>
      <span>Sort by</span>
      <select value={sort} onchange={(e) => onSort(e.currentTarget.value)}>
        {#each SORT_OPTIONS as opt (opt.value)}
          <option value={opt.value}>{opt.label}</option>
        {/each}
      </select>
    </label>
  </div>
</header>
