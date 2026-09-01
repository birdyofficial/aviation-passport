-- AVIATION PASSPORT V0.13.1 — Worker Opportunity List Cleanup
-- Add-on to V0.13.1.
--
-- Workers may remove declined or employer-cancelled opportunities from their
-- own Opportunities view. This is a personal hide, not destructive deletion.
-- Hired opportunities can never be hidden.

alter table public.opportunities
  add column if not exists worker_hidden_at timestamptz;

create or replace function public.dismiss_my_opportunity(p_opportunity_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_worker_id uuid;
  v_pipeline_stage text;
  v_demand_cancelled boolean;
begin
  select
    o.worker_id,
    o.pipeline_stage,
    (d.status = 'cancelled')
  into
    v_worker_id,
    v_pipeline_stage,
    v_demand_cancelled
  from public.opportunities o
  join public.open_demands d on d.id = o.demand_id
  where o.id = p_opportunity_id;

  if v_worker_id is null or v_worker_id <> auth.uid() then
    raise exception 'Opportunity not found or not authorised';
  end if;

  if v_pipeline_stage = 'hired' then
    raise exception 'Hired opportunities remain in your Aviation Passport history';
  end if;

  if v_pipeline_stage <> 'declined' and not coalesce(v_demand_cancelled, false) then
    raise exception 'Only declined or cancelled opportunities can be removed from your list';
  end if;

  update public.opportunities
  set worker_hidden_at = now()
  where id = p_opportunity_id
    and worker_id = auth.uid();

  return 'Opportunity removed from your list';
end;
$$;

revoke all on function public.dismiss_my_opportunity(uuid) from public;
grant execute on function public.dismiss_my_opportunity(uuid) to authenticated;

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
  hired_at timestamptz,
  demand_cancelled boolean
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
  from public.open_demands d
  where o.worker_id = auth.uid()
    and o.demand_id = d.id
    and o.worker_hidden_at is null
    and d.status <> 'cancelled'
    and d.deleted_at is null
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
    o.hired_at,
    (d.status = 'cancelled')::boolean
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
    and o.worker_hidden_at is null
  order by o.sent_at desc;
end;
$$;

revoke all on function public.get_my_opportunities() from public;
grant execute on function public.get_my_opportunities() to authenticated;

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
    join public.open_demands d on d.id = o.demand_id
    left join public.opportunity_offers oo on oo.opportunity_id = o.id
    where o.worker_id = auth.uid()
      and o.worker_hidden_at is null
      and d.status <> 'cancelled'
      and d.deleted_at is null
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
    join public.open_demands d on d.id = o.demand_id
    where o.worker_id = auth.uid()
      and o.worker_hidden_at is null
      and d.status <> 'cancelled'
      and d.deleted_at is null
      and oi.status = 'proposed'
  ) x;
$$;

revoke all on function public.get_my_worker_action_count() from public;
grant execute on function public.get_my_worker_action_count() to authenticated;
