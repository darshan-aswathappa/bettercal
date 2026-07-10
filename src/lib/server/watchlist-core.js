// Re-export shim: the canonical implementation lives in
// supabase/functions/_shared/watchlist-core.js so the watchlist worker edge
// function shares the exact same hashing/matching/backoff code (the Supabase
// bundler can't import from src/, but Vite imports from outside it fine).
export * from '../../../supabase/functions/_shared/watchlist-core.js';
