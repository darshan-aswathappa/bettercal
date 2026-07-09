// bettercal frontend: fetch availability once, filter and render client-side.

const els = {
  date: document.getElementById('filter-date'),
  from: document.getElementById('filter-from'),
  to: document.getElementById('filter-to'),
  clearTime: document.getElementById('filter-clear-time'),
  style: document.getElementById('filter-style'),
  capacity: document.getElementById('filter-capacity'),
  freeNowSection: document.getElementById('free-now-section'),
  freeNowCount: document.getElementById('free-now-count'),
  freeNowGrid: document.getElementById('free-now-grid'),
  allHeading: document.getElementById('all-heading'),
  updatedAt: document.getElementById('updated-at'),
  status: document.getElementById('status'),
  roomList: document.getElementById('room-list'),
};

const CAPACITY_BANDS = {
  '1-4': [1, 4],
  '5-8': [5, 8],
};

let currentData = null;

function todayStr() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// LibCal timestamps are "YYYY-MM-DD HH:mm:ss" in Boston local time;
// we treat them as browser-local, which is right for people on campus.
function parseTs(ts) {
  return new Date(ts.replace(' ', 'T'));
}

function fmtTime(ts) {
  return parseTs(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function fmtDuration(ms) {
  const mins = Math.round(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}

function applyFilters(rooms) {
  const style = els.style.value;
  const band = CAPACITY_BANDS[els.capacity.value];
  return rooms.filter((room) => {
    if (style && room.grouping !== style) return false;
    if (band && (room.capacity == null || room.capacity < band[0] || room.capacity > band[1])) {
      return false;
    }
    return true;
  });
}

// Read the From/To time filter. Returns null when no time window is set.
// `from`/`to` are LibCal-style "YYYY-MM-DD HH:mm:ss" strings on the chosen date.
function getWindow() {
  if (!els.from.value) return null;
  const date = els.date.value;
  const from = `${date} ${els.from.value}:00`;
  const to = els.to.value ? `${date} ${els.to.value}:00` : null;
  const invalid = to != null && to <= from;
  return { from, to, invalid };
}

// Mirror of rangeCoversWindow() in src/slots.js (kept identical); the browser
// can't import the server module directly. Covered by tests there.
function rangeCoversWindow(range, from, to) {
  if (to) return range.start <= from && range.end >= to;
  return range.start <= from && range.end > from;
}

function windowLabel(win) {
  const fromLabel = fmtTime(win.from);
  return win.to ? `${fromLabel} – ${fmtTime(win.to)}` : `from ${fromLabel}`;
}

// LibCal's space page defaults to today unless given ?date=. Pass either a
// plain date (YYYY-MM-DD) or a full "YYYY-MM-DD HH:mm:ss" to pre-position it.
function buildBookUrl(baseUrl, dateOrTs) {
  if (!dateOrTs) return baseUrl;
  return `${baseUrl}?date=${encodeURIComponent(dateOrTs)}`;
}

function renderFreeNow(rooms) {
  const isToday = els.date.value === todayStr();
  const now = new Date();

  const freeNow = isToday
    ? rooms
        .map((room) => {
          const range = room.ranges.find(
            (r) => parseTs(r.start) <= now && now < parseTs(r.end)
          );
          return range ? { room, range } : null;
        })
        .filter(Boolean)
        .sort((a, b) => parseTs(b.range.end) - parseTs(a.range.end))
    : [];

  els.freeNowSection.hidden = !isToday;
  if (!isToday) return;

  els.freeNowCount.textContent = String(freeNow.length);
  els.freeNowGrid.replaceChildren();

  if (freeNow.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'status';
    empty.textContent = 'Nothing free at this moment — check the slots below.';
    els.freeNowGrid.appendChild(empty);
    return;
  }

  for (const { room, range } of freeNow) {
    const card = document.createElement('a');
    card.className = 'now-card';
    card.href = buildBookUrl(room.bookUrl, els.date.value);
    card.target = '_blank';
    card.rel = 'noopener';
    card.style.textDecoration = 'none';
    card.style.color = 'inherit';

    const name = document.createElement('div');
    name.className = 'room-name';
    name.textContent = room.name;

    const freeFor = document.createElement('div');
    freeFor.className = 'free-for';
    freeFor.textContent = `Free for ${fmtDuration(parseTs(range.end) - now)}`;

    const until = document.createElement('div');
    until.className = 'until';
    until.textContent = `Until ${fmtTime(range.end)} · seats ${room.capacity ?? '—'}`;

    card.append(name, freeFor, until);
    els.freeNowGrid.appendChild(card);
  }
}

function renderRooms(rooms, { windowActive, win } = {}) {
  els.roomList.replaceChildren();
  const withSlots = rooms.filter((r) => r.ranges.length > 0);

  if (withSlots.length === 0) {
    els.status.textContent = windowActive
      ? 'No rooms are free for that whole time window. Try a shorter window or a different time.'
      : 'No free slots match these filters for this date.';
    els.status.classList.remove('error');
    els.status.hidden = false;
    return;
  }
  els.status.hidden = true;

  for (const room of withSlots) {
    const row = document.createElement('div');
    row.className = 'room-row';

    const info = document.createElement('div');
    info.className = 'room-info';
    const name = document.createElement('div');
    name.className = 'room-name';
    name.textContent = room.name;
    const sub = document.createElement('div');
    sub.className = 'room-sub';
    sub.textContent = `${room.grouping} · seats ${room.capacity ?? '—'}`;
    info.append(name, sub);

    const ranges = document.createElement('div');
    ranges.className = 'ranges';
    if (windowActive && win) {
      // Lead with the window the user asked for (that's what's guaranteed
      // free); show the full free block behind it as context.
      const pill = document.createElement('span');
      pill.className = 'range-pill range-pill--match';
      pill.textContent = win.to
        ? `✓ ${fmtTime(win.from)} – ${fmtTime(win.to)}`
        : `✓ free from ${fmtTime(win.from)}`;
      ranges.appendChild(pill);

      const cover = room.ranges[0];
      const ctx = document.createElement('span');
      ctx.className = 'range-context';
      ctx.textContent = `open ${fmtTime(cover.start)} – ${fmtTime(cover.end)}`;
      ranges.appendChild(ctx);
    } else {
      for (const r of room.ranges) {
        const pill = document.createElement('span');
        pill.className = 'range-pill';
        pill.textContent = `${fmtTime(r.start)} – ${fmtTime(r.end)}`;
        pill.title = `Free for ${fmtDuration(parseTs(r.end) - parseTs(r.start))}`;
        ranges.appendChild(pill);
      }
    }

    const book = document.createElement('a');
    book.className = 'book-link';
    // Open LibCal on the day being viewed; when the user picked a time window,
    // drop them at that start time too.
    book.href = buildBookUrl(room.bookUrl, windowActive && win ? win.from : els.date.value);
    book.target = '_blank';
    book.rel = 'noopener';
    book.textContent = 'Book →';

    row.append(info, ranges, book);
    els.roomList.appendChild(row);
  }
}

function render() {
  if (!currentData) return;
  const filtered = applyFilters(currentData.rooms);
  const win = getWindow();
  const windowActive = win != null;

  els.clearTime.hidden = !windowActive;
  const dateLabel =
    els.date.value === todayStr() ? 'today' : `on ${els.date.value}`;

  // A time window makes "free right now" irrelevant — hide it.
  if (windowActive) {
    els.freeNowSection.hidden = true;
  } else {
    renderFreeNow(filtered);
  }

  if (win?.invalid) {
    els.roomList.replaceChildren();
    els.status.hidden = false;
    els.status.classList.add('error');
    els.status.textContent = 'End time must be after start time.';
    els.allHeading.textContent = 'Free slots';
    return;
  }
  els.status.classList.remove('error');

  if (windowActive) {
    const matches = filtered
      .map((room) => ({
        ...room,
        ranges: room.ranges.filter((r) => rangeCoversWindow(r, win.from, win.to)),
      }))
      .filter((room) => room.ranges.length > 0);
    renderRooms(matches, { windowActive: true, win });
    els.allHeading.textContent = `Rooms free ${windowLabel(win)} ${dateLabel}`;
  } else {
    renderRooms(filtered);
    els.allHeading.textContent =
      els.date.value === todayStr() ? 'Free slots today' : `Free slots on ${els.date.value}`;
  }
}

async function load() {
  els.status.hidden = false;
  els.status.classList.remove('error');
  els.status.textContent = 'Loading availability…';
  els.roomList.replaceChildren();

  try {
    const res = await fetch(`/api/availability?date=${encodeURIComponent(els.date.value)}`);
    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    currentData = data;
    els.updatedAt.textContent = `updated ${new Date(data.generatedAt).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    })}`;
    render();
  } catch (err) {
    els.status.hidden = false;
    els.status.classList.add('error');
    els.status.textContent = `Could not load availability: ${err.message}`;
  }
}

function init() {
  els.date.value = todayStr();
  els.date.min = todayStr();
  els.date.addEventListener('change', () => {
    if (!els.date.value) els.date.value = todayStr();
    load();
  });
  els.style.addEventListener('change', render);
  els.capacity.addEventListener('change', render);
  // Time window filters run against already-loaded data — no refetch needed.
  els.from.addEventListener('input', render);
  els.to.addEventListener('input', render);
  els.clearTime.addEventListener('click', () => {
    els.from.value = '';
    els.to.value = '';
    render();
  });

  load();
  // Keep "free now" honest without hammering the server.
  setInterval(load, 60_000);
}

init();
