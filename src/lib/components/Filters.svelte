<script>
  const PRESETS = [
    { minutes: 30, label: '30m' },
    { minutes: 60, label: '1h' },
    { minutes: 120, label: '2h' },
    { minutes: 180, label: '3h' },
  ];

  const STYLES = [
    'Group Study Rooms',
    'Graduate Group Study Rooms',
    'Individual Study',
    'Individual Silent Study',
  ];

  let {
    date,
    from,
    to,
    style,
    capacity,
    minDate,
    activeMinutes = null,
    showClearTime = false,
    onDate,
    onFrom,
    onTo,
    onStyle,
    onCapacity,
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
    <h1>bettercal</h1>
    <p class="tagline">Free study room slots, at a glance</p>
  </div>

  <div class="filters">
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
  </div>
</header>
