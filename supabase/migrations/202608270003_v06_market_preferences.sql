-- AVIATION PASSPORT V0.6 — Market Preferences
-- Run once after V0.5.

-- Extend mobility preferences without changing the existing meaning of
-- willing_to_relocate / willing_fifo / willing_international.
alter table public.worker_market_preferences
  add column if not exists willing_dido boolean not null default false,
  add column if not exists willing_commute boolean not null default false,
  add column if not exists willing_temporary_assignment boolean not null default false;

-- Preferred work environments are structured separately from employment
-- experience. Selecting an environment here is a preference, not a claim.
create table if not exists public.worker_environment_preferences (
  worker_id uuid not null references public.worker_profiles(id) on delete cascade,
  environment_id smallint not null references public.environments(id),
  created_at timestamptz not null default now(),
  primary key (worker_id, environment_id)
);

alter table public.worker_environment_preferences enable row level security;

drop policy if exists "worker manages own environment preferences"
  on public.worker_environment_preferences;
create policy "worker manages own environment preferences"
  on public.worker_environment_preferences for all to authenticated
  using (worker_id = auth.uid())
  with check (worker_id = auth.uid());

create index if not exists worker_location_preferences_worker_idx
  on public.worker_location_preferences(worker_id);
