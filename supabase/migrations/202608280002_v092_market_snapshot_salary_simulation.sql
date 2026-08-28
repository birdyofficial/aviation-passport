-- AVIATION PASSPORT V0.9.2 — Straightforward Demand Intelligence + Salary Simulation
-- Run once after V0.9.1.
--
-- Changes:
-- 1. Talent Matches no longer disappear merely because a worker has not filled
--    out a positive mobility preference. Only an explicit Not Interested
--    location preference blocks the opportunity.
-- 2. Compensation incompatibility is shown as a compatibility gap rather than
--    silently removing an otherwise qualified/receptive worker.
-- 3. Adds a compact aggregate market snapshot with a salary-range scenario
--    override for Demand Intelligence.

-- =========================================================
-- TALENT MATCHES
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
  location_label text,
  location_compatible boolean,
  earliest_start_date date,
  notice_value integer,
  notice_unit text,
  compensation_label text,
  compensation_compatible boolean,
  visible_minimum_compensation numeric,
  visible_minimum_currency char(3),
  visible_minimum_period public.money_period,
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
      public._worker_demand_gaps(wp.id, p_demand_id, 'trainable') as trainable_gaps,
      public._worker_demand_gaps(wp.id, p_demand_id, 'preferred') as preferred_gaps,
      public._worker_meets_demand_mandatory(wp.id, p_demand_id, true) as verified_match,
      bc.amount_min as demand_amount_min,
      bc.amount_max as demand_amount_max,
      bc.currency_code as demand_currency,
      bc.period as demand_period
    from public.worker_profiles wp
    cross join demand d
    left join public.worker_market_preferences wmp on wmp.worker_id = wp.id
    left join base_comp bc on true
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
      select true as direct_work_right
      from public.worker_work_rights wr0
      where wr0.worker_id = wp.id
        and d.country_code is not null
        and wr0.country_code = d.country_code
        and wr0.status in ('citizen','permanent_resident','unrestricted','temporary')
        and (wr0.expires_on is null or wr0.expires_on >= current_date)
        and wr0.verification_status in ('pending','verified')
      limit 1
    ) wr on true
    where wp.visibility in ('public','anonymous_market','aviation_network')
      and wp.market_status <> 'not_open'
      and (
        wp.market_status <> 'contract_only'
        or d.employment_type in ('contractor','fixed_term','agency','casual')
      )
      and public._worker_meets_demand_mandatory(wp.id, p_demand_id, false)
      -- An explicit negative preference is respected. Missing mobility data
      -- does not silently remove an otherwise receptive worker.
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
  )
  select
    encode(digest(p_demand_id::text || ':' || s.id::text, 'sha256'), 'hex') as match_ref,
    case when s.visibility = 'anonymous_market' then null else s.id end as worker_id,
    (s.visibility = 'anonymous_market') as is_anonymous,
    case when s.visibility = 'anonymous_market' then null else s.first_name end as first_name,
    case when s.visibility = 'anonymous_market' then null else s.middle_name end as middle_name,
    case when s.visibility = 'anonymous_market' then null else s.last_name end as last_name,
    case when s.visibility = 'anonymous_market' then null else s.professional_headline end as professional_headline,
    case when s.visibility = 'anonymous_market' then null else s.current_city end as current_city,
    case when s.visibility = 'anonymous_market' then null else s.current_country_code end as current_country_code,
    s.market_status,
    case
      when s.compensation_ok is false then 'Compensation Gap'
      when not s.location_ok then 'Location Check'
      when s.mobility_needed then 'Mobility Match'
      when s.trainable_count > 0 then 'Trainable Match'
      when s.preferred_count = 0 then 'Exact Match'
      else 'Strong Match'
    end as match_label,
    case when s.verified_match then 'Verified mandatory match' else 'Some mandatory facts pending verification' end as trust_label,
    case
      when d.country_code is null then 'No country requirement'
      when s.direct_work_right then 'Direct work right'
      when d.sponsorship_available then 'Sponsorship required'
      else 'Work right not confirmed'
    end as work_right_label,
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
    s.location_ok as location_compatible,
    s.earliest_start_date,
    s.notice_value,
    s.notice_unit,
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
    s.compensation_ok as compensation_compatible,
    case when s.compensation_visibility = 'visible' then s.minimum_compensation else null end as visible_minimum_compensation,
    case when s.compensation_visibility = 'visible' then s.minimum_compensation_currency else null end as visible_minimum_currency,
    case when s.compensation_visibility = 'visible' then s.minimum_compensation_period else null end as visible_minimum_period,
    s.trainable_count as trainable_gap_count,
    s.preferred_count as preferred_gap_count,
    s.trainable_gaps,
    s.preferred_gaps,
    s.verified_match
  from scored s
  cross join demand d
  order by
    (s.compensation_ok is true) desc,
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
-- STRAIGHTFORWARD DEMAND MARKET SNAPSHOT
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
    (select count(*) from market) as market_passports,
    (select count(*) from mandatory) as mandatory_match,
    (select count(*) from receptive) as receptive_match,
    (select count(*) from talent) as talent_matches,
    (select count(*) from talent where location_ok) as location_compatible,
    (select count(*) from talent where compensation_ok is true) as salary_compatible,
    (select count(*) from talent where location_ok and compensation_ok is true) as ready_now,
    (select count(*) from talent where visibility in ('public','aviation_network')) as identified_matches,
    (select count(*) from talent where visibility = 'anonymous_market') as anonymous_matches,
    (select count(*) from talent where verified_match) as verified_mandatory,
    (select count(*) from talent where compensation_ok is false) as compensation_below_minimum,
    (select count(*) from talent where compensation_ok is null) as compensation_needs_comparison,
    ec.amount_min,
    ec.amount_max,
    ec.currency_code,
    ec.period
  from effective_comp ec;
end;
$$;

revoke all on function public.get_demand_market_snapshot(uuid, numeric, numeric, text, text) from public;
grant execute on function public.get_demand_market_snapshot(uuid, numeric, numeric, text, text) to authenticated;
