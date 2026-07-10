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

  let copiedId = $state(null);
  let timer;

  function shareRoom(room) {
    const id = room.eid ?? room.name;
    const url = buildBookUrl(room.bookUrl, date);
    navigator.clipboard.writeText(url).then(() => {
      copiedId = id;
      clearTimeout(timer);
      timer = setTimeout(() => (copiedId = null), 2000);
    }).catch(() => {});
  }
</script>

{#if rooms.length === 0}
  <p class="status" class:error data-testid="status">{emptyMessage}</p>
{:else}
  <div class="room-list">
    {#each rooms as room (room.eid ?? room.name)}
      {@const rowId = room.eid ?? room.name}
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

        <div class="room-actions">
          <div class="action-buttons">
            <a
              class="book-link"
              href={buildBookUrl(room.bookUrl, windowActive && win ? win.from : date)}
              target="_blank"
              rel="noopener">Book →</a
            >
            <button
              type="button"
              class="share-btn"
              class:share-btn--copied={copiedId === rowId}
              aria-label="Copy link to {room.name}"
              onclick={() => shareRoom(room)}
            >
              {#if copiedId === rowId}
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Copied!
              {:else}
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                </svg>
                Share
              {/if}
            </button>
          </div>
          {#if windowActive}
            <span
              class="book-hint"
              data-testid="book-hint"
              style:visibility={bookingHint(win) ? 'visible' : 'hidden'}
            >{bookingHint(win) || ' '}</span>
          {/if}
        </div>
      </div>
    {/each}
  </div>
{/if}
