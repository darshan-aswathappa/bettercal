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
    tab = 'library',
    buildings = [],
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
  <span class="eyebrow">Northeastern University · {tab === 'classrooms' ? 'Campus-wide' : 'Snell Library'}</span>
  <span class="eyebrow eyebrow-accent">{tab === 'classrooms' ? 'Classrooms' : 'Study Rooms'}</span>
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

    <details class="filters-more" open>
      <summary class="filters-more-toggle">
        More filters
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </summary>
      <div class="filters-more-content">
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
          class:clear-time--hidden={!showClearTime}
          data-testid="clear-time"
          aria-hidden={!showClearTime}
          tabindex={showClearTime ? 0 : -1}
          onclick={() => onClearTime()}>Clear time</button
        >

        {#if tab === 'classrooms'}
          <label>
            <span>Building</span>
            <select value={style} onchange={(e) => onStyle(e.currentTarget.value)}>
              <option value="">All buildings</option>
              {#each buildings as b (b)}
                <option value={b}>{b}</option>
              {/each}
            </select>
          </label>
        {:else}
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
              <option value="1-4">1-4 people</option>
              <option value="5-8">5-8 people</option>
            </select>
          </label>
        {/if}
        <label>
          <span>Sort by</span>
          <select value={sort} onchange={(e) => onSort(e.currentTarget.value)}>
            {#each SORT_OPTIONS as opt (opt.value)}
              <option value={opt.value}>{opt.label}</option>
            {/each}
          </select>
        </label>
      </div>
    </details>
  </div>
</header>
