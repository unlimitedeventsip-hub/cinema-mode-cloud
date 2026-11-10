-- Cinema Mode: private projector pairing. Already applied to Supabase project "screen".
-- Only a trusted Cloudflare Worker with a server-side Supabase secret key
-- may create, pair, poll, write state and revoke device credentials.
create table if not exists public.cinema_devices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  token_sha256 text not null unique check (length(token_sha256)=64),
  pairing_sha256 text unique check (pairing_sha256 is null or length(pairing_sha256)=64),
  pairing_expires_at timestamptz,
  status text not null default 'pending' check (status in ('pending','paired','revoked')),
  device_name text not null default 'Proiector Cinema' check (char_length(device_name) between 1 and 80),
  last_command_id bigint not null default 0,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  paired_at timestamptz,
  constraint cinema_device_paired_owner check (status <> 'paired' or owner_id is not null)
);
create index if not exists cinema_devices_owner_idx on public.cinema_devices(owner_id,status);
create index if not exists cinema_devices_pairing_expiry_idx on public.cinema_devices(pairing_expires_at) where status='pending';
alter table public.cinema_devices enable row level security;
revoke all on public.cinema_devices from anon, authenticated;
-- No RLS policies: regular clients cannot access the table.
-- Never expose the Supabase secret or service_role key to frontend / projector.
