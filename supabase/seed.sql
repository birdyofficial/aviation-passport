-- Aviation Passport V0.1
-- Reference seed: initial aircraft, engines, licence authorities and competencies.
-- Safe to re-run where ON CONFLICT is specified.

-- =========================================================
-- MANUFACTURERS
-- =========================================================

insert into public.aircraft_manufacturers (name)
values ('Airbus'), ('Boeing')
on conflict (name) do nothing;

-- =========================================================
-- AIRCRAFT FAMILIES
-- =========================================================

insert into public.aircraft_families (manufacturer_id, code, display_name)
select id, 'A320', 'A320 Family'
from public.aircraft_manufacturers where name = 'Airbus'
on conflict (manufacturer_id, code) do nothing;

insert into public.aircraft_families (manufacturer_id, code, display_name)
select id, 'A330', 'A330 Family'
from public.aircraft_manufacturers where name = 'Airbus'
on conflict (manufacturer_id, code) do nothing;

insert into public.aircraft_families (manufacturer_id, code, display_name)
select id, 'A350', 'A350'
from public.aircraft_manufacturers where name = 'Airbus'
on conflict (manufacturer_id, code) do nothing;

insert into public.aircraft_families (manufacturer_id, code, display_name)
select id, 'A380', 'A380'
from public.aircraft_manufacturers where name = 'Airbus'
on conflict (manufacturer_id, code) do nothing;

insert into public.aircraft_families (manufacturer_id, code, display_name)
select id, 'B737', '737 Family'
from public.aircraft_manufacturers where name = 'Boeing'
on conflict (manufacturer_id, code) do nothing;

insert into public.aircraft_families (manufacturer_id, code, display_name)
select id, 'B777', '777 Family'
from public.aircraft_manufacturers where name = 'Boeing'
on conflict (manufacturer_id, code) do nothing;

insert into public.aircraft_families (manufacturer_id, code, display_name)
select id, 'B787', '787'
from public.aircraft_manufacturers where name = 'Boeing'
on conflict (manufacturer_id, code) do nothing;

-- =========================================================
-- VARIANTS
-- =========================================================

insert into public.aircraft_variants (family_id, code, display_name)
select f.id, v.code, v.display_name
from public.aircraft_families f
join public.aircraft_manufacturers m on m.id = f.manufacturer_id
cross join (values
  ('A319', 'A319'),
  ('A320', 'A320'),
  ('A321', 'A321')
) as v(code, display_name)
where m.name = 'Airbus' and f.code = 'A320'
on conflict (family_id, code) do nothing;

insert into public.aircraft_variants (family_id, code, display_name)
select f.id, v.code, v.display_name
from public.aircraft_families f
join public.aircraft_manufacturers m on m.id = f.manufacturer_id
cross join (values
  ('A330-200', 'A330-200'),
  ('A330-300', 'A330-300'),
  ('A330-800', 'A330-800'),
  ('A330-900', 'A330-900')
) as v(code, display_name)
where m.name = 'Airbus' and f.code = 'A330'
on conflict (family_id, code) do nothing;

insert into public.aircraft_variants (family_id, code, display_name)
select f.id, v.code, v.display_name
from public.aircraft_families f
join public.aircraft_manufacturers m on m.id = f.manufacturer_id
cross join (values
  ('A350-900', 'A350-900'),
  ('A350-1000', 'A350-1000')
) as v(code, display_name)
where m.name = 'Airbus' and f.code = 'A350'
on conflict (family_id, code) do nothing;

insert into public.aircraft_variants (family_id, code, display_name)
select f.id, 'A380-800', 'A380-800'
from public.aircraft_families f
join public.aircraft_manufacturers m on m.id = f.manufacturer_id
where m.name = 'Airbus' and f.code = 'A380'
on conflict (family_id, code) do nothing;

insert into public.aircraft_variants (family_id, code, display_name)
select f.id, v.code, v.display_name
from public.aircraft_families f
join public.aircraft_manufacturers m on m.id = f.manufacturer_id
cross join (values
  ('737-700', '737-700'),
  ('737-800', '737-800'),
  ('737-900', '737-900'),
  ('737-8', '737 MAX 8'),
  ('737-9', '737 MAX 9')
) as v(code, display_name)
where m.name = 'Boeing' and f.code = 'B737'
on conflict (family_id, code) do nothing;

insert into public.aircraft_variants (family_id, code, display_name)
select f.id, v.code, v.display_name
from public.aircraft_families f
join public.aircraft_manufacturers m on m.id = f.manufacturer_id
cross join (values
  ('777-200', '777-200'),
  ('777-200ER', '777-200ER'),
  ('777-200LR', '777-200LR'),
  ('777-300', '777-300'),
  ('777-300ER', '777-300ER'),
  ('777F', '777 Freighter')
) as v(code, display_name)
where m.name = 'Boeing' and f.code = 'B777'
on conflict (family_id, code) do nothing;

insert into public.aircraft_variants (family_id, code, display_name)
select f.id, v.code, v.display_name
from public.aircraft_families f
join public.aircraft_manufacturers m on m.id = f.manufacturer_id
cross join (values
  ('787-8', '787-8'),
  ('787-9', '787-9'),
  ('787-10', '787-10')
) as v(code, display_name)
where m.name = 'Boeing' and f.code = 'B787'
on conflict (family_id, code) do nothing;

-- =========================================================
-- ENGINES
-- =========================================================

insert into public.engine_types (manufacturer, code, display_name) values
  ('CFM International', 'CFM56', 'CFM56'),
  ('CFM International', 'LEAP-1A', 'LEAP-1A'),
  ('CFM International', 'LEAP-1B', 'LEAP-1B'),
  ('International Aero Engines', 'V2500', 'V2500'),
  ('Pratt & Whitney', 'PW1100G-JM', 'PW1100G-JM'),
  ('Rolls-Royce', 'Trent 700', 'Trent 700'),
  ('Rolls-Royce', 'Trent 7000', 'Trent 7000'),
  ('Rolls-Royce', 'Trent XWB-84', 'Trent XWB-84'),
  ('Rolls-Royce', 'Trent XWB-97', 'Trent XWB-97'),
  ('Rolls-Royce', 'Trent 900', 'Trent 900'),
  ('Engine Alliance', 'GP7200', 'GP7200'),
  ('General Electric', 'GE90', 'GE90'),
  ('General Electric', 'GEnx-1B', 'GEnx-1B'),
  ('Rolls-Royce', 'Trent 1000', 'Trent 1000')
on conflict (manufacturer, code) do nothing;

-- =========================================================
-- INITIAL AIRCRAFT/ENGINE MAPPINGS
-- =========================================================

insert into public.aircraft_variant_engines (variant_id, engine_id)
select av.id, e.id
from public.aircraft_variants av
join public.aircraft_families af on af.id = av.family_id
join public.aircraft_manufacturers am on am.id = af.manufacturer_id
join public.engine_types e on true
where am.name = 'Airbus'
  and af.code = 'A350'
  and (
    (av.code = 'A350-900' and e.code = 'Trent XWB-84')
    or
    (av.code = 'A350-1000' and e.code = 'Trent XWB-97')
  )
on conflict do nothing;

insert into public.aircraft_variant_engines (variant_id, engine_id)
select av.id, e.id
from public.aircraft_variants av
join public.aircraft_families af on af.id = av.family_id
join public.aircraft_manufacturers am on am.id = af.manufacturer_id
join public.engine_types e on true
where am.name = 'Airbus'
  and af.code = 'A380'
  and av.code = 'A380-800'
  and e.code in ('Trent 900', 'GP7200')
on conflict do nothing;

insert into public.aircraft_variant_engines (variant_id, engine_id)
select av.id, e.id
from public.aircraft_variants av
join public.aircraft_families af on af.id = av.family_id
join public.aircraft_manufacturers am on am.id = af.manufacturer_id
join public.engine_types e on true
where am.name = 'Boeing'
  and af.code = 'B787'
  and e.code in ('GEnx-1B', 'Trent 1000')
on conflict do nothing;

insert into public.aircraft_variant_engines (variant_id, engine_id)
select av.id, e.id
from public.aircraft_variants av
join public.aircraft_families af on af.id = av.family_id
join public.aircraft_manufacturers am on am.id = af.manufacturer_id
join public.engine_types e on true
where am.name = 'Boeing'
  and af.code = 'B737'
  and (
    (av.code in ('737-700','737-800','737-900') and e.code = 'CFM56')
    or
    (av.code in ('737-8','737-9') and e.code = 'LEAP-1B')
  )
on conflict do nothing;

-- =========================================================
-- LICENCE AUTHORITIES
-- =========================================================
-- Note: EASA is a regulatory framework, while Part-66 AMLs are issued by
-- national competent authorities. Store the actual issuing authority and
-- use worker_licences.licence_scheme for "EASA Part-66 AML".

insert into public.licence_authorities (code, name, country_code) values
  ('CASA-AU', 'Civil Aviation Safety Authority', 'AU'),
  ('FAA-US', 'Federal Aviation Administration', 'US'),
  ('UKCAA', 'UK Civil Aviation Authority', 'GB'),
  ('GCAA-AE', 'General Civil Aviation Authority', 'AE'),
  ('CAAS-SG', 'Civil Aviation Authority of Singapore', 'SG'),
  ('HKCAD', 'Hong Kong Civil Aviation Department', 'HK'),
  ('CAA-NZ', 'Civil Aviation Authority of New Zealand', 'NZ'),
  ('LBA-DE', 'Luftfahrt-Bundesamt', 'DE')
on conflict (code) do nothing;

-- =========================================================
-- COMPETENCY CATALOG
-- =========================================================

insert into public.competency_catalog (code, label, aircraft_specific) values
  ('engine_ground_run', 'Engine Ground Run', true),
  ('aircraft_towing', 'Aircraft Towing', false),
  ('brake_riding', 'Brake Riding', false),
  ('borescope', 'Borescope Inspection', true),
  ('wiring_repair', 'Wiring Repair', false),
  ('fibre_optic_repair', 'Fibre-Optic Repair', false),
  ('composite_repair', 'Composite Repair', false),
  ('sheet_metal_structures', 'Sheet Metal / Structures', false),
  ('software_data_loading', 'Software / Data Loading', true),
  ('fuel_tank_entry', 'Fuel Tank Entry', false)
on conflict (code) do nothing;
