-- AVIATION PASSPORT V0.13.1 — Cancelled Demand Worker History
-- Add-on to V0.13.1.
--
-- If an employer cancels an opening, candidates keep the opportunity in
-- their personal history and see it as Cancelled. Soft-deleting the cancelled
-- demand from the employer register does not remove it from the worker view.
--
-- Cancellation also terminates active hiring actions cleanly:
-- - live interviews are cancelled;
-- - sent formal offers are withdrawn;
-- - active opportunity pipelines are closed (except already Hired);
-- - worker action badges no longer ask the candidate to act.

create or replace function public.handle_cancelled_demand_opportunities()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'cancelled'
     and (
       old.status is distinct from new.status
       or old.deleted_at is distinct from new.deleted_at
     ) then

    update public.opportunity_interviews oi
    set
      status = 'cancelled',
      cancelled_at = coalesce(oi.cancelled_at, now())
    from public.opportunities o
    where oi.opportunity_id = o.id
      and o.demand_id = new.id
      and oi.status not in ('completed','cancelled');

    update public.opportunity_offers oo
    set offer_status = 'withdrawn'
    from public.opportunities o
    where oo.opportunity_id = o.id
      and o.demand_id = new.id
      and oo.offer_status = 'sent';

    update public.opportunities o
    set
      pipeline_stage = 'closed',
      status = 'closed'::public.opportunity_status
    where o.demand_id = new.id
      and o.pipeline_stage not in ('hired','declined','withdrawn','closed');

  end if;

  return new;
end;
$$;

drop trigger if exists open_demands_cancel_worker_opportunities on public.open_demands;
create trigger open_demands_cancel_worker_opportunities
after update of status, deleted_at on public.open_demands
for each row
execute function public.handle_cancelled_demand_opportunities();

-- Backfill any demands that were already cancelled before this update.
update public.opportunity_interviews oi
set
  status = 'cancelled',
  cancelled_at = coalesce(oi.cancelled_at, now())
from public.opportunities o
join public.open_demands d on d.id = o.demand_id
where oi.opportunity_id = o.id
  and d.status = 'cancelled'
  and oi.status not in ('completed','cancelled');

update public.opportunity_offers oo
set offer_status = 'withdrawn'
from public.opportunities o
join public.open_demands d on d.id = o.demand_id
where oo.opportunity_id = o.id
  and d.status = 'cancelled'
  and oo.offer_status = 'sent';

update public.opportunities o
set
  pipeline_stage = 'closed',
  status = 'closed'::public.opportunity_status
from public.open_demands d
where o.demand_id = d.id
  and d.status = 'cancelled'
  and o.pipeline_stage not in ('hired','declined','withdrawn','closed');

-- Worker inbox now returns the demand cancellation state even when the employer
-- has soft-deleted the cancelled demand from its own register.
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
  order by o.sent_at desc;
end;
$$;

revoke all on function public.get_my_opportunities() from public;
grant execute on function public.get_my_opportunities() to authenticated;

-- A cancelled/deleted demand must never remain a worker "action required".
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
      and d.status <> 'cancelled'
      and d.deleted_at is null
      and oi.status = 'proposed'
  ) x;
$$;

revoke all on function public.get_my_worker_action_count() from public;
grant execute on function public.get_my_worker_action_count() to authenticated;
