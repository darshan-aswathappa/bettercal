// LibCal upstream client: fetches room metadata and the availability grid
// from northeastern.libcal.com. All requests are unauthenticated.

const BASE = 'https://northeastern.libcal.com';
const LID = 7009; // Snell Library Study Space
const SPACES_PAGE = `${BASE}/reserve/spaces/studyspace`;

const COMMON_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
  cookie: 'springy_cookie_consent=ok',
};

function decodeJsString(raw) {
  // Titles are embedded with \uXXXX escapes; JSON.parse resolves them.
  try {
    return JSON.parse(`"${raw}"`);
  } catch {
    return raw;
  }
}

/**
 * Parse the `resources.push({...})` blocks embedded in the reserve page HTML
 * into a list of room objects.
 */
export function parseRooms(html) {
  const rooms = [];
  const blockRe = /resources\.push\(\{([\s\S]*?)\}\);/g;
  let match;
  while ((match = blockRe.exec(html)) !== null) {
    const block = match[1];
    const eid = block.match(/eid:\s*(\d+)/);
    const gid = block.match(/gid:\s*(\d+)/);
    const lid = block.match(/lid:\s*(\d+)/);
    const capacity = block.match(/capacity:\s*(\d+)/);
    const title = block.match(/title:\s*"((?:\\.|[^"\\])*)"/);
    const grouping = block.match(/grouping:\s*"((?:\\.|[^"\\])*)"/);
    const url = block.match(/url:\s*"((?:\\.|[^"\\])*)"/);
    if (!eid || !title) continue;
    if (lid && Number(lid[1]) !== LID) continue;

    const fullTitle = decodeJsString(title[1]);
    rooms.push({
      eid: Number(eid[1]),
      gid: gid ? Number(gid[1]) : 0,
      // "Group Study 130S (Capacity 6)" -> "Group Study 130S"
      name: fullTitle.replace(/\s*\(Capacity \d+\)\s*$/i, ''),
      grouping: grouping ? decodeJsString(grouping[1]) : '',
      capacity: capacity ? Number(capacity[1]) : null,
      bookUrl: url ? `${BASE}${decodeJsString(url[1])}` : SPACES_PAGE,
    });
  }
  return rooms;
}

export async function fetchRooms() {
  const res = await fetch(SPACES_PAGE, { headers: COMMON_HEADERS });
  if (!res.ok) {
    throw new Error(`LibCal spaces page returned ${res.status}`);
  }
  const html = await res.text();
  const rooms = parseRooms(html);
  if (rooms.length === 0) {
    throw new Error('No rooms parsed from LibCal page (markup may have changed)');
  }
  return rooms;
}

/**
 * Fetch the raw availability grid for [start, end) dates (YYYY-MM-DD).
 * Returns the array of slot objects from LibCal.
 */
export async function fetchGrid(start, end) {
  const body = new URLSearchParams({
    lid: String(LID),
    gid: '0',
    eid: '-1',
    seat: '0',
    seatId: '0',
    zone: '0',
    start,
    end,
    pageIndex: '0',
    pageSize: '200',
  });

  const res = await fetch(`${BASE}/spaces/availability/grid`, {
    method: 'POST',
    headers: {
      ...COMMON_HEADERS,
      accept: 'application/json, text/javascript, */*; q=0.01',
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      origin: BASE,
      referer: SPACES_PAGE,
      'x-requested-with': 'XMLHttpRequest',
    },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`LibCal grid returned ${res.status}`);
  }
  const data = await res.json();
  if (!data || !Array.isArray(data.slots)) {
    throw new Error('Unexpected LibCal grid response shape');
  }
  return data.slots;
}
