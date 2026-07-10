<script>
  import { buildDateStrip } from '$lib/dateStrip.js';

  let {
    startDate,
    selected,
    days = 7,
    onSelect,
  } = $props();

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const strip = $derived(buildDateStrip(startDate, days));

  // "Fri Jul 10" — a full, screen-reader-friendly label for each chip.
  function label(d) {
    const month = MONTHS[Number(d.date.slice(5, 7)) - 1];
    return `${d.weekday} ${month} ${d.day}`;
  }
</script>

<div class="date-strip" role="group" aria-label="Jump to a day">
  {#each strip as d (d.date)}
    <button
      type="button"
      class="date-chip"
      class:selected={d.date === selected}
      class:is-today={d.isToday}
      aria-pressed={d.date === selected}
      aria-label={label(d)}
      onclick={() => onSelect?.(d.date)}
    >
      <span class="date-chip__weekday">{d.isToday ? 'Today' : d.weekday}</span>
      <span class="date-chip__day">{d.day}</span>
    </button>
  {/each}
</div>
