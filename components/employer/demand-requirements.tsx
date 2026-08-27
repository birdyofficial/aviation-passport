"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { COUNTRIES, countryLabel } from "@/lib/reference/countries";
import { LICENCE_SYSTEMS } from "@/lib/reference/licensing";

type RequirementLevel = "mandatory" | "trainable" | "preferred" | "not_relevant";
type ExposureLevel = "primary" | "regular" | "occasional" | "limited";

type Environment = { id: number; code: string; label: string };
type Manufacturer = { id: string; name: string };
type AircraftFamily = { id: string; manufacturer_id: string; code: string; display_name: string };
type AircraftVariant = { id: string; family_id: string; code: string; display_name: string };
type Engine = { id: string; manufacturer: string | null; code: string; display_name: string };
type VariantEngine = { variant_id: string; engine_id: string };
type Authority = { id: string; code: string; name: string; country_code: string | null };
type Competency = { id: string; code: string; label: string; aircraft_specific: boolean };

type DemandEnvironment = { demand_id: string; environment_id: number; requirement_level: RequirementLevel };
type AircraftRequirement = {
  id: string; demand_id: string; aircraft_family_id: string | null; custom_aircraft_family: string | null;
  aircraft_variant_id: string | null; engine_id: string | null;
  experience_requirement: RequirementLevel; rating_requirement: RequirementLevel; authorisation_requirement: RequirementLevel;
  minimum_exposure: ExposureLevel | null; max_months_since_exposure: number | null; notes: string | null;
};
type LicenceRequirement = {
  id: string; demand_id: string; authority_id: string | null; issuing_country_code: string | null;
  issuing_authority_name: string | null; licence_scheme: string | null; category_privileges: string | null;
  requirement_level: RequirementLevel; conversion_accepted: boolean; notes: string | null;
};
type CompetencyRequirement = {
  id: string; demand_id: string; competency_id: string | null; custom_competency_name: string | null;
  aircraft_family_id: string | null; requirement_level: RequirementLevel; must_be_current: boolean;
  max_months_since_use: number | null; notes: string | null;
};
type TrainingRequirement = {
  id: string; demand_id: string; training_name: string; requirement_level: RequirementLevel; must_be_current: boolean; notes: string | null;
};
type FunnelStage = {
  stage_order: number; stage_key: string; stage_label: string;
  structured_count: number; receptive_count: number; verified_count: number;
};

type Props = {
  demandId: string;
  demandTitle: string;
  countryCode: string | null;
  sponsorshipAvailable: boolean;
  onClose: () => void;
};

const LEVELS: [RequirementLevel, string][] = [
  ["mandatory", "Mandatory"],
  ["trainable", "Trainable"],
  ["preferred", "Preferred"],
  ["not_relevant", "Not relevant"],
];

const AIRCRAFT_MANUFACTURER_ORDER = [
  "Boeing", "Airbus", "Airbus Helicopters", "ATR", "Embraer", "Bombardier", "De Havilland Canada",
  "COMAC", "Fokker", "Saab", "Bell", "Leonardo", "Sikorsky", "NHIndustries", "Eurofighter",
];

const ENVIRONMENT_ORDER = [
  "line_maintenance", "base_maintenance", "heavy_maintenance", "production", "final_assembly",
  "prototype_development", "flight_test", "modification_retrofit", "component_workshop", "engine_shop",
  "structures", "mro_support", "field_support", "other",
];

const TRAINING_OPTIONS = [
  "Human Factors", "EWIS", "Fuel Tank Safety", "Dangerous Goods", "Safety Management System (SMS)",
  "Continuation Training", "ETOPS", "RVSM", "Airside / Airport Safety", "First Aid",
];

function levelClass(level: RequirementLevel) {
  if (level === "mandatory") return "border-rose-200 bg-rose-50 text-rose-700";
  if (level === "trainable") return "border-blue-200 bg-blue-50 text-blue-700";
  if (level === "preferred") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-500";
}

function levelLabel(level: RequirementLevel) {
  return LEVELS.find(([value]) => value === level)?.[1] ?? level;
}

export default function DemandRequirements({ demandId, demandTitle, countryCode, sponsorshipAvailable, onClose }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [families, setFamilies] = useState<AircraftFamily[]>([]);
  const [variants, setVariants] = useState<AircraftVariant[]>([]);
  const [engines, setEngines] = useState<Engine[]>([]);
  const [variantEngines, setVariantEngines] = useState<VariantEngine[]>([]);
  const [authorities, setAuthorities] = useState<Authority[]>([]);
  const [competencies, setCompetencies] = useState<Competency[]>([]);

  const [environmentRequirements, setEnvironmentRequirements] = useState<DemandEnvironment[]>([]);
  const [aircraftRequirements, setAircraftRequirements] = useState<AircraftRequirement[]>([]);
  const [licenceRequirements, setLicenceRequirements] = useState<LicenceRequirement[]>([]);
  const [competencyRequirements, setCompetencyRequirements] = useState<CompetencyRequirement[]>([]);
  const [trainingRequirements, setTrainingRequirements] = useState<TrainingRequirement[]>([]);
  const [funnel, setFunnel] = useState<FunnelStage[]>([]);

  const [environmentForm, setEnvironmentForm] = useState({ environment_id: "", requirement_level: "mandatory" as RequirementLevel });
  const [editingAircraftId, setEditingAircraftId] = useState<string | null>(null);
  const [aircraftForm, setAircraftForm] = useState({
    aircraft_family_id: "", custom_aircraft_family: "", aircraft_variant_id: "", engine_id: "",
    experience_requirement: "mandatory" as RequirementLevel, rating_requirement: "preferred" as RequirementLevel,
    authorisation_requirement: "not_relevant" as RequirementLevel, minimum_exposure: "" as "" | ExposureLevel,
    max_months_since_exposure: "",
  });
  const [editingLicenceId, setEditingLicenceId] = useState<string | null>(null);
  const [licenceForm, setLicenceForm] = useState({
    issuing_country_code: "", authority_id: "", custom_authority_name: "", licence_system_code: "",
    custom_licence_system: "", category_privileges: "", requirement_level: "mandatory" as RequirementLevel,
    conversion_accepted: false,
  });
  const [editingCompetencyId, setEditingCompetencyId] = useState<string | null>(null);
  const [competencyForm, setCompetencyForm] = useState({
    competency_id: "", custom_competency_name: "", aircraft_family_id: "", requirement_level: "preferred" as RequirementLevel,
    max_months_since_use: "",
  });
  const [editingTrainingId, setEditingTrainingId] = useState<string | null>(null);
  const [trainingForm, setTrainingForm] = useState({ training_key: "", custom_training_name: "", requirement_level: "preferred" as RequirementLevel, must_be_current: true });

  useEffect(() => { void loadAll(); }, [demandId]);

  const manufacturerById = useMemo(() => Object.fromEntries(manufacturers.map((item) => [item.id, item])), [manufacturers]);
  const familyById = useMemo(() => Object.fromEntries(families.map((item) => [item.id, item])), [families]);
  const variantById = useMemo(() => Object.fromEntries(variants.map((item) => [item.id, item])), [variants]);
  const engineById = useMemo(() => Object.fromEntries(engines.map((item) => [item.id, item])), [engines]);
  const authorityById = useMemo(() => Object.fromEntries(authorities.map((item) => [item.id, item])), [authorities]);
  const competencyById = useMemo(() => Object.fromEntries(competencies.map((item) => [item.id, item])), [competencies]);
  const environmentById = useMemo(() => Object.fromEntries(environments.map((item) => [item.id, item])), [environments]);

  const sortedEnvironments = useMemo(() => {
    const rank = new Map(ENVIRONMENT_ORDER.map((code, index) => [code, index]));
    return [...environments].sort((a,b) => (rank.get(a.code) ?? 999) - (rank.get(b.code) ?? 999) || a.label.localeCompare(b.label));
  }, [environments]);

  const aircraftFamilyGroups = useMemo(() => {
    const rank = new Map(AIRCRAFT_MANUFACTURER_ORDER.map((name, index) => [name, index]));
    const groups = new Map<string, AircraftFamily[]>();
    for (const family of families) {
      const name = manufacturerById[family.manufacturer_id]?.name ?? "Other";
      groups.set(name, [...(groups.get(name) ?? []), family]);
    }
    return [...groups.entries()].map(([manufacturerName, groupFamilies]) => ({
      manufacturerName,
      families: groupFamilies.sort((a,b) => a.display_name.localeCompare(b.display_name, undefined, { numeric: true })),
    })).sort((a,b) => (rank.get(a.manufacturerName) ?? 999) - (rank.get(b.manufacturerName) ?? 999) || a.manufacturerName.localeCompare(b.manufacturerName));
  }, [families, manufacturerById]);

  const aircraftVariants = useMemo(() => variants.filter((item) => item.family_id === aircraftForm.aircraft_family_id), [variants, aircraftForm.aircraft_family_id]);
  const aircraftEngines = useMemo(() => {
    const ids = new Set(variantEngines.filter((item) => !aircraftForm.aircraft_variant_id || item.variant_id === aircraftForm.aircraft_variant_id).map((item) => item.engine_id));
    return engines.filter((item) => ids.has(item.id));
  }, [engines, variantEngines, aircraftForm.aircraft_variant_id]);

  const finalStage = funnel.at(-1);
  const baseStage = funnel[0];
  const mandatoryCount = [
    ...environmentRequirements.filter((r) => r.requirement_level === "mandatory"),
    ...licenceRequirements.filter((r) => r.requirement_level === "mandatory"),
    ...competencyRequirements.filter((r) => r.requirement_level === "mandatory"),
    ...trainingRequirements.filter((r) => r.requirement_level === "mandatory"),
  ].length + aircraftRequirements.reduce((sum, r) => sum + [r.experience_requirement, r.rating_requirement, r.authorisation_requirement].filter((level) => level === "mandatory").length, 0);

  async function loadAll() {
    setLoading(true); setNotice(null);
    try {
      const [envRef, manufacturerRef, familyRef, variantRef, engineRef, variantEngineRef, authorityRef, competencyRef,
        envReq, aircraftReq, licenceReq, competencyReq, trainingReq] = await Promise.all([
        supabase.from("environments").select("*"),
        supabase.from("aircraft_manufacturers").select("*").order("name"),
        supabase.from("aircraft_families").select("*").order("display_name"),
        supabase.from("aircraft_variants").select("*").order("display_name"),
        supabase.from("engine_types").select("*").order("display_name"),
        supabase.from("aircraft_variant_engines").select("*"),
        supabase.from("licence_authorities").select("*").order("name"),
        supabase.from("competency_catalog").select("*").order("label"),
        supabase.from("demand_environments").select("*").eq("demand_id", demandId),
        supabase.from("demand_aircraft_requirements").select("*").eq("demand_id", demandId).order("id"),
        supabase.from("demand_licence_requirements").select("*").eq("demand_id", demandId).order("id"),
        supabase.from("demand_competency_requirements").select("*").eq("demand_id", demandId).order("id"),
        supabase.from("demand_training_requirements").select("*").eq("demand_id", demandId).order("id"),
      ]);
      const firstError = [envRef, manufacturerRef, familyRef, variantRef, engineRef, variantEngineRef, authorityRef, competencyRef, envReq, aircraftReq, licenceReq, competencyReq, trainingReq].find((r) => r.error)?.error;
      if (firstError) throw firstError;
      setEnvironments((envRef.data ?? []) as Environment[]); setManufacturers((manufacturerRef.data ?? []) as Manufacturer[]);
      setFamilies((familyRef.data ?? []) as AircraftFamily[]); setVariants((variantRef.data ?? []) as AircraftVariant[]);
      setEngines((engineRef.data ?? []) as Engine[]); setVariantEngines((variantEngineRef.data ?? []) as VariantEngine[]);
      setAuthorities((authorityRef.data ?? []) as Authority[]); setCompetencies((competencyRef.data ?? []) as Competency[]);
      setEnvironmentRequirements((envReq.data ?? []) as DemandEnvironment[]); setAircraftRequirements((aircraftReq.data ?? []) as AircraftRequirement[]);
      setLicenceRequirements((licenceReq.data ?? []) as LicenceRequirement[]); setCompetencyRequirements((competencyReq.data ?? []) as CompetencyRequirement[]);
      setTrainingRequirements((trainingReq.data ?? []) as TrainingRequirement[]);
      await loadFunnel();
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not load demand requirements." });
    } finally { setLoading(false); }
  }

  async function loadFunnel() {
    const { data, error } = await supabase.rpc("get_demand_supply_funnel", { p_demand_id: demandId });
    if (error) throw error;
    setFunnel((data ?? []).map((row: FunnelStage) => ({ ...row, structured_count: Number(row.structured_count), receptive_count: Number(row.receptive_count), verified_count: Number(row.verified_count) })));
  }

  async function refresh(message: string) {
    await loadAll(); setNotice({ type: "success", text: message });
  }

  async function saveEnvironment(event: FormEvent) {
    event.preventDefault(); if (!environmentForm.environment_id) return;
    setBusy(true); setNotice(null);
    try {
      const { error } = await supabase.from("demand_environments").upsert({ demand_id: demandId, environment_id: Number(environmentForm.environment_id), requirement_level: environmentForm.requirement_level }, { onConflict: "demand_id,environment_id" });
      if (error) throw error;
      setEnvironmentForm({ environment_id: "", requirement_level: "mandatory" }); await refresh("Environment requirement saved.");
    } catch (error) { setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not save environment requirement." }); }
    finally { setBusy(false); }
  }

  async function updateEnvironment(requirement: DemandEnvironment, level: RequirementLevel) {
    setBusy(true); setNotice(null);
    try { const { error } = await supabase.from("demand_environments").update({ requirement_level: level }).eq("demand_id", demandId).eq("environment_id", requirement.environment_id); if (error) throw error; await refresh("Environment requirement updated."); }
    catch (error) { setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not update environment requirement." }); } finally { setBusy(false); }
  }

  async function removeEnvironment(requirement: DemandEnvironment) {
    if (!window.confirm("Remove this environment requirement?")) return; setBusy(true);
    try { const { error } = await supabase.from("demand_environments").delete().eq("demand_id", demandId).eq("environment_id", requirement.environment_id); if (error) throw error; await refresh("Environment requirement removed."); }
    catch (error) { setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not remove environment requirement." }); } finally { setBusy(false); }
  }

  function resetAircraft() { setEditingAircraftId(null); setAircraftForm({ aircraft_family_id: "", custom_aircraft_family: "", aircraft_variant_id: "", engine_id: "", experience_requirement: "mandatory", rating_requirement: "preferred", authorisation_requirement: "not_relevant", minimum_exposure: "", max_months_since_exposure: "" }); }
  function editAircraft(r: AircraftRequirement) { setEditingAircraftId(r.id); setAircraftForm({ aircraft_family_id: r.aircraft_family_id ?? (r.custom_aircraft_family ? "__custom__" : ""), custom_aircraft_family: r.custom_aircraft_family ?? "", aircraft_variant_id: r.aircraft_variant_id ?? "", engine_id: r.engine_id ?? "", experience_requirement: r.experience_requirement, rating_requirement: r.rating_requirement, authorisation_requirement: r.authorisation_requirement, minimum_exposure: r.minimum_exposure ?? "", max_months_since_exposure: r.max_months_since_exposure == null ? "" : String(r.max_months_since_exposure) }); }
  async function saveAircraft(event: FormEvent) {
    event.preventDefault(); setBusy(true); setNotice(null);
    try {
      const custom = aircraftForm.aircraft_family_id === "__custom__" ? aircraftForm.custom_aircraft_family.trim() : "";
      if ((!aircraftForm.aircraft_family_id || aircraftForm.aircraft_family_id === "__custom__") && !custom) throw new Error("Select or enter an aircraft family.");
      const months = aircraftForm.max_months_since_exposure.trim() ? Number(aircraftForm.max_months_since_exposure) : null;
      if (months != null && (!Number.isInteger(months) || months < 0)) throw new Error("Aircraft recency must be a whole number of months.");
      const payload = { demand_id: demandId, aircraft_family_id: aircraftForm.aircraft_family_id && aircraftForm.aircraft_family_id !== "__custom__" ? aircraftForm.aircraft_family_id : null, custom_aircraft_family: custom || null, aircraft_variant_id: aircraftForm.aircraft_family_id === "__custom__" ? null : aircraftForm.aircraft_variant_id || null, engine_id: aircraftForm.aircraft_family_id === "__custom__" ? null : aircraftForm.engine_id || null, experience_requirement: aircraftForm.experience_requirement, rating_requirement: aircraftForm.rating_requirement, authorisation_requirement: aircraftForm.authorisation_requirement, minimum_exposure: aircraftForm.minimum_exposure || null, max_months_since_exposure: months };
      const result = editingAircraftId ? await supabase.from("demand_aircraft_requirements").update(payload).eq("id", editingAircraftId) : await supabase.from("demand_aircraft_requirements").insert(payload);
      if (result.error) throw result.error; resetAircraft(); await refresh("Aircraft requirement saved. Supply funnel recalculated.");
    } catch (error) { setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not save aircraft requirement." }); } finally { setBusy(false); }
  }
  async function removeAircraft(r: AircraftRequirement) { if (!window.confirm("Remove this aircraft requirement?")) return; setBusy(true); try { const { error } = await supabase.from("demand_aircraft_requirements").delete().eq("id", r.id); if (error) throw error; if (editingAircraftId === r.id) resetAircraft(); await refresh("Aircraft requirement removed."); } catch (error) { setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not remove aircraft requirement." }); } finally { setBusy(false); } }

  function resetLicence() { setEditingLicenceId(null); setLicenceForm({ issuing_country_code: "", authority_id: "", custom_authority_name: "", licence_system_code: "", custom_licence_system: "", category_privileges: "", requirement_level: "mandatory", conversion_accepted: false }); }
  function editLicence(r: LicenceRequirement) { const knownSystem = LICENCE_SYSTEMS.find((item) => item.code !== "OTHER" && item.label === r.licence_scheme); setEditingLicenceId(r.id); setLicenceForm({ issuing_country_code: r.issuing_country_code ?? "", authority_id: r.authority_id ?? (r.issuing_authority_name ? "__custom__" : ""), custom_authority_name: r.authority_id ? "" : r.issuing_authority_name ?? "", licence_system_code: knownSystem?.code ?? (r.licence_scheme ? "OTHER" : ""), custom_licence_system: knownSystem ? "" : r.licence_scheme ?? "", category_privileges: r.category_privileges ?? "", requirement_level: r.requirement_level, conversion_accepted: r.conversion_accepted }); }
  async function saveLicence(event: FormEvent) {
    event.preventDefault(); setBusy(true); setNotice(null);
    try {
      const selectedAuthority = authorities.find((item) => item.id === licenceForm.authority_id);
      const selectedSystem = LICENCE_SYSTEMS.find((item) => item.code === licenceForm.licence_system_code);
      const system = licenceForm.licence_system_code === "OTHER" ? licenceForm.custom_licence_system.trim() : selectedSystem?.label ?? "";
      if (!system && !licenceForm.conversion_accepted) throw new Error("Select a licence system, or explicitly allow conversion.");
      const payload = { demand_id: demandId, authority_id: selectedAuthority?.id ?? null, issuing_country_code: licenceForm.issuing_country_code || selectedAuthority?.country_code || null, issuing_authority_name: selectedAuthority?.name ?? (licenceForm.custom_authority_name.trim() || null), licence_scheme: system || null, category_privileges: licenceForm.category_privileges.trim() || null, requirement_level: licenceForm.requirement_level, conversion_accepted: licenceForm.conversion_accepted };
      const result = editingLicenceId ? await supabase.from("demand_licence_requirements").update(payload).eq("id", editingLicenceId) : await supabase.from("demand_licence_requirements").insert(payload);
      if (result.error) throw result.error; resetLicence(); await refresh("Licence requirement saved. Supply funnel recalculated.");
    } catch (error) { setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not save licence requirement." }); } finally { setBusy(false); }
  }
  async function removeLicence(r: LicenceRequirement) { if (!window.confirm("Remove this licence requirement?")) return; setBusy(true); try { const { error } = await supabase.from("demand_licence_requirements").delete().eq("id", r.id); if (error) throw error; if (editingLicenceId === r.id) resetLicence(); await refresh("Licence requirement removed."); } catch (error) { setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not remove licence requirement." }); } finally { setBusy(false); } }

  function resetCompetency() { setEditingCompetencyId(null); setCompetencyForm({ competency_id: "", custom_competency_name: "", aircraft_family_id: "", requirement_level: "preferred", max_months_since_use: "" }); }
  function editCompetency(r: CompetencyRequirement) { setEditingCompetencyId(r.id); setCompetencyForm({ competency_id: r.competency_id ?? "__custom__", custom_competency_name: r.custom_competency_name ?? "", aircraft_family_id: r.aircraft_family_id ?? "", requirement_level: r.requirement_level, max_months_since_use: r.max_months_since_use == null ? "" : String(r.max_months_since_use) }); }
  async function saveCompetency(event: FormEvent) {
    event.preventDefault(); setBusy(true); setNotice(null);
    try {
      const selected = competencies.find((item) => item.id === competencyForm.competency_id); const custom = competencyForm.competency_id === "__custom__" ? competencyForm.custom_competency_name.trim() : "";
      if (!selected && !custom) throw new Error("Select or enter a competency.");
      const months = competencyForm.max_months_since_use.trim() ? Number(competencyForm.max_months_since_use) : null;
      if (months != null && (!Number.isInteger(months) || months < 0)) throw new Error("Competency recency must be a whole number of months.");
      const payload = { demand_id: demandId, competency_id: selected?.id ?? null, custom_competency_name: custom || null, aircraft_family_id: competencyForm.aircraft_family_id || null, requirement_level: competencyForm.requirement_level, must_be_current: months != null, max_months_since_use: months };
      const result = editingCompetencyId ? await supabase.from("demand_competency_requirements").update(payload).eq("id", editingCompetencyId) : await supabase.from("demand_competency_requirements").insert(payload);
      if (result.error) throw result.error; resetCompetency(); await refresh("Competency requirement saved. Supply funnel recalculated.");
    } catch (error) { setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not save competency requirement." }); } finally { setBusy(false); }
  }
  async function removeCompetency(r: CompetencyRequirement) { if (!window.confirm("Remove this competency requirement?")) return; setBusy(true); try { const { error } = await supabase.from("demand_competency_requirements").delete().eq("id", r.id); if (error) throw error; if (editingCompetencyId === r.id) resetCompetency(); await refresh("Competency requirement removed."); } catch (error) { setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not remove competency requirement." }); } finally { setBusy(false); } }

  function resetTraining() { setEditingTrainingId(null); setTrainingForm({ training_key: "", custom_training_name: "", requirement_level: "preferred", must_be_current: true }); }
  function editTraining(r: TrainingRequirement) { const known = TRAINING_OPTIONS.includes(r.training_name); setEditingTrainingId(r.id); setTrainingForm({ training_key: known ? r.training_name : "__custom__", custom_training_name: known ? "" : r.training_name, requirement_level: r.requirement_level, must_be_current: r.must_be_current }); }
  async function saveTraining(event: FormEvent) {
    event.preventDefault(); setBusy(true); setNotice(null);
    try { const name = trainingForm.training_key === "__custom__" ? trainingForm.custom_training_name.trim() : trainingForm.training_key; if (!name) throw new Error("Select or enter a training requirement."); const payload = { demand_id: demandId, training_name: name, requirement_level: trainingForm.requirement_level, must_be_current: trainingForm.must_be_current }; const result = editingTrainingId ? await supabase.from("demand_training_requirements").update(payload).eq("id", editingTrainingId) : await supabase.from("demand_training_requirements").insert(payload); if (result.error) throw result.error; resetTraining(); await refresh("Training requirement saved. Supply funnel recalculated."); }
    catch (error) { setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not save training requirement." }); } finally { setBusy(false); }
  }
  async function removeTraining(r: TrainingRequirement) { if (!window.confirm("Remove this training requirement?")) return; setBusy(true); try { const { error } = await supabase.from("demand_training_requirements").delete().eq("id", r.id); if (error) throw error; if (editingTrainingId === r.id) resetTraining(); await refresh("Training requirement removed."); } catch (error) { setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not remove training requirement." }); } finally { setBusy(false); } }

  if (loading) return <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-8 text-slate-600">Loading requirements and market intelligence…</section>;

  return (
    <section className="mt-8 rounded-3xl border border-slate-200 bg-slate-50 p-4 shadow-sm sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div><div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">V0.8 · Demand intelligence</div><h2 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">{demandTitle}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Define exactly what is mandatory, what can be trained, and what is merely preferred. Only Mandatory requirements shrink the available workforce pool.</p></div>
        <button type="button" onClick={onClose} className="self-start rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700">Close requirements</button>
      </div>

      {notice ? <div className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${notice.type === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{notice.text}</div> : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Market Passports" value={String(baseStage?.structured_count ?? 0)} note="Non-private structured Passports" />
        <Metric label="Mandatory match" value={String(finalStage?.structured_count ?? 0)} note={`${mandatoryCount} hard requirement${mandatoryCount === 1 ? "" : "s"}`} />
        <Metric label="Receptive match" value={String(finalStage?.receptive_count ?? 0)} note="Open to opportunities" />
        <Metric label="Verified match" value={String(finalStage?.verified_count ?? 0)} note="Trust-backed hard requirements" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6">
          <div className="flex items-start justify-between gap-4"><div><h3 className="text-xl font-semibold text-slate-950">Supply funnel</h3><p className="mt-1 text-sm text-slate-500">Watch hard requirements narrow the labour pool.</p></div><button type="button" disabled={busy} onClick={() => void loadFunnel().catch((error) => setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not refresh intelligence." }))} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700">Refresh</button></div>
          <div className="mt-5 space-y-2">{funnel.map((stage, index) => { const previous = index ? funnel[index - 1].structured_count : stage.structured_count; const loss = Math.max(0, previous - stage.structured_count); return <div key={stage.stage_key} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3"><div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold text-slate-800">{stage.stage_label}</span><span className="text-lg font-semibold text-slate-950">{stage.structured_count}</span></div><div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500"><span>{stage.receptive_count} receptive</span><span>{stage.verified_count} verified</span>{loss ? <span className="text-rose-600">−{loss} at this stage</span> : null}</div></div>; })}</div>
          <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-800"><strong>Structured</strong> includes submitted facts that are not rejected or expired. <strong>Verified</strong> uses only verification/employer-confirmed facts. No individual worker records are exposed here.</div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6">
          <h3 className="text-xl font-semibold text-slate-950">Automatic eligibility</h3>
          <div className="mt-4 rounded-2xl border border-slate-200 p-4"><div className="text-xs font-bold uppercase tracking-[0.1em] text-slate-400">Work rights</div><div className="mt-1 font-semibold text-slate-900">{countryCode ? countryLabel(countryCode) : "No demand country selected"}</div><p className="mt-2 text-sm leading-6 text-slate-600">{!countryCode ? "Set the demand country to activate work-right eligibility." : sponsorshipAvailable ? "Sponsorship is available, so existing local work rights do not hard-filter the pool." : "Without sponsorship, a worker needs a valid citizen, permanent-resident, unrestricted or temporary work right for this country."}</p></div>
          <div className="mt-4 rounded-2xl border border-slate-200 p-4"><div className="text-xs font-bold uppercase tracking-[0.1em] text-slate-400">Requirement behaviour</div><div className="mt-3 grid gap-2 sm:grid-cols-2">{LEVELS.map(([value,label]) => <div key={value} className={`rounded-xl border px-3 py-2 text-xs font-semibold ${levelClass(value)}`}>{label}{value === "mandatory" ? " · hard filter" : value === "trainable" ? " · gap employer accepts" : value === "preferred" ? " · ranking signal" : " · ignored"}</div>)}</div></div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <RequirementPanel title="Environment" description="Where the worker has operated: line, base, production, field support and more.">
          <form onSubmit={saveEnvironment} className="grid gap-3 sm:grid-cols-[1fr_170px_auto]"><select className="input" value={environmentForm.environment_id} onChange={(e) => setEnvironmentForm({ ...environmentForm, environment_id: e.target.value })} required><option value="">Select environment</option>{sortedEnvironments.filter((env) => !environmentRequirements.some((r) => r.environment_id === env.id)).map((env) => <option key={env.id} value={env.id}>{env.label}</option>)}</select><LevelSelect value={environmentForm.requirement_level} onChange={(value) => setEnvironmentForm({ ...environmentForm, requirement_level: value })} /><button disabled={busy} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white">Add</button></form>
          <div className="mt-4 space-y-2">{environmentRequirements.map((r) => <RequirementRow key={r.environment_id} title={environmentById[r.environment_id]?.label ?? "Environment"} level={r.requirement_level} actions={<><select className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs" value={r.requirement_level} onChange={(e) => void updateEnvironment(r, e.target.value as RequirementLevel)}>{LEVELS.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select><RemoveButton disabled={busy} onClick={() => void removeEnvironment(r)} /></>} />)}{!environmentRequirements.length ? <Empty text="No environment requirements yet." /> : null}</div>
        </RequirementPanel>

        <RequirementPanel title="Aircraft" description="Separate experience, rating and company-authorisation requirements for the same aircraft.">
          <form onSubmit={saveAircraft} className="space-y-3"><Field label="Aircraft family"><select className="input" value={aircraftForm.aircraft_family_id} onChange={(e) => setAircraftForm({ ...aircraftForm, aircraft_family_id: e.target.value, custom_aircraft_family: "", aircraft_variant_id: "", engine_id: "" })} required><option value="">Select aircraft</option>{aircraftFamilyGroups.map((group) => <optgroup key={group.manufacturerName} label={group.manufacturerName}>{group.families.map((family) => <option key={family.id} value={family.id}>{family.display_name}</option>)}</optgroup>)}<option value="__custom__">Not listed — enter aircraft</option></select></Field>{aircraftForm.aircraft_family_id === "__custom__" ? <Field label="Exact aircraft family/type"><input className="input" value={aircraftForm.custom_aircraft_family} onChange={(e) => setAircraftForm({ ...aircraftForm, custom_aircraft_family: e.target.value })} required /></Field> : null}
            {aircraftForm.aircraft_family_id && aircraftForm.aircraft_family_id !== "__custom__" ? <div className="grid gap-3 sm:grid-cols-2"><Field label="Variant (optional)"><select className="input" value={aircraftForm.aircraft_variant_id} onChange={(e) => setAircraftForm({ ...aircraftForm, aircraft_variant_id: e.target.value, engine_id: "" })}><option value="">All / not specified</option>{aircraftVariants.map((v) => <option key={v.id} value={v.id}>{v.display_name}</option>)}</select></Field><Field label="Engine (optional)"><select className="input" value={aircraftForm.engine_id} onChange={(e) => setAircraftForm({ ...aircraftForm, engine_id: e.target.value })}><option value="">Not specified</option>{aircraftEngines.map((engine) => <option key={engine.id} value={engine.id}>{engine.display_name}</option>)}</select></Field></div> : null}
            <div className="grid gap-3 sm:grid-cols-3"><Field label="Experience"><LevelSelect value={aircraftForm.experience_requirement} onChange={(value) => setAircraftForm({ ...aircraftForm, experience_requirement: value })} /></Field><Field label="Rating"><LevelSelect value={aircraftForm.rating_requirement} onChange={(value) => setAircraftForm({ ...aircraftForm, rating_requirement: value })} /></Field><Field label="Company authorisation"><LevelSelect value={aircraftForm.authorisation_requirement} onChange={(value) => setAircraftForm({ ...aircraftForm, authorisation_requirement: value })} /></Field></div>
            <div className="grid gap-3 sm:grid-cols-2"><Field label="Minimum exposure (optional)"><select className="input" value={aircraftForm.minimum_exposure} onChange={(e) => setAircraftForm({ ...aircraftForm, minimum_exposure: e.target.value as "" | ExposureLevel })}><option value="">Any exposure</option><option value="limited">Limited</option><option value="occasional">Occasional</option><option value="regular">Regular</option><option value="primary">Primary</option></select></Field><Field label="Max months since exposure (optional)"><input type="number" min="0" step="1" className="input" value={aircraftForm.max_months_since_exposure} onChange={(e) => setAircraftForm({ ...aircraftForm, max_months_since_exposure: e.target.value })} placeholder="e.g. 24" /></Field></div>
            <FormActions editing={Boolean(editingAircraftId)} busy={busy} saveLabel="Save aircraft requirement" onCancel={resetAircraft} />
          </form>
          <div className="mt-5 space-y-3">{aircraftRequirements.map((r) => { const family = r.aircraft_family_id ? familyById[r.aircraft_family_id]?.display_name : r.custom_aircraft_family; const variant = r.aircraft_variant_id ? variantById[r.aircraft_variant_id]?.display_name : null; const engine = r.engine_id ? engineById[r.engine_id]?.display_name : null; return <div key={r.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><div className="font-semibold text-slate-950">{family || "Aircraft"}{variant ? ` · ${variant}` : ""}{engine ? ` · ${engine}` : ""}</div><div className="mt-2 flex flex-wrap gap-2"><Pill label={`Experience: ${levelLabel(r.experience_requirement)}`} level={r.experience_requirement}/><Pill label={`Rating: ${levelLabel(r.rating_requirement)}`} level={r.rating_requirement}/><Pill label={`Authorisation: ${levelLabel(r.authorisation_requirement)}`} level={r.authorisation_requirement}/></div>{r.minimum_exposure || r.max_months_since_exposure != null ? <div className="mt-2 text-xs text-slate-500">{r.minimum_exposure ? `Minimum ${r.minimum_exposure} exposure` : ""}{r.minimum_exposure && r.max_months_since_exposure != null ? " · " : ""}{r.max_months_since_exposure != null ? `within ${r.max_months_since_exposure} months` : ""}</div> : null}</div><RowActions onEdit={() => editAircraft(r)} onRemove={() => void removeAircraft(r)} /></div></div>; })}{!aircraftRequirements.length ? <Empty text="No aircraft requirements yet." /> : null}</div>
        </RequirementPanel>

        <RequirementPanel title="Licence" description="Licence system, issuing authority/country, category privileges and conversion policy.">
          <form onSubmit={saveLicence} className="space-y-3"><div className="grid gap-3 sm:grid-cols-2"><Field label="Issuing country"><CountrySelect value={licenceForm.issuing_country_code} onChange={(value) => setLicenceForm({ ...licenceForm, issuing_country_code: value, authority_id: "", custom_authority_name: "" })} /></Field><Field label="Issuing authority"><select className="input" value={licenceForm.authority_id} onChange={(e) => setLicenceForm({ ...licenceForm, authority_id: e.target.value, custom_authority_name: "" })}><option value="">Any / not specified</option>{authorities.filter((a) => !licenceForm.issuing_country_code || a.country_code === licenceForm.issuing_country_code).map((a) => <option key={a.id} value={a.id}>{a.name}{a.code ? ` (${a.code})` : ""}</option>)}<option value="__custom__">Not listed — enter authority</option></select></Field></div>{licenceForm.authority_id === "__custom__" ? <Field label="Exact authority name"><input className="input" value={licenceForm.custom_authority_name} onChange={(e) => setLicenceForm({ ...licenceForm, custom_authority_name: e.target.value })} /></Field> : null}
            <Field label="Licence system"><select className="input" value={licenceForm.licence_system_code} onChange={(e) => setLicenceForm({ ...licenceForm, licence_system_code: e.target.value, custom_licence_system: "" })}><option value="">Any / not specified</option>{LICENCE_SYSTEMS.map((system) => <option key={system.code} value={system.code}>{system.label}</option>)}</select></Field>{licenceForm.licence_system_code === "OTHER" ? <Field label="Exact licence system"><input className="input" value={licenceForm.custom_licence_system} onChange={(e) => setLicenceForm({ ...licenceForm, custom_licence_system: e.target.value })} required /></Field> : null}
            <div className="grid gap-3 sm:grid-cols-2"><Field label="Category / privileges"><input className="input" value={licenceForm.category_privileges} onChange={(e) => setLicenceForm({ ...licenceForm, category_privileges: e.target.value })} placeholder="B2, B1.1, A&P…" /></Field><Field label="Requirement level"><LevelSelect value={licenceForm.requirement_level} onChange={(value) => setLicenceForm({ ...licenceForm, requirement_level: value })} /></Field></div><label className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700"><input type="checkbox" checked={licenceForm.conversion_accepted} onChange={(e) => setLicenceForm({ ...licenceForm, conversion_accepted: e.target.checked })} />Equivalent foreign licence / conversion pathway accepted</label>
            <FormActions editing={Boolean(editingLicenceId)} busy={busy} saveLabel="Save licence requirement" onCancel={resetLicence} />
          </form>
          <div className="mt-5 space-y-3">{licenceRequirements.map((r) => <RequirementCard key={r.id} title={[r.licence_scheme, r.category_privileges].filter(Boolean).join(" · ") || "Licence requirement"} subtitle={[r.issuing_authority_name || (r.authority_id ? authorityById[r.authority_id]?.name : null), r.issuing_country_code ? countryLabel(r.issuing_country_code) : null, r.conversion_accepted ? "Conversion accepted" : null].filter(Boolean).join(" · ")} level={r.requirement_level} onEdit={() => editLicence(r)} onRemove={() => void removeLicence(r)} />)}{!licenceRequirements.length ? <Empty text="No licence requirements yet." /> : null}</div>
        </RequirementPanel>

        <RequirementPanel title="Competencies" description="Technical capability such as ground run, borescope, NDT or troubleshooting.">
          <form onSubmit={saveCompetency} className="space-y-3"><Field label="Competency"><select className="input" value={competencyForm.competency_id} onChange={(e) => setCompetencyForm({ ...competencyForm, competency_id: e.target.value, custom_competency_name: "" })} required><option value="">Select competency</option>{competencies.map((c) => <option key={c.id} value={c.id}>{c.label}{c.aircraft_specific ? " — aircraft specific" : ""}</option>)}<option value="__custom__">Not listed — enter competency</option></select></Field>{competencyForm.competency_id === "__custom__" ? <Field label="Exact competency"><input className="input" value={competencyForm.custom_competency_name} onChange={(e) => setCompetencyForm({ ...competencyForm, custom_competency_name: e.target.value })} required /></Field> : null}<Field label="Aircraft family (optional)"><select className="input" value={competencyForm.aircraft_family_id} onChange={(e) => setCompetencyForm({ ...competencyForm, aircraft_family_id: e.target.value })}><option value="">Not aircraft-specific</option>{aircraftFamilyGroups.map((group) => <optgroup key={group.manufacturerName} label={group.manufacturerName}>{group.families.map((family) => <option key={family.id} value={family.id}>{family.display_name}</option>)}</optgroup>)}</select></Field><div className="grid gap-3 sm:grid-cols-2"><Field label="Requirement level"><LevelSelect value={competencyForm.requirement_level} onChange={(value) => setCompetencyForm({ ...competencyForm, requirement_level: value })} /></Field><Field label="Max months since last use (optional)"><input type="number" min="0" step="1" className="input" value={competencyForm.max_months_since_use} onChange={(e) => setCompetencyForm({ ...competencyForm, max_months_since_use: e.target.value })} placeholder="e.g. 24" /></Field></div><FormActions editing={Boolean(editingCompetencyId)} busy={busy} saveLabel="Save competency requirement" onCancel={resetCompetency} /></form>
          <div className="mt-5 space-y-3">{competencyRequirements.map((r) => <RequirementCard key={r.id} title={r.competency_id ? competencyById[r.competency_id]?.label ?? "Competency" : r.custom_competency_name ?? "Competency"} subtitle={[r.aircraft_family_id ? familyById[r.aircraft_family_id]?.display_name : null, r.max_months_since_use != null ? `used within ${r.max_months_since_use} months` : null].filter(Boolean).join(" · ")} level={r.requirement_level} onEdit={() => editCompetency(r)} onRemove={() => void removeCompetency(r)} />)}{!competencyRequirements.length ? <Empty text="No competency requirements yet." /> : null}</div>
        </RequirementPanel>

        <RequirementPanel title="Training" description="Formal or recurrent training. Current means the recorded expiry must not have elapsed.">
          <form onSubmit={saveTraining} className="space-y-3"><Field label="Training"><select className="input" value={trainingForm.training_key} onChange={(e) => setTrainingForm({ ...trainingForm, training_key: e.target.value, custom_training_name: "" })} required><option value="">Select training</option>{TRAINING_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}<option value="__custom__">Not listed — enter exact training</option></select></Field>{trainingForm.training_key === "__custom__" ? <Field label="Exact training name"><input className="input" value={trainingForm.custom_training_name} onChange={(e) => setTrainingForm({ ...trainingForm, custom_training_name: e.target.value })} required /></Field> : null}<Field label="Requirement level"><LevelSelect value={trainingForm.requirement_level} onChange={(value) => setTrainingForm({ ...trainingForm, requirement_level: value })} /></Field><label className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700"><input type="checkbox" checked={trainingForm.must_be_current} onChange={(e) => setTrainingForm({ ...trainingForm, must_be_current: e.target.checked })} />Must be current / not expired</label><FormActions editing={Boolean(editingTrainingId)} busy={busy} saveLabel="Save training requirement" onCancel={resetTraining} /></form>
          <div className="mt-5 space-y-3">{trainingRequirements.map((r) => <RequirementCard key={r.id} title={r.training_name} subtitle={r.must_be_current ? "Must be current" : "Historical completion accepted"} level={r.requirement_level} onEdit={() => editTraining(r)} onRemove={() => void removeTraining(r)} />)}{!trainingRequirements.length ? <Empty text="No training requirements yet." /> : null}</div>
        </RequirementPanel>
      </div>
    </section>
  );
}

function RequirementPanel({ title, description, children }: { title: string; description: string; children: ReactNode }) { return <div className="rounded-3xl border border-slate-200 bg-white p-6"><h3 className="text-xl font-semibold text-slate-950">{title}</h3><p className="mt-1 mb-5 text-sm leading-6 text-slate-500">{description}</p>{children}</div>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block"><span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>{children}</label>; }
function LevelSelect({ value, onChange }: { value: RequirementLevel; onChange: (value: RequirementLevel) => void }) { return <select className="input" value={value} onChange={(e) => onChange(e.target.value as RequirementLevel)}>{LEVELS.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select>; }
function CountrySelect({ value, onChange }: { value: string; onChange: (value: string) => void }) { return <select className="input" value={value} onChange={(e) => onChange(e.target.value)}><option value="">Any / not specified</option>{COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select>; }
function Metric({ label, value, note }: { label: string; value: string; note: string }) { return <div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="text-sm text-slate-500">{label}</div><div className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">{value}</div><div className="mt-1 text-xs text-slate-500">{note}</div></div>; }
function Pill({ label, level }: { label: string; level: RequirementLevel }) { return <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${levelClass(level)}`}>{label}</span>; }
function RemoveButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) { return <button type="button" disabled={disabled} onClick={onClick} className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-semibold text-rose-700">Remove</button>; }
function RowActions({ onEdit, onRemove }: { onEdit: () => void; onRemove: () => void }) { return <div className="flex shrink-0 gap-2"><button type="button" onClick={onEdit} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700">Edit</button><button type="button" onClick={onRemove} className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-semibold text-rose-700">Remove</button></div>; }
function RequirementRow({ title, level, actions }: { title: string; level: RequirementLevel; actions: ReactNode }) { return <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"><div className="flex items-center gap-2"><span className="text-sm font-semibold text-slate-900">{title}</span><Pill label={levelLabel(level)} level={level}/></div><div className="flex gap-2">{actions}</div></div>; }
function RequirementCard({ title, subtitle, level, onEdit, onRemove }: { title: string; subtitle?: string; level: RequirementLevel; onEdit: () => void; onRemove: () => void }) { return <div className="rounded-2xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><div className="font-semibold text-slate-950">{title}</div>{subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}<div className="mt-2"><Pill label={levelLabel(level)} level={level}/></div></div><RowActions onEdit={onEdit} onRemove={onRemove}/></div></div>; }
function FormActions({ editing, busy, saveLabel, onCancel }: { editing: boolean; busy: boolean; saveLabel: string; onCancel: () => void }) { return <div className="flex flex-wrap gap-2"><button disabled={busy} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saveLabel}</button>{editing ? <button type="button" disabled={busy} onClick={onCancel} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Cancel edit</button> : null}</div>; }
function Empty({ text }: { text: string }) { return <div className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-center text-sm text-slate-500">{text}</div>; }
