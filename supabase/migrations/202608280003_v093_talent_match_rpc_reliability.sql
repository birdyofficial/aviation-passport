-- AVIATION PASSPORT V0.9.3 — Talent Match RPC Reliability
-- Run once after V0.9.2.
--
-- The Demand Intelligence snapshot can already see qualified/receptive matches.
-- This patch fixes the separate individual Talent Matches RPC:
-- 1. removes its dependency on pgcrypto's digest() search path by using
--    PostgreSQL's built-in md5() for the non-security anonymous display ref;
-- 2. explicitly casts RETURN QUERY fields to the function's declared types.
--
-- The anonymous reference is only a UI pseudonym and is never used for
-- authentication or authorisation.

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
    pg_catalog.md5(p_demand_id::text || ':' || s.id::text)::text as match_ref,
    case when s.visibility = 'anonymous_market' then null::uuid else s.id::uuid end as worker_id,
    (s.visibility = 'anonymous_market')::boolean as is_anonymous,
    case when s.visibility = 'anonymous_market' then null::text else s.first_name::text end as first_name,
    case when s.visibility = 'anonymous_market' then null::text else s.middle_name::text end as middle_name,
    case when s.visibility = 'anonymous_market' then null::text else s.last_name::text end as last_name,
    case when s.visibility = 'anonymous_market' then null::text else s.professional_headline::text end as professional_headline,
    case when s.visibility = 'anonymous_market' then null::text else s.current_city::text end as current_city,
    case when s.visibility = 'anonymous_market' then null::char(2) else s.current_country_code::char(2) end as current_country_code,
    s.market_status,
    case
      when s.compensation_ok is false then 'Compensation Gap'
      when not s.location_ok then 'Location Check'
      when s.mobility_needed then 'Mobility Match'
      when s.trainable_count > 0 then 'Trainable Match'
      when s.preferred_count = 0 then 'Exact Match'
      else 'Strong Match'
    end as match_label,
    case when s.verified_match::boolean then 'Verified mandatory match' else 'Some mandatory facts pending verification' end as trust_label,
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
    s.location_ok::boolean as location_compatible,
    s.earliest_start_date,
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
    s.trainable_count::integer as trainable_gap_count,
    s.preferred_count::integer as preferred_gap_count,
    s.trainable_gaps::text[],
    s.preferred_gaps::text[],
    s.verified_match::boolean
  from scored s
  cross join demand d
  order by
    (s.compensation_ok is true) desc,
    s.location_ok desc,
    s.verified_match::boolean desc,
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
