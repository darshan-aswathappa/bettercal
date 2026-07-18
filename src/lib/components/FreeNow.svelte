<script>
  import { fmtTime, fmtDuration, parseTs, buildBookUrl } from '$lib/format.js';

  let { rooms = [], now = new Date(), isToday = false, date } = $props();

  // Rooms with a free range covering "now", longest-remaining first.
  const freeNow = $derived(
    isToday
      ? rooms
          .map((room) => {
            const range = room.ranges.find(
              (r) => parseTs(r.start) <= now && now < parseTs(r.end)
            );
            return range ? { room, range } : null;
          })
          .filter(Boolean)
          .sort((a, b) => parseTs(b.range.end) - parseTs(a.range.end))
      : []
  );
</script>

<section hidden={!isToday} data-testid="free-now">
  <div class="section-head">
    <h2>Free right now</h2>
    <span class="count">{freeNow.length}</span>
  </div>

  <div class="now-grid">
    {#if freeNow.length === 0}
      <p class="status">Nothing free at this moment — check the slots below.</p>
    {:else}
      {#each freeNow as { room, range } (room.eid ?? room.name)}
        {#if room.bookUrl != null}
          <a
            class="now-card"
            href={buildBookUrl(room.bookUrl, date)}
            target="_blank"
            rel="noopener"
            style="text-decoration: none; color: inherit;"
          >
            <div class="room-name">{room.name}</div>
            <div class="free-for">Free for {fmtDuration(parseTs(range.end) - now)}</div>
            <div class="until">Until {fmtTime(range.end)} · seats {room.capacity ?? '—'}</div>
          </a>
        {:else}
          <div class="now-card">
            <div class="room-name">{room.name}</div>
            <div class="free-for">Free for {fmtDuration(parseTs(range.end) - now)}</div>
            <div class="until">Until {fmtTime(range.end)}</div>
          </div>
        {/if}
      {/each}
    {/if}
  </div>
</section>
