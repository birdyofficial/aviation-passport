-- AVIATION PASSPORT V0.6.1 — Notice Period Units
-- Run once after V0.6.
--
-- notice_days remains the normalized matching value.
-- notice_value + notice_unit preserve exactly what the worker entered.

alter table public.worker_market_preferences
  add column if not exists notice_value integer,
  add column if not exists notice_unit text;

alter table public.worker_market_preferences
  drop constraint if exists worker_market_preferences_notice_value_check;

alter table public.worker_market_preferences
  add constraint worker_market_preferences_notice_value_check
  check (notice_value is null or notice_value >= 0);

alter table public.worker_market_preferences
  drop constraint if exists worker_market_preferences_notice_unit_check;

alter table public.worker_market_preferences
  add constraint worker_market_preferences_notice_unit_check
  check (notice_unit is null or notice_unit in ('days', 'weeks', 'months'));

-- Preserve old V0.6 records: if a notice period already exists only as days,
-- use that as the editable display value.
update public.worker_market_preferences
set
  notice_value = notice_days,
  notice_unit = 'days'
where notice_days is not null
  and notice_value is null;
