-- AVIATION PASSPORT V0.13.1 — Interview Cancellation + Next-Step Clarity
-- Run once after V0.13.
--
-- Adds worker-side cancellation of a scheduled interview.
-- Either side may cancel an active interview round.
-- A cancelled round returns the hiring workflow to HR so new interview
-- options can be scheduled.
-- Employer action indicators now include cancelled interview rounds that
-- need rescheduling / a next decision.

create or replace function public.cancel_interview_round(p_interview_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_worker_id uuid;
  v_is_employer boolean := false;
begin
  select
    o.worker_id,
    public.is_org_member(d.organisation_id)
  into
    v_worker_id,
    v_is_employer
  from public.opportunity_interviews oi
  join public.opportunities o on o.id = oi.opportunity_id
  join public.open_demands d on d.id = o.demand_id
  where oi.id = p_interview_id
    and oi.status not in ('completed','cancelled')
    and d.deleted_at is null;

  if v_worker_id is null then
    raise exception 'Interview round not found or cannot be cancelled';
  end if;

  if auth.uid() <> v_worker_id and not coalesce(v_is_employer, false) then
    raise exception 'Not authorised to cancel this interview';
  end if;

  update public.opportunity_interviews
  set
    status = 'cancelled',
    cancelled_at = now()
  where id = p_interview_id
    and status not in ('completed','cancelled');

  if not found then
    raise exception 'Interview round could not be cancelled';
  end if;

  return 'Interview cancelled';
end;
$$;

revoke all on function public.cancel_interview_round(uuid) from public;
grant execute on function public.cancel_interview_round(uuid) to authenticated;

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

    -- Once an interview has been completed OR cancelled and there is no
    -- active round, HR owns the next step: schedule/re-schedule another
    -- interview, create an offer (after a completed round), withdraw, or close.
    select o.demand_id, 'post-interview:' || o.id::text
    from public.opportunities o
    join public.open_demands d on d.id = o.demand_id
    where d.deleted_at is null
      and public.is_org_member(d.organisation_id)
      and o.pipeline_stage = 'interview'
      and (
        exists (
          select 1
          from public.opportunity_interviews done
          where done.opportunity_id = o.id
            and done.status = 'completed'
        )
        or exists (
          select 1
          from public.opportunity_interviews cancelled
          where cancelled.opportunity_id = o.id
            and cancelled.status = 'cancelled'
        )
      )
      and not exists (
        select 1
        from public.opportunity_interviews active
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
