-- Demo state for the Mosh support concierge (one JSON document, versioned for safe concurrent saves).
-- Run once in the Supabase SQL editor.
create table if not exists public.demo_state (
  id text primary key,
  version integer not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Lock the table down: RLS on with no policies means the public "anon" key can't read or write it.
-- The server uses the service-role key, which bypasses RLS and never reaches the browser.
alter table public.demo_state enable row level security;
