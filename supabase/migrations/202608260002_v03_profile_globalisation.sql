-- AVIATION PASSPORT V0.3 — RUN ONCE IN SUPABASE SQL EDITOR
-- Profile refinements, global licence modelling, multi-country work rights,
-- custom aircraft support, broader aircraft/authority seed, and 50 MB credential files.

-- =========================================================
-- 1. PROFESSIONAL IDENTITY
-- =========================================================

alter table public.worker_profiles
  add column if not exists middle_name text;

-- =========================================================
-- 2. WORK RIGHTS: ONE CURRENT RECORD PER COUNTRY
-- =========================================================

-- Remove any accidental duplicate country rows, retaining the newest record.
delete from public.worker_work_rights a
using public.worker_work_rights b
where a.worker_id = b.worker_id
  and a.country_code = b.country_code
  and (
    a.created_at < b.created_at
    or (a.created_at = b.created_at and a.id::text < b.id::text)
  );

alter table public.worker_work_rights
  drop constraint if exists worker_work_rights_worker_id_country_code_status_key;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'worker_work_rights_worker_country_key'
      and conrelid = 'public.worker_work_rights'::regclass
  ) then
    alter table public.worker_work_rights
      add constraint worker_work_rights_worker_country_key unique (worker_id, country_code);
  end if;
end $$;

-- =========================================================
-- 3. GLOBAL LICENCE MODELLING
-- =========================================================

alter table public.worker_licences
  alter column authority_id drop not null;

alter table public.worker_licences
  add column if not exists issuing_country_code char(2),
  add column if not exists issuing_authority_name text;

-- Backfill exact authority/country snapshots for existing records.
update public.worker_licences wl
set
  issuing_country_code = coalesce(wl.issuing_country_code, la.country_code),
  issuing_authority_name = coalesce(wl.issuing_authority_name, la.name)
from public.licence_authorities la
where wl.authority_id = la.id
  and (wl.issuing_country_code is null or wl.issuing_authority_name is null);

-- `licence_scheme` remains the database column for backwards compatibility.
-- In V0.3 the UI calls it "Licence system" (EASA Part-66, CASR Part 66,
-- FAA Mechanic Certificate, Canadian AME, etc.).

-- =========================================================
-- 4. CUSTOM / NOT-LISTED AIRCRAFT
-- =========================================================

alter table public.licence_ratings
  add column if not exists custom_aircraft_family text;

alter table public.employment_aircraft_exposure
  alter column aircraft_family_id drop not null;

alter table public.employment_aircraft_exposure
  add column if not exists custom_aircraft_family text;

alter table public.company_authorisations
  add column if not exists custom_aircraft_family text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'employment_aircraft_exposure_aircraft_required'
      and conrelid = 'public.employment_aircraft_exposure'::regclass
  ) then
    alter table public.employment_aircraft_exposure
      add constraint employment_aircraft_exposure_aircraft_required
      check (
        aircraft_family_id is not null
        or nullif(btrim(custom_aircraft_family), '') is not null
      );
  end if;
end $$;

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
  and (ca.expires_on is null or ca.expires_on >= current_date);

-- =========================================================
-- 5. CREDENTIAL FILE SIZE
-- =========================================================

update storage.buckets
set file_size_limit = 52428800
where id = 'credential-evidence';

-- =========================================================
-- 6. GLOBAL / COMMON ISSUING AUTHORITIES
-- =========================================================
-- This is a convenience list, NOT a closed universe. V0.3 also supports
-- "Not listed" + exact authority name, so every ICAO state can be represented.

insert into public.licence_authorities (code, name, country_code) values
  ('CASA-AU', 'Civil Aviation Safety Authority', 'AU'),
  ('FAA-US', 'Federal Aviation Administration', 'US'),
  ('TCCA-CA', 'Transport Canada Civil Aviation', 'CA'),
  ('UKCAA', 'UK Civil Aviation Authority', 'GB'),
  ('GCAA-AE', 'General Civil Aviation Authority', 'AE'),
  ('CAAS-SG', 'Civil Aviation Authority of Singapore', 'SG'),
  ('HKCAD', 'Hong Kong Civil Aviation Department', 'HK'),
  ('CAA-NZ', 'Civil Aviation Authority of New Zealand', 'NZ'),
  ('DGCA-IN', 'Directorate General of Civil Aviation', 'IN'),
  ('CAAC-CN', 'Civil Aviation Administration of China', 'CN'),
  ('JCAB-JP', 'Japan Civil Aviation Bureau', 'JP'),
  ('SACAA-ZA', 'South African Civil Aviation Authority', 'ZA'),
  ('ANAC-BR', 'Agência Nacional de Aviação Civil', 'BR'),
  ('CAAM-MY', 'Civil Aviation Authority of Malaysia', 'MY'),
  ('CAAT-TH', 'Civil Aviation Authority of Thailand', 'TH'),
  ('DGCA-ID', 'Directorate General of Civil Aviation Indonesia', 'ID'),
  ('CAAP-PH', 'Civil Aviation Authority of the Philippines', 'PH'),
  ('GACA-SA', 'General Authority of Civil Aviation', 'SA'),
  ('QCAA-QA', 'Qatar Civil Aviation Authority', 'QA'),
  ('CAA-OM', 'Civil Aviation Authority of Oman', 'OM'),
  ('BCAA-BH', 'Bahrain Civil Aviation Affairs', 'BH'),
  ('CARC-JO', 'Civil Aviation Regulatory Commission', 'JO'),
  ('LBA-DE', 'Luftfahrt-Bundesamt', 'DE'),
  ('AUSTROCONTROL-AT', 'Austro Control GmbH', 'AT'),
  ('BCAA-BE', 'Belgian Civil Aviation Authority', 'BE'),
  ('DGCAA-BG', 'Directorate General Civil Aviation Administration', 'BG'),
  ('CCAA-HR', 'Croatian Civil Aviation Agency', 'HR'),
  ('DCA-CY', 'Department of Civil Aviation Cyprus', 'CY'),
  ('CAA-CZ', 'Civil Aviation Authority of the Czech Republic', 'CZ'),
  ('DTA-DK', 'Danish Civil Aviation and Railway Authority', 'DK'),
  ('ETA-EE', 'Estonian Transport Administration', 'EE'),
  ('TRAFICOM-FI', 'Finnish Transport and Communications Agency Traficom', 'FI'),
  ('DGAC-FR', 'Direction Générale de l''Aviation Civile (DGAC/DSAC)', 'FR'),
  ('HCAA-GR', 'Hellenic Civil Aviation Authority', 'GR'),
  ('CAA-HU', 'Hungarian Civil Aviation Authority', 'HU'),
  ('IAA-IE', 'Irish Aviation Authority', 'IE'),
  ('ENAC-IT', 'Ente Nazionale per l''Aviazione Civile', 'IT'),
  ('CAA-LV', 'Civil Aviation Agency of Latvia', 'LV'),
  ('TKA-LT', 'Transport Competence Agency', 'LT'),
  ('DAC-LU', 'Direction de l''Aviation Civile', 'LU'),
  ('TM-CAD-MT', 'Transport Malta Civil Aviation Directorate', 'MT'),
  ('ILT-NL', 'Human Environment and Transport Inspectorate (ILT)', 'NL'),
  ('CAA-NO', 'Civil Aviation Authority of Norway', 'NO'),
  ('ULC-PL', 'Civil Aviation Authority of Poland (ULC)', 'PL'),
  ('ANAC-PT', 'Autoridade Nacional da Aviação Civil', 'PT'),
  ('CAA-RO', 'Romanian Civil Aeronautical Authority', 'RO'),
  ('TA-SK', 'Transport Authority of the Slovak Republic', 'SK'),
  ('CAA-SI', 'Civil Aviation Agency of Slovenia', 'SI'),
  ('AESA-ES', 'Agencia Estatal de Seguridad Aérea', 'ES'),
  ('STA-SE', 'Swedish Transport Agency', 'SE'),
  ('ICETRA-IS', 'Icelandic Transport Authority', 'IS'),
  ('FOCA-CH', 'Federal Office of Civil Aviation', 'CH')
on conflict (code) do update set
  name = excluded.name,
  country_code = excluded.country_code;

-- =========================================================
-- 7. BROADER AIRCRAFT REFERENCE CATALOGUE
-- =========================================================

insert into public.aircraft_manufacturers (name) values
  ('ATR'),
  ('Embraer'),
  ('Bombardier'),
  ('De Havilland Canada'),
  ('Fokker'),
  ('Saab'),
  ('COMAC'),
  ('Airbus Helicopters'),
  ('Bell'),
  ('Leonardo'),
  ('Sikorsky'),
  ('NHIndustries'),
  ('Eurofighter')
on conflict (name) do nothing;

-- Airbus
insert into public.aircraft_families (manufacturer_id, code, display_name)
select m.id, x.code, x.label
from public.aircraft_manufacturers m
cross join (values
  ('A220','A220'),
  ('A300','A300'),
  ('A310','A310'),
  ('A320','A320 Family'),
  ('A330','A330 Family'),
  ('A340','A340'),
  ('A350','A350'),
  ('A380','A380')
) x(code,label)
where m.name = 'Airbus'
on conflict (manufacturer_id, code) do nothing;

-- Boeing
insert into public.aircraft_families (manufacturer_id, code, display_name)
select m.id, x.code, x.label
from public.aircraft_manufacturers m
cross join (values
  ('B717','717'),
  ('B727','727'),
  ('B737','737 Family'),
  ('B747','747'),
  ('B757','757'),
  ('B767','767'),
  ('B777','777 Family'),
  ('B787','787')
) x(code,label)
where m.name = 'Boeing'
on conflict (manufacturer_id, code) do nothing;

-- ATR
insert into public.aircraft_families (manufacturer_id, code, display_name)
select m.id, x.code, x.label
from public.aircraft_manufacturers m
cross join (values ('ATR42','ATR 42'),('ATR72','ATR 72')) x(code,label)
where m.name = 'ATR'
on conflict (manufacturer_id, code) do nothing;

-- Embraer
insert into public.aircraft_families (manufacturer_id, code, display_name)
select m.id, x.code, x.label
from public.aircraft_manufacturers m
cross join (values
  ('ERJ145','ERJ 135/140/145'),
  ('EJET','E-Jet E170/E175/E190/E195'),
  ('EJET-E2','E-Jet E2')
) x(code,label)
where m.name = 'Embraer'
on conflict (manufacturer_id, code) do nothing;

-- Bombardier
insert into public.aircraft_families (manufacturer_id, code, display_name)
select m.id, x.code, x.label
from public.aircraft_manufacturers m
cross join (values
  ('CRJ','CRJ Series'),
  ('CHALLENGER','Challenger'),
  ('GLOBAL','Global')
) x(code,label)
where m.name = 'Bombardier'
on conflict (manufacturer_id, code) do nothing;

-- De Havilland Canada
insert into public.aircraft_families (manufacturer_id, code, display_name)
select m.id, x.code, x.label
from public.aircraft_manufacturers m
cross join (values
  ('DHC6','DHC-6 Twin Otter'),
  ('DHC8','DHC-8 / Dash 8 / Q Series')
) x(code,label)
where m.name = 'De Havilland Canada'
on conflict (manufacturer_id, code) do nothing;

-- Other transport aircraft
insert into public.aircraft_families (manufacturer_id, code, display_name)
select m.id, x.code, x.label
from public.aircraft_manufacturers m
cross join (values ('F50','Fokker 50'),('F70','Fokker 70'),('F100','Fokker 100')) x(code,label)
where m.name = 'Fokker'
on conflict (manufacturer_id, code) do nothing;

insert into public.aircraft_families (manufacturer_id, code, display_name)
select m.id, x.code, x.label
from public.aircraft_manufacturers m
cross join (values ('S340','Saab 340'),('S2000','Saab 2000')) x(code,label)
where m.name = 'Saab'
on conflict (manufacturer_id, code) do nothing;

insert into public.aircraft_families (manufacturer_id, code, display_name)
select m.id, x.code, x.label
from public.aircraft_manufacturers m
cross join (values ('C909','C909 / ARJ21'),('C919','C919')) x(code,label)
where m.name = 'COMAC'
on conflict (manufacturer_id, code) do nothing;

-- Rotorcraft / specialist aircraft
insert into public.aircraft_families (manufacturer_id, code, display_name)
select m.id, x.code, x.label
from public.aircraft_manufacturers m
cross join (values
  ('H125','H125'),
  ('H130','H130'),
  ('H135','H135'),
  ('H145','H145'),
  ('H155','H155'),
  ('H175','H175'),
  ('H215','H215'),
  ('H225','H225'),
  ('TIGER','Tiger')
) x(code,label)
where m.name = 'Airbus Helicopters'
on conflict (manufacturer_id, code) do nothing;

insert into public.aircraft_families (manufacturer_id, code, display_name)
select m.id, x.code, x.label
from public.aircraft_manufacturers m
cross join (values
  ('B206','Bell 206'),
  ('B212','Bell 212'),
  ('B412','Bell 412'),
  ('B429','Bell 429'),
  ('B505','Bell 505')
) x(code,label)
where m.name = 'Bell'
on conflict (manufacturer_id, code) do nothing;

insert into public.aircraft_families (manufacturer_id, code, display_name)
select m.id, x.code, x.label
from public.aircraft_manufacturers m
cross join (values
  ('AW109','AW109'),
  ('AW139','AW139'),
  ('AW169','AW169'),
  ('AW189','AW189')
) x(code,label)
where m.name = 'Leonardo'
on conflict (manufacturer_id, code) do nothing;

insert into public.aircraft_families (manufacturer_id, code, display_name)
select m.id, x.code, x.label
from public.aircraft_manufacturers m
cross join (values ('S76','S-76'),('S92','S-92')) x(code,label)
where m.name = 'Sikorsky'
on conflict (manufacturer_id, code) do nothing;

insert into public.aircraft_families (manufacturer_id, code, display_name)
select m.id, 'NH90', 'NH90'
from public.aircraft_manufacturers m where m.name = 'NHIndustries'
on conflict (manufacturer_id, code) do nothing;

insert into public.aircraft_families (manufacturer_id, code, display_name)
select m.id, 'TYPHOON', 'Eurofighter Typhoon'
from public.aircraft_manufacturers m where m.name = 'Eurofighter'
on conflict (manufacturer_id, code) do nothing;
