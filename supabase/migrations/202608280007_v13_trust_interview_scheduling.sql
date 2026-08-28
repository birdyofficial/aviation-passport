-- AVIATION PASSPORT V0.13 — Verification & Trust Centre + Interview Scheduling
-- Run once after V0.12.
--
-- Main additions:
-- 1. Central documentary verification workflow for work rights, licences,
--    ratings, training and competencies.
-- 2. Platform verifier queue with Verify / Request information / Reject.
-- 3. Worker Trust view and action state.
-- 4. Interested -> Interviewing directly. No generic Conversation stage.
-- 5. Repeatable interview rounds with 3 HR-proposed options, worker counter-
--    proposals, timezone-aware storage, channel and connection details.
--
-- Company authorisations, employment and aircraft exposure remain outside
-- central documentary verification. Those belong to employer attestation
-- and are intentionally reserved for the next trust layer.

-- =========================================================
-- PLATFORM VERIFIER ROLE
-- =========================================================

create table if not exists public.platform_verifiers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'verifier'
    check (role in ('owner','verifier')),
  created_at timestamptz not null default now()
);

alter table public.platform_verifiers enable row level security;
revoke all on table public.platform_verifiers from anon, authenticated;

-- Development bootstrap: the oldest existing Aviation Passport account becomes
-- the initial owner verifier if no verifier exists yet. Future production
-- provisioning can replace this with explicit administrative assignment.
insert into public.platform_verifiers (user_id, role)
select u.id, 'owner'
from auth.users u
where not exists (select 1 from public.platform_verifiers)
order by u.created_at asc
limit 1
on conflict (user_id) do nothing;

create or replace function public.is_platform_verifier()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.platform_verifiers pv
    where pv.user_id = auth.uid()
  );
$$;

revoke all on function public.is_platform_verifier() from public;
grant execute on function public.is_platform_verifier() to authenticated;

-- Verifiers may read private credential evidence. The bucket remains private
-- and signed URLs are still short-lived.
drop policy if exists "platform verifiers read credential evidence" on storage.objects;
create policy "platform verifiers read credential evidence"
on storage.objects for select to authenticated
using (
  bucket_id = 'credential-evidence'
  and public.is_platform_verifier()
);


-- Platform review RPCs need to be able to update the source verification state
-- even when the verifier is also the owner of a development/test Passport.
-- Normal worker edits still reset verification to Pending.
create or replace function public.guard_worker_verification()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('app.verification_context', true), '') <> 'platform'
     and auth.uid() is not null
     and new.worker_id = auth.uid() then
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

  if coalesce(current_setting('app.verification_context', true), '') <> 'platform'
     and auth.uid() is not null
     and owner_id = auth.uid() then
    new.verification_status := 'pending';
    new.verified_at := null;
  end if;
  return new;
end;
$$;

-- =========================================================
-- VERIFICATION CASES
-- =========================================================

create table if not exists public.verification_cases (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.worker_profiles(id) on delete cascade,
  subject_type text not null
    check (subject_type in ('work_right','licence','rating','training','competency')),
  subject_id uuid not null,
  status text not null default 'pending'
    check (status in ('pending','more_information','verified','rejected','expired')),
  reviewer_request text,
  worker_note text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(subject_type, subject_id)
);

drop trigger if exists verification_cases_set_updated_at on public.verification_cases;
create trigger verification_cases_set_updated_at
before update on public.verification_cases
for each row execute function public.set_updated_at();

alter table public.verification_cases enable row level security;
revoke all on table public.verification_cases from anon, authenticated;

create or replace function public.sync_verification_case()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_worker_id uuid;
  v_subject_type text;
  v_source_status text;
begin
  if tg_table_name = 'licence_ratings' then
    select wl.worker_id
    into v_worker_id
    from public.worker_licences wl
    where wl.id = new.licence_id;
    v_subject_type := 'rating';
  else
    v_worker_id := nullif(to_jsonb(new)->>'worker_id','')::uuid;
    v_subject_type := case tg_table_name
      when 'worker_work_rights' then 'work_right'
      when 'worker_licences' then 'licence'
      when 'training_records' then 'training'
      when 'worker_competencies' then 'competency'
      else null
    end;
  end if;

  if v_worker_id is null or v_subject_type is null then
    return new;
  end if;

  v_source_status := coalesce(to_jsonb(new)->>'verification_status', 'pending');

  insert into public.verification_cases (
    worker_id,
    subject_type,
    subject_id,
    status
  )
  values (
    v_worker_id,
    v_subject_type,
    new.id,
    case
      when v_source_status = 'verified' then 'verified'
      when v_source_status = 'rejected' then 'rejected'
      when v_source_status = 'expired' then 'expired'
      else 'pending'
    end
  )
  on conflict (subject_type, subject_id) do update
  set
    worker_id = excluded.worker_id,
    status = excluded.status,
    reviewed_by = case when excluded.status = 'pending' then null else public.verification_cases.reviewed_by end,
    reviewed_at = case when excluded.status = 'pending' then null else public.verification_cases.reviewed_at end,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists work_rights_sync_verification_case on public.worker_work_rights;
create trigger work_rights_sync_verification_case
after insert or update
on public.worker_work_rights
for each row execute function public.sync_verification_case();

drop trigger if exists licences_sync_verification_case on public.worker_licences;
create trigger licences_sync_verification_case
after insert or update
on public.worker_licences
for each row execute function public.sync_verification_case();

drop trigger if exists ratings_sync_verification_case on public.licence_ratings;
create trigger ratings_sync_verification_case
after insert or update
on public.licence_ratings
for each row execute function public.sync_verification_case();

drop trigger if exists training_sync_verification_case on public.training_records;
create trigger training_sync_verification_case
after insert or update
on public.training_records
for each row execute function public.sync_verification_case();

drop trigger if exists competencies_sync_verification_case on public.worker_competencies;
create trigger competencies_sync_verification_case
after insert or update
on public.worker_competencies
for each row execute function public.sync_verification_case();

-- Seed cases for the records that already exist.
insert into public.verification_cases (worker_id, subject_type, subject_id, status)
select wr.worker_id, 'work_right', wr.id,
  case when wr.verification_status = 'verified' then 'verified'
       when wr.verification_status = 'rejected' then 'rejected'
       when wr.verification_status = 'expired' then 'expired'
       else 'pending' end
from public.worker_work_rights wr
on conflict (subject_type, subject_id) do nothing;

insert into public.verification_cases (worker_id, subject_type, subject_id, status)
select wl.worker_id, 'licence', wl.id,
  case when wl.verification_status = 'verified' then 'verified'
       when wl.verification_status = 'rejected' then 'rejected'
       when wl.verification_status = 'expired' then 'expired'
       else 'pending' end
from public.worker_licences wl
on conflict (subject_type, subject_id) do nothing;

insert into public.verification_cases (worker_id, subject_type, subject_id, status)
select wl.worker_id, 'rating', lr.id,
  case when lr.verification_status = 'verified' then 'verified'
       when lr.verification_status = 'rejected' then 'rejected'
       when lr.verification_status = 'expired' then 'expired'
       else 'pending' end
from public.licence_ratings lr
join public.worker_licences wl on wl.id = lr.licence_id
on conflict (subject_type, subject_id) do nothing;

insert into public.verification_cases (worker_id, subject_type, subject_id, status)
select tr.worker_id, 'training', tr.id,
  case when tr.verification_status = 'verified' then 'verified'
       when tr.verification_status = 'rejected' then 'rejected'
       when tr.verification_status = 'expired' then 'expired'
       else 'pending' end
from public.training_records tr
on conflict (subject_type, subject_id) do nothing;

insert into public.verification_cases (worker_id, subject_type, subject_id, status)
select wc.worker_id, 'competency', wc.id,
  case when wc.verification_status = 'verified' then 'verified'
       when wc.verification_status = 'rejected' then 'rejected'
       when wc.verification_status = 'expired' then 'expired'
       else 'pending' end
from public.worker_competencies wc
on conflict (subject_type, subject_id) do nothing;

create or replace function public._verification_subject_payload(
  p_subject_type text,
  p_subject_id uuid
)
returns table (
  subject_label text,
  subject_details jsonb,
  evidence_path text,
  source_status public.verification_status,
  source_verified_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_subject_type = 'work_right' then
    return query
    select
      ('Work right · ' || wr.country_code)::text,
      jsonb_build_object(
        'country_code', wr.country_code,
        'status', wr.status,
        'visa_type', wr.visa_type,
        'expires_on', wr.expires_on
      ),
      wr.evidence_path,
      wr.verification_status,
      wr.verified_at
    from public.worker_work_rights wr
    where wr.id = p_subject_id;
    return;
  end if;

  if p_subject_type = 'licence' then
    return query
    select
      (wl.licence_scheme || coalesce(' · ' || la.name, ''))::text,
      jsonb_build_object(
        'licence_system', wl.licence_scheme,
        'authority', la.name,
        'authority_country_code', la.country_code,
        'category_privileges', wl.category_privileges,
        'licence_number', wl.licence_number,
        'issued_on', wl.issued_on,
        'expires_on', wl.expires_on,
        'limitations', wl.limitations
      ),
      wl.evidence_path,
      wl.verification_status,
      wl.verified_at
    from public.worker_licences wl
    left join public.licence_authorities la on la.id = wl.authority_id
    where wl.id = p_subject_id;
    return;
  end if;

  if p_subject_type = 'rating' then
    return query
    select
      ('Rating · ' || lr.official_designation)::text,
      jsonb_build_object(
        'official_designation', lr.official_designation,
        'privilege_category', lr.privilege_category,
        'licence_system', wl.licence_scheme,
        'aircraft_family', coalesce(af.display_name, lr.custom_aircraft_family),
        'aircraft_variant', av.display_name,
        'engine', et.display_name
      ),
      lr.evidence_path,
      lr.verification_status,
      lr.verified_at
    from public.licence_ratings lr
    join public.worker_licences wl on wl.id = lr.licence_id
    left join public.aircraft_families af on af.id = lr.aircraft_family_id
    left join public.aircraft_variants av on av.id = lr.aircraft_variant_id
    left join public.engine_types et on et.id = lr.engine_id
    where lr.id = p_subject_id;
    return;
  end if;

  if p_subject_type = 'training' then
    return query
    select
      ('Training · ' || tr.course_name)::text,
      jsonb_build_object(
        'course_name', tr.course_name,
        'provider', tr.provider,
        'completed_on', tr.completed_on,
        'expires_on', tr.expires_on
      ),
      tr.evidence_path,
      tr.verification_status,
      tr.verified_at
    from public.training_records tr
    where tr.id = p_subject_id;
    return;
  end if;

  if p_subject_type = 'competency' then
    return query
    select
      ('Competency · ' || coalesce(cc.label, wc.custom_competency_name, 'Competency'))::text,
      jsonb_build_object(
        'competency', coalesce(cc.label, wc.custom_competency_name),
        'gained_on', wc.gained_on,
        'last_used_on', wc.last_used_on,
        'aircraft_family', af.display_name,
        'aircraft_variant', av.display_name,
        'engine', et.display_name
      ),
      wc.evidence_path,
      wc.verification_status,
      wc.verified_at
    from public.worker_competencies wc
    left join public.competency_catalog cc on cc.id = wc.competency_id
    left join public.aircraft_families af on af.id = wc.aircraft_family_id
    left join public.aircraft_variants av on av.id = wc.aircraft_variant_id
    left join public.engine_types et on et.id = wc.engine_id
    where wc.id = p_subject_id;
    return;
  end if;
end;
$$;

revoke all on function public._verification_subject_payload(text, uuid) from public;

create or replace function public.get_my_verification_cases()
returns table (
  case_id uuid,
  subject_type text,
  subject_id uuid,
  case_status text,
  subject_label text,
  subject_details jsonb,
  evidence_path text,
  source_status public.verification_status,
  source_verified_at timestamptz,
  reviewer_request text,
  worker_note text,
  reviewed_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    c.id,
    c.subject_type,
    c.subject_id,
    c.status,
    p.subject_label,
    p.subject_details,
    p.evidence_path,
    p.source_status,
    p.source_verified_at,
    c.reviewer_request,
    c.worker_note,
    c.reviewed_at,
    c.updated_at
  from public.verification_cases c
  cross join lateral public._verification_subject_payload(c.subject_type, c.subject_id) p
  where c.worker_id = auth.uid()
  order by
    case c.status
      when 'more_information' then 1
      when 'pending' then 2
      when 'rejected' then 3
      else 4
    end,
    c.updated_at desc;
$$;

revoke all on function public.get_my_verification_cases() from public;
grant execute on function public.get_my_verification_cases() to authenticated;

create or replace function public.get_my_trust_action_count()
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::integer
  from public.verification_cases c
  where c.worker_id = auth.uid()
    and c.status = 'more_information';
$$;

revoke all on function public.get_my_trust_action_count() from public;
grant execute on function public.get_my_trust_action_count() to authenticated;

create or replace function public.get_verification_queue()
returns table (
  case_id uuid,
  worker_id uuid,
  worker_name text,
  subject_type text,
  subject_id uuid,
  case_status text,
  subject_label text,
  subject_details jsonb,
  evidence_path text,
  source_status public.verification_status,
  reviewer_request text,
  worker_note text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_platform_verifier() then
    raise exception 'Platform verifier access required';
  end if;

  return query
  select
    c.id,
    c.worker_id,
    concat_ws(' ', wp.first_name, wp.middle_name, wp.last_name)::text,
    c.subject_type,
    c.subject_id,
    c.status,
    p.subject_label,
    p.subject_details,
    p.evidence_path,
    p.source_status,
    c.reviewer_request,
    c.worker_note,
    c.created_at,
    c.updated_at
  from public.verification_cases c
  join public.worker_profiles wp on wp.id = c.worker_id
  cross join lateral public._verification_subject_payload(c.subject_type, c.subject_id) p
  where c.status in ('pending','more_information')
  order by
    case c.status when 'more_information' then 1 else 2 end,
    c.updated_at asc;
end;
$$;

revoke all on function public.get_verification_queue() from public;
grant execute on function public.get_verification_queue() to authenticated;

create or replace function public.review_verification_case(
  p_case_id uuid,
  p_action text,
  p_note text default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_case public.verification_cases%rowtype;
  v_action text := lower(btrim(coalesce(p_action,'')));
  v_note text := nullif(btrim(coalesce(p_note,'')), '');
begin
  if not public.is_platform_verifier() then
    raise exception 'Platform verifier access required';
  end if;

  if v_action not in ('verify','request_information','reject') then
    raise exception 'Unsupported verification action';
  end if;

  select * into v_case
  from public.verification_cases
  where id = p_case_id
  for update;

  if v_case.id is null then
    raise exception 'Verification case not found';
  end if;

  if v_action = 'request_information' then
    if v_note is null then
      raise exception 'Explain what information is required';
    end if;

    update public.verification_cases
    set
      status = 'more_information',
      reviewer_request = v_note,
      reviewed_by = auth.uid(),
      reviewed_at = now()
    where id = p_case_id;

    return 'More information requested';
  end if;

  perform set_config('app.verification_context', 'platform', true);

  if v_case.subject_type = 'work_right' then
    update public.worker_work_rights
    set verification_status = case when v_action = 'verify' then 'verified' else 'rejected' end::public.verification_status,
        verified_at = case when v_action = 'verify' then now() else null end
    where id = v_case.subject_id;
  elsif v_case.subject_type = 'licence' then
    update public.worker_licences
    set verification_status = case when v_action = 'verify' then 'verified' else 'rejected' end::public.verification_status,
        verified_at = case when v_action = 'verify' then now() else null end
    where id = v_case.subject_id;
  elsif v_case.subject_type = 'rating' then
    update public.licence_ratings
    set verification_status = case when v_action = 'verify' then 'verified' else 'rejected' end::public.verification_status,
        verified_at = case when v_action = 'verify' then now() else null end
    where id = v_case.subject_id;
  elsif v_case.subject_type = 'training' then
    update public.training_records
    set verification_status = case when v_action = 'verify' then 'verified' else 'rejected' end::public.verification_status,
        verified_at = case when v_action = 'verify' then now() else null end
    where id = v_case.subject_id;
  elsif v_case.subject_type = 'competency' then
    update public.worker_competencies
    set verification_status = case when v_action = 'verify' then 'verified' else 'rejected' end::public.verification_status,
        verified_at = case when v_action = 'verify' then now() else null end
    where id = v_case.subject_id;
  end if;

  update public.verification_cases
  set
    status = case when v_action = 'verify' then 'verified' else 'rejected' end,
    reviewer_request = v_note,
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = p_case_id;

  return case when v_action = 'verify' then 'Verified' else 'Rejected' end;
end;
$$;

revoke all on function public.review_verification_case(uuid, text, text) from public;
grant execute on function public.review_verification_case(uuid, text, text) to authenticated;

create or replace function public.respond_verification_case(
  p_case_id uuid,
  p_note text
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_note text := nullif(btrim(coalesce(p_note,'')), '');
begin
  if v_note is null then
    raise exception 'Enter your response';
  end if;

  update public.verification_cases c
  set
    status = 'pending',
    worker_note = v_note,
    reviewed_by = null,
    reviewed_at = null
  where c.id = p_case_id
    and c.worker_id = auth.uid()
    and c.status = 'more_information';

  if not found then
    raise exception 'No information request was found';
  end if;

  return 'Response sent for verification';
end;
$$;

revoke all on function public.respond_verification_case(uuid, text) from public;
grant execute on function public.respond_verification_case(uuid, text) to authenticated;

-- Keep the verification case table clean when a worker removes a credential.
create or replace function public.remove_verification_case()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_subject_type text;
begin
  v_subject_type := case tg_table_name
    when 'worker_work_rights' then 'work_right'
    when 'worker_licences' then 'licence'
    when 'licence_ratings' then 'rating'
    when 'training_records' then 'training'
    when 'worker_competencies' then 'competency'
    else null
  end;

  if v_subject_type is not null then
    delete from public.verification_cases
    where subject_type = v_subject_type
      and subject_id = old.id;
  end if;
  return old;
end;
$$;

drop trigger if exists work_rights_remove_verification_case on public.worker_work_rights;
create trigger work_rights_remove_verification_case after delete on public.worker_work_rights for each row execute function public.remove_verification_case();
drop trigger if exists licences_remove_verification_case on public.worker_licences;
create trigger licences_remove_verification_case after delete on public.worker_licences for each row execute function public.remove_verification_case();
drop trigger if exists ratings_remove_verification_case on public.licence_ratings;
create trigger ratings_remove_verification_case after delete on public.licence_ratings for each row execute function public.remove_verification_case();
drop trigger if exists training_remove_verification_case on public.training_records;
create trigger training_remove_verification_case after delete on public.training_records for each row execute function public.remove_verification_case();
drop trigger if exists competencies_remove_verification_case on public.worker_competencies;
create trigger competencies_remove_verification_case after delete on public.worker_competencies for each row execute function public.remove_verification_case();

-- =========================================================
-- INTERVIEW ROUNDS
-- =========================================================

create table if not exists public.opportunity_interviews (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  round_number integer not null check (round_number >= 1),
  title text not null,
  status text not null default 'proposed'
    check (status in ('proposed','counter_proposed','confirmed','completed','cancelled')),
  timezone_name text not null,
  channel text not null
    check (channel in ('in_person','microsoft_teams','zoom','google_meet','webex','discord','phone','other')),
  connection_details text,
  duration_minutes integer not null default 60 check (duration_minutes between 10 and 480),
  selected_start_at timestamptz,
  counter_start_at timestamptz,
  counter_timezone_name text,
  outcome_note text,
  created_by uuid not null references auth.users(id),
  confirmed_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(opportunity_id, round_number)
);

create table if not exists public.opportunity_interview_options (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null references public.opportunity_interviews(id) on delete cascade,
  starts_at timestamptz not null,
  sort_order integer not null check (sort_order between 1 and 3),
  created_at timestamptz not null default now(),
  unique(interview_id, sort_order)
);

drop trigger if exists opportunity_interviews_set_updated_at on public.opportunity_interviews;
create trigger opportunity_interviews_set_updated_at
before update on public.opportunity_interviews
for each row execute function public.set_updated_at();

alter table public.opportunity_interviews enable row level security;
alter table public.opportunity_interview_options enable row level security;
revoke all on table public.opportunity_interviews from anon, authenticated;
revoke all on table public.opportunity_interview_options from anon, authenticated;

-- Remove the generic Conversation stage from active V0.13 workflow.
update public.opportunities
set pipeline_stage = 'interested'
where pipeline_stage = 'conversation';

alter table public.opportunities
  drop constraint if exists opportunities_pipeline_stage_check;

alter table public.opportunities
  add constraint opportunities_pipeline_stage_check
  check (pipeline_stage in (
    'approached',
    'interested',
    'interview',
    'offer',
    'accepted',
    'hired',
    'declined',
    'withdrawn',
    'closed'
  ));

create or replace function public._validate_three_interview_options(p_option_starts timestamptz[])
returns void
language plpgsql
immutable
as $$
begin
  if p_option_starts is null or cardinality(p_option_starts) <> 3 then
    raise exception 'Exactly three interview options are required';
  end if;

  if exists (
    select 1 from unnest(p_option_starts) x where x is null
  ) then
    raise exception 'Interview options cannot be empty';
  end if;

  if (select count(distinct x) from unnest(p_option_starts) x) <> 3 then
    raise exception 'Interview options must be different times';
  end if;
end;
$$;

create or replace function public.schedule_interview_round(
  p_opportunity_id uuid,
  p_title text,
  p_timezone_name text,
  p_channel text,
  p_connection_details text,
  p_duration_minutes integer,
  p_option_starts timestamptz[]
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_interview_id uuid;
  v_round integer;
  v_stage text;
  v_channel text := lower(btrim(coalesce(p_channel,'')));
begin
  perform public._validate_three_interview_options(p_option_starts);

  if nullif(btrim(coalesce(p_timezone_name,'')), '') is null then
    raise exception 'Interview timezone is required';
  end if;

  if v_channel not in ('in_person','microsoft_teams','zoom','google_meet','webex','discord','phone','other') then
    raise exception 'Unsupported interview channel';
  end if;

  select o.pipeline_stage
  into v_stage
  from public.opportunities o
  join public.open_demands d on d.id = o.demand_id
  where o.id = p_opportunity_id
    and d.deleted_at is null
    and public.is_org_member(d.organisation_id);

  if v_stage is null then
    raise exception 'Opportunity not found or not authorised';
  end if;

  if v_stage not in ('interested','interview') then
    raise exception 'Interview scheduling starts after the worker is Interested';
  end if;

  if exists (
    select 1
    from public.opportunity_interviews oi
    where oi.opportunity_id = p_opportunity_id
      and oi.status not in ('completed','cancelled')
  ) then
    raise exception 'Complete or cancel the current interview round first';
  end if;

  select coalesce(max(round_number), 0) + 1
  into v_round
  from public.opportunity_interviews
  where opportunity_id = p_opportunity_id;

  insert into public.opportunity_interviews (
    opportunity_id,
    round_number,
    title,
    timezone_name,
    channel,
    connection_details,
    duration_minutes,
    status,
    created_by
  )
  values (
    p_opportunity_id,
    v_round,
    coalesce(nullif(btrim(p_title),''), 'Interview ' || v_round),
    btrim(p_timezone_name),
    v_channel,
    nullif(btrim(coalesce(p_connection_details,'')), ''),
    coalesce(p_duration_minutes, 60),
    'proposed',
    auth.uid()
  )
  returning id into v_interview_id;

  insert into public.opportunity_interview_options (interview_id, starts_at, sort_order)
  select v_interview_id, x.starts_at, x.ordinality::integer
  from unnest(p_option_starts) with ordinality as x(starts_at, ordinality);

  update public.opportunities
  set
    pipeline_stage = 'interview',
    status = 'interview',
    worker_question = null,
    employer_message = null
  where id = p_opportunity_id;

  return v_interview_id;
end;
$$;

revoke all on function public.schedule_interview_round(uuid, text, text, text, text, integer, timestamptz[]) from public;
grant execute on function public.schedule_interview_round(uuid, text, text, text, text, integer, timestamptz[]) to authenticated;

create or replace function public.repropose_interview_round(
  p_interview_id uuid,
  p_timezone_name text,
  p_channel text,
  p_connection_details text,
  p_duration_minutes integer,
  p_option_starts timestamptz[]
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_channel text := lower(btrim(coalesce(p_channel,'')));
begin
  perform public._validate_three_interview_options(p_option_starts);

  if not exists (
    select 1
    from public.opportunity_interviews oi
    join public.opportunities o on o.id = oi.opportunity_id
    join public.open_demands d on d.id = o.demand_id
    where oi.id = p_interview_id
      and oi.status in ('proposed','counter_proposed')
      and d.deleted_at is null
      and public.is_org_member(d.organisation_id)
  ) then
    raise exception 'Interview round not found or cannot be re-proposed';
  end if;

  if v_channel not in ('in_person','microsoft_teams','zoom','google_meet','webex','discord','phone','other') then
    raise exception 'Unsupported interview channel';
  end if;

  delete from public.opportunity_interview_options
  where interview_id = p_interview_id;

  insert into public.opportunity_interview_options (interview_id, starts_at, sort_order)
  select p_interview_id, x.starts_at, x.ordinality::integer
  from unnest(p_option_starts) with ordinality as x(starts_at, ordinality);

  update public.opportunity_interviews
  set
    status = 'proposed',
    timezone_name = btrim(p_timezone_name),
    channel = v_channel,
    connection_details = nullif(btrim(coalesce(p_connection_details,'')), ''),
    duration_minutes = coalesce(p_duration_minutes, 60),
    selected_start_at = null,
    counter_start_at = null,
    counter_timezone_name = null,
    confirmed_at = null
  where id = p_interview_id;

  return p_interview_id;
end;
$$;

revoke all on function public.repropose_interview_round(uuid, text, text, text, integer, timestamptz[]) from public;
grant execute on function public.repropose_interview_round(uuid, text, text, text, integer, timestamptz[]) to authenticated;

create or replace function public.respond_to_interview_round(
  p_interview_id uuid,
  p_action text,
  p_option_id uuid default null,
  p_counter_start timestamptz default null,
  p_counter_timezone_name text default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action text := lower(btrim(coalesce(p_action,'')));
  v_start timestamptz;
begin
  if v_action not in ('accept','counter') then
    raise exception 'Unsupported interview response';
  end if;

  if not exists (
    select 1
    from public.opportunity_interviews oi
    join public.opportunities o on o.id = oi.opportunity_id
    where oi.id = p_interview_id
      and o.worker_id = auth.uid()
      and oi.status = 'proposed'
  ) then
    raise exception 'No interview proposal is awaiting your response';
  end if;

  if v_action = 'accept' then
    select io.starts_at
    into v_start
    from public.opportunity_interview_options io
    where io.id = p_option_id
      and io.interview_id = p_interview_id;

    if v_start is null then
      raise exception 'Choose one of the proposed interview times';
    end if;

    update public.opportunity_interviews
    set
      status = 'confirmed',
      selected_start_at = v_start,
      counter_start_at = null,
      counter_timezone_name = null,
      confirmed_at = now()
    where id = p_interview_id;

    return 'Interview confirmed';
  end if;

  if p_counter_start is null or nullif(btrim(coalesce(p_counter_timezone_name,'')), '') is null then
    raise exception 'Enter your proposed interview time';
  end if;

  update public.opportunity_interviews
  set
    status = 'counter_proposed',
    counter_start_at = p_counter_start,
    counter_timezone_name = btrim(p_counter_timezone_name),
    selected_start_at = null,
    confirmed_at = null
  where id = p_interview_id;

  return 'Counter-proposal sent';
end;
$$;

revoke all on function public.respond_to_interview_round(uuid, text, uuid, timestamptz, text) from public;
grant execute on function public.respond_to_interview_round(uuid, text, uuid, timestamptz, text) to authenticated;

create or replace function public.accept_interview_counter(p_interview_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_counter timestamptz;
begin
  select oi.counter_start_at
  into v_counter
  from public.opportunity_interviews oi
  join public.opportunities o on o.id = oi.opportunity_id
  join public.open_demands d on d.id = o.demand_id
  where oi.id = p_interview_id
    and oi.status = 'counter_proposed'
    and d.deleted_at is null
    and public.is_org_member(d.organisation_id);

  if v_counter is null then
    raise exception 'No counter-proposal is awaiting employer action';
  end if;

  update public.opportunity_interviews
  set
    status = 'confirmed',
    selected_start_at = v_counter,
    confirmed_at = now()
  where id = p_interview_id;

  return 'Counter-proposal accepted';
end;
$$;

revoke all on function public.accept_interview_counter(uuid) from public;
grant execute on function public.accept_interview_counter(uuid) to authenticated;

create or replace function public.complete_interview_round(
  p_interview_id uuid,
  p_outcome_note text default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.opportunity_interviews oi
  set
    status = 'completed',
    outcome_note = nullif(btrim(coalesce(p_outcome_note,'')), ''),
    completed_at = now()
  from public.opportunities o, public.open_demands d
  where oi.id = p_interview_id
    and oi.opportunity_id = o.id
    and o.demand_id = d.id
    and oi.status = 'confirmed'
    and d.deleted_at is null
    and public.is_org_member(d.organisation_id);

  if not found then
    raise exception 'Confirmed interview not found or not authorised';
  end if;

  return 'Interview completed';
end;
$$;

revoke all on function public.complete_interview_round(uuid, text) from public;
grant execute on function public.complete_interview_round(uuid, text) to authenticated;

create or replace function public.cancel_interview_round(p_interview_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.opportunity_interviews oi
  set status = 'cancelled', cancelled_at = now()
  from public.opportunities o, public.open_demands d
  where oi.id = p_interview_id
    and oi.opportunity_id = o.id
    and o.demand_id = d.id
    and oi.status not in ('completed','cancelled')
    and d.deleted_at is null
    and public.is_org_member(d.organisation_id);

  if not found then
    raise exception 'Interview round not found or not authorised';
  end if;

  return 'Interview cancelled';
end;
$$;

revoke all on function public.cancel_interview_round(uuid) from public;
grant execute on function public.cancel_interview_round(uuid) to authenticated;

create or replace function public.get_demand_interview_rounds(p_demand_id uuid)
returns table (
  interview_id uuid,
  opportunity_id uuid,
  round_number integer,
  title text,
  interview_status text,
  timezone_name text,
  channel text,
  connection_details text,
  duration_minutes integer,
  selected_start_at timestamptz,
  counter_start_at timestamptz,
  counter_timezone_name text,
  outcome_note text,
  confirmed_at timestamptz,
  completed_at timestamptz,
  options jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.open_demands d
    where d.id = p_demand_id
      and d.deleted_at is null
      and public.is_org_member(d.organisation_id)
  ) then
    raise exception 'Not authorised for this demand';
  end if;

  return query
  select
    oi.id,
    oi.opportunity_id,
    oi.round_number,
    oi.title,
    oi.status,
    oi.timezone_name,
    oi.channel,
    oi.connection_details,
    oi.duration_minutes,
    oi.selected_start_at,
    oi.counter_start_at,
    oi.counter_timezone_name,
    oi.outcome_note,
    oi.confirmed_at,
    oi.completed_at,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', io.id,
          'starts_at', io.starts_at,
          'sort_order', io.sort_order
        )
        order by io.sort_order
      )
      from public.opportunity_interview_options io
      where io.interview_id = oi.id
    ), '[]'::jsonb)
  from public.opportunity_interviews oi
  join public.opportunities o on o.id = oi.opportunity_id
  where o.demand_id = p_demand_id
  order by oi.opportunity_id, oi.round_number;
end;
$$;

revoke all on function public.get_demand_interview_rounds(uuid) from public;
grant execute on function public.get_demand_interview_rounds(uuid) to authenticated;

create or replace function public.get_my_interview_rounds()
returns table (
  interview_id uuid,
  opportunity_id uuid,
  round_number integer,
  title text,
  interview_status text,
  timezone_name text,
  channel text,
  connection_details text,
  duration_minutes integer,
  selected_start_at timestamptz,
  counter_start_at timestamptz,
  counter_timezone_name text,
  outcome_note text,
  confirmed_at timestamptz,
  completed_at timestamptz,
  options jsonb
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    oi.id,
    oi.opportunity_id,
    oi.round_number,
    oi.title,
    oi.status,
    oi.timezone_name,
    oi.channel,
    oi.connection_details,
    oi.duration_minutes,
    oi.selected_start_at,
    oi.counter_start_at,
    oi.counter_timezone_name,
    oi.outcome_note,
    oi.confirmed_at,
    oi.completed_at,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', io.id,
          'starts_at', io.starts_at,
          'sort_order', io.sort_order
        )
        order by io.sort_order
      )
      from public.opportunity_interview_options io
      where io.interview_id = oi.id
    ), '[]'::jsonb)
  from public.opportunity_interviews oi
  join public.opportunities o on o.id = oi.opportunity_id
  where o.worker_id = auth.uid()
  order by oi.opportunity_id, oi.round_number;
$$;

revoke all on function public.get_my_interview_rounds() from public;
grant execute on function public.get_my_interview_rounds() to authenticated;

-- =========================================================
-- UPDATED PIPELINE / ACTION RESPONSIBILITY
-- =========================================================

create or replace function public.advance_candidate_pipeline(
  p_opportunity_id uuid,
  p_stage text
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_stage text := lower(btrim(coalesce(p_stage,'')));
  v_current text;
  v_demand_id uuid;
  v_hired_at timestamptz;
  v_remaining integer;
begin
  if v_stage not in ('hired','withdrawn','closed') then
    raise exception 'Interview progression is controlled by the interview scheduler';
  end if;

  select o.pipeline_stage, o.demand_id, o.hired_at
  into v_current, v_demand_id, v_hired_at
  from public.opportunities o
  join public.open_demands d on d.id = o.demand_id
  where o.id = p_opportunity_id
    and d.deleted_at is null
    and public.is_org_member(d.organisation_id);

  if v_demand_id is null then
    raise exception 'Opportunity not found or not authorised';
  end if;

  if v_stage = 'hired' and v_current <> 'accepted' then
    raise exception 'A worker can be marked Hired only after accepting the formal offer';
  end if;

  if v_stage in ('withdrawn','closed') and v_current in ('hired','declined','withdrawn','closed') then
    raise exception 'This candidate is already in a terminal stage';
  end if;

  if v_stage = 'hired' then
    if v_hired_at is not null then
      return 'Hired';
    end if;

    update public.opportunities
    set pipeline_stage = 'hired', hired_at = now()
    where id = p_opportunity_id and hired_at is null;

    if found then
      update public.open_demands d
      set
        positions_remaining = greatest(0, d.positions_remaining - 1),
        status = case
          when greatest(0, d.positions_remaining - 1) = 0 then 'filled'::public.demand_status
          else d.status
        end
      where d.id = v_demand_id
      returning d.positions_remaining into v_remaining;
    end if;

    return 'Hired';
  end if;

  update public.opportunities
  set
    pipeline_stage = v_stage,
    status = case
      when v_stage = 'withdrawn' then 'withdrawn'::public.opportunity_status
      when v_stage = 'closed' then 'closed'::public.opportunity_status
      else status
    end
  where id = p_opportunity_id;

  if v_stage = 'withdrawn' then
    update public.opportunity_offers
    set offer_status = 'withdrawn'
    where opportunity_id = p_opportunity_id
      and offer_status = 'sent';
  end if;

  return initcap(v_stage);
end;
$$;

revoke all on function public.advance_candidate_pipeline(uuid, text) from public;
grant execute on function public.advance_candidate_pipeline(uuid, text) to authenticated;

-- Formal offers now follow at least one completed interview round.
create or replace function public.send_structured_offer(
  p_opportunity_id uuid,
  p_base_compensation numeric,
  p_currency_code text,
  p_period text,
  p_employment_type text,
  p_start_date date default null,
  p_roster jsonb default '{}'::jsonb,
  p_allowances jsonb default '[]'::jsonb,
  p_benefits text[] default '{}'::text[]
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_offer_id uuid;
  v_stage text;
  v_period public.money_period;
  v_employment_type public.employment_type;
  v_currency text := upper(btrim(coalesce(p_currency_code,'')));
begin
  if p_base_compensation is null or p_base_compensation < 0 then
    raise exception 'Enter a valid base compensation amount';
  end if;
  if char_length(v_currency) <> 3 then
    raise exception 'Currency must use a 3-letter code';
  end if;

  begin v_period := p_period::public.money_period;
  exception when others then raise exception 'Unsupported compensation period';
  end;

  begin v_employment_type := p_employment_type::public.employment_type;
  exception when others then raise exception 'Unsupported employment type';
  end;

  select o.pipeline_stage
  into v_stage
  from public.opportunities o
  join public.open_demands d on d.id = o.demand_id
  where o.id = p_opportunity_id
    and d.deleted_at is null
    and public.is_org_member(d.organisation_id);

  if v_stage is null then
    raise exception 'Opportunity not found or not authorised';
  end if;

  if v_stage = 'interview' and not exists (
    select 1
    from public.opportunity_interviews oi
    where oi.opportunity_id = p_opportunity_id
      and oi.status = 'completed'
  ) then
    raise exception 'Complete at least one interview before sending a formal offer';
  end if;

  if v_stage not in ('interview','offer') then
    raise exception 'A formal offer follows the interview stage';
  end if;

  insert into public.opportunity_offers (
    opportunity_id, base_compensation, currency_code, period, employment_type,
    start_date, roster, allowances, benefits, offer_status, created_by,
    sent_at, accepted_at, declined_at
  )
  values (
    p_opportunity_id, p_base_compensation, v_currency, v_period, v_employment_type,
    p_start_date, coalesce(p_roster, '{}'::jsonb), coalesce(p_allowances, '[]'::jsonb),
    coalesce(p_benefits, '{}'::text[]), 'sent', auth.uid(), now(), null, null
  )
  on conflict (opportunity_id) do update
  set
    base_compensation = excluded.base_compensation,
    currency_code = excluded.currency_code,
    period = excluded.period,
    employment_type = excluded.employment_type,
    start_date = excluded.start_date,
    roster = excluded.roster,
    allowances = excluded.allowances,
    benefits = excluded.benefits,
    offer_status = 'sent',
    created_by = auth.uid(),
    sent_at = now(),
    accepted_at = null,
    declined_at = null
  returning id into v_offer_id;

  update public.opportunities
  set
    pipeline_stage = 'offer',
    status = 'offer',
    worker_question = null,
    employer_message = null
  where id = p_opportunity_id;

  return v_offer_id;
end;
$$;

revoke all on function public.send_structured_offer(uuid, numeric, text, text, text, date, jsonb, jsonb, text[]) from public;
grant execute on function public.send_structured_offer(uuid, numeric, text, text, text, date, jsonb, jsonb, text[]) to authenticated;

create or replace function public.get_my_worker_action_count()
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(distinct x.action_key)::integer
  from (
    select 'opportunity:' || o.id::text as action_key
    from public.opportunities o
    left join public.opportunity_offers oo on oo.opportunity_id = o.id
    where o.worker_id = auth.uid()
      and (
        (
          o.pipeline_stage = 'approached'
          and (
            o.status::text in ('sent','viewed')
            or (o.status::text = 'question' and o.employer_message is not null)
          )
        )
        or (
          o.pipeline_stage = 'offer'
          and oo.offer_status = 'sent'
          and (o.worker_question is null or o.employer_message is not null)
        )
      )

    union all

    select 'interview:' || oi.id::text
    from public.opportunity_interviews oi
    join public.opportunities o on o.id = oi.opportunity_id
    where o.worker_id = auth.uid()
      and oi.status = 'proposed'
  ) x;
$$;

revoke all on function public.get_my_worker_action_count() from public;
grant execute on function public.get_my_worker_action_count() to authenticated;

create or replace function public.get_my_employer_action_counts()
returns table (
  demand_id uuid,
  action_count integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with actions as (
    select o.demand_id, 'opportunity:' || o.id::text as action_key
    from public.opportunities o
    join public.open_demands d on d.id = o.demand_id
    where d.deleted_at is null
      and public.is_org_member(d.organisation_id)
      and (
        o.pipeline_stage = 'interested'
        or o.pipeline_stage = 'accepted'
        or (
          o.worker_question is not null
          and o.employer_message is null
          and o.pipeline_stage not in ('declined','withdrawn','closed','hired')
        )
      )

    union all

    select o.demand_id, 'interview-counter:' || oi.id::text
    from public.opportunity_interviews oi
    join public.opportunities o on o.id = oi.opportunity_id
    join public.open_demands d on d.id = o.demand_id
    where d.deleted_at is null
      and public.is_org_member(d.organisation_id)
      and oi.status = 'counter_proposed'

    union all

    select o.demand_id, 'interview-complete:' || oi.id::text
    from public.opportunity_interviews oi
    join public.opportunities o on o.id = oi.opportunity_id
    join public.open_demands d on d.id = o.demand_id
    where d.deleted_at is null
      and public.is_org_member(d.organisation_id)
      and oi.status = 'confirmed'
      and oi.selected_start_at <= now()

    union all

    -- After an interview is marked completed, HR still owns the next decision:
    -- schedule another round, send an offer, withdraw, or close.
    select o.demand_id, 'post-interview:' || o.id::text
    from public.opportunities o
    join public.open_demands d on d.id = o.demand_id
    where d.deleted_at is null
      and public.is_org_member(d.organisation_id)
      and o.pipeline_stage = 'interview'
      and exists (
        select 1 from public.opportunity_interviews done
        where done.opportunity_id = o.id
          and done.status = 'completed'
      )
      and not exists (
        select 1 from public.opportunity_interviews active
        where active.opportunity_id = o.id
          and active.status not in ('completed','cancelled')
      )
  )
  select a.demand_id::uuid, count(distinct a.action_key)::integer
  from actions a
  group by a.demand_id;
$$;

revoke all on function public.get_my_employer_action_counts() from public;
grant execute on function public.get_my_employer_action_counts() to authenticated;


create or replace function public.get_interview_rounds_for_opportunity(p_opportunity_id uuid)
returns table (
  interview_id uuid,
  opportunity_id uuid,
  round_number integer,
  title text,
  interview_status text,
  timezone_name text,
  channel text,
  connection_details text,
  duration_minutes integer,
  selected_start_at timestamptz,
  counter_start_at timestamptz,
  counter_timezone_name text,
  outcome_note text,
  confirmed_at timestamptz,
  completed_at timestamptz,
  options jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.opportunities o
    join public.open_demands d on d.id = o.demand_id
    where o.id = p_opportunity_id
      and d.deleted_at is null
      and public.is_org_member(d.organisation_id)
  ) then
    raise exception 'Not authorised for this opportunity';
  end if;

  return query
  select
    oi.id,
    oi.opportunity_id,
    oi.round_number,
    oi.title,
    oi.status,
    oi.timezone_name,
    oi.channel,
    oi.connection_details,
    oi.duration_minutes,
    oi.selected_start_at,
    oi.counter_start_at,
    oi.counter_timezone_name,
    oi.outcome_note,
    oi.confirmed_at,
    oi.completed_at,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', io.id,
          'starts_at', io.starts_at,
          'sort_order', io.sort_order
        )
        order by io.sort_order
      )
      from public.opportunity_interview_options io
      where io.interview_id = oi.id
    ), '[]'::jsonb)
  from public.opportunity_interviews oi
  where oi.opportunity_id = p_opportunity_id
  order by oi.round_number;
end;
$$;

revoke all on function public.get_interview_rounds_for_opportunity(uuid) from public;
grant execute on function public.get_interview_rounds_for_opportunity(uuid) to authenticated;
