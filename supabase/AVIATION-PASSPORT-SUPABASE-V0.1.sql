-- AVIATION PASSPORT V0.1 — RUN THIS ONCE IN SUPABASE SQL EDITOR
-- Part 1: schema / security

-- Aviation Passport V0.1
-- Initial Supabase/PostgreSQL schema
-- Purpose: Passport (supply) -> Open Demand (demand) -> Matching -> Opportunity -> My Value
--
-- Design principles:
-- 1. Workers own their Passport data.
-- 2. Employers do NOT receive direct general read access to worker records.
-- 3. Individual talent access will be exposed through a controlled matching RPC/server endpoint
--    that requires active Open Demand.
-- 4. Money is always stored in native currency + period + component type.
-- 5. Blue dot = supported aircraft experience record.
-- 6. Gold star = verified licence rating mapped to aircraft.
-- 7. Green shield = current company authorisation mapped to aircraft.
-- 8. Verification marks are derived from evidence/attestation, never user-clicked badges.

create extension if not exists pgcrypto;

-- =========================================================
-- ENUMS
-- =========================================================

create type public.profile_visibility as enum (
  'public',
  'aviation_network',
  'anonymous_market',
  'private'
);

create type public.nationality_visibility as enum (
  'visible',
  'employers_only',
  'hidden'
);

create type public.market_status as enum (
  'not_open',
  'selected_opportunities',
  'actively_looking',
  'contract_only'
);

create type public.verification_status as enum (
  'pending',
  'verified',
  'rejected',
  'expired'
);

create type public.work_right_status as enum (
  'citizen',
  'permanent_resident',
  'unrestricted',
  'temporary',
  'sponsorship_required'
);

create type public.employment_type as enum (
  'permanent',
  'fixed_term',
  'contractor',
  'casual',
  'part_time',
  'self_employed',
  'agency'
);

create type public.exposure_level as enum (
  'primary',
  'regular',
  'occasional',
  'limited'
);

create type public.requirement_level as enum (
  'mandatory',
  'trainable',
  'preferred',
  'not_relevant'
);

create type public.demand_status as enum (
  'draft',
  'open',
  'paused',
  'needs_confirmation',
  'filled',
  'cancelled'
);

create type public.demand_visibility as enum (
  'public',
  'limited',
  'confidential'
);

create type public.opportunity_status as enum (
  'sent',
  'viewed',
  'interested',
  'question',
  'declined',
  'interview',
  'offer',
  'accepted',
  'withdrawn',
  'closed'
);

create type public.money_period as enum (
  'hour',
  'day',
  'week',
  'month',
  'year',
  'one_off'
);

create type public.money_component_type as enum (
  'base_salary',
  'shift_allowance',
  'housing_allowance',
  'travel_allowance',
  'schooling_allowance',
  'medical_benefit',
  'pension_super',
  'bonus',
  'overtime_estimate',
  'relocation',
  'other'
);

create type public.compensation_visibility as enum (
  'private',
  'compatibility_only',
  'visible'
);

create type public.location_preference_level as enum (
  'preferred',
  'acceptable',
  'exceptional_only',
  'not_interested'
);

create type public.attestation_type as enum (
  'employment',
  'aircraft_exposure',
  'company_authorisation',
  'training',
  'competency',
  'other'
);

-- =========================================================
-- COMMON TIMESTAMP TRIGGER
-- =========================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- Worker-submitted evidence can be edited by the worker, but a worker can never
-- self-award a verified state. Any worker edit returns the record to pending.
create or replace function public.guard_worker_verification()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null and new.worker_id = auth.uid() then
    new.verification_status := 'pending';
    new.verified_at := null;
  end if;
  return new;
end;
$$;

create or replace function public.guard_rating_verification()
returns trigger
language plpgsql
as $$
declare
  owner_id uuid;
begin
  select worker_id into owner_id
  from public.worker_licences
  where id = new.licence_id;

  if auth.uid() is not null and owner_id = auth.uid() then
    new.verification_status := 'pending';
    new.verified_at := null;
  end if;
  return new;
end;
$$;

-- Workers can maintain their career records, but cannot self-confirm employer facts.
-- If they alter a previously confirmed employment/exposure record, confirmation resets.
create or replace function public.guard_worker_employment_confirmation()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null and new.worker_id = auth.uid() then
    new.employer_confirmed := false;
    new.confirmed_at := null;
  end if;
  return new;
end;
$$;

-- Organisation members can edit company details, but cannot self-verify the company.
create or replace function public.guard_organisation_verification()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.verified := false;
    else
      new.verified := old.verified;
    end if;
  end if;
  return new;
end;
$$;

-- =========================================================
-- USER / WORKER IDENTITY
-- =========================================================

create table public.worker_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  professional_headline text,
  current_city text,
  current_country_code char(2),
  preferred_currency char(3) not null default 'AUD',
  visibility public.profile_visibility not null default 'aviation_network',
  market_status public.market_status not null default 'not_open',
  profile_photo_path text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger worker_profiles_set_updated_at
before update on public.worker_profiles
for each row execute function public.set_updated_at();

create table public.worker_nationalities (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.worker_profiles(id) on delete cascade,
  country_code char(2) not null,
  is_primary boolean not null default false,
  visibility public.nationality_visibility not null default 'visible',
  created_at timestamptz not null default now(),
  unique(worker_id, country_code)
);

create table public.worker_work_rights (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.worker_profiles(id) on delete cascade,
  country_code char(2) not null,
  status public.work_right_status not null,
  visa_type text,
  expires_on date,
  evidence_path text,
  verification_status public.verification_status not null default 'pending',
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(worker_id, country_code, status)
);

create trigger worker_work_rights_set_updated_at
before update on public.worker_work_rights
for each row execute function public.set_updated_at();

create trigger worker_work_rights_guard_verification
before insert or update on public.worker_work_rights
for each row execute function public.guard_worker_verification();

-- =========================================================
-- ORGANISATIONS / EMPLOYER ACCOUNTS
-- =========================================================

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id),
  name text not null,
  legal_name text,
  organisation_type text,
  country_code char(2),
  website text,
  logo_path text,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger organisations_set_updated_at
before update on public.organisations
for each row execute function public.set_updated_at();

create trigger organisations_guard_verification
before insert or update on public.organisations
for each row execute function public.guard_organisation_verification();

create table public.organisation_members (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  primary key (organisation_id, user_id)
);

create or replace function public.is_org_member(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organisation_members om
    where om.organisation_id = org_id
      and om.user_id = auth.uid()
  );
$$;

-- =========================================================
-- AVIATION REFERENCE DATA
-- =========================================================

create table public.environments (
  id smallint generated always as identity primary key,
  code text not null unique,
  label text not null unique,
  active boolean not null default true
);

insert into public.environments (code, label) values
  ('line_maintenance', 'Line Maintenance'),
  ('base_maintenance', 'Base Maintenance'),
  ('heavy_maintenance', 'Heavy Maintenance'),
  ('production', 'Production'),
  ('final_assembly', 'Final Assembly Line'),
  ('prototype_development', 'Prototype / Development'),
  ('flight_test', 'Flight Test'),
  ('modification_retrofit', 'Modification / Retrofit'),
  ('component_workshop', 'Component / Workshop'),
  ('engine_shop', 'Engine Shop'),
  ('structures', 'Structures'),
  ('mro_support', 'MRO Support'),
  ('field_support', 'Field Support'),
  ('other', 'Other');

create table public.aircraft_manufacturers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table public.aircraft_families (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references public.aircraft_manufacturers(id),
  code text not null,
  display_name text not null,
  unique(manufacturer_id, code)
);

create table public.aircraft_variants (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.aircraft_families(id) on delete cascade,
  code text not null,
  display_name text not null,
  unique(family_id, code)
);

create table public.engine_types (
  id uuid primary key default gen_random_uuid(),
  manufacturer text,
  code text not null,
  display_name text not null,
  unique(manufacturer, code)
);

create table public.aircraft_variant_engines (
  variant_id uuid not null references public.aircraft_variants(id) on delete cascade,
  engine_id uuid not null references public.engine_types(id) on delete cascade,
  primary key (variant_id, engine_id)
);

-- =========================================================
-- LICENCES & RATINGS
-- =========================================================

create table public.licence_authorities (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  country_code char(2)
);

create table public.worker_licences (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.worker_profiles(id) on delete cascade,
  authority_id uuid not null references public.licence_authorities(id),
  licence_scheme text not null,
  category_privileges text,
  licence_number text,
  issued_on date,
  expires_on date,
  limitations text,
  evidence_path text,
  verification_status public.verification_status not null default 'pending',
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger worker_licences_set_updated_at
before update on public.worker_licences
for each row execute function public.set_updated_at();

create trigger worker_licences_guard_verification
before insert or update on public.worker_licences
for each row execute function public.guard_worker_verification();

create table public.licence_ratings (
  id uuid primary key default gen_random_uuid(),
  licence_id uuid not null references public.worker_licences(id) on delete cascade,
  official_designation text not null,
  privilege_category text,
  aircraft_family_id uuid references public.aircraft_families(id),
  aircraft_variant_id uuid references public.aircraft_variants(id),
  engine_id uuid references public.engine_types(id),
  evidence_path text,
  verification_status public.verification_status not null default 'pending',
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create trigger licence_ratings_guard_verification
before insert or update on public.licence_ratings
for each row execute function public.guard_rating_verification();

-- Gold star rule:
-- Show ⭐ only where licence_ratings.verification_status = 'verified'
-- and the rating maps to the relevant aircraft family/variant.

-- =========================================================
-- EMPLOYMENT & AIRCRAFT EXPERIENCE
-- =========================================================

create table public.employment_records (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.worker_profiles(id) on delete cascade,
  organisation_id uuid references public.organisations(id),
  employer_name text not null,
  job_title text not null,
  discipline text,
  city text,
  country_code char(2),
  employment_type public.employment_type,
  start_date date not null,
  end_date date,
  is_current boolean not null default false,
  description text,
  employer_confirmed boolean not null default false,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

create trigger employment_records_set_updated_at
before update on public.employment_records
for each row execute function public.set_updated_at();

create trigger employment_records_guard_confirmation
before insert or update on public.employment_records
for each row execute function public.guard_worker_employment_confirmation();

create table public.employment_environments (
  employment_id uuid not null references public.employment_records(id) on delete cascade,
  environment_id smallint not null references public.environments(id),
  primary key (employment_id, environment_id)
);

create table public.employment_aircraft_exposure (
  id uuid primary key default gen_random_uuid(),
  employment_id uuid not null references public.employment_records(id) on delete cascade,
  worker_id uuid not null references public.worker_profiles(id) on delete cascade,
  aircraft_family_id uuid not null references public.aircraft_families(id),
  aircraft_variant_id uuid references public.aircraft_variants(id),
  engine_id uuid references public.engine_types(id),
  discipline text,
  exposure public.exposure_level not null,
  exposure_start date,
  exposure_end date,
  last_worked_on date,
  employer_confirmed boolean not null default false,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  check (exposure_end is null or exposure_start is null or exposure_end >= exposure_start)
);

create trigger employment_aircraft_exposure_guard_confirmation
before insert or update on public.employment_aircraft_exposure
for each row execute function public.guard_worker_employment_confirmation();

create index employment_aircraft_exposure_worker_idx
  on public.employment_aircraft_exposure(worker_id);

create index employment_aircraft_exposure_family_idx
  on public.employment_aircraft_exposure(aircraft_family_id);

-- Blue dot rule:
-- Show 🔵 when a current/historical supported exposure record exists for the aircraft.
-- The UI must show recency and exposure level rather than pretending all calendar time is equal.

-- =========================================================
-- TRAINING / COMPETENCIES / AUTHORISATIONS
-- =========================================================

create table public.training_records (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.worker_profiles(id) on delete cascade,
  course_name text not null,
  provider text,
  completed_on date,
  expires_on date,
  evidence_path text,
  verification_status public.verification_status not null default 'pending',
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create trigger training_records_guard_verification
before insert or update on public.training_records
for each row execute function public.guard_worker_verification();

create table public.competency_catalog (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null unique,
  aircraft_specific boolean not null default false
);

create table public.worker_competencies (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.worker_profiles(id) on delete cascade,
  competency_id uuid not null references public.competency_catalog(id),
  aircraft_family_id uuid references public.aircraft_families(id),
  aircraft_variant_id uuid references public.aircraft_variants(id),
  engine_id uuid references public.engine_types(id),
  gained_on date,
  last_used_on date,
  evidence_path text,
  verification_status public.verification_status not null default 'pending',
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create trigger worker_competencies_guard_verification
before insert or update on public.worker_competencies
for each row execute function public.guard_worker_verification();

create table public.company_authorisations (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.worker_profiles(id) on delete cascade,
  organisation_id uuid references public.organisations(id),
  employer_name text not null,
  authorisation_name text not null,
  aircraft_family_id uuid references public.aircraft_families(id),
  aircraft_variant_id uuid references public.aircraft_variants(id),
  competency_id uuid references public.competency_catalog(id),
  issued_on date,
  expires_on date,
  revoked_on date,
  evidence_path text,
  verification_status public.verification_status not null default 'pending',
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

-- Green shield rule:
-- Show the custom green shield only for a current company_authorisation with
-- verification_status = 'verified', no revoked_on, and no elapsed expires_on.

-- =========================================================
-- EMPLOYER ATTESTATIONS
-- =========================================================

create table public.attestations (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.worker_profiles(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  attestation_type public.attestation_type not null,
  subject_type text not null,
  subject_id uuid,
  statement jsonb not null default '{}'::jsonb,
  attested_by uuid references auth.users(id),
  attested_at timestamptz not null default now(),
  revoked_at timestamptz,
  revocation_reason text,
  created_at timestamptz not null default now()
);

-- Historical facts should not be silently deleted.
-- A current authorisation can be revoked/expire; historic employment/exposure remains.

-- =========================================================
-- WORKER MARKET PREFERENCES
-- =========================================================

create table public.worker_market_preferences (
  worker_id uuid primary key references public.worker_profiles(id) on delete cascade,
  earliest_start_date date,
  notice_days integer check (notice_days is null or notice_days >= 0),
  willing_to_relocate boolean not null default false,
  willing_fifo boolean not null default false,
  willing_international boolean not null default false,
  preferred_employment_types public.employment_type[] not null default '{}',
  minimum_compensation numeric(14,2),
  minimum_compensation_currency char(3),
  minimum_compensation_period public.money_period default 'year',
  compensation_visibility public.compensation_visibility not null default 'compatibility_only',
  roster_preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create trigger worker_market_preferences_set_updated_at
before update on public.worker_market_preferences
for each row execute function public.set_updated_at();

create table public.worker_location_preferences (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.worker_profiles(id) on delete cascade,
  country_code char(2) not null,
  city text,
  preference public.location_preference_level not null,
  relocation_mode text,
  created_at timestamptz not null default now()
);

-- =========================================================
-- OPEN DEMAND
-- =========================================================

create table public.open_demands (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  internal_title text not null,
  public_title text not null,
  profession text not null,
  discipline text,
  seniority text,
  positions_required integer not null check (positions_required > 0),
  positions_remaining integer not null check (positions_remaining >= 0),
  status public.demand_status not null default 'draft',
  visibility public.demand_visibility not null default 'public',
  employment_type public.employment_type,
  city text,
  country_code char(2),
  sponsorship_available boolean not null default false,
  relocation_assistance boolean not null default false,
  expected_start_date date,
  target_fill_date date,
  opened_at timestamptz,
  confirmed_active_at timestamptz,
  confirmation_due_at timestamptz,
  description text,
  roster jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (positions_remaining <= positions_required)
);

create trigger open_demands_set_updated_at
before update on public.open_demands
for each row execute function public.set_updated_at();

create index open_demands_market_idx
  on public.open_demands(status, country_code, profession);

create table public.demand_environments (
  demand_id uuid not null references public.open_demands(id) on delete cascade,
  environment_id smallint not null references public.environments(id),
  requirement_level public.requirement_level not null default 'mandatory',
  primary key (demand_id, environment_id)
);

create table public.demand_aircraft_requirements (
  id uuid primary key default gen_random_uuid(),
  demand_id uuid not null references public.open_demands(id) on delete cascade,
  aircraft_family_id uuid not null references public.aircraft_families(id),
  aircraft_variant_id uuid references public.aircraft_variants(id),
  engine_id uuid references public.engine_types(id),
  experience_requirement public.requirement_level not null default 'not_relevant',
  rating_requirement public.requirement_level not null default 'not_relevant',
  authorisation_requirement public.requirement_level not null default 'not_relevant',
  minimum_exposure public.exposure_level,
  max_months_since_exposure integer check (max_months_since_exposure is null or max_months_since_exposure >= 0),
  notes text
);

create table public.demand_licence_requirements (
  id uuid primary key default gen_random_uuid(),
  demand_id uuid not null references public.open_demands(id) on delete cascade,
  authority_id uuid references public.licence_authorities(id),
  licence_scheme text,
  category_privileges text,
  requirement_level public.requirement_level not null,
  conversion_accepted boolean not null default false,
  notes text
);

create table public.demand_competency_requirements (
  id uuid primary key default gen_random_uuid(),
  demand_id uuid not null references public.open_demands(id) on delete cascade,
  competency_id uuid not null references public.competency_catalog(id),
  aircraft_family_id uuid references public.aircraft_families(id),
  requirement_level public.requirement_level not null,
  must_be_current boolean not null default false,
  notes text
);

create table public.demand_training_requirements (
  id uuid primary key default gen_random_uuid(),
  demand_id uuid not null references public.open_demands(id) on delete cascade,
  training_name text not null,
  requirement_level public.requirement_level not null,
  must_be_current boolean not null default false,
  notes text
);

create table public.demand_compensation_components (
  id uuid primary key default gen_random_uuid(),
  demand_id uuid not null references public.open_demands(id) on delete cascade,
  component_type public.money_component_type not null,
  amount_min numeric(14,2),
  amount_max numeric(14,2),
  currency_code char(3) not null,
  period public.money_period not null,
  taxable boolean,
  notes text,
  check (
    amount_min is null
    or amount_max is null
    or amount_max >= amount_min
  )
);

create table public.demand_benefits (
  id uuid primary key default gen_random_uuid(),
  demand_id uuid not null references public.open_demands(id) on delete cascade,
  label text not null,
  description text,
  estimated_value numeric(14,2),
  currency_code char(3),
  period public.money_period,
  created_at timestamptz not null default now()
);

-- Native currency is authoritative.
-- Display currency conversion and later purchasing-power adjustment happen above this layer.

-- =========================================================
-- STRUCTURED OPPORTUNITIES
-- =========================================================

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  demand_id uuid not null references public.open_demands(id) on delete cascade,
  worker_id uuid not null references public.worker_profiles(id) on delete cascade,
  sent_by uuid not null references auth.users(id),
  status public.opportunity_status not null default 'sent',
  employer_message text,
  worker_question text,
  sent_at timestamptz not null default now(),
  viewed_at timestamptz,
  responded_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(demand_id, worker_id)
);

create trigger opportunities_set_updated_at
before update on public.opportunities
for each row execute function public.set_updated_at();

-- =========================================================
-- USEFUL VIEWS
-- =========================================================

create view public.worker_verified_ratings with (security_invoker = true) as
select
  wl.worker_id,
  lr.id as rating_id,
  lr.aircraft_family_id,
  lr.aircraft_variant_id,
  lr.engine_id,
  lr.official_designation,
  lr.privilege_category
from public.licence_ratings lr
join public.worker_licences wl on wl.id = lr.licence_id
where wl.verification_status = 'verified'
  and lr.verification_status = 'verified';

create view public.worker_current_authorisations with (security_invoker = true) as
select
  ca.worker_id,
  ca.id as authorisation_id,
  ca.organisation_id,
  ca.aircraft_family_id,
  ca.aircraft_variant_id,
  ca.competency_id,
  ca.authorisation_name,
  ca.expires_on
from public.company_authorisations ca
where ca.verification_status = 'verified'
  and ca.revoked_on is null
  and (ca.expires_on is null or ca.expires_on >= current_date);

create view public.worker_aircraft_presence with (security_invoker = true) as
select distinct
  eae.worker_id,
  eae.aircraft_family_id,
  eae.aircraft_variant_id,
  eae.exposure,
  eae.last_worked_on
from public.employment_aircraft_exposure eae;

-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================

alter table public.worker_profiles enable row level security;
alter table public.worker_nationalities enable row level security;
alter table public.worker_work_rights enable row level security;
alter table public.organisations enable row level security;
alter table public.organisation_members enable row level security;
alter table public.worker_licences enable row level security;
alter table public.licence_ratings enable row level security;
alter table public.employment_records enable row level security;
alter table public.employment_environments enable row level security;
alter table public.employment_aircraft_exposure enable row level security;
alter table public.training_records enable row level security;
alter table public.worker_competencies enable row level security;
alter table public.company_authorisations enable row level security;
alter table public.attestations enable row level security;
alter table public.worker_market_preferences enable row level security;
alter table public.worker_location_preferences enable row level security;
alter table public.open_demands enable row level security;
alter table public.demand_environments enable row level security;
alter table public.demand_aircraft_requirements enable row level security;
alter table public.demand_licence_requirements enable row level security;
alter table public.demand_competency_requirements enable row level security;
alter table public.demand_training_requirements enable row level security;
alter table public.demand_compensation_components enable row level security;
alter table public.demand_benefits enable row level security;
alter table public.opportunities enable row level security;

-- Reference data: readable by authenticated users.
alter table public.environments enable row level security;
alter table public.aircraft_manufacturers enable row level security;
alter table public.aircraft_families enable row level security;
alter table public.aircraft_variants enable row level security;
alter table public.engine_types enable row level security;
alter table public.aircraft_variant_engines enable row level security;
alter table public.licence_authorities enable row level security;
alter table public.competency_catalog enable row level security;

create policy "authenticated read environments"
on public.environments for select to authenticated using (true);

create policy "authenticated read aircraft manufacturers"
on public.aircraft_manufacturers for select to authenticated using (true);

create policy "authenticated read aircraft families"
on public.aircraft_families for select to authenticated using (true);

create policy "authenticated read aircraft variants"
on public.aircraft_variants for select to authenticated using (true);

create policy "authenticated read engine types"
on public.engine_types for select to authenticated using (true);

create policy "authenticated read aircraft variant engines"
on public.aircraft_variant_engines for select to authenticated using (true);

create policy "authenticated read licence authorities"
on public.licence_authorities for select to authenticated using (true);

create policy "authenticated read competency catalog"
on public.competency_catalog for select to authenticated using (true);

-- Worker-owned root profile.
create policy "worker reads own profile"
on public.worker_profiles for select to authenticated
using (id = auth.uid());

create policy "worker inserts own profile"
on public.worker_profiles for insert to authenticated
with check (id = auth.uid());

create policy "worker updates own profile"
on public.worker_profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Simple worker-owned child table policies.
create policy "worker manages own nationalities"
on public.worker_nationalities for all to authenticated
using (worker_id = auth.uid())
with check (worker_id = auth.uid());

create policy "worker manages own work rights"
on public.worker_work_rights for all to authenticated
using (worker_id = auth.uid())
with check (worker_id = auth.uid());

create policy "worker manages own licences"
on public.worker_licences for all to authenticated
using (worker_id = auth.uid())
with check (worker_id = auth.uid());

create policy "worker manages own ratings"
on public.licence_ratings for all to authenticated
using (
  exists (
    select 1 from public.worker_licences wl
    where wl.id = licence_id and wl.worker_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.worker_licences wl
    where wl.id = licence_id and wl.worker_id = auth.uid()
  )
);

create policy "worker manages own employment"
on public.employment_records for all to authenticated
using (worker_id = auth.uid())
with check (worker_id = auth.uid());

create policy "worker manages own employment environments"
on public.employment_environments for all to authenticated
using (
  exists (
    select 1 from public.employment_records er
    where er.id = employment_id and er.worker_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.employment_records er
    where er.id = employment_id and er.worker_id = auth.uid()
  )
);

create policy "worker manages own aircraft exposure"
on public.employment_aircraft_exposure for all to authenticated
using (worker_id = auth.uid())
with check (worker_id = auth.uid());

create policy "worker manages own training"
on public.training_records for all to authenticated
using (worker_id = auth.uid())
with check (worker_id = auth.uid());

create policy "worker manages own competencies"
on public.worker_competencies for all to authenticated
using (worker_id = auth.uid())
with check (worker_id = auth.uid());

create policy "worker reads own authorisations"
on public.company_authorisations for select to authenticated
using (worker_id = auth.uid());

create policy "worker manages own market preferences"
on public.worker_market_preferences for all to authenticated
using (worker_id = auth.uid())
with check (worker_id = auth.uid());

create policy "worker manages own location preferences"
on public.worker_location_preferences for all to authenticated
using (worker_id = auth.uid())
with check (worker_id = auth.uid());

create policy "worker reads own attestations"
on public.attestations for select to authenticated
using (worker_id = auth.uid());

-- Organisations: users may create an organisation, then bootstrap their own membership.
create policy "authenticated creates organisation"
on public.organisations for insert to authenticated
with check (created_by = auth.uid());

create policy "org members read organisation"
on public.organisations for select to authenticated
using (public.is_org_member(id) or created_by = auth.uid());

create policy "org members update organisation"
on public.organisations for update to authenticated
using (public.is_org_member(id) or created_by = auth.uid())
with check (public.is_org_member(id) or created_by = auth.uid());

create policy "creator bootstraps own membership"
on public.organisation_members for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.organisations o
    where o.id = organisation_id
      and o.created_by = auth.uid()
  )
);

create policy "member reads own memberships"
on public.organisation_members for select to authenticated
using (user_id = auth.uid());

-- Organisation members manage demand for their organisation.
create policy "org members read own demands"
on public.open_demands for select to authenticated
using (public.is_org_member(organisation_id));

create policy "org members create demands"
on public.open_demands for insert to authenticated
with check (
  created_by = auth.uid()
  and public.is_org_member(organisation_id)
);

create policy "org members update demands"
on public.open_demands for update to authenticated
using (public.is_org_member(organisation_id))
with check (public.is_org_member(organisation_id));

-- Workers can read public open demand.
create policy "workers read public open demand"
on public.open_demands for select to authenticated
using (
  status = 'open'
  and visibility = 'public'
);

-- Demand child data: org members can manage it.
create policy "org members manage demand environments"
on public.demand_environments for all to authenticated
using (
  exists (
    select 1 from public.open_demands d
    where d.id = demand_id and public.is_org_member(d.organisation_id)
  )
)
with check (
  exists (
    select 1 from public.open_demands d
    where d.id = demand_id and public.is_org_member(d.organisation_id)
  )
);

create policy "org members manage demand aircraft requirements"
on public.demand_aircraft_requirements for all to authenticated
using (
  exists (
    select 1 from public.open_demands d
    where d.id = demand_id and public.is_org_member(d.organisation_id)
  )
)
with check (
  exists (
    select 1 from public.open_demands d
    where d.id = demand_id and public.is_org_member(d.organisation_id)
  )
);

create policy "org members manage demand licence requirements"
on public.demand_licence_requirements for all to authenticated
using (
  exists (
    select 1 from public.open_demands d
    where d.id = demand_id and public.is_org_member(d.organisation_id)
  )
)
with check (
  exists (
    select 1 from public.open_demands d
    where d.id = demand_id and public.is_org_member(d.organisation_id)
  )
);

create policy "org members manage demand competency requirements"
on public.demand_competency_requirements for all to authenticated
using (
  exists (
    select 1 from public.open_demands d
    where d.id = demand_id and public.is_org_member(d.organisation_id)
  )
)
with check (
  exists (
    select 1 from public.open_demands d
    where d.id = demand_id and public.is_org_member(d.organisation_id)
  )
);

create policy "org members manage demand training requirements"
on public.demand_training_requirements for all to authenticated
using (
  exists (
    select 1 from public.open_demands d
    where d.id = demand_id and public.is_org_member(d.organisation_id)
  )
)
with check (
  exists (
    select 1 from public.open_demands d
    where d.id = demand_id and public.is_org_member(d.organisation_id)
  )
);

create policy "org members manage demand compensation"
on public.demand_compensation_components for all to authenticated
using (
  exists (
    select 1 from public.open_demands d
    where d.id = demand_id and public.is_org_member(d.organisation_id)
  )
)
with check (
  exists (
    select 1 from public.open_demands d
    where d.id = demand_id and public.is_org_member(d.organisation_id)
  )
);

create policy "org members manage demand benefits"
on public.demand_benefits for all to authenticated
using (
  exists (
    select 1 from public.open_demands d
    where d.id = demand_id and public.is_org_member(d.organisation_id)
  )
)
with check (
  exists (
    select 1 from public.open_demands d
    where d.id = demand_id and public.is_org_member(d.organisation_id)
  )
);

-- Opportunities: recipient worker or employer org member.
create policy "worker reads own opportunities"
on public.opportunities for select to authenticated
using (worker_id = auth.uid());

create policy "worker updates own opportunity response"
on public.opportunities for update to authenticated
using (worker_id = auth.uid())
with check (worker_id = auth.uid());

create policy "org members read opportunities for own demand"
on public.opportunities for select to authenticated
using (
  exists (
    select 1
    from public.open_demands d
    where d.id = demand_id
      and public.is_org_member(d.organisation_id)
  )
);

create policy "org members send opportunities from own demand"
on public.opportunities for insert to authenticated
with check (
  sent_by = auth.uid()
  and exists (
    select 1
    from public.open_demands d
    where d.id = demand_id
      and d.status = 'open'
      and public.is_org_member(d.organisation_id)
  )
);

-- NOTE:
-- Do NOT add broad employer SELECT policies to worker Passport tables.
-- V0.1 talent search should be implemented via a controlled server endpoint or
-- SECURITY DEFINER RPC that:
--   1. verifies caller organisation membership,
--   2. verifies demand.status = 'open',
--   3. limits search to candidates relevant to that demand,
--   4. respects worker visibility / market status / preferences,
--   5. returns only the fields allowed by worker privacy settings.


-- =========================================================
-- Part 2: reference seed
-- =========================================================

-- Aviation Passport V0.1
-- Reference seed: initial aircraft, engines, licence authorities and competencies.
-- Safe to re-run where ON CONFLICT is specified.

-- =========================================================
-- MANUFACTURERS
-- =========================================================

insert into public.aircraft_manufacturers (name)
values ('Airbus'), ('Boeing')
on conflict (name) do nothing;

-- =========================================================
-- AIRCRAFT FAMILIES
-- =========================================================

insert into public.aircraft_families (manufacturer_id, code, display_name)
select id, 'A320', 'A320 Family'
from public.aircraft_manufacturers where name = 'Airbus'
on conflict (manufacturer_id, code) do nothing;

insert into public.aircraft_families (manufacturer_id, code, display_name)
select id, 'A330', 'A330 Family'
from public.aircraft_manufacturers where name = 'Airbus'
on conflict (manufacturer_id, code) do nothing;

insert into public.aircraft_families (manufacturer_id, code, display_name)
select id, 'A350', 'A350'
from public.aircraft_manufacturers where name = 'Airbus'
on conflict (manufacturer_id, code) do nothing;

insert into public.aircraft_families (manufacturer_id, code, display_name)
select id, 'A380', 'A380'
from public.aircraft_manufacturers where name = 'Airbus'
on conflict (manufacturer_id, code) do nothing;

insert into public.aircraft_families (manufacturer_id, code, display_name)
select id, 'B737', '737 Family'
from public.aircraft_manufacturers where name = 'Boeing'
on conflict (manufacturer_id, code) do nothing;

insert into public.aircraft_families (manufacturer_id, code, display_name)
select id, 'B777', '777 Family'
from public.aircraft_manufacturers where name = 'Boeing'
on conflict (manufacturer_id, code) do nothing;

insert into public.aircraft_families (manufacturer_id, code, display_name)
select id, 'B787', '787'
from public.aircraft_manufacturers where name = 'Boeing'
on conflict (manufacturer_id, code) do nothing;

-- =========================================================
-- VARIANTS
-- =========================================================

insert into public.aircraft_variants (family_id, code, display_name)
select f.id, v.code, v.display_name
from public.aircraft_families f
join public.aircraft_manufacturers m on m.id = f.manufacturer_id
cross join (values
  ('A319', 'A319'),
  ('A320', 'A320'),
  ('A321', 'A321')
) as v(code, display_name)
where m.name = 'Airbus' and f.code = 'A320'
on conflict (family_id, code) do nothing;

insert into public.aircraft_variants (family_id, code, display_name)
select f.id, v.code, v.display_name
from public.aircraft_families f
join public.aircraft_manufacturers m on m.id = f.manufacturer_id
cross join (values
  ('A330-200', 'A330-200'),
  ('A330-300', 'A330-300'),
  ('A330-800', 'A330-800'),
  ('A330-900', 'A330-900')
) as v(code, display_name)
where m.name = 'Airbus' and f.code = 'A330'
on conflict (family_id, code) do nothing;

insert into public.aircraft_variants (family_id, code, display_name)
select f.id, v.code, v.display_name
from public.aircraft_families f
join public.aircraft_manufacturers m on m.id = f.manufacturer_id
cross join (values
  ('A350-900', 'A350-900'),
  ('A350-1000', 'A350-1000')
) as v(code, display_name)
where m.name = 'Airbus' and f.code = 'A350'
on conflict (family_id, code) do nothing;

insert into public.aircraft_variants (family_id, code, display_name)
select f.id, 'A380-800', 'A380-800'
from public.aircraft_families f
join public.aircraft_manufacturers m on m.id = f.manufacturer_id
where m.name = 'Airbus' and f.code = 'A380'
on conflict (family_id, code) do nothing;

insert into public.aircraft_variants (family_id, code, display_name)
select f.id, v.code, v.display_name
from public.aircraft_families f
join public.aircraft_manufacturers m on m.id = f.manufacturer_id
cross join (values
  ('737-700', '737-700'),
  ('737-800', '737-800'),
  ('737-900', '737-900'),
  ('737-8', '737 MAX 8'),
  ('737-9', '737 MAX 9')
) as v(code, display_name)
where m.name = 'Boeing' and f.code = 'B737'
on conflict (family_id, code) do nothing;

insert into public.aircraft_variants (family_id, code, display_name)
select f.id, v.code, v.display_name
from public.aircraft_families f
join public.aircraft_manufacturers m on m.id = f.manufacturer_id
cross join (values
  ('777-200', '777-200'),
  ('777-200ER', '777-200ER'),
  ('777-200LR', '777-200LR'),
  ('777-300', '777-300'),
  ('777-300ER', '777-300ER'),
  ('777F', '777 Freighter')
) as v(code, display_name)
where m.name = 'Boeing' and f.code = 'B777'
on conflict (family_id, code) do nothing;

insert into public.aircraft_variants (family_id, code, display_name)
select f.id, v.code, v.display_name
from public.aircraft_families f
join public.aircraft_manufacturers m on m.id = f.manufacturer_id
cross join (values
  ('787-8', '787-8'),
  ('787-9', '787-9'),
  ('787-10', '787-10')
) as v(code, display_name)
where m.name = 'Boeing' and f.code = 'B787'
on conflict (family_id, code) do nothing;

-- =========================================================
-- ENGINES
-- =========================================================

insert into public.engine_types (manufacturer, code, display_name) values
  ('CFM International', 'CFM56', 'CFM56'),
  ('CFM International', 'LEAP-1A', 'LEAP-1A'),
  ('CFM International', 'LEAP-1B', 'LEAP-1B'),
  ('International Aero Engines', 'V2500', 'V2500'),
  ('Pratt & Whitney', 'PW1100G-JM', 'PW1100G-JM'),
  ('Rolls-Royce', 'Trent 700', 'Trent 700'),
  ('Rolls-Royce', 'Trent 7000', 'Trent 7000'),
  ('Rolls-Royce', 'Trent XWB-84', 'Trent XWB-84'),
  ('Rolls-Royce', 'Trent XWB-97', 'Trent XWB-97'),
  ('Rolls-Royce', 'Trent 900', 'Trent 900'),
  ('Engine Alliance', 'GP7200', 'GP7200'),
  ('General Electric', 'GE90', 'GE90'),
  ('General Electric', 'GEnx-1B', 'GEnx-1B'),
  ('Rolls-Royce', 'Trent 1000', 'Trent 1000')
on conflict (manufacturer, code) do nothing;

-- =========================================================
-- INITIAL AIRCRAFT/ENGINE MAPPINGS
-- =========================================================

insert into public.aircraft_variant_engines (variant_id, engine_id)
select av.id, e.id
from public.aircraft_variants av
join public.aircraft_families af on af.id = av.family_id
join public.aircraft_manufacturers am on am.id = af.manufacturer_id
join public.engine_types e on true
where am.name = 'Airbus'
  and af.code = 'A350'
  and (
    (av.code = 'A350-900' and e.code = 'Trent XWB-84')
    or
    (av.code = 'A350-1000' and e.code = 'Trent XWB-97')
  )
on conflict do nothing;

insert into public.aircraft_variant_engines (variant_id, engine_id)
select av.id, e.id
from public.aircraft_variants av
join public.aircraft_families af on af.id = av.family_id
join public.aircraft_manufacturers am on am.id = af.manufacturer_id
join public.engine_types e on true
where am.name = 'Airbus'
  and af.code = 'A380'
  and av.code = 'A380-800'
  and e.code in ('Trent 900', 'GP7200')
on conflict do nothing;

insert into public.aircraft_variant_engines (variant_id, engine_id)
select av.id, e.id
from public.aircraft_variants av
join public.aircraft_families af on af.id = av.family_id
join public.aircraft_manufacturers am on am.id = af.manufacturer_id
join public.engine_types e on true
where am.name = 'Boeing'
  and af.code = 'B787'
  and e.code in ('GEnx-1B', 'Trent 1000')
on conflict do nothing;

insert into public.aircraft_variant_engines (variant_id, engine_id)
select av.id, e.id
from public.aircraft_variants av
join public.aircraft_families af on af.id = av.family_id
join public.aircraft_manufacturers am on am.id = af.manufacturer_id
join public.engine_types e on true
where am.name = 'Boeing'
  and af.code = 'B737'
  and (
    (av.code in ('737-700','737-800','737-900') and e.code = 'CFM56')
    or
    (av.code in ('737-8','737-9') and e.code = 'LEAP-1B')
  )
on conflict do nothing;

-- =========================================================
-- LICENCE AUTHORITIES
-- =========================================================
-- Note: EASA is a regulatory framework, while Part-66 AMLs are issued by
-- national competent authorities. Store the actual issuing authority and
-- use worker_licences.licence_scheme for "EASA Part-66 AML".

insert into public.licence_authorities (code, name, country_code) values
  ('CASA-AU', 'Civil Aviation Safety Authority', 'AU'),
  ('FAA-US', 'Federal Aviation Administration', 'US'),
  ('UKCAA', 'UK Civil Aviation Authority', 'GB'),
  ('GCAA-AE', 'General Civil Aviation Authority', 'AE'),
  ('CAAS-SG', 'Civil Aviation Authority of Singapore', 'SG'),
  ('HKCAD', 'Hong Kong Civil Aviation Department', 'HK'),
  ('CAA-NZ', 'Civil Aviation Authority of New Zealand', 'NZ'),
  ('LBA-DE', 'Luftfahrt-Bundesamt', 'DE')
on conflict (code) do nothing;

-- =========================================================
-- COMPETENCY CATALOG
-- =========================================================

insert into public.competency_catalog (code, label, aircraft_specific) values
  ('engine_ground_run', 'Engine Ground Run', true),
  ('aircraft_towing', 'Aircraft Towing', false),
  ('brake_riding', 'Brake Riding', false),
  ('borescope', 'Borescope Inspection', true),
  ('wiring_repair', 'Wiring Repair', false),
  ('fibre_optic_repair', 'Fibre-Optic Repair', false),
  ('composite_repair', 'Composite Repair', false),
  ('sheet_metal_structures', 'Sheet Metal / Structures', false),
  ('software_data_loading', 'Software / Data Loading', true),
  ('fuel_tank_entry', 'Fuel Tank Entry', false)
on conflict (code) do nothing;
