<script>
  import { fmtTime, fmtDuration, parseTs, buildBookUrl, bookingHint } from '$lib/format.js';

  let {
    rooms = [],
    windowActive = false,
    win = null,
    date,
    emptyMessage = '',
    error = false,
  } = $props();
</script>

{#if rooms.length === 0}
  <p class="status" class:error data-testid="status">{emptyMessage}</p>
{:else}
  <div class="room-list">
    {#each rooms as room (room.eid ?? room.name)}
      <div class="room-row">
        <div class="room-info">
          <div class="room-name">{room.name}</div>
          <div class="room-sub">{room.grouping} · seats {room.capacity ?? '—'}</div>
        </div>

        <div class="ranges">
          {#if windowActive && win}
            <span class="range-pill range-pill--match">
              {win.to
                ? `✓ ${fmtTime(win.from)} – ${fmtTime(win.to)}`
                : `✓ free from ${fmtTime(win.from)}`}
            </span>
            {#if room.ranges[0]}
              <span class="range-context">
                open {fmtTime(room.ranges[0].start)} – {fmtTime(room.ranges[0].end)}
              </span>
            {/if}
          {:else}
            {#each room.ranges as r (r.start)}
              <a
                class="range-pill"
                href={buildBookUrl(room.bookUrl, r.start)}
                target="_blank"
                rel="noopener"
                title={`Free for ${fmtDuration(parseTs(r.end) - parseTs(r.start))} — book from ${fmtTime(r.start)}`}
              >
                {fmtTime(r.start)} – {fmtTime(r.end)}
              </a>
            {/each}
          {/if}
        </div>

        <div class="book-col">
          <a
            class="book-link"
            href={buildBookUrl(room.bookUrl, windowActive && win ? win.from : date)}
            target="_blank"
            rel="noopener">Book →</a
          >
          {#if windowActive}
            <span
              class="book-hint"
              data-testid="book-hint"
              style:visibility={bookingHint(win) ? 'visible' : 'hidden'}
            >{bookingHint(win) || ' '}</span>
          {/if}
        </div>
      </div>
    {/each}
  </div>
{/if}
