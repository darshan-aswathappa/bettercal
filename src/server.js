import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchRooms, fetchGrid } from './libcal.js';
import { freeRangesByRoom, rangesForDate } from './slots.js';

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

const ROOMS_TTL_MS = 60 * 60 * 1000; // room metadata changes rarely
const GRID_TTL_MS = 30 * 1000; // availability changes constantly

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const cache = new Map();

async function cached(key, ttlMs, loader) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = await loader();
  cache.set(key, { at: Date.now(), value });
  return value;
}

function json(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function nextDay(date) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function handleAvailability(res, url) {
  const date = url.searchParams.get('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return json(res, 400, { ok: false, error: 'date must be YYYY-MM-DD' });
  }

  const [rooms, slots] = await Promise.all([
    cached('rooms', ROOMS_TTL_MS, fetchRooms),
    cached(`grid:${date}`, GRID_TTL_MS, () => fetchGrid(date, nextDay(date))),
  ]);

  const ranges = freeRangesByRoom(slots);
  const payload = rooms.map((room) => ({
    ...room,
    ranges: rangesForDate(ranges.get(room.eid) ?? [], date),
  }));

  json(res, 200, { ok: true, date, generatedAt: new Date().toISOString(), rooms: payload });
}

async function serveStatic(res, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : urlPath.slice(1);
  const filePath = path.join(PUBLIC_DIR, path.normalize(rel));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  try {
    const body = await readFile(filePath);
    res.writeHead(200, {
      'content-type': MIME[path.extname(filePath)] ?? 'application/octet-stream',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === '/api/availability') {
      await handleAvailability(res, url);
    } else {
      await serveStatic(res, url.pathname);
    }
  } catch (err) {
    console.error(`[bettercal] ${req.method} ${url.pathname} failed:`, err);
    json(res, 502, { ok: false, error: 'Could not reach LibCal. Try again shortly.' });
  }
});

server.listen(PORT, () => {
  console.log(`bettercal running at http://localhost:${PORT}`);
});
