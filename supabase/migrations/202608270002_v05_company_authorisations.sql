-- AVIATION PASSPORT V0.5 — Company Authorisations
-- Run once after V0.4.

-- Anchor authorisations to employment where possible while preserving manual fallback.
alter table public.company_authorisations
  add column if not exists employment_id uuid references public.employment_records(id) on delete set null;

-- Historical end date is different from a revoked current privilege.
alter table public.company_authorisations
  add column if not exists ended_on date;

-- A worker may submit and maintain their own claimed authorisation record,
-- but the trust trigger ensures they can never self-award verified status.
drop trigger if exists company_authorisations_guard_verification on public.company_authorisations;
create trigger company_authorisations_guard_verification
before insert or update on public.company_authorisations
for each row execute function public.guard_worker_verification();

drop policy if exists "worker inserts own authorisations" on public.company_authorisations;
drop policy if exists "worker updates own authorisations" on public.company_authorisations;
drop policy if exists "worker deletes own authorisations" on public.company_authorisations;

create policy "worker inserts own authorisations"
on public.company_authorisations for insert to authenticated
with check (worker_id = auth.uid());

create policy "worker updates own authorisations"
on public.company_authorisations for update to authenticated
using (worker_id = auth.uid())
with check (worker_id = auth.uid());

create policy "worker deletes own authorisations"
on public.company_authorisations for delete to authenticated
using (worker_id = auth.uid());

-- Current green-shield view excludes historical/end-dated and revoked records.
create or replace view public.worker_current_authorisations
with (security_invoker = true) as
select
  ca.worker_id,
  ca.id as authorisation_id,
  ca.organisation_id,
  ca.aircraft_family_id,
  ca.aircraft_variant_id,
  ca.competency_id,
  ca.authorisation_name,
  ca.expires_on,
  ca.custom_aircraft_family
from public.company_authorisations ca
where ca.verification_status = 'verified'
  and ca.revoked_on is null
  and ca.ended_on is null
  and (ca.expires_on is null or ca.expires_on >= current_date);
