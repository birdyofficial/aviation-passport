-- AVIATION PASSPORT V0.10 — Structured Opportunities + Compatibility Signals
-- Run once after V0.9.3.
--
-- Adds:
-- 1. meaningful Work Rights and Availability compatibility signals;
-- 2. demand-bound structured opportunity sending;
-- 3. worker opportunity inbox and response flow;
-- 4. anonymous-market identity reveal only when the worker chooses Interested;
-- 5. tighter Opportunity RLS so employers cannot bypass the demand-bound RPC.

-- =========================================================
-- OPPORTUNITY PRIVACY / RESPONSE STATE
-- =========================================================

alter table public.opportunities
  add column if not exists identity_revealed_at timestamptz;

-- Employers should not directly read worker_id from opportunity rows or insert
-- arbitrary worker ids. All employer access now goes through controlled RPCs.
drop policy if exists "org members read opportunities for own demand"
  on public.opportunities;

drop policy if exists "org members send opportunities from own demand"
  on public.opportunities;

-- Workers respond through a restricted RPC so they cannot rewrite employer-
-- controlled fields such as demand_id, worker_id or sent_by.
drop policy if exists "worker updates own opportunity response"
  on public.opportunities;

-- =========================================================
-- REQUIREMENT LABELS FOR THE WORKER OPPORTUNITY CARD
-- =========================================================

create or replace function public._demand_requirement_labels(
  p_demand_id uuid,
  p_level public.requirement_level
)
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(x.label order by x.label), '{}'::text[])
  from (
    select 'Environment · ' || e.label as label
    from public.demand_environments req
    join public.environments e on e.id = req.environment_id
    where req.demand_id = p_demand_id
      and req.requirement_level = p_level

    union all

    select 'Licence · ' ||
      coalesce(
        nullif(req.category_privileges, ''),
        nullif(req.licence_scheme, ''),
        nullif(req.issuing_authority_name, ''),
        'Required licence'
      )
    from public.demand_licence_requirements req
    where req.demand_id = p_demand_id
      and req.requirement_level = p_level

    union all

    select 'Aircraft experience · ' || coalesce(af.display_name, req.custom_aircraft_family, 'Aircraft')
    from public.demand_aircraft_requirements req
    left join public.aircraft_families af on af.id = req.aircraft_family_id
    where req.demand_id = p_demand_id
      and req.experience_requirement = p_level

    union all

    select 'Aircraft rating · ' || coalesce(af.display_name, req.custom_aircraft_family, 'Aircraft')
    from public.demand_aircraft_requirements req
    left join public.aircraft_families af on af.id = req.aircraft_family_id
    where req.demand_id = p_demand_id
      and req.rating_requirement = p_level

    union all

    select 'Company authorisation · ' || coalesce(af.display_name, req.custom_aircraft_family, 'Aircraft')
    from public.demand_aircraft_requirements req
    left join public.aircraft_families af on af.id = req.aircraft_family_id
    where req.demand_id = p_demand_id
      and req.authorisation_requirement = p_level

    union all

    select 'Competency · ' || coalesce(cc.label, req.custom_competency_name, 'Competency')
    from public.demand_competency_requirements req
    left join public.competency_catalog cc on cc.id = req.competency_id
    where req.demand_id = p_demand_id
      and req.requirement_level = p_level

    union all

    select 'Training · ' || req.training_name
    from public.demand_training_requirements req
    where req.demand_id = p_demand_id
      and req.requirement_level = p_level
  ) x;
$$;

revoke all on function public._demand_requirement_labels(uuid, public.requirement_level) from public;

-- =========================================================
-- TALENT MATCHES WITH WORK-RIGHT + AVAILABILITY SIGNALS
-- =========================================================

drop function if exists public.get_demand_talent_matches(uuid);

create or replace function public.get_demand_talent_matches(p_demand_id uuid)
returns table (
  match_ref text,
  worker_id uuid,
  is_anonymous boolean,
  first_name text,
  middle_name text,
  last_name text,
  professional_headline text,
  current_city text,
  current_country_code char(2),
  market_status public.market_status,
  match_label text,
  trust_label text,
  work_right_label text,
  work_right_state text,
  work_right_compatible boolean,
  location_label text,
  location_compatible boolean,
  availability_label text,
  availability_compatible boolean,
  available_from date,
  expected_start_date date,
  earliest_start_date date,
  notice_value integer,
  notice_unit text,
  compensation_label text,
  compensation_compatible boolean,
  visible_minimum_compensation numeric,
  visible_minimum_currency char(3),
  visible_minimum_period public.money_period,
  opportunity_id uuid,
  opportunity_status public.opportunity_status,
  opportunity_sent_at timestamptz,
  identity_revealed boolean,
  worker_question text,
  employer_reply text,
  trainable_gap_count integer,
  preferred_gap_count integer,
  trainable_gaps text[],
  preferred_gaps text[],
  verified_match boolean
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
      and d.status = 'open'
      and public.is_org_member(d.organisation_id)
  ) then
    raise exception 'Talent access requires an active Open Demand belonging to your organisation';
  end if;

  return query
  with
  demand as (
    select d.*
    from public.open_demands d
    where d.id = p_demand_id
      and d.deleted_at is null
      and d.status = 'open'
  ),
  base_comp as (
    select dc.*
    from public.demand_compensation_components dc
    where dc.demand_id = p_demand_id
      and dc.component_type = 'base_salary'
    order by dc.id
    limit 1
  ),
  eligible as (
    select
      wp.*,
      wmp.earliest_start_date,
      wmp.notice_days,
      wmp.notice_value,
      wmp.notice_unit,
      wmp.minimum_compensation,
      wmp.minimum_compensation_currency,
      wmp.minimum_compensation_period,
      wmp.compensation_visibility,
      wmp.willing_to_relocate,
      wmp.willing_fifo,
      wmp.willing_dido,
      wmp.willing_commute,
      wmp.willing_international,
      wmp.willing_temporary_assignment,
      lp.preference as location_preference,
      lp.relocation_mode,
      coalesce(wr.direct_work_right, false) as direct_work_right,
      coalesce(wr.work_right_verified, false) as work_right_verified,
      public._worker_demand_gaps(wp.id, p_demand_id, 'trainable') as trainable_gaps,
      public._worker_demand_gaps(wp.id, p_demand_id, 'preferred') as preferred_gaps,
      public._worker_meets_demand_mandatory(wp.id, p_demand_id, true) as verified_match,
      bc.amount_min as demand_amount_min,
      bc.amount_max as demand_amount_max,
      bc.currency_code as demand_currency,
      bc.period as demand_period,
      o.id as opportunity_id,
      o.status as opportunity_status,
      o.sent_at as opportunity_sent_at,
      o.identity_revealed_at,
      o.worker_question,
      o.employer_message
    from public.worker_profiles wp
    cross join demand d
    left join public.worker_market_preferences wmp on wmp.worker_id = wp.id
    left join base_comp bc on true
    left join public.opportunities o
      on o.demand_id = p_demand_id
      and o.worker_id = wp.id
    left join lateral (
      select p.preference, p.relocation_mode
      from public.worker_location_preferences p
      where p.worker_id = wp.id
        and d.country_code is not null
        and p.country_code = d.country_code
        and (
          p.city is null
          or d.city is null
          or lower(btrim(p.city)) = lower(btrim(d.city))
        )
      order by (p.city is not null) desc, p.created_at desc
      limit 1
    ) lp on true
    left join lateral (
      select
        (count(*) > 0) as direct_work_right,
        coalesce(bool_or(wr0.verification_status = 'verified'), false) as work_right_verified
      from public.worker_work_rights wr0
      where wr0.worker_id = wp.id
        and d.country_code is not null
        and wr0.country_code = d.country_code
        and wr0.status in ('citizen','permanent_resident','unrestricted','temporary')
        and (wr0.expires_on is null or wr0.expires_on >= current_date)
        and wr0.verification_status in ('pending','verified')
    ) wr on true
    where wp.visibility in ('public','anonymous_market','aviation_network')
      and wp.market_status <> 'not_open'
      and (
        wp.market_status <> 'contract_only'
        or d.employment_type in ('contractor','fixed_term','agency','casual')
      )
      and public._worker_meets_demand_mandatory(wp.id, p_demand_id, false)
      and coalesce(lp.preference::text, '') <> 'not_interested'
  ),
  scored as (
    select
      e.*,
      coalesce(cardinality(e.trainable_gaps), 0) as trainable_count,
      coalesce(cardinality(e.preferred_gaps), 0) as preferred_count,
      case
        when d.country_code is null then true
        when e.current_country_code = d.country_code then true
        when e.location_preference in ('preferred','acceptable','exceptional_only') then true
        when coalesce(e.willing_to_relocate,false) then true
        when coalesce(e.willing_fifo,false) then true
        when coalesce(e.willing_dido,false) then true
        when coalesce(e.willing_commute,false) then true
        when coalesce(e.willing_international,false) then true
        when coalesce(e.willing_temporary_assignment,false) then true
        else false
      end as location_ok,
      case
        when d.country_code is null then true
        when e.direct_work_right then true
        when d.sponsorship_available then true
        else false
      end as work_right_ok,
      case
        when e.earliest_start_date is not null then e.earliest_start_date
        when e.notice_days is not null then current_date + e.notice_days
        else null
      end as available_date,
      case
        when e.minimum_compensation is null then true
        when e.demand_amount_max is null then null
        when e.minimum_compensation_currency = e.demand_currency
          and e.minimum_compensation_period = e.demand_period
          then e.demand_amount_max >= e.minimum_compensation
        else null
      end as compensation_ok,
      case
        when d.country_code is not null and not e.direct_work_right and d.sponsorship_available then true
        when d.country_code is not null and e.current_country_code is distinct from d.country_code then true
        else false
      end as mobility_needed
    from eligible e
    cross join demand d
  ),
  final as (
    select
      s.*,
      case
        when d.expected_start_date is null then null
        when s.available_date is null then null
        else s.available_date <= d.expected_start_date
      end as availability_ok
    from scored s
    cross join demand d
  )
  select
    pg_catalog.md5(p_demand_id::text || ':' || s.id::text)::text as match_ref,
    case
      when s.visibility = 'anonymous_market' and s.identity_revealed_at is null then null::uuid
      else s.id::uuid
    end as worker_id,
    (s.visibility = 'anonymous_market' and s.identity_revealed_at is null)::boolean as is_anonymous,
    case when s.visibility = 'anonymous_market' and s.identity_revealed_at is null then null::text else s.first_name::text end as first_name,
    case when s.visibility = 'anonymous_market' and s.identity_revealed_at is null then null::text else s.middle_name::text end as middle_name,
    case when s.visibility = 'anonymous_market' and s.identity_revealed_at is null then null::text else s.last_name::text end as last_name,
    case when s.visibility = 'anonymous_market' and s.identity_revealed_at is null then null::text else s.professional_headline::text end as professional_headline,
    case when s.visibility = 'anonymous_market' and s.identity_revealed_at is null then null::text else s.current_city::text end as current_city,
    case when s.visibility = 'anonymous_market' and s.identity_revealed_at is null then null::char(2) else s.current_country_code::char(2) end as current_country_code,
    s.market_status,
    case
      when s.compensation_ok is false then 'Compensation Gap'
      when s.availability_ok is false then 'Availability Check'
      when not s.location_ok then 'Location Check'
      when s.mobility_needed then 'Mobility Match'
      when s.trainable_count > 0 then 'Trainable Match'
      when s.preferred_count = 0 then 'Exact Match'
      else 'Strong Match'
    end as match_label,
    case when s.verified_match then 'Verified mandatory match' else 'Some mandatory facts pending verification' end as trust_label,
    case
      when d.country_code is null then 'No country requirement'
      when s.direct_work_right and s.work_right_verified then 'Verified direct work right'
      when s.direct_work_right then 'Direct work right · verification pending'
      when d.sponsorship_available then 'Sponsorship required'
      else 'Work right not confirmed'
    end as work_right_label,
    case
      when d.country_code is null then 'not_required'
      when s.direct_work_right and s.work_right_verified then 'verified'
      when s.direct_work_right then 'pending'
      when d.sponsorship_available then 'sponsorship'
      else 'unconfirmed'
    end as work_right_state,
    s.work_right_ok::boolean as work_right_compatible,
    case
      when d.country_code is null then 'Location flexible'
      when s.current_country_code = d.country_code and (d.city is null or lower(coalesce(s.current_city,'')) = lower(d.city)) then 'Current location'
      when s.current_country_code = d.country_code then 'Same country'
      when s.location_preference = 'preferred' then 'Preferred location'
      when s.location_preference = 'acceptable' then 'Acceptable location'
      when s.location_preference = 'exceptional_only' then 'Exceptional-only location'
      when coalesce(s.willing_fifo,false) then 'FIFO compatible'
      when coalesce(s.willing_dido,false) then 'DIDO compatible'
      when coalesce(s.willing_commute,false) then 'Commute compatible'
      when coalesce(s.willing_temporary_assignment,false) then 'Temporary assignment compatible'
      when coalesce(s.willing_to_relocate,false) or coalesce(s.willing_international,false) then 'Relocation compatible'
      else 'Location needs discussion'
    end as location_label,
    s.location_ok::boolean as location_compatible,
    case
      when d.expected_start_date is null then
        case when s.available_date is null then 'Availability not specified' else 'Available from ' || to_char(s.available_date, 'DD Mon YYYY') end
      when s.available_date is null then 'Worker availability not specified'
      when s.available_date <= d.expected_start_date then 'Available by expected start'
      else 'Available after expected start'
    end as availability_label,
    s.availability_ok::boolean as availability_compatible,
    s.available_date::date as available_from,
    d.expected_start_date::date,
    s.earliest_start_date::date,
    s.notice_value::integer,
    s.notice_unit::text,
    case
      when s.minimum_compensation is null then 'Candidate minimum not specified'
      when s.demand_amount_max is null then 'Demand compensation incomplete'
      when s.minimum_compensation_currency = s.demand_currency
        and s.minimum_compensation_period = s.demand_period
        and s.demand_amount_max >= s.minimum_compensation
        then 'Compensation compatible'
      when s.minimum_compensation_currency = s.demand_currency
        and s.minimum_compensation_period = s.demand_period
        and s.demand_amount_max < s.minimum_compensation
        then 'Below candidate minimum'
      else 'Needs currency / period comparison'
    end as compensation_label,
    s.compensation_ok::boolean as compensation_compatible,
    case when s.compensation_visibility = 'visible' then s.minimum_compensation::numeric else null::numeric end as visible_minimum_compensation,
    case when s.compensation_visibility = 'visible' then s.minimum_compensation_currency::char(3) else null::char(3) end as visible_minimum_currency,
    case when s.compensation_visibility = 'visible' then s.minimum_compensation_period else null::public.money_period end as visible_minimum_period,
    s.opportunity_id::uuid,
    s.opportunity_status,
    s.opportunity_sent_at,
    (s.identity_revealed_at is not null)::boolean as identity_revealed,
    s.worker_question::text,
    s.employer_message::text as employer_reply,
    s.trainable_count::integer,
    s.preferred_count::integer,
    s.trainable_gaps::text[],
    s.preferred_gaps::text[],
    s.verified_match::boolean
  from final s
  cross join demand d
  order by
    (s.compensation_ok is true) desc,
    (s.availability_ok is not false) desc,
    s.location_ok desc,
    s.verified_match desc,
    s.trainable_count asc,
    s.preferred_count asc,
    s.mobility_needed asc,
    s.last_name,
    s.first_name
  limit 100;
end;
$$;

revoke all on function public.get_demand_talent_matches(uuid) from public;
grant execute on function public.get_demand_talent_matches(uuid) to authenticated;

-- =========================================================
-- RESOLVE A DEMAND-BOUND MATCH WITHOUT REVEALING ANONYMOUS ID
-- =========================================================

create or replace function public._resolve_demand_match_worker(
  p_demand_id uuid,
  p_match_ref text
)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with demand as (
    select d.*
    from public.open_demands d
    where d.id = p_demand_id
      and d.deleted_at is null
      and d.status = 'open'
  )
  select wp.id
  from public.worker_profiles wp
  cross join demand d
  left join lateral (
    select p.preference
    from public.worker_location_preferences p
    where p.worker_id = wp.id
      and d.country_code is not null
      and p.country_code = d.country_code
      and (
        p.city is null
        or d.city is null
        or lower(btrim(p.city)) = lower(btrim(d.city))
      )
    order by (p.city is not null) desc, p.created_at desc
    limit 1
  ) lp on true
  where pg_catalog.md5(p_demand_id::text || ':' || wp.id::text) = lower(btrim(p_match_ref))
    and wp.visibility in ('public','anonymous_market','aviation_network')
    and wp.market_status <> 'not_open'
    and (
      wp.market_status <> 'contract_only'
      or d.employment_type in ('contractor','fixed_term','agency','casual')
    )
    and public._worker_meets_demand_mandatory(wp.id, p_demand_id, false)
    and coalesce(lp.preference::text, '') <> 'not_interested'
  limit 1;
$$;

revoke all on function public._resolve_demand_match_worker(uuid, text) from public;

-- =========================================================
-- EMPLOYER: SEND THE DECLARED OPPORTUNITY
-- =========================================================

create or replace function public.send_demand_opportunity(
  p_demand_id uuid,
  p_match_ref text
)
returns table (
  opportunity_id uuid,
  status public.opportunity_status,
  sent_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_worker_id uuid;
begin
  if not exists (
    select 1
    from public.open_demands d
    where d.id = p_demand_id
      and d.deleted_at is null
      and d.status = 'open'
      and public.is_org_member(d.organisation_id)
  ) then
    raise exception 'Sending an opportunity requires an active Open Demand belonging to your organisation';
  end if;

  v_worker_id := public._resolve_demand_match_worker(p_demand_id, p_match_ref);

  if v_worker_id is null then
    raise exception 'This worker is no longer an eligible Talent Match for the demand';
  end if;

  insert into public.opportunities (demand_id, worker_id, sent_by, status)
  values (p_demand_id, v_worker_id, auth.uid(), 'sent')
  on conflict (demand_id, worker_id) do nothing;

  return query
  select o.id, o.status, o.sent_at
  from public.opportunities o
  where o.demand_id = p_demand_id
    and o.worker_id = v_worker_id;
end;
$$;

revoke all on function public.send_demand_opportunity(uuid, text) from public;
grant execute on function public.send_demand_opportunity(uuid, text) to authenticated;

-- Employer replies are only allowed after the worker has asked a question.
-- employer_message is therefore used as a structured follow-up answer, not as
-- an unsolicited recruiter message.
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
    and o.status = 'question';

  if not found then
    raise exception 'There is no open worker question for this opportunity';
  end if;

  return v_reply;
end;
$$;

revoke all on function public.reply_to_opportunity_question(uuid, text, text) from public;
grant execute on function public.reply_to_opportunity_question(uuid, text, text) to authenticated;

-- =========================================================
-- WORKER: OPPORTUNITY INBOX
-- =========================================================

create or replace function public.get_my_opportunities()
returns table (
  opportunity_id uuid,
  status public.opportunity_status,
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
  benefits text[]
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
    o.sent_at,
    o.viewed_at,
    o.responded_at,
    o.worker_question::text,
    o.employer_message::text as employer_reply,
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
    ), '{}'::text[]) as benefits
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
  where o.worker_id = auth.uid()
  order by o.sent_at desc;
end;
$$;

revoke all on function public.get_my_opportunities() from public;
grant execute on function public.get_my_opportunities() to authenticated;

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
  ) then
    raise exception 'Opportunity not found';
  end if;

  update public.opportunities o
  set
    status = v_action::public.opportunity_status,
    worker_question = case
      when v_action = 'question' then btrim(p_question)
      else o.worker_question
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
-- DEMAND INTELLIGENCE: AVAILABILITY NOW PARTICIPATES IN READY COUNT
-- =========================================================

drop function if exists public.get_demand_market_snapshot(uuid, numeric, numeric, text, text);

create or replace function public.get_demand_market_snapshot(
  p_demand_id uuid,
  p_amount_min numeric default null,
  p_amount_max numeric default null,
  p_currency_code text default null,
  p_period text default null
)
returns table (
  market_passports bigint,
  mandatory_match bigint,
  receptive_match bigint,
  talent_matches bigint,
  location_compatible bigint,
  availability_compatible bigint,
  salary_compatible bigint,
  ready_now bigint,
  identified_matches bigint,
  anonymous_matches bigint,
  verified_mandatory bigint,
  compensation_below_minimum bigint,
  compensation_needs_comparison bigint,
  effective_amount_min numeric,
  effective_amount_max numeric,
  effective_currency_code text,
  effective_period text
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
  with
  demand as (
    select d.*
    from public.open_demands d
    where d.id = p_demand_id
      and d.deleted_at is null
  ),
  base_comp as (
    select dc.amount_min, dc.amount_max, dc.currency_code::text as currency_code, dc.period::text as period
    from public.demand_compensation_components dc
    where dc.demand_id = p_demand_id
      and dc.component_type = 'base_salary'
    order by dc.id
    limit 1
  ),
  effective_comp as (
    select
      coalesce(p_amount_min, bc.amount_min) as amount_min,
      coalesce(p_amount_max, bc.amount_max) as amount_max,
      coalesce(nullif(upper(btrim(p_currency_code)), ''), bc.currency_code) as currency_code,
      coalesce(nullif(lower(btrim(p_period)), ''), bc.period) as period
    from (select 1) seed
    left join base_comp bc on true
  ),
  market as (
    select wp.id, wp.visibility
    from public.worker_profiles wp
    where wp.visibility <> 'private'
  ),
  mandatory as (
    select
      wp.id,
      wp.visibility,
      wp.market_status,
      wp.current_country_code,
      wmp.earliest_start_date,
      wmp.notice_days,
      wmp.minimum_compensation,
      wmp.minimum_compensation_currency::text as minimum_compensation_currency,
      wmp.minimum_compensation_period::text as minimum_compensation_period,
      wmp.willing_to_relocate,
      wmp.willing_fifo,
      wmp.willing_dido,
      wmp.willing_commute,
      wmp.willing_international,
      wmp.willing_temporary_assignment,
      lp.preference as location_preference,
      public._worker_meets_demand_mandatory(wp.id, p_demand_id, true) as verified_match
    from public.worker_profiles wp
    cross join demand d
    left join public.worker_market_preferences wmp on wmp.worker_id = wp.id
    left join lateral (
      select p.preference
      from public.worker_location_preferences p
      where p.worker_id = wp.id
        and d.country_code is not null
        and p.country_code = d.country_code
        and (
          p.city is null
          or d.city is null
          or lower(btrim(p.city)) = lower(btrim(d.city))
        )
      order by (p.city is not null) desc, p.created_at desc
      limit 1
    ) lp on true
    where wp.visibility <> 'private'
      and public._worker_meets_demand_mandatory(wp.id, p_demand_id, false)
  ),
  receptive as (
    select m.*
    from mandatory m
    cross join demand d
    where m.market_status <> 'not_open'
      and (
        m.market_status <> 'contract_only'
        or d.employment_type in ('contractor','fixed_term','agency','casual')
      )
  ),
  talent as (
    select
      r.*,
      case
        when d.country_code is null then true
        when r.current_country_code = d.country_code then true
        when r.location_preference in ('preferred','acceptable','exceptional_only') then true
        when coalesce(r.willing_to_relocate,false) then true
        when coalesce(r.willing_fifo,false) then true
        when coalesce(r.willing_dido,false) then true
        when coalesce(r.willing_commute,false) then true
        when coalesce(r.willing_international,false) then true
        when coalesce(r.willing_temporary_assignment,false) then true
        else false
      end as location_ok,
      case
        when d.expected_start_date is null then true
        when r.earliest_start_date is not null then r.earliest_start_date <= d.expected_start_date
        when r.notice_days is not null then current_date + r.notice_days <= d.expected_start_date
        else false
      end as availability_ok,
      case
        when r.minimum_compensation is null then true
        when ec.amount_max is null then null
        when r.minimum_compensation_currency = ec.currency_code
          and r.minimum_compensation_period = ec.period
          then ec.amount_max >= r.minimum_compensation
        else null
      end as compensation_ok
    from receptive r
    cross join demand d
    cross join effective_comp ec
    where coalesce(r.location_preference::text, '') <> 'not_interested'
  )
  select
    (select count(*) from market),
    (select count(*) from mandatory),
    (select count(*) from receptive),
    (select count(*) from talent),
    (select count(*) from talent where location_ok),
    (select count(*) from talent where availability_ok),
    (select count(*) from talent where compensation_ok is true),
    (select count(*) from talent where location_ok and availability_ok and compensation_ok is true),
    (select count(*) from talent where visibility in ('public','aviation_network')),
    (select count(*) from talent where visibility = 'anonymous_market'),
    (select count(*) from talent where verified_match),
    (select count(*) from talent where compensation_ok is false),
    (select count(*) from talent where compensation_ok is null),
    ec.amount_min,
    ec.amount_max,
    ec.currency_code,
    ec.period
  from effective_comp ec;
end;
$$;

revoke all on function public.get_demand_market_snapshot(uuid, numeric, numeric, text, text) from public;
grant execute on function public.get_demand_market_snapshot(uuid, numeric, numeric, text, text) to authenticated;
