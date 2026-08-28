-- AVIATION PASSPORT V0.12 — My Value + Action Indicators
-- Run once after V0.11.
--
-- Adds lightweight "whose turn is it?" action counts, the first worker-facing
-- My Value market snapshot, and a small structured-offer flow cleanup.
-- My Value does not show a salary range from fewer than 3 comparable packages.

create or replace function public.get_my_worker_action_count()
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::integer
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
      or
      (
        o.pipeline_stage = 'offer'
        and oo.offer_status = 'sent'
        and (o.worker_question is null or o.employer_message is not null)
      )
    );
$$;

revoke all on function public.get_my_worker_action_count() from public;
grant execute on function public.get_my_worker_action_count() to authenticated;

create or replace function public.get_my_employer_action_counts()
returns table (demand_id uuid, action_count integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select o.demand_id::uuid, count(*)::integer
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
  group by o.demand_id;
$$;

revoke all on function public.get_my_employer_action_counts() from public;
grant execute on function public.get_my_employer_action_counts() to authenticated;

create or replace function public.get_my_value_snapshot()
returns table (
  preferred_currency char(3),
  compatible_open_demands integer,
  verified_compatible_demands integer,
  compatible_countries integer,
  salary_sample_size integer,
  salary_period public.money_period,
  market_range_low numeric,
  market_midpoint numeric,
  market_range_high numeric,
  confidence_label text,
  demand_strength text,
  top_markets jsonb,
  improvement_signals jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_worker_id uuid := auth.uid();
begin
  if v_worker_id is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.worker_profiles wp where wp.id = v_worker_id) then
    raise exception 'Worker Passport not found';
  end if;

  return query
  with
  me as (
    select wp.id, wp.preferred_currency::char(3) as preferred_currency, wp.market_status
    from public.worker_profiles wp
    where wp.id = v_worker_id
  ),
  compatible as (
    select
      d.id, d.country_code, d.city, d.visibility,
      dc.amount_min, dc.amount_max, dc.currency_code, dc.period,
      public._worker_meets_demand_mandatory(v_worker_id, d.id, true) as verified_match
    from public.open_demands d
    cross join me
    left join lateral (
      select c.amount_min, c.amount_max, c.currency_code, c.period
      from public.demand_compensation_components c
      where c.demand_id = d.id and c.component_type = 'base_salary'
      order by c.id limit 1
    ) dc on true
    where d.status = 'open'
      and d.deleted_at is null
      and public._worker_meets_demand_mandatory(v_worker_id, d.id, false)
      and (
        me.market_status <> 'contract_only'
        or d.employment_type in ('contractor','fixed_term','agency','casual')
      )
      and (
        d.country_code is null
        or d.sponsorship_available
        or exists (
          select 1 from public.worker_work_rights wr
          where wr.worker_id = v_worker_id
            and wr.country_code = d.country_code
            and wr.status in ('citizen','permanent_resident','unrestricted','temporary')
            and (wr.expires_on is null or wr.expires_on >= current_date)
            and wr.verification_status in ('pending','verified')
        )
      )
      and not exists (
        select 1 from public.worker_location_preferences lp
        where lp.worker_id = v_worker_id
          and d.country_code is not null
          and lp.country_code = d.country_code
          and lp.preference = 'not_interested'
          and (lp.city is null or d.city is null or lower(btrim(lp.city)) = lower(btrim(d.city)))
      )
  ),
  pay_basis as (
    select c.period
    from compatible c cross join me
    where c.currency_code = me.preferred_currency
      and c.period is not null
      and (c.amount_min is not null or c.amount_max is not null)
    group by c.period
    order by count(*) desc,
      case c.period when 'year' then 1 when 'month' then 2 when 'week' then 3 when 'day' then 4 when 'hour' then 5 else 6 end
    limit 1
  ),
  salary_rows as (
    select
      coalesce(c.amount_min, c.amount_max)::numeric as low_value,
      coalesce(c.amount_max, c.amount_min)::numeric as high_value,
      ((coalesce(c.amount_min, c.amount_max) + coalesce(c.amount_max, c.amount_min)) / 2.0)::numeric as midpoint
    from compatible c cross join me cross join pay_basis pb
    where c.currency_code = me.preferred_currency
      and c.period = pb.period
      and (c.amount_min is not null or c.amount_max is not null)
  ),
  salary_stats as (
    select
      count(*)::integer as sample_size,
      percentile_cont(0.25) within group (order by low_value)::numeric as range_low,
      percentile_cont(0.50) within group (order by midpoint)::numeric as midpoint,
      percentile_cont(0.75) within group (order by high_value)::numeric as range_high
    from salary_rows
  ),
  market_rows as (
    select c.country_code, c.city, count(*)::integer as demand_count
    from compatible c
    where c.visibility <> 'confidential' and c.country_code is not null
    group by c.country_code, c.city
    order by count(*) desc, c.country_code, c.city nulls last
    limit 5
  ),
  markets_json as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'country_code', country_code, 'city', city, 'demand_count', demand_count
    ) order by demand_count desc, country_code, city), '[]'::jsonb) as value
    from market_rows
  ),
  gap_rows as (
    select gap::text as label, 'preferred'::text as signal_type
    from compatible c
    cross join lateral unnest(public._worker_demand_gaps(v_worker_id, c.id, 'preferred')) gap
    union all
    select gap::text as label, 'trainable'::text as signal_type
    from compatible c
    cross join lateral unnest(public._worker_demand_gaps(v_worker_id, c.id, 'trainable')) gap
  ),
  gap_ranked as (
    select label, signal_type, count(*)::integer as demand_count
    from gap_rows group by label, signal_type
    order by count(*) desc, label limit 5
  ),
  gaps_json as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'label', label, 'type', signal_type, 'demand_count', demand_count
    ) order by demand_count desc, label), '[]'::jsonb) as value
    from gap_ranked
  )
  select
    me.preferred_currency,
    (select count(*)::integer from compatible),
    (select count(*)::integer from compatible where verified_match),
    (select count(distinct country_code)::integer from compatible where country_code is not null),
    coalesce(ss.sample_size, 0)::integer,
    pb.period,
    case when coalesce(ss.sample_size, 0) >= 3 then ss.range_low else null::numeric end,
    case when coalesce(ss.sample_size, 0) >= 3 then ss.midpoint else null::numeric end,
    case when coalesce(ss.sample_size, 0) >= 3 then ss.range_high else null::numeric end,
    case
      when coalesce(ss.sample_size, 0) = 0 then 'No comparable pay data'
      when ss.sample_size < 3 then 'Building'
      when ss.sample_size <= 5 then 'Low'
      when ss.sample_size <= 15 then 'Medium'
      else 'High'
    end::text,
    case
      when (select count(*) from compatible) = 0 then 'No current demand'
      when (select count(*) from compatible) <= 2 then 'Emerging'
      when (select count(*) from compatible) <= 7 then 'Active'
      else 'Strong'
    end::text,
    mj.value,
    gj.value
  from me
  left join pay_basis pb on true
  cross join salary_stats ss
  cross join markets_json mj
  cross join gaps_json gj;
end;
$$;

revoke all on function public.get_my_value_snapshot() from public;
grant execute on function public.get_my_value_snapshot() to authenticated;

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
  if p_base_compensation is null or p_base_compensation < 0 then raise exception 'Enter a valid base compensation amount'; end if;
  if char_length(v_currency) <> 3 then raise exception 'Currency must use a 3-letter code'; end if;
  begin v_period := p_period::public.money_period; exception when others then raise exception 'Unsupported compensation period'; end;
  begin v_employment_type := p_employment_type::public.employment_type; exception when others then raise exception 'Unsupported employment type'; end;

  select o.pipeline_stage into v_stage
  from public.opportunities o
  join public.open_demands d on d.id = o.demand_id
  where o.id = p_opportunity_id and d.deleted_at is null and public.is_org_member(d.organisation_id);

  if v_stage is null then raise exception 'Opportunity not found or not authorised'; end if;
  if v_stage not in ('interested','conversation','interview','offer') then
    raise exception 'A structured offer can be sent only to an active Interested candidate';
  end if;

  insert into public.opportunity_offers (
    opportunity_id, base_compensation, currency_code, period, employment_type,
    start_date, roster, allowances, benefits, offer_status, created_by, sent_at,
    accepted_at, declined_at
  )
  values (
    p_opportunity_id, p_base_compensation, v_currency, v_period, v_employment_type,
    p_start_date, coalesce(p_roster, '{}'::jsonb), coalesce(p_allowances, '[]'::jsonb),
    coalesce(p_benefits, '{}'::text[]), 'sent', auth.uid(), now(), null, null
  )
  on conflict (opportunity_id) do update
  set base_compensation = excluded.base_compensation,
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
  set pipeline_stage = 'offer', status = 'offer', worker_question = null, employer_message = null
  where id = p_opportunity_id;

  return v_offer_id;
end;
$$;

revoke all on function public.send_structured_offer(uuid, numeric, text, text, text, date, jsonb, jsonb, text[]) from public;
grant execute on function public.send_structured_offer(uuid, numeric, text, text, text, date, jsonb, jsonb, text[]) to authenticated;
