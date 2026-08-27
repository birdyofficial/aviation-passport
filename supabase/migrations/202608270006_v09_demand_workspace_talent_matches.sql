-- AVIATION PASSPORT V0.9 — Demand Workspace + Demand-Bound Talent Matches
-- Run once after V0.8.
--
-- This migration keeps cancelled-demand deletion non-destructive by soft-deleting
-- it from the employer register while preserving historic market data.
-- It also adds controlled, demand-bound individual talent matching. Employers do
-- not receive direct SELECT access to Passport tables; matched people are returned
-- only through a SECURITY DEFINER RPC for an active Open Demand belonging to the
-- caller's organisation.

-- =========================================================
-- 1. SOFT DELETE FOR CANCELLED DEMAND
-- =========================================================

alter table public.open_demands
  add column if not exists deleted_at timestamptz;

alter table public.open_demands
  drop constraint if exists open_demands_deleted_only_when_cancelled;

alter table public.open_demands
  add constraint open_demands_deleted_only_when_cancelled
  check (deleted_at is null or status = 'cancelled');

create index if not exists open_demands_org_visible_idx
  on public.open_demands(organisation_id, created_at desc)
  where deleted_at is null;

-- =========================================================
-- 2. INTERNAL MATCHING HELPERS
-- =========================================================

create or replace function public._worker_meets_demand_mandatory(
  p_worker_id uuid,
  p_demand_id uuid,
  p_verified boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    exists (
      select 1 from public.open_demands d
      where d.id = p_demand_id and d.deleted_at is null
    )

    -- Work rights are a hard gate only when sponsorship is not offered.
    and not exists (
      select 1
      from public.open_demands d
      where d.id = p_demand_id
        and d.country_code is not null
        and not d.sponsorship_available
        and not exists (
          select 1
          from public.worker_work_rights wr
          where wr.worker_id = p_worker_id
            and wr.country_code = d.country_code
            and wr.status in ('citizen','permanent_resident','unrestricted','temporary')
            and (wr.expires_on is null or wr.expires_on >= current_date)
            and (
              (p_verified and wr.verification_status = 'verified')
              or (not p_verified and wr.verification_status in ('pending','verified'))
            )
        )
    )

    -- Environment.
    and not exists (
      select 1
      from public.demand_environments req
      where req.demand_id = p_demand_id
        and req.requirement_level = 'mandatory'
        and not exists (
          select 1
          from public.employment_records er
          join public.employment_environments ee on ee.employment_id = er.id
          where er.worker_id = p_worker_id
            and ee.environment_id = req.environment_id
            and (not p_verified or er.employer_confirmed)
        )
    )

    -- Licence.
    and not exists (
      select 1
      from public.demand_licence_requirements req
      where req.demand_id = p_demand_id
        and req.requirement_level = 'mandatory'
        and not exists (
          select 1
          from public.worker_licences wl
          where wl.worker_id = p_worker_id
            and (
              (p_verified and wl.verification_status = 'verified')
              or (not p_verified and wl.verification_status in ('pending','verified'))
            )
            and (wl.expires_on is null or wl.expires_on >= current_date)
            and (
              req.category_privileges is null
              or btrim(req.category_privileges) = ''
              or lower(coalesce(wl.category_privileges,'')) like '%' || lower(btrim(req.category_privileges)) || '%'
            )
            and (
              req.conversion_accepted
              or (
                (req.authority_id is null or wl.authority_id = req.authority_id)
                and (req.issuing_country_code is null or wl.issuing_country_code = req.issuing_country_code)
                and (
                  req.issuing_authority_name is null
                  or btrim(req.issuing_authority_name) = ''
                  or lower(coalesce(wl.issuing_authority_name,'')) = lower(btrim(req.issuing_authority_name))
                )
                and (
                  req.licence_scheme is null
                  or btrim(req.licence_scheme) = ''
                  or lower(wl.licence_scheme) = lower(btrim(req.licence_scheme))
                )
              )
            )
        )
    )

    -- Aircraft experience.
    and not exists (
      select 1
      from public.demand_aircraft_requirements req
      where req.demand_id = p_demand_id
        and req.experience_requirement = 'mandatory'
        and not exists (
          select 1
          from public.employment_aircraft_exposure ex
          where ex.worker_id = p_worker_id
            and (not p_verified or ex.employer_confirmed)
            and (
              (req.aircraft_family_id is not null and ex.aircraft_family_id = req.aircraft_family_id)
              or (
                req.aircraft_family_id is null
                and req.custom_aircraft_family is not null
                and lower(coalesce(ex.custom_aircraft_family,'')) = lower(req.custom_aircraft_family)
              )
            )
            and (req.aircraft_variant_id is null or ex.aircraft_variant_id = req.aircraft_variant_id)
            and (req.engine_id is null or ex.engine_id = req.engine_id)
            and (
              req.minimum_exposure is null
              or case ex.exposure
                   when 'primary' then 4
                   when 'regular' then 3
                   when 'occasional' then 2
                   when 'limited' then 1
                 end >=
                 case req.minimum_exposure
                   when 'primary' then 4
                   when 'regular' then 3
                   when 'occasional' then 2
                   when 'limited' then 1
                 end
            )
            and (
              req.max_months_since_exposure is null
              or coalesce(ex.exposure_end, current_date) >= current_date - make_interval(months => req.max_months_since_exposure)
            )
        )
    )

    -- Aircraft rating.
    and not exists (
      select 1
      from public.demand_aircraft_requirements req
      where req.demand_id = p_demand_id
        and req.rating_requirement = 'mandatory'
        and not exists (
          select 1
          from public.worker_licences wl
          join public.licence_ratings lr on lr.licence_id = wl.id
          where wl.worker_id = p_worker_id
            and (
              (p_verified and wl.verification_status = 'verified' and lr.verification_status = 'verified')
              or (not p_verified and wl.verification_status in ('pending','verified') and lr.verification_status in ('pending','verified'))
            )
            and (wl.expires_on is null or wl.expires_on >= current_date)
            and (
              (req.aircraft_family_id is not null and lr.aircraft_family_id = req.aircraft_family_id)
              or (
                req.aircraft_family_id is null
                and req.custom_aircraft_family is not null
                and lower(coalesce(lr.custom_aircraft_family,'')) = lower(req.custom_aircraft_family)
              )
            )
            and (req.aircraft_variant_id is null or lr.aircraft_variant_id = req.aircraft_variant_id)
            and (req.engine_id is null or lr.engine_id = req.engine_id)
        )
    )

    -- Current company authorisation.
    and not exists (
      select 1
      from public.demand_aircraft_requirements req
      where req.demand_id = p_demand_id
        and req.authorisation_requirement = 'mandatory'
        and not exists (
          select 1
          from public.company_authorisations ca
          where ca.worker_id = p_worker_id
            and (
              (p_verified and ca.verification_status = 'verified')
              or (not p_verified and ca.verification_status in ('pending','verified'))
            )
            and ca.revoked_on is null
            and ca.ended_on is null
            and (ca.expires_on is null or ca.expires_on >= current_date)
            and (
              (req.aircraft_family_id is not null and ca.aircraft_family_id = req.aircraft_family_id)
              or (
                req.aircraft_family_id is null
                and req.custom_aircraft_family is not null
                and lower(coalesce(ca.custom_aircraft_family,'')) = lower(req.custom_aircraft_family)
              )
            )
            and (req.aircraft_variant_id is null or ca.aircraft_variant_id = req.aircraft_variant_id)
        )
    )

    -- Competencies.
    and not exists (
      select 1
      from public.demand_competency_requirements req
      where req.demand_id = p_demand_id
        and req.requirement_level = 'mandatory'
        and not exists (
          select 1
          from public.worker_competencies wc
          left join public.competency_catalog cc on cc.id = wc.competency_id
          where wc.worker_id = p_worker_id
            and (
              (p_verified and wc.verification_status = 'verified')
              or (not p_verified and wc.verification_status in ('pending','verified'))
            )
            and (
              (req.competency_id is not null and wc.competency_id = req.competency_id)
              or (
                req.competency_id is null
                and req.custom_competency_name is not null
                and lower(coalesce(wc.custom_competency_name, cc.label, '')) = lower(req.custom_competency_name)
              )
            )
            and (req.aircraft_family_id is null or wc.aircraft_family_id = req.aircraft_family_id)
            and (
              req.max_months_since_use is null
              or wc.last_used_on >= current_date - make_interval(months => req.max_months_since_use)
            )
        )
    )

    -- Training.
    and not exists (
      select 1
      from public.demand_training_requirements req
      where req.demand_id = p_demand_id
        and req.requirement_level = 'mandatory'
        and not exists (
          select 1
          from public.training_records tr
          where tr.worker_id = p_worker_id
            and (
              (p_verified and tr.verification_status = 'verified')
              or (not p_verified and tr.verification_status in ('pending','verified'))
            )
            and (
              lower(tr.course_name) like '%' || lower(btrim(req.training_name)) || '%'
              or lower(btrim(req.training_name)) like '%' || lower(tr.course_name) || '%'
            )
            and (not req.must_be_current or tr.expires_on is null or tr.expires_on >= current_date)
        )
    );
$$;

revoke all on function public._worker_meets_demand_mandatory(uuid, uuid, boolean) from public;

create or replace function public._worker_demand_gaps(
  p_worker_id uuid,
  p_demand_id uuid,
  p_level public.requirement_level
)
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(g.label order by g.label), '{}'::text[])
  from (
    select 'Environment · ' || e.label as label
    from public.demand_environments req
    join public.environments e on e.id = req.environment_id
    where req.demand_id = p_demand_id
      and req.requirement_level = p_level
      and not exists (
        select 1
        from public.employment_records er
        join public.employment_environments ee on ee.employment_id = er.id
        where er.worker_id = p_worker_id and ee.environment_id = req.environment_id
      )

    union all

    select 'Licence · ' || coalesce(nullif(req.licence_scheme,''), nullif(req.category_privileges,''), nullif(req.issuing_authority_name,''), 'Required licence')
    from public.demand_licence_requirements req
    where req.demand_id = p_demand_id
      and req.requirement_level = p_level
      and not exists (
        select 1
        from public.worker_licences wl
        where wl.worker_id = p_worker_id
          and wl.verification_status in ('pending','verified')
          and (wl.expires_on is null or wl.expires_on >= current_date)
          and (
            req.category_privileges is null
            or btrim(req.category_privileges) = ''
            or lower(coalesce(wl.category_privileges,'')) like '%' || lower(btrim(req.category_privileges)) || '%'
          )
          and (
            req.conversion_accepted
            or (
              (req.authority_id is null or wl.authority_id = req.authority_id)
              and (req.issuing_country_code is null or wl.issuing_country_code = req.issuing_country_code)
              and (
                req.issuing_authority_name is null
                or btrim(req.issuing_authority_name) = ''
                or lower(coalesce(wl.issuing_authority_name,'')) = lower(btrim(req.issuing_authority_name))
              )
              and (
                req.licence_scheme is null
                or btrim(req.licence_scheme) = ''
                or lower(wl.licence_scheme) = lower(btrim(req.licence_scheme))
              )
            )
          )
      )

    union all

    select 'Aircraft experience · ' || coalesce(af.display_name, req.custom_aircraft_family, 'Aircraft')
    from public.demand_aircraft_requirements req
    left join public.aircraft_families af on af.id = req.aircraft_family_id
    where req.demand_id = p_demand_id
      and req.experience_requirement = p_level
      and not exists (
        select 1
        from public.employment_aircraft_exposure ex
        where ex.worker_id = p_worker_id
          and (
            (req.aircraft_family_id is not null and ex.aircraft_family_id = req.aircraft_family_id)
            or (req.aircraft_family_id is null and req.custom_aircraft_family is not null and lower(coalesce(ex.custom_aircraft_family,'')) = lower(req.custom_aircraft_family))
          )
          and (req.aircraft_variant_id is null or ex.aircraft_variant_id = req.aircraft_variant_id)
          and (req.engine_id is null or ex.engine_id = req.engine_id)
          and (
            req.minimum_exposure is null
            or case ex.exposure when 'primary' then 4 when 'regular' then 3 when 'occasional' then 2 when 'limited' then 1 end >=
               case req.minimum_exposure when 'primary' then 4 when 'regular' then 3 when 'occasional' then 2 when 'limited' then 1 end
          )
          and (req.max_months_since_exposure is null or coalesce(ex.exposure_end,current_date) >= current_date - make_interval(months => req.max_months_since_exposure))
      )

    union all

    select 'Aircraft rating · ' || coalesce(af.display_name, req.custom_aircraft_family, 'Aircraft')
    from public.demand_aircraft_requirements req
    left join public.aircraft_families af on af.id = req.aircraft_family_id
    where req.demand_id = p_demand_id
      and req.rating_requirement = p_level
      and not exists (
        select 1
        from public.worker_licences wl
        join public.licence_ratings lr on lr.licence_id = wl.id
        where wl.worker_id = p_worker_id
          and wl.verification_status in ('pending','verified')
          and lr.verification_status in ('pending','verified')
          and (wl.expires_on is null or wl.expires_on >= current_date)
          and (
            (req.aircraft_family_id is not null and lr.aircraft_family_id = req.aircraft_family_id)
            or (req.aircraft_family_id is null and req.custom_aircraft_family is not null and lower(coalesce(lr.custom_aircraft_family,'')) = lower(req.custom_aircraft_family))
          )
          and (req.aircraft_variant_id is null or lr.aircraft_variant_id = req.aircraft_variant_id)
          and (req.engine_id is null or lr.engine_id = req.engine_id)
      )

    union all

    select 'Company authorisation · ' || coalesce(af.display_name, req.custom_aircraft_family, 'Aircraft')
    from public.demand_aircraft_requirements req
    left join public.aircraft_families af on af.id = req.aircraft_family_id
    where req.demand_id = p_demand_id
      and req.authorisation_requirement = p_level
      and not exists (
        select 1
        from public.company_authorisations ca
        where ca.worker_id = p_worker_id
          and ca.verification_status in ('pending','verified')
          and ca.revoked_on is null
          and ca.ended_on is null
          and (ca.expires_on is null or ca.expires_on >= current_date)
          and (
            (req.aircraft_family_id is not null and ca.aircraft_family_id = req.aircraft_family_id)
            or (req.aircraft_family_id is null and req.custom_aircraft_family is not null and lower(coalesce(ca.custom_aircraft_family,'')) = lower(req.custom_aircraft_family))
          )
          and (req.aircraft_variant_id is null or ca.aircraft_variant_id = req.aircraft_variant_id)
      )

    union all

    select 'Competency · ' || coalesce(cc.label, req.custom_competency_name, 'Competency')
    from public.demand_competency_requirements req
    left join public.competency_catalog cc on cc.id = req.competency_id
    where req.demand_id = p_demand_id
      and req.requirement_level = p_level
      and not exists (
        select 1
        from public.worker_competencies wc
        left join public.competency_catalog wcc on wcc.id = wc.competency_id
        where wc.worker_id = p_worker_id
          and wc.verification_status in ('pending','verified')
          and (
            (req.competency_id is not null and wc.competency_id = req.competency_id)
            or (req.competency_id is null and req.custom_competency_name is not null and lower(coalesce(wc.custom_competency_name,wcc.label,'')) = lower(req.custom_competency_name))
          )
          and (req.aircraft_family_id is null or wc.aircraft_family_id = req.aircraft_family_id)
          and (req.max_months_since_use is null or wc.last_used_on >= current_date - make_interval(months => req.max_months_since_use))
      )

    union all

    select 'Training · ' || req.training_name
    from public.demand_training_requirements req
    where req.demand_id = p_demand_id
      and req.requirement_level = p_level
      and not exists (
        select 1
        from public.training_records tr
        where tr.worker_id = p_worker_id
          and tr.verification_status in ('pending','verified')
          and (
            lower(tr.course_name) like '%' || lower(btrim(req.training_name)) || '%'
            or lower(btrim(req.training_name)) like '%' || lower(tr.course_name) || '%'
          )
          and (not req.must_be_current or tr.expires_on is null or tr.expires_on >= current_date)
      )
  ) g;
$$;

revoke all on function public._worker_demand_gaps(uuid, uuid, public.requirement_level) from public;

-- =========================================================
-- 3. CONTROLLED INDIVIDUAL TALENT ACCESS
-- =========================================================

create or replace function public.get_demand_talent_matches(p_demand_id uuid)
returns table (
  worker_id uuid,
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
  earliest_start_date date,
  notice_value integer,
  notice_unit text,
  compensation_label text,
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
    where wp.visibility in ('public','aviation_network')
      and wp.market_status <> 'not_open'
      and (
        wp.market_status <> 'contract_only'
        or d.employment_type in ('contractor','fixed_term','agency','casual')
      )
      and public._worker_meets_demand_mandatory(wp.id, p_demand_id, false)
      and coalesce(lp.preference::text, '') <> 'not_interested'
      and (
        d.country_code is null
        or wp.current_country_code = d.country_code
        or lp.preference in ('preferred','acceptable','exceptional_only')
        or coalesce(wmp.willing_to_relocate, false)
        or coalesce(wmp.willing_fifo, false)
        or coalesce(wmp.willing_dido, false)
        or coalesce(wmp.willing_commute, false)
        or coalesce(wmp.willing_international, false)
        or coalesce(wmp.willing_temporary_assignment, false)
      )
      -- If the candidate's private minimum is directly comparable and the
      -- employer's maximum is below it, do not expose the worker as a match.
      and not (
        wmp.minimum_compensation is not null
        and bc.amount_max is not null
        and wmp.minimum_compensation_currency = bc.currency_code
        and wmp.minimum_compensation_period = bc.period
        and bc.amount_max < wmp.minimum_compensation
      )
  ),
  scored as (
    select
      e.*,
      coalesce(cardinality(e.trainable_gaps), 0) as trainable_count,
      coalesce(cardinality(e.preferred_gaps), 0) as preferred_count,
      case
        when d.country_code is not null and not e.direct_work_right and d.sponsorship_available then true
        when d.country_code is not null and e.current_country_code is distinct from d.country_code then true
        else false
      end as mobility_needed
    from eligible e
    cross join demand d
  )
  select
    s.id as worker_id,
    s.first_name,
    s.middle_name,
    s.last_name,
    s.professional_headline,
    s.current_city,
    s.current_country_code,
    s.market_status,
    case
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
      else 'Location compatibility not specified'
    end as location_label,
    s.earliest_start_date,
    s.notice_value,
    s.notice_unit,
    case
      when s.minimum_compensation is null then 'Candidate minimum not specified'
      when s.demand_amount_max is null then 'Demand compensation incomplete'
      when s.minimum_compensation_currency = s.demand_currency and s.minimum_compensation_period = s.demand_period then 'Compensation compatible'
      else 'Needs currency / period comparison'
    end as compensation_label,
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
