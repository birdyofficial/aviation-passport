-- AVIATION PASSPORT V0.8 — Demand Requirements + Aggregate Matching Intelligence
-- Run once after V0.6.1 / before deploying the V0.8 frontend.
--
-- This migration does NOT expose individual workers to employers.
-- It adds globally flexible requirement records and one controlled aggregate RPC
-- that returns supply counts only to members of the demand's organisation.

-- =========================================================
-- 1. GLOBAL / NOT-LISTED DEMAND REQUIREMENTS
-- =========================================================

alter table public.demand_aircraft_requirements
  alter column aircraft_family_id drop not null;

alter table public.demand_aircraft_requirements
  add column if not exists custom_aircraft_family text;

alter table public.demand_aircraft_requirements
  drop constraint if exists demand_aircraft_requirements_aircraft_required;

alter table public.demand_aircraft_requirements
  add constraint demand_aircraft_requirements_aircraft_required
  check (
    aircraft_family_id is not null
    or nullif(btrim(custom_aircraft_family), '') is not null
  );

alter table public.demand_licence_requirements
  add column if not exists issuing_country_code char(2),
  add column if not exists issuing_authority_name text;

alter table public.demand_competency_requirements
  alter column competency_id drop not null;

alter table public.demand_competency_requirements
  add column if not exists custom_competency_name text,
  add column if not exists max_months_since_use integer;

alter table public.demand_competency_requirements
  drop constraint if exists demand_competency_requirements_named_check;

alter table public.demand_competency_requirements
  add constraint demand_competency_requirements_named_check
  check (
    competency_id is not null
    or nullif(btrim(custom_competency_name), '') is not null
  );

alter table public.demand_competency_requirements
  drop constraint if exists demand_competency_requirements_recency_check;

alter table public.demand_competency_requirements
  add constraint demand_competency_requirements_recency_check
  check (max_months_since_use is null or max_months_since_use >= 0);

-- Helpful indexes for aggregate matching.
create index if not exists demand_aircraft_requirements_demand_idx
  on public.demand_aircraft_requirements(demand_id);
create index if not exists demand_licence_requirements_demand_idx
  on public.demand_licence_requirements(demand_id);
create index if not exists demand_competency_requirements_demand_idx
  on public.demand_competency_requirements(demand_id);
create index if not exists demand_training_requirements_demand_idx
  on public.demand_training_requirements(demand_id);
create index if not exists worker_licences_worker_idx
  on public.worker_licences(worker_id);
create index if not exists licence_ratings_licence_idx
  on public.licence_ratings(licence_id);
create index if not exists worker_competencies_worker_idx
  on public.worker_competencies(worker_id);
create index if not exists training_records_worker_idx
  on public.training_records(worker_id);
create index if not exists worker_work_rights_worker_country_idx
  on public.worker_work_rights(worker_id, country_code);

-- =========================================================
-- 2. CONTROLLED AGGREGATE SUPPLY FUNNEL
-- =========================================================
-- Structured = submitted Passport facts that are not rejected/expired.
-- Verified   = trust-backed facts only (verification / employer confirmation).
-- Receptive  = structured supply whose market status is not "not_open".
--
-- Only Mandatory requirements reduce the pool. Trainable and Preferred
-- requirements are intentionally non-excluding.

create or replace function public.get_demand_supply_funnel(p_demand_id uuid)
returns table (
  stage_order integer,
  stage_key text,
  stage_label text,
  structured_count bigint,
  receptive_count bigint,
  verified_count bigint
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
  ),

  structured_base as (
    select wp.id
    from public.worker_profiles wp
    where wp.visibility <> 'private'
  ),
  verified_base as (
    select wp.id
    from public.worker_profiles wp
    where wp.visibility <> 'private'
  ),

  structured_work_rights as (
    select b.id
    from structured_base b
    cross join demand d
    where d.country_code is null
       or d.sponsorship_available
       or exists (
          select 1
          from public.worker_work_rights wr
          where wr.worker_id = b.id
            and wr.country_code = d.country_code
            and wr.status in ('citizen','permanent_resident','unrestricted','temporary')
            and (wr.expires_on is null or wr.expires_on >= current_date)
            and wr.verification_status in ('pending','verified')
       )
  ),
  verified_work_rights as (
    select b.id
    from verified_base b
    cross join demand d
    where d.country_code is null
       or d.sponsorship_available
       or exists (
          select 1
          from public.worker_work_rights wr
          where wr.worker_id = b.id
            and wr.country_code = d.country_code
            and wr.status in ('citizen','permanent_resident','unrestricted','temporary')
            and (wr.expires_on is null or wr.expires_on >= current_date)
            and wr.verification_status = 'verified'
       )
  ),

  structured_environment as (
    select s.id
    from structured_work_rights s
    where not exists (
      select 1
      from public.demand_environments req
      where req.demand_id = p_demand_id
        and req.requirement_level = 'mandatory'
        and not exists (
          select 1
          from public.employment_records er
          join public.employment_environments ee on ee.employment_id = er.id
          where er.worker_id = s.id
            and ee.environment_id = req.environment_id
        )
    )
  ),
  verified_environment as (
    select s.id
    from verified_work_rights s
    where not exists (
      select 1
      from public.demand_environments req
      where req.demand_id = p_demand_id
        and req.requirement_level = 'mandatory'
        and not exists (
          select 1
          from public.employment_records er
          join public.employment_environments ee on ee.employment_id = er.id
          where er.worker_id = s.id
            and er.employer_confirmed
            and ee.environment_id = req.environment_id
        )
    )
  ),

  structured_licence as (
    select s.id
    from structured_environment s
    where not exists (
      select 1
      from public.demand_licence_requirements req
      where req.demand_id = p_demand_id
        and req.requirement_level = 'mandatory'
        and not exists (
          select 1
          from public.worker_licences wl
          where wl.worker_id = s.id
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
    )
  ),
  verified_licence as (
    select s.id
    from verified_environment s
    where not exists (
      select 1
      from public.demand_licence_requirements req
      where req.demand_id = p_demand_id
        and req.requirement_level = 'mandatory'
        and not exists (
          select 1
          from public.worker_licences wl
          where wl.worker_id = s.id
            and wl.verification_status = 'verified'
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
  ),

  structured_experience as (
    select s.id
    from structured_licence s
    where not exists (
      select 1
      from public.demand_aircraft_requirements req
      where req.demand_id = p_demand_id
        and req.experience_requirement = 'mandatory'
        and not exists (
          select 1
          from public.employment_aircraft_exposure ex
          where ex.worker_id = s.id
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
  ),
  verified_experience as (
    select s.id
    from verified_licence s
    where not exists (
      select 1
      from public.demand_aircraft_requirements req
      where req.demand_id = p_demand_id
        and req.experience_requirement = 'mandatory'
        and not exists (
          select 1
          from public.employment_aircraft_exposure ex
          where ex.worker_id = s.id
            and ex.employer_confirmed
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
  ),

  structured_rating as (
    select s.id
    from structured_experience s
    where not exists (
      select 1
      from public.demand_aircraft_requirements req
      where req.demand_id = p_demand_id
        and req.rating_requirement = 'mandatory'
        and not exists (
          select 1
          from public.worker_licences wl
          join public.licence_ratings lr on lr.licence_id = wl.id
          where wl.worker_id = s.id
            and wl.verification_status in ('pending','verified')
            and lr.verification_status in ('pending','verified')
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
  ),
  verified_rating as (
    select s.id
    from verified_experience s
    where not exists (
      select 1
      from public.demand_aircraft_requirements req
      where req.demand_id = p_demand_id
        and req.rating_requirement = 'mandatory'
        and not exists (
          select 1
          from public.worker_licences wl
          join public.licence_ratings lr on lr.licence_id = wl.id
          where wl.worker_id = s.id
            and wl.verification_status = 'verified'
            and lr.verification_status = 'verified'
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
  ),

  structured_authorisation as (
    select s.id
    from structured_rating s
    where not exists (
      select 1
      from public.demand_aircraft_requirements req
      where req.demand_id = p_demand_id
        and req.authorisation_requirement = 'mandatory'
        and not exists (
          select 1
          from public.company_authorisations ca
          where ca.worker_id = s.id
            and ca.verification_status in ('pending','verified')
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
  ),
  verified_authorisation as (
    select s.id
    from verified_rating s
    where not exists (
      select 1
      from public.demand_aircraft_requirements req
      where req.demand_id = p_demand_id
        and req.authorisation_requirement = 'mandatory'
        and not exists (
          select 1
          from public.company_authorisations ca
          where ca.worker_id = s.id
            and ca.verification_status = 'verified'
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
  ),

  structured_competency as (
    select s.id
    from structured_authorisation s
    where not exists (
      select 1
      from public.demand_competency_requirements req
      where req.demand_id = p_demand_id
        and req.requirement_level = 'mandatory'
        and not exists (
          select 1
          from public.worker_competencies wc
          left join public.competency_catalog cc on cc.id = wc.competency_id
          left join public.competency_catalog reqcc on reqcc.id = req.competency_id
          where wc.worker_id = s.id
            and wc.verification_status in ('pending','verified')
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
  ),
  verified_competency as (
    select s.id
    from verified_authorisation s
    where not exists (
      select 1
      from public.demand_competency_requirements req
      where req.demand_id = p_demand_id
        and req.requirement_level = 'mandatory'
        and not exists (
          select 1
          from public.worker_competencies wc
          left join public.competency_catalog cc on cc.id = wc.competency_id
          where wc.worker_id = s.id
            and wc.verification_status = 'verified'
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
  ),

  structured_training as (
    select s.id
    from structured_competency s
    where not exists (
      select 1
      from public.demand_training_requirements req
      where req.demand_id = p_demand_id
        and req.requirement_level = 'mandatory'
        and not exists (
          select 1
          from public.training_records tr
          where tr.worker_id = s.id
            and tr.verification_status in ('pending','verified')
            and (
              lower(tr.course_name) like '%' || lower(btrim(req.training_name)) || '%'
              or lower(btrim(req.training_name)) like '%' || lower(tr.course_name) || '%'
            )
            and (not req.must_be_current or tr.expires_on is null or tr.expires_on >= current_date)
        )
    )
  ),
  verified_training as (
    select s.id
    from verified_competency s
    where not exists (
      select 1
      from public.demand_training_requirements req
      where req.demand_id = p_demand_id
        and req.requirement_level = 'mandatory'
        and not exists (
          select 1
          from public.training_records tr
          where tr.worker_id = s.id
            and tr.verification_status = 'verified'
            and (
              lower(tr.course_name) like '%' || lower(btrim(req.training_name)) || '%'
              or lower(btrim(req.training_name)) like '%' || lower(tr.course_name) || '%'
            )
            and (not req.must_be_current or tr.expires_on is null or tr.expires_on >= current_date)
        )
    )
  ),

  stages as (
    select 1 as ord, 'market'::text as key, 'Market supply'::text as label,
      (select count(*) from structured_base) as structured,
      (select count(*) from structured_base s join public.worker_profiles wp on wp.id=s.id where wp.market_status <> 'not_open') as receptive,
      (select count(*) from verified_base) as verified
    union all
    select 2, 'work_rights', 'Work-right eligible',
      (select count(*) from structured_work_rights),
      (select count(*) from structured_work_rights s join public.worker_profiles wp on wp.id=s.id where wp.market_status <> 'not_open'),
      (select count(*) from verified_work_rights)
    union all
    select 3, 'environment', 'Mandatory environment',
      (select count(*) from structured_environment),
      (select count(*) from structured_environment s join public.worker_profiles wp on wp.id=s.id where wp.market_status <> 'not_open'),
      (select count(*) from verified_environment)
    union all
    select 4, 'licence', 'Mandatory licence',
      (select count(*) from structured_licence),
      (select count(*) from structured_licence s join public.worker_profiles wp on wp.id=s.id where wp.market_status <> 'not_open'),
      (select count(*) from verified_licence)
    union all
    select 5, 'experience', 'Mandatory aircraft experience',
      (select count(*) from structured_experience),
      (select count(*) from structured_experience s join public.worker_profiles wp on wp.id=s.id where wp.market_status <> 'not_open'),
      (select count(*) from verified_experience)
    union all
    select 6, 'rating', 'Mandatory aircraft rating',
      (select count(*) from structured_rating),
      (select count(*) from structured_rating s join public.worker_profiles wp on wp.id=s.id where wp.market_status <> 'not_open'),
      (select count(*) from verified_rating)
    union all
    select 7, 'authorisation', 'Mandatory company authorisation',
      (select count(*) from structured_authorisation),
      (select count(*) from structured_authorisation s join public.worker_profiles wp on wp.id=s.id where wp.market_status <> 'not_open'),
      (select count(*) from verified_authorisation)
    union all
    select 8, 'competency', 'Mandatory competencies',
      (select count(*) from structured_competency),
      (select count(*) from structured_competency s join public.worker_profiles wp on wp.id=s.id where wp.market_status <> 'not_open'),
      (select count(*) from verified_competency)
    union all
    select 9, 'training', 'Mandatory training',
      (select count(*) from structured_training),
      (select count(*) from structured_training s join public.worker_profiles wp on wp.id=s.id where wp.market_status <> 'not_open'),
      (select count(*) from verified_training)
  )
  select ord, key, label, structured, receptive, verified
  from stages
  order by ord;
end;
$$;

revoke all on function public.get_demand_supply_funnel(uuid) from public;
grant execute on function public.get_demand_supply_funnel(uuid) to authenticated;
