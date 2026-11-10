-- CINEMA MODE CLOUD. Ruleaza in Supabase -> SQL Editor.
-- Filmele sunt stocate in Cloudflare R2, NU ca binare in PostgreSQL.

create table if not exists public.cinema_films (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title text not null check (char_length(title) between 1 and 160),
  year int check (year is null or year between 1888 and 2100),
  r2_key text not null unique,
  mime_type text not null default 'video/mp4',
  file_size bigint not null default 0,
  duration_s double precision not null default 0,
  poster_url text,
  subtitles jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.cinema_commands (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  film_id uuid references public.cinema_films(id) on delete set null,
  action text not null check (action in ('load','play','pause','toggle','stop','seek','skip')),
  value double precision,
  created_at timestamptz not null default now()
);
create index if not exists idx_cinema_commands_owner_id on public.cinema_commands(owner_id,id);

create table if not exists public.cinema_state (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  film_id uuid references public.cinema_films(id) on delete set null,
  position_s double precision not null default 0,
  duration_s double precision not null default 0,
  playing boolean not null default false,
  volume double precision not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.cinema_films enable row level security;
alter table public.cinema_commands enable row level security;
alter table public.cinema_state enable row level security;

-- Fiecare cont vede si poate modifica DOAR propriile filme si comenzi.
drop policy if exists "cinema_films_own" on public.cinema_films;
create policy "cinema_films_own" on public.cinema_films for all to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);
drop policy if exists "commands_own" on public.cinema_commands;
create policy "commands_own" on public.cinema_commands for all to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);
drop policy if exists "state_own" on public.cinema_state;
create policy "state_own" on public.cinema_state for all to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

grant usage on schema public to authenticated;
grant select,insert,update,delete on public.cinema_films,public.cinema_commands,public.cinema_state to authenticated;
grant usage,select on sequence public.cinema_commands_id_seq to authenticated;

-- Activateaza sincronizarea live a telecomenzii.
do $$
begin
 if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='cinema_commands') then
   alter publication supabase_realtime add table public.cinema_commands;
 end if;
 if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='cinema_state') then
   alter publication supabase_realtime add table public.cinema_state;
 end if;
end $$;
