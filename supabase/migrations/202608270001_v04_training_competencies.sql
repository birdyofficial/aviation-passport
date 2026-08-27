-- AVIATION PASSPORT V0.4 — Training & Competencies
-- Run once after V0.3.

-- A competency can come from the structured platform catalogue or be entered
-- exactly as issued when it is not yet in our catalogue.
alter table public.worker_competencies
  alter column competency_id drop not null;

alter table public.worker_competencies
  add column if not exists custom_competency_name text;

alter table public.worker_competencies
  drop constraint if exists worker_competencies_named_check;

alter table public.worker_competencies
  add constraint worker_competencies_named_check
  check (
    competency_id is not null
    or nullif(btrim(custom_competency_name), '') is not null
  );

insert into public.competency_catalog (code, label, aircraft_specific) values
  ('avionics_troubleshooting', 'Avionics Troubleshooting', false),
  ('electrical_troubleshooting', 'Electrical Troubleshooting', false),
  ('fault_isolation', 'Fault Isolation', false),
  ('pitot_static_test', 'Pitot / Static System Testing', true),
  ('flight_control_rigging', 'Flight Control Rigging', true),
  ('landing_gear_rigging', 'Landing Gear Rigging', true),
  ('apu_ground_run', 'APU Ground Run', true),
  ('aircraft_jacking', 'Aircraft Jacking', true),
  ('aircraft_weighing', 'Aircraft Weighing', false),
  ('ndt', 'Non-Destructive Testing (NDT)', false),
  ('soldering_termination', 'Soldering / Electrical Termination', false),
  ('connector_repair', 'Connector / Pin Repair', false),
  ('bonding_grounding', 'Bonding / Grounding Testing', false),
  ('high_voltage_systems', 'High-Voltage Aircraft Systems', true),
  ('oxygen_system_servicing', 'Oxygen System Servicing', true)
on conflict (code) do nothing;
