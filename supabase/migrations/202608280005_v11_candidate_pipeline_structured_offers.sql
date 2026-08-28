-- AVIATION PASSPORT V0.11 — Candidate Pipeline + Structured Offers
-- Run once after V0.10.
--
-- Keeps the worker response status and the employer hiring stage separate:
-- Opportunity status = communication/worker response.
-- Pipeline stage    = hiring progress.
--
-- Hiring flow:
-- Approached -> Interested -> Conversation -> Interview -> Offer -> Accepted -> Hired
-- Exit states: Declined / Withdrawn / Closed.
--
-- A Hire automatically decrements positions_remaining exactly once and marks
-- the Open Demand Filled when no positions remain.

-- =========================================================
-- PIPELINE STATE
-- =========================================================

alter table public.opportunities
  add column if not exists pipeline_stage text not null default 'approached',
  add column if not exists hired_at timestamptz;

alter table public.opportunities
  drop constraint if exists opportunities_pipeline_stage_check;

alter table public.opportunities
  add constraint opportunities_pipeline_stage_check
  check (pipeline_stage in (
    'approached',
    'interested',
    'conversation',
    'interview',
    'offer',
    'accepted',
    'hired',
    'declined',
    'withdrawn',
    'closed'
  ));

-- Backfill anything created before V0.11.
update public.opportunities
set pipeline_stage = case status::text
  when 'interested' then 'interested'
  when 'interview' then 'interview'
  when 'offer' then 'offer'
  when 'accepted' then 'accepted'
  when 'declined' then 'declined'
  when 'withdrawn' then 'withdrawn'
  when 'closed' then 'closed'
  else 'approached'
end
where pipeline_stage = 'approached';

-- =========================================================
-- STRUCTURED OFFER
-- =========================================================

create table if not exists public.opportunity_offers (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null unique references public.opportunities(id) on delete cascade,
  base_compensation numeric(14,2) not null check (base_compensation >= 0),
  currency_code char(3) not null,
  period public.money_period not null,
  employment_type public.employment_type not null,
  start_date date,
  roster jsonb not null default '{}'::jsonb,
  allowances jsonb not null default '[]'::jsonb,
  benefits text[] not null default '{}'::text[],
  offer_status text not null default 'sent'
    check (offer_status in ('sent','accepted','declined','withdrawn')),
  created_by uuid not null references auth.users(id),
  sent_at timestamptz not null default now(),
  accepted_at timestamptz,
  declined_at timestamptz,
  updated_at timestamptz not null default now()
);

drop trigger if exists opportunity_offers_set_updated_at on public.opportunity_offers;
create trigger opportunity_offers_set_updated_at
before update on public.opportunity_offers
for each row execute function public.set_updated_at();

alter table public.opportunity_offers enable row level security;

-- Direct table access is intentionally unavailable. Employer and worker
-- interaction goes through demand-bound / worker-bound security-definer RPCs.
revoke all on table public.opportunity_offers from anon, authenticated;

-- =========================================================
-- EXISTING WORKER RESPONSE RPC: ALSO MAINTAIN PIPELINE STAGE
-- =========================================================

create or replace function public.respond_to_opportunity(
  p_opportunity_id uuid,
  p_action text,
  p_question text default null
)
returns table (
  status public.opportunity_status,
  identity_revealed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action text := lower(btrim(coalesce(p_action, '')));
begin
  if v_action not in ('interested','question','declined') then
    raise exception 'Unsupported opportunity response';
  end if;

  if v_action = 'question' and nullif(btrim(coalesce(p_question,'')), '') is null then
    raise exception 'Enter your question first';
  end if;

  if not exists (
    select 1
    from public.opportunities o
    where o.id = p_opportunity_id
      and o.worker_id = auth.uid()
      and o.pipeline_stage = 'approached'
  ) then
    raise exception 'This opportunity can no longer receive an initial response';
  end if;

  update public.opportunities o
  set
    status = v_action::public.opportunity_status,
    pipeline_stage = case
      when v_action = 'interested' then 'interested'
      when v_action = 'declined' then 'declined'
      else o.pipeline_stage
    end,
    worker_question = case
      when v_action = 'question' then btrim(p_question)
      else o.worker_question
    end,
    employer_message = case
      when v_action = 'question' then null
      else o.employer_message
    end,
    responded_at = now(),
    viewed_at = coalesce(o.viewed_at, now()),
    identity_revealed_at = case
      when v_action = 'interested' then coalesce(o.identity_revealed_at, now())
      else o.identity_revealed_at
    end
  where o.id = p_opportunity_id
    and o.worker_id = auth.uid();

  return query
  select
    o.status,
    (o.identity_revealed_at is not null)::boolean
  from public.opportunities o
  where o.id = p_opportunity_id
    and o.worker_id = auth.uid();
end;
$$;

revoke all on function public.respond_to_opportunity(uuid, text, text) from public;
grant execute on function public.respond_to_opportunity(uuid, text, text) to authenticated;

-- =========================================================
-- EMPLOYER: CANDIDATE PIPELINE
-- =========================================================

create or replace function public.get_demand_candidate_pipeline(p_demand_id uuid)
returns table (
  opportunity_id uuid,
  match_ref text,
  pipeline_stage text,
  opportunity_status public.opportunity_status,
  sent_at timestamptz,
  viewed_at timestamptz,
  responded_at timestamptz,
  identity_revealed boolean,
  is_anonymous boolean,
  worker_id uuid,
  first_name text,
  middle_name text,
  last_name text,
  professional_headline text,
  worker_question text,
  employer_reply text,
  offer_id uuid,
  offer_status text,
  offer_base_compensation numeric,
  offer_currency char(3),
  offer_period public.money_period,
  offer_employment_type public.employment_type,
  offer_start_date date,
  offer_roster jsonb,
  offer_allowances jsonb,
  offer_benefits text[],
  offer_sent_at timestamptz,
  offer_accepted_at timestamptz,
  offer_declined_at timestamptz,
  hired_at timestamptz
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
    o.id::uuid,
    pg_catalog.md5(p_demand_id::text || ':' || o.worker_id::text)::text,
    o.pipeline_stage::text,
    o.status,
    o.sent_at,
    o.viewed_at,
    o.responded_at,
    (o.identity_revealed_at is not null)::boolean,
    (wp.visibility = 'anonymous_market' and o.identity_revealed_at is null)::boolean,
    case
      when wp.visibility = 'anonymous_market' and o.identity_revealed_at is null then null::uuid
      else wp.id::uuid
    end,
    case when wp.visibility = 'anonymous_market' and o.identity_revealed_at is null then null::text else wp.first_name::text end,
    case when wp.visibility = 'anonymous_market' and o.identity_revealed_at is null then null::text else wp.middle_name::text end,
    case when wp.visibility = 'anonymous_market' and o.identity_revealed_at is null then null::text else wp.last_name::text end,
    case when wp.visibility = 'anonymous_market' and o.identity_revealed_at is null then null::text else wp.professional_headline::text end,
    o.worker_question::text,
    o.employer_message::text,
    oo.id::uuid,
    oo.offer_status::text,
    oo.base_compensation::numeric,
    oo.currency_code::char(3),
    oo.period,
    oo.employment_type,
    oo.start_date::date,
    oo.roster,
    oo.allowances,
    oo.benefits::text[],
    oo.sent_at,
    oo.accepted_at,
    oo.declined_at,
    o.hired_at
  from public.opportunities o
  join public.worker_profiles wp on wp.id = o.worker_id
  left join public.opportunity_offers oo on oo.opportunity_id = o.id
  where o.demand_id = p_demand_id
  order by
    case o.pipeline_stage
      when 'accepted' then 1
      when 'offer' then 2
      when 'interview' then 3
      when 'conversation' then 4
      when 'interested' then 5
      when 'approached' then 6
      when 'hired' then 7
      else 8
    end,
    o.sent_at desc;
end;
$$;

revoke all on function public.get_demand_candidate_pipeline(uuid) from public;
grant execute on function public.get_demand_candidate_pipeline(uuid) to authenticated;

-- =========================================================
-- EMPLOYER: ADVANCE / CLOSE PIPELINE
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
  if v_stage not in ('conversation','interview','hired','withdrawn','closed') then
    raise exception 'Unsupported pipeline stage';
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

  if v_stage = 'conversation' and v_current <> 'interested' then
    raise exception 'Conversation can start only after the worker is Interested';
  end if;

  if v_stage = 'interview' and v_current not in ('interested','conversation') then
    raise exception 'Interview requires an Interested or Conversation-stage candidate';
  end if;

  if v_stage = 'hired' and v_current <> 'accepted' then
    raise exception 'A worker can be marked Hired only after accepting the structured offer';
  end if;

  if v_stage in ('withdrawn','closed') and v_current in ('hired','declined','withdrawn','closed') then
    raise exception 'This candidate is already in a terminal stage';
  end if;

  if v_stage = 'hired' then
    if v_hired_at is not null then
      return 'Hired';
    end if;

    update public.opportunities
    set
      pipeline_stage = 'hired',
      hired_at = now()
    where id = p_opportunity_id
      and hired_at is null;

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
      when v_stage = 'interview' then 'interview'::public.opportunity_status
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

  return initcap(replace(v_stage, '_', ' '));
end;
$$;

revoke all on function public.advance_candidate_pipeline(uuid, text) from public;
grant execute on function public.advance_candidate_pipeline(uuid, text) to authenticated;

-- =========================================================
-- EMPLOYER: SEND / UPDATE A STRUCTURED OFFER
-- =========================================================

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

  begin
    v_period := p_period::public.money_period;
  exception when others then
    raise exception 'Unsupported compensation period';
  end;

  begin
    v_employment_type := p_employment_type::public.employment_type;
  exception when others then
    raise exception 'Unsupported employment type';
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

  if v_stage not in ('interested','conversation','interview','offer') then
    raise exception 'A structured offer can be sent only to an active Interested candidate';
  end if;

  insert into public.opportunity_offers (
    opportunity_id,
    base_compensation,
    currency_code,
    period,
    employment_type,
    start_date,
    roster,
    allowances,
    benefits,
    offer_status,
    created_by,
    sent_at,
    accepted_at,
    declined_at
  )
  values (
    p_opportunity_id,
    p_base_compensation,
    v_currency,
    v_period,
    v_employment_type,
    p_start_date,
    coalesce(p_roster, '{}'::jsonb),
    coalesce(p_allowances, '[]'::jsonb),
    coalesce(p_benefits, '{}'::text[]),
    'sent',
    auth.uid(),
    now(),
    null,
    null
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
    employer_message = null
  where id = p_opportunity_id;

  return v_offer_id;
end;
$$;

revoke all on function public.send_structured_offer(uuid, numeric, text, text, text, date, jsonb, jsonb, text[]) from public;
grant execute on function public.send_structured_offer(uuid, numeric, text, text, text, date, jsonb, jsonb, text[]) to authenticated;

-- =========================================================
-- WORKER: RESPOND TO FORMAL OFFER
-- =========================================================

create or replace function public.respond_to_structured_offer(
  p_opportunity_id uuid,
  p_action text,
  p_question text default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action text := lower(btrim(coalesce(p_action,'')));
begin
  if v_action not in ('accept','decline','question') then
    raise exception 'Unsupported offer response';
  end if;

  if v_action = 'question' and nullif(btrim(coalesce(p_question,'')), '') is null then
    raise exception 'Enter your question first';
  end if;

  if not exists (
    select 1
    from public.opportunities o
    join public.opportunity_offers oo on oo.opportunity_id = o.id
    where o.id = p_opportunity_id
      and o.worker_id = auth.uid()
      and o.pipeline_stage = 'offer'
      and oo.offer_status = 'sent'
  ) then
    raise exception 'No active structured offer was found';
  end if;

  if v_action = 'accept' then
    update public.opportunity_offers
    set
      offer_status = 'accepted',
      accepted_at = now()
    where opportunity_id = p_opportunity_id;

    update public.opportunities
    set
      pipeline_stage = 'accepted',
      status = 'accepted',
      responded_at = now(),
      worker_question = null,
      employer_message = null
    where id = p_opportunity_id
      and worker_id = auth.uid();

    return 'Offer accepted';
  end if;

  if v_action = 'decline' then
    update public.opportunity_offers
    set
      offer_status = 'declined',
      declined_at = now()
    where opportunity_id = p_opportunity_id;

    update public.opportunities
    set
      pipeline_stage = 'declined',
      status = 'declined',
      responded_at = now()
    where id = p_opportunity_id
      and worker_id = auth.uid();

    return 'Offer declined';
  end if;

  update public.opportunities
  set
    worker_question = btrim(p_question),
    employer_message = null,
    responded_at = now()
  where id = p_opportunity_id
    and worker_id = auth.uid();

  return 'Question sent';
end;
$$;

revoke all on function public.respond_to_structured_offer(uuid, text, text) from public;
grant execute on function public.respond_to_structured_offer(uuid, text, text) to authenticated;

-- Employer replies now work for both an initial anonymous question and a
-- question about a live formal offer.
create or replace function public.reply_to_opportunity_question(
  p_demand_id uuid,
  p_match_ref text,
  p_reply text
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_worker_id uuid;
  v_reply text := nullif(btrim(coalesce(p_reply,'')), '');
begin
  if v_reply is null then
    raise exception 'Enter a reply first';
  end if;

  if not exists (
    select 1
    from public.open_demands d
    where d.id = p_demand_id
      and d.deleted_at is null
      and public.is_org_member(d.organisation_id)
  ) then
    raise exception 'Not authorised for this demand';
  end if;

  select o.worker_id
  into v_worker_id
  from public.opportunities o
  where o.demand_id = p_demand_id
    and pg_catalog.md5(p_demand_id::text || ':' || o.worker_id::text) = lower(btrim(p_match_ref))
  limit 1;

  if v_worker_id is null then
    raise exception 'Opportunity not found';
  end if;

  update public.opportunities o
  set employer_message = v_reply
  where o.demand_id = p_demand_id
    and o.worker_id = v_worker_id
    and o.worker_question is not null
    and o.pipeline_stage not in ('declined','withdrawn','closed','hired');

  if not found then
    raise exception 'There is no open worker question for this opportunity';
  end if;

  return v_reply;
end;
$$;

revoke all on function public.reply_to_opportunity_question(uuid, text, text) from public;
grant execute on function public.reply_to_opportunity_question(uuid, text, text) to authenticated;

-- =========================================================
-- WORKER OPPORTUNITY INBOX WITH PIPELINE + FORMAL OFFER
-- =========================================================

drop function if exists public.get_my_opportunities();

create or replace function public.get_my_opportunities()
returns table (
  opportunity_id uuid,
  status public.opportunity_status,
  pipeline_stage text,
  sent_at timestamptz,
  viewed_at timestamptz,
  responded_at timestamptz,
  worker_question text,
  employer_reply text,
  identity_revealed boolean,
  worker_visibility text,
  demand_id uuid,
  organisation_name text,
  organisation_verified boolean,
  public_title text,
  profession text,
  discipline text,
  employment_type text,
  city text,
  country_code char(2),
  sponsorship_available boolean,
  relocation_assistance boolean,
  expected_start_date date,
  roster jsonb,
  compensation_min numeric,
  compensation_max numeric,
  compensation_currency char(3),
  compensation_period public.money_period,
  mandatory_requirements text[],
  trainable_gaps text[],
  preferred_gaps text[],
  demand_benefits text[],
  offer_id uuid,
  offer_status text,
  offer_base_compensation numeric,
  offer_currency char(3),
  offer_period public.money_period,
  offer_employment_type public.employment_type,
  offer_start_date date,
  offer_roster jsonb,
  offer_allowances jsonb,
  offer_benefits text[],
  offer_sent_at timestamptz,
  offer_accepted_at timestamptz,
  hired_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.opportunities o
  set
    viewed_at = coalesce(o.viewed_at, now()),
    status = case when o.status = 'sent' then 'viewed'::public.opportunity_status else o.status end
  where o.worker_id = auth.uid()
    and o.status in ('sent','viewed');

  return query
  select
    o.id::uuid,
    o.status,
    o.pipeline_stage::text,
    o.sent_at,
    o.viewed_at,
    o.responded_at,
    o.worker_question::text,
    o.employer_message::text,
    (o.identity_revealed_at is not null)::boolean,
    wp.visibility::text,
    d.id::uuid,
    org.name::text,
    org.verified::boolean,
    d.public_title::text,
    d.profession::text,
    d.discipline::text,
    d.employment_type::text,
    d.city::text,
    d.country_code::char(2),
    d.sponsorship_available::boolean,
    d.relocation_assistance::boolean,
    d.expected_start_date::date,
    d.roster,
    bc.amount_min::numeric,
    bc.amount_max::numeric,
    bc.currency_code::char(3),
    bc.period,
    public._demand_requirement_labels(d.id, 'mandatory')::text[],
    public._worker_demand_gaps(wp.id, d.id, 'trainable')::text[],
    public._worker_demand_gaps(wp.id, d.id, 'preferred')::text[],
    coalesce((
      select array_agg(db.label order by db.label)
      from public.demand_benefits db
      where db.demand_id = d.id
    ), '{}'::text[]),
    oo.id::uuid,
    oo.offer_status::text,
    oo.base_compensation::numeric,
    oo.currency_code::char(3),
    oo.period,
    oo.employment_type,
    oo.start_date::date,
    oo.roster,
    oo.allowances,
    oo.benefits::text[],
    oo.sent_at,
    oo.accepted_at,
    o.hired_at
  from public.opportunities o
  join public.worker_profiles wp on wp.id = o.worker_id
  join public.open_demands d on d.id = o.demand_id
  join public.organisations org on org.id = d.organisation_id
  left join lateral (
    select dc.*
    from public.demand_compensation_components dc
    where dc.demand_id = d.id
      and dc.component_type = 'base_salary'
    order by dc.id
    limit 1
  ) bc on true
  left join public.opportunity_offers oo on oo.opportunity_id = o.id
  where o.worker_id = auth.uid()
  order by o.sent_at desc;
end;
$$;

revoke all on function public.get_my_opportunities() from public;
grant execute on function public.get_my_opportunities() to authenticated;
