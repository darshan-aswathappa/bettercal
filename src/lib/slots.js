// Re-export shim: the canonical implementation lives in
// supabase/functions/_shared/slots.js so the watchlist worker edge function
// can share it (the Supabase bundler can't import from src/, but Vite happily
// imports from outside it). Keep importing from '$lib/slots.js' everywhere in
// app code — only the file behind this path moved.
export * from '../../supabase/functions/_shared/slots.js';
