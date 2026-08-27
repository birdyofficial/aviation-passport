"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { COUNTRIES, countryLabel } from "@/lib/reference/countries";
import DemandRequirements from "@/components/employer/demand-requirements";

type Organisation = {
  id: string;
  created_by: string;
  name: string;
  legal_name: string | null;
  organisation_type: string | null;
  country_code: string | null;
  website: string | null;
  verified: boolean;
};

type Membership = {
  organisation_id: string;
  role: string;
};

type Environment = {
  id: number;
  code: string;
  label: string;
};

type DemandStatus = "draft" | "open" | "paused" | "needs_confirmation" | "filled" | "cancelled";
type DemandVisibility = "public" | "limited" | "confidential";
type EmploymentType = "permanent" | "fixed_term" | "contractor" | "casual" | "part_time" | "self_employed" | "agency";
type MoneyPeriod = "hour" | "day" | "week" | "month" | "year" | "one_off";

type Demand = {
  id: string;
  organisation_id: string;
  created_by: string;
  internal_title: string;
  public_title: string;
  profession: string;
  discipline: string | null;
  seniority: string | null;
  positions_required: number;
  positions_remaining: number;
  status: DemandStatus;
  visibility: DemandVisibility;
  employment_type: EmploymentType | null;
  city: string | null;
  country_code: string | null;
  sponsorship_available: boolean;
  relocation_assistance: boolean;
  expected_start_date: string | null;
  target_fill_date: string | null;
  opened_at: string | null;
  confirmed_active_at: string | null;
  confirmation_due_at: string | null;
  roster: {
    shift?: string;
    pattern?: string;
  } | null;
  created_at: string;
};

type DemandEnvironment = {
  demand_id: string;
  environment_id: number;
  requirement_level: "mandatory" | "trainable" | "preferred" | "not_relevant";
};

type CompensationComponent = {
  id: string;
  demand_id: string;
  component_type: string;
  amount_min: number | null;
  amount_max: number | null;
  currency_code: string;
  period: MoneyPeriod;
};

const ENVIRONMENT_ORDER = [
  "line_maintenance",
  "base_maintenance",
  "heavy_maintenance",
  "production",
  "final_assembly",
  "prototype_development",
  "flight_test",
  "modification_retrofit",
  "component_workshop",
  "engine_shop",
  "structures",
  "mro_support",
  "field_support",
  "other",
];

const EMPLOYMENT_TYPES: [EmploymentType, string][] = [
  ["permanent", "Permanent"],
  ["fixed_term", "Fixed term"],
  ["contractor", "Contractor"],
  ["casual", "Casual"],
  ["part_time", "Part time"],
  ["agency", "Agency"],
  ["self_employed", "Self-employed"],
];

const STATUS_LABELS: Record<DemandStatus, string> = {
  draft: "Draft",
  open: "Open",
  paused: "Paused",
  needs_confirmation: "Needs confirmation",
  filled: "Filled",
  cancelled: "Cancelled",
};

const VISIBILITY_LABELS: Record<DemandVisibility, string> = {
  public: "Public",
  limited: "Limited",
  confidential: "Confidential",
};

const MONEY_PERIODS: [MoneyPeriod, string][] = [
  ["hour", "per hour"],
  ["day", "per day"],
  ["week", "per week"],
  ["month", "per month"],
  ["year", "per year"],
];

function cleanCountryCode(value: string) {
  return value.trim().toUpperCase().slice(0, 2);
}

function statusClasses(status: DemandStatus) {
  if (status === "open") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "draft") return "bg-slate-50 text-slate-700 border-slate-200";
  if (status === "paused" || status === "needs_confirmation") return "bg-amber-50 text-amber-700 border-amber-200";
  if (status === "filled") return "bg-blue-50 text-blue-700 border-blue-200";
  return "bg-rose-50 text-rose-700 border-rose-200";
}

function money(value: number | null, currency: string) {
  if (value == null) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: value % 1 === 0 ? 0 : 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString()}`;
  }
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function thirtyDaysFromNowIso() {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString();
}

export default function EmployerDashboard() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [userId, setUserId] = useState("");

  const [organisations, setOrganisations] = useState<Organisation[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [selectedOrganisationId, setSelectedOrganisationId] = useState("");
  const [environments, setEnvironments] = useState<Environment[]>([]);

  const [demands, setDemands] = useState<Demand[]>([]);
  const [demandEnvironments, setDemandEnvironments] = useState<DemandEnvironment[]>([]);
  const [compensation, setCompensation] = useState<CompensationComponent[]>([]);

  const [showOrganisationForm, setShowOrganisationForm] = useState(false);
  const [organisationForm, setOrganisationForm] = useState({
    name: "",
    legal_name: "",
    organisation_type: "airline",
    country_code: "",
    website: "",
  });

  const emptyDemandForm = {
    internal_title: "",
    public_title: "",
    profession: "",
    discipline: "",
    seniority: "",
    positions_required: "1",
    status: "draft" as DemandStatus,
    visibility: "public" as DemandVisibility,
    employment_type: "permanent" as EmploymentType,
    city: "",
    country_code: "",
    sponsorship_available: false,
    relocation_assistance: false,
    expected_start_date: "",
    target_fill_date: "",
    environment_ids: [] as number[],
    roster_shift: "any",
    roster_pattern: "",
    compensation_min: "",
    compensation_max: "",
    compensation_currency: "AUD",
    compensation_period: "year" as MoneyPeriod,
  };

  const [editingDemandId, setEditingDemandId] = useState<string | null>(null);
  const [demandForm, setDemandForm] = useState(emptyDemandForm);
  const [requirementsDemandId, setRequirementsDemandId] = useState<string | null>(null);

  const selectedOrganisation = organisations.find((item) => item.id === selectedOrganisationId) ?? null;
  const activeDemands = demands.filter((item) => item.status === "open");
  const openPositions = activeDemands.reduce((sum, item) => sum + item.positions_remaining, 0);
  const drafts = demands.filter((item) => item.status === "draft").length;

  const sortedEnvironments = useMemo(() => {
    const rank = new Map(ENVIRONMENT_ORDER.map((code, index) => [code, index]));
    return [...environments].sort((a, b) => {
      const aRank = rank.get(a.code) ?? 999;
      const bRank = rank.get(b.code) ?? 999;
      return aRank - bRank || a.label.localeCompare(b.label);
    });
  }, [environments]);

  const compensationByDemand = useMemo(() => {
    const result = new Map<string, CompensationComponent>();
    for (const item of compensation) {
      if (item.component_type === "base_salary") result.set(item.demand_id, item);
    }
    return result;
  }, [compensation]);

  const environmentIdsByDemand = useMemo(() => {
    const result = new Map<string, number[]>();
    for (const item of demandEnvironments) {
      const current = result.get(item.demand_id) ?? [];
      current.push(item.environment_id);
      result.set(item.demand_id, current);
    }
    return result;
  }, [demandEnvironments]);

  useEffect(() => {
    void initialise();
  }, []);

  useEffect(() => {
    if (selectedOrganisationId) {
      void loadDemandData(selectedOrganisationId);
    } else {
      setDemands([]);
      setDemandEnvironments([]);
      setCompensation([]);
    }
  }, [selectedOrganisationId]);

  async function initialise() {
    setLoading(true);
    setNotice(null);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) {
        router.push("/login");
        router.refresh();
        return;
      }
      setUserId(authData.user.id);

      const [orgResult, membershipResult, environmentResult] = await Promise.all([
        supabase.from("organisations").select("*").order("name"),
        supabase.from("organisation_members").select("organisation_id, role"),
        supabase.from("environments").select("*"),
      ]);

      const firstError = [orgResult, membershipResult, environmentResult].find((result) => result.error)?.error;
      if (firstError) throw firstError;

      const loadedOrganisations = (orgResult.data ?? []) as Organisation[];
      const loadedMemberships = (membershipResult.data ?? []) as Membership[];
      setOrganisations(loadedOrganisations);
      setMemberships(loadedMemberships);
      setEnvironments((environmentResult.data ?? []) as Environment[]);

      const memberOrgIds = new Set(loadedMemberships.map((item) => item.organisation_id));
      const preferredOrg = loadedOrganisations.find((item) => memberOrgIds.has(item.id)) ?? loadedOrganisations[0];
      if (preferredOrg) setSelectedOrganisationId(preferredOrg.id);
      if (!loadedOrganisations.length) setShowOrganisationForm(true);
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not load employer portal." });
    } finally {
      setLoading(false);
    }
  }

  async function loadOrganisations(preferredId?: string) {
    const [orgResult, membershipResult] = await Promise.all([
      supabase.from("organisations").select("*").order("name"),
      supabase.from("organisation_members").select("organisation_id, role"),
    ]);
    if (orgResult.error) throw orgResult.error;
    if (membershipResult.error) throw membershipResult.error;
    const loadedOrganisations = (orgResult.data ?? []) as Organisation[];
    setOrganisations(loadedOrganisations);
    setMemberships((membershipResult.data ?? []) as Membership[]);
    if (preferredId && loadedOrganisations.some((item) => item.id === preferredId)) {
      setSelectedOrganisationId(preferredId);
    }
  }

  async function loadDemandData(organisationId: string) {
    setNotice(null);
    try {
      const demandResult = await supabase
        .from("open_demands")
        .select("*")
        .eq("organisation_id", organisationId)
        .order("created_at", { ascending: false });
      if (demandResult.error) throw demandResult.error;

      const loadedDemands = (demandResult.data ?? []) as Demand[];
      setDemands(loadedDemands);
      const ids = loadedDemands.map((item) => item.id);

      if (!ids.length) {
        setDemandEnvironments([]);
        setCompensation([]);
        return;
      }

      const [environmentResult, compensationResult] = await Promise.all([
        supabase.from("demand_environments").select("*").in("demand_id", ids),
        supabase.from("demand_compensation_components").select("*").in("demand_id", ids),
      ]);
      if (environmentResult.error) throw environmentResult.error;
      if (compensationResult.error) throw compensationResult.error;
      setDemandEnvironments((environmentResult.data ?? []) as DemandEnvironment[]);
      setCompensation((compensationResult.data ?? []) as CompensationComponent[]);
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not load Open Demand." });
    }
  }

  async function createOrganisation(event: FormEvent) {
    event.preventDefault();
    if (!userId) return;
    setBusy(true);
    setNotice(null);
    try {
      const { data, error } = await supabase
        .from("organisations")
        .insert({
          created_by: userId,
          name: organisationForm.name.trim(),
          legal_name: organisationForm.legal_name.trim() || null,
          organisation_type: organisationForm.organisation_type,
          country_code: cleanCountryCode(organisationForm.country_code) || null,
          website: organisationForm.website.trim() || null,
        })
        .select("*")
        .single();
      if (error) throw error;

      const membershipResult = await supabase.from("organisation_members").insert({
        organisation_id: data.id,
        user_id: userId,
        role: "admin",
      });
      if (membershipResult.error && membershipResult.error.code !== "23505") throw membershipResult.error;

      setOrganisationForm({ name: "", legal_name: "", organisation_type: "airline", country_code: "", website: "" });
      setShowOrganisationForm(false);
      await loadOrganisations(data.id);
      setNotice({ type: "success", text: `${data.name} created. You can now declare Open Demand.` });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not create organisation." });
    } finally {
      setBusy(false);
    }
  }

  function resetDemandForm() {
    setEditingDemandId(null);
    setDemandForm(emptyDemandForm);
  }

  function editDemand(demand: Demand) {
    const baseComp = compensationByDemand.get(demand.id);
    setEditingDemandId(demand.id);
    setDemandForm({
      internal_title: demand.internal_title,
      public_title: demand.public_title,
      profession: demand.profession,
      discipline: demand.discipline ?? "",
      seniority: demand.seniority ?? "",
      positions_required: String(demand.positions_required),
      status: demand.status,
      visibility: demand.visibility,
      employment_type: demand.employment_type ?? "permanent",
      city: demand.city ?? "",
      country_code: demand.country_code ?? "",
      sponsorship_available: demand.sponsorship_available,
      relocation_assistance: demand.relocation_assistance,
      expected_start_date: demand.expected_start_date ?? "",
      target_fill_date: demand.target_fill_date ?? "",
      environment_ids: environmentIdsByDemand.get(demand.id) ?? [],
      roster_shift: demand.roster?.shift ?? "any",
      roster_pattern: demand.roster?.pattern ?? "",
      compensation_min: baseComp?.amount_min == null ? "" : String(baseComp.amount_min),
      compensation_max: baseComp?.amount_max == null ? "" : String(baseComp.amount_max),
      compensation_currency: baseComp?.currency_code ?? "AUD",
      compensation_period: baseComp?.period ?? "year",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveDemand(event: FormEvent) {
    event.preventDefault();
    if (!userId || !selectedOrganisationId) return;
    setBusy(true);
    setNotice(null);

    try {
      const positionsRequired = Number(demandForm.positions_required);
      if (!Number.isInteger(positionsRequired) || positionsRequired <= 0) {
        throw new Error("Positions required must be a whole number greater than zero.");
      }

      const compMin = demandForm.compensation_min.trim() ? Number(demandForm.compensation_min) : null;
      const compMax = demandForm.compensation_max.trim() ? Number(demandForm.compensation_max) : null;
      if ((compMin != null && (!Number.isFinite(compMin) || compMin < 0)) || (compMax != null && (!Number.isFinite(compMax) || compMax < 0))) {
        throw new Error("Compensation must be a valid positive amount.");
      }
      if (compMin != null && compMax != null && compMax < compMin) {
        throw new Error("Maximum compensation cannot be lower than minimum compensation.");
      }
      if (demandForm.status === "open" && (compMin == null || compMax == null)) {
        throw new Error("Open Demand must include a transparent base compensation range. Save as Draft if compensation is not ready yet.");
      }
      if (demandForm.status === "open" && !demandForm.country_code) {
        throw new Error("Open Demand needs a country so the labour market can be measured correctly.");
      }

      const existing = editingDemandId ? demands.find((item) => item.id === editingDemandId) : null;
      const previousFilled = existing ? Math.max(0, existing.positions_required - existing.positions_remaining) : 0;
      const nextRemaining = demandForm.status === "filled"
        ? 0
        : Math.max(0, positionsRequired - previousFilled);

      const payload = {
        organisation_id: selectedOrganisationId,
        internal_title: demandForm.internal_title.trim(),
        public_title: demandForm.public_title.trim(),
        profession: demandForm.profession.trim(),
        discipline: demandForm.discipline.trim() || null,
        seniority: demandForm.seniority.trim() || null,
        positions_required: positionsRequired,
        positions_remaining: nextRemaining,
        status: demandForm.status,
        visibility: demandForm.visibility,
        employment_type: demandForm.employment_type,
        city: demandForm.city.trim() || null,
        country_code: cleanCountryCode(demandForm.country_code) || null,
        sponsorship_available: demandForm.sponsorship_available,
        relocation_assistance: demandForm.relocation_assistance,
        expected_start_date: demandForm.expected_start_date || null,
        target_fill_date: demandForm.target_fill_date || null,
        roster: {
          shift: demandForm.roster_shift,
          pattern: demandForm.roster_pattern.trim() || undefined,
        },
        opened_at: demandForm.status === "open" ? existing?.opened_at ?? new Date().toISOString() : existing?.opened_at ?? null,
        confirmed_active_at: demandForm.status === "open" ? new Date().toISOString() : existing?.confirmed_active_at ?? null,
        confirmation_due_at: demandForm.status === "open" ? thirtyDaysFromNowIso() : existing?.confirmation_due_at ?? null,
      };

      let demandId = editingDemandId;
      if (editingDemandId) {
        const { error } = await supabase.from("open_demands").update(payload).eq("id", editingDemandId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("open_demands")
          .insert({ created_by: userId, ...payload })
          .select("id")
          .single();
        if (error) throw error;
        demandId = data.id;
      }

      if (!demandId) throw new Error("Demand could not be saved.");

      const existingEnvironmentLevels = new Map(
        demandEnvironments
          .filter((item) => item.demand_id === demandId)
          .map((item) => [item.environment_id, item.requirement_level]),
      );
      const deleteEnv = await supabase.from("demand_environments").delete().eq("demand_id", demandId);
      if (deleteEnv.error) throw deleteEnv.error;
      if (demandForm.environment_ids.length) {
        const insertEnv = await supabase.from("demand_environments").insert(
          demandForm.environment_ids.map((environmentId) => ({
            demand_id: demandId,
            environment_id: environmentId,
            requirement_level: existingEnvironmentLevels.get(environmentId) ?? "mandatory",
          })),
        );
        if (insertEnv.error) throw insertEnv.error;
      }

      const deleteComp = await supabase
        .from("demand_compensation_components")
        .delete()
        .eq("demand_id", demandId)
        .eq("component_type", "base_salary");
      if (deleteComp.error) throw deleteComp.error;

      if (compMin != null || compMax != null) {
        const insertComp = await supabase.from("demand_compensation_components").insert({
          demand_id: demandId,
          component_type: "base_salary",
          amount_min: compMin,
          amount_max: compMax,
          currency_code: demandForm.compensation_currency.trim().toUpperCase().slice(0, 3),
          period: demandForm.compensation_period,
        });
        if (insertComp.error) throw insertComp.error;
      }

      const message = editingDemandId
        ? demandForm.status === "open"
          ? "Open Demand updated and confirmed active."
          : "Demand updated."
        : demandForm.status === "open"
          ? "Open Demand published."
          : "Demand saved as Draft.";

      resetDemandForm();
      setNotice({ type: "success", text: message });
      await loadDemandData(selectedOrganisationId);
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not save Open Demand." });
    } finally {
      setBusy(false);
    }
  }

  async function changeDemandStatus(demand: Demand, status: DemandStatus) {
    setBusy(true);
    setNotice(null);
    try {
      if (status === "open" && !compensationByDemand.get(demand.id)) {
        throw new Error("Add a transparent base compensation range before opening this demand.");
      }
      const update: Record<string, unknown> = { status };
      if (status === "open") {
        update.opened_at = demand.opened_at ?? new Date().toISOString();
        update.confirmed_active_at = new Date().toISOString();
        update.confirmation_due_at = thirtyDaysFromNowIso();
      }
      if (status === "filled") update.positions_remaining = 0;

      const { error } = await supabase.from("open_demands").update(update).eq("id", demand.id);
      if (error) throw error;
      setNotice({ type: "success", text: status === "open" ? "Demand is now Open." : `Demand marked ${STATUS_LABELS[status]}.` });
      await loadDemandData(selectedOrganisationId);
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not update demand status." });
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  if (loading) {
    return <div className="rounded-3xl border border-slate-200 bg-white p-8 text-slate-600">Loading Employer Portal…</div>;
  }

  return (
    <div>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs font-bold tracking-[0.22em] text-slate-500">AVIATION PASSPORT · EMPLOYER</div>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">Open Demand</h1>
          <p className="mt-2 max-w-3xl text-slate-600">
            Declare real aviation labour demand first. Talent access comes later and only in the context of active demand.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/passport" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">My Passport</a>
          <button onClick={signOut} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Sign out</button>
        </div>
      </div>

      {notice ? (
        <div className={`mt-6 rounded-2xl border px-4 py-3 text-sm ${notice.type === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          {notice.text}
        </div>
      ) : null}

      <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Organisation</div>
            {organisations.length ? (
              <select
                className="input mt-2 max-w-xl"
                value={selectedOrganisationId}
                onChange={(event) => {
                  setSelectedOrganisationId(event.target.value);
                  resetDemandForm();
                }}
              >
                {organisations.map((organisation) => (
                  <option key={organisation.id} value={organisation.id}>{organisation.name}</option>
                ))}
              </select>
            ) : (
              <p className="mt-2 text-sm text-slate-600">Create your organisation to start declaring demand.</p>
            )}
            {selectedOrganisation ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>{selectedOrganisation.organisation_type ? selectedOrganisation.organisation_type.replaceAll("_", " ") : "Organisation"}</span>
                {selectedOrganisation.country_code ? <span>· {countryLabel(selectedOrganisation.country_code)}</span> : null}
                <span className={`rounded-full border px-2 py-0.5 font-semibold ${selectedOrganisation.verified ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
                  {selectedOrganisation.verified ? "Verified organisation" : "Organisation verification pending"}
                </span>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setShowOrganisationForm((current) => !current)}
            className="self-start rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {showOrganisationForm ? "Hide organisation form" : "Add organisation"}
          </button>
        </div>

        {showOrganisationForm ? (
          <form onSubmit={createOrganisation} className="mt-6 grid gap-4 border-t border-slate-100 pt-6 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Organisation name"><input className="input" value={organisationForm.name} onChange={(e) => setOrganisationForm({ ...organisationForm, name: e.target.value })} required /></Field>
            <Field label="Legal name (optional)"><input className="input" value={organisationForm.legal_name} onChange={(e) => setOrganisationForm({ ...organisationForm, legal_name: e.target.value })} /></Field>
            <Field label="Organisation type">
              <select className="input" value={organisationForm.organisation_type} onChange={(e) => setOrganisationForm({ ...organisationForm, organisation_type: e.target.value })}>
                <option value="airline">Airline</option>
                <option value="mro">MRO</option>
                <option value="operator">Aircraft operator</option>
                <option value="manufacturer">Manufacturer / OEM</option>
                <option value="recruitment_agency">Recruitment / staffing</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Country"><CountrySelect value={organisationForm.country_code} onChange={(value) => setOrganisationForm({ ...organisationForm, country_code: value })} /></Field>
            <Field label="Website (optional)"><input className="input" value={organisationForm.website} onChange={(e) => setOrganisationForm({ ...organisationForm, website: e.target.value })} placeholder="https://…" /></Field>
            <div className="flex items-end">
              <button disabled={busy} className="w-full rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">Create organisation</button>
            </div>
          </form>
        ) : null}
      </section>

      {selectedOrganisation ? (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <Metric label="Active Open Demand" value={String(activeDemands.length)} />
            <Metric label="Open positions" value={String(openPositions)} />
            <Metric label="Draft demands" value={String(drafts)} />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <form onSubmit={saveDemand} className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{editingDemandId ? "Edit demand" : "New demand"}</div>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{editingDemandId ? "Update Open Demand" : "Declare Open Demand"}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Keep it structured and measurable. Drafts can be incomplete; anything Open must include transparent base compensation.
                </p>
              </div>

              <div className="mt-6 space-y-6">
                <Section title="Role">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Internal title"><input className="input" value={demandForm.internal_title} onChange={(e) => setDemandForm({ ...demandForm, internal_title: e.target.value })} placeholder="BNE A350 B2 intake" required /></Field>
                    <Field label="Public title"><input className="input" value={demandForm.public_title} onChange={(e) => setDemandForm({ ...demandForm, public_title: e.target.value })} placeholder="B2 Licensed Aircraft Engineer — A350" required /></Field>
                    <Field label="Profession"><input className="input" value={demandForm.profession} onChange={(e) => setDemandForm({ ...demandForm, profession: e.target.value })} placeholder="Licensed Aircraft Maintenance Engineer" required /></Field>
                    <Field label="Discipline (optional)"><input className="input" value={demandForm.discipline} onChange={(e) => setDemandForm({ ...demandForm, discipline: e.target.value })} placeholder="B2 / Avionics" /></Field>
                    <Field label="Seniority (optional)"><input className="input" value={demandForm.seniority} onChange={(e) => setDemandForm({ ...demandForm, seniority: e.target.value })} placeholder="Licensed / certifying staff" /></Field>
                    <Field label="Positions required"><input type="number" min="1" step="1" className="input" value={demandForm.positions_required} onChange={(e) => setDemandForm({ ...demandForm, positions_required: e.target.value })} required /></Field>
                    <Field label="Employment type">
                      <select className="input" value={demandForm.employment_type} onChange={(e) => setDemandForm({ ...demandForm, employment_type: e.target.value as EmploymentType })}>
                        {EMPLOYMENT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </Field>
                    <Field label="Demand visibility">
                      <select className="input" value={demandForm.visibility} onChange={(e) => setDemandForm({ ...demandForm, visibility: e.target.value as DemandVisibility })}>
                        <option value="public">Public</option>
                        <option value="limited">Limited</option>
                        <option value="confidential">Confidential</option>
                      </select>
                    </Field>
                  </div>
                </Section>

                <Section title="Location & mobility">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Country"><CountrySelect value={demandForm.country_code} onChange={(value) => setDemandForm({ ...demandForm, country_code: value })} /></Field>
                    <Field label="City / base"><input className="input" value={demandForm.city} onChange={(e) => setDemandForm({ ...demandForm, city: e.target.value })} placeholder="Brisbane" /></Field>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <Toggle checked={demandForm.sponsorship_available} onChange={(checked) => setDemandForm({ ...demandForm, sponsorship_available: checked })} label="Sponsorship available" />
                    <Toggle checked={demandForm.relocation_assistance} onChange={(checked) => setDemandForm({ ...demandForm, relocation_assistance: checked })} label="Relocation assistance" />
                  </div>
                </Section>

                <Section title="Environment">
                  <p className="mb-3 text-xs text-slate-500">V0.7 treats selected environments as mandatory. Requirement levels become more granular in the next employer requirements build.</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {sortedEnvironments.map((environment) => {
                      const checked = demandForm.environment_ids.includes(environment.id);
                      return (
                        <label key={environment.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm ${checked ? "border-slate-900 bg-slate-50 text-slate-950" : "border-slate-200 text-slate-700"}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => setDemandForm({
                              ...demandForm,
                              environment_ids: checked
                                ? demandForm.environment_ids.filter((id) => id !== environment.id)
                                : [...demandForm.environment_ids, environment.id],
                            })}
                          />
                          {environment.label}
                        </label>
                      );
                    })}
                  </div>
                </Section>

                <Section title="Roster & timing">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Shift">
                      <select className="input" value={demandForm.roster_shift} onChange={(e) => setDemandForm({ ...demandForm, roster_shift: e.target.value })}>
                        <option value="any">Any / mixed</option>
                        <option value="days">Day shift</option>
                        <option value="nights">Night shift</option>
                        <option value="rotating">Rotating days / nights</option>
                      </select>
                    </Field>
                    <Field label="Roster pattern (optional)"><input className="input" value={demandForm.roster_pattern} onChange={(e) => setDemandForm({ ...demandForm, roster_pattern: e.target.value })} placeholder="5 on / 3 off, 14/14…" /></Field>
                    <Field label="Expected start"><input type="date" className="input" min={todayIso()} value={demandForm.expected_start_date} onChange={(e) => setDemandForm({ ...demandForm, expected_start_date: e.target.value })} /></Field>
                    <Field label="Target fill date"><input type="date" className="input" min={todayIso()} value={demandForm.target_fill_date} onChange={(e) => setDemandForm({ ...demandForm, target_fill_date: e.target.value })} /></Field>
                  </div>
                </Section>

                <Section title="Transparent base compensation">
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <Field label="Minimum"><input type="number" min="0" step="0.01" className="input" value={demandForm.compensation_min} onChange={(e) => setDemandForm({ ...demandForm, compensation_min: e.target.value })} placeholder="120000" /></Field>
                    <Field label="Maximum"><input type="number" min="0" step="0.01" className="input" value={demandForm.compensation_max} onChange={(e) => setDemandForm({ ...demandForm, compensation_max: e.target.value })} placeholder="145000" /></Field>
                    <Field label="Currency"><input className="input uppercase" maxLength={3} value={demandForm.compensation_currency} onChange={(e) => setDemandForm({ ...demandForm, compensation_currency: e.target.value.toUpperCase() })} /></Field>
                    <Field label="Period">
                      <select className="input" value={demandForm.compensation_period} onChange={(e) => setDemandForm({ ...demandForm, compensation_period: e.target.value as MoneyPeriod })}>
                        {MONEY_PERIODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </Field>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">Native currency is authoritative. Cross-currency and purchasing-power comparison will be added above this layer later.</p>
                </Section>

                <Section title="State">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Demand status">
                      <select className="input" value={demandForm.status} onChange={(e) => setDemandForm({ ...demandForm, status: e.target.value as DemandStatus })}>
                        <option value="draft">Draft</option>
                        <option value="open">Open</option>
                        <option value="paused">Paused</option>
                        {editingDemandId ? <option value="filled">Filled</option> : null}
                        {editingDemandId ? <option value="cancelled">Cancelled</option> : null}
                      </select>
                    </Field>
                    <div className="flex items-end">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
                        Only <strong>Open</strong> demand counts as live labour-market demand. Draft, Paused, Filled and Cancelled do not.
                      </div>
                    </div>
                  </div>
                </Section>
              </div>

              <div className="mt-7 flex flex-wrap gap-3">
                <button disabled={busy} className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">
                  {editingDemandId ? "Save demand changes" : demandForm.status === "open" ? "Publish Open Demand" : "Save demand"}
                </button>
                {editingDemandId ? <button type="button" disabled={busy} onClick={resetDemandForm} className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700">Cancel edit</button> : null}
              </div>
            </form>

            <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Demand register</div>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{selectedOrganisation.name}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">This is the organisation’s declared labour demand. No worker database access is exposed here.</p>
              </div>

              {demands.length ? (
                <div className="mt-6 space-y-4">
                  {demands.map((demand) => {
                    const baseComp = compensationByDemand.get(demand.id);
                    const environmentLabels = (environmentIdsByDemand.get(demand.id) ?? [])
                      .map((id) => environments.find((item) => item.id === id)?.label)
                      .filter(Boolean) as string[];
                    const location = [demand.city, demand.country_code ? countryLabel(demand.country_code) : null].filter(Boolean).join(", ");

                    return (
                      <div key={demand.id} className="rounded-2xl border border-slate-200 p-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-950">{demand.public_title}</div>
                            <div className="mt-1 text-sm text-slate-600">{demand.profession}{demand.discipline ? ` · ${demand.discipline}` : ""}</div>
                          </div>
                          <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusClasses(demand.status)}`}>{STATUS_LABELS[demand.status]}</span>
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <DemandFact label="Positions" value={`${demand.positions_remaining} remaining / ${demand.positions_required} required`} />
                          <DemandFact label="Location" value={location || "Not specified"} />
                          <DemandFact label="Visibility" value={VISIBILITY_LABELS[demand.visibility]} />
                          <DemandFact label="Employment" value={EMPLOYMENT_TYPES.find(([value]) => value === demand.employment_type)?.[1] ?? "Not specified"} />
                          <DemandFact label="Environment" value={environmentLabels.length ? environmentLabels.join(" · ") : "Not specified"} wide />
                          <DemandFact
                            label="Base compensation"
                            value={baseComp
                              ? `${money(baseComp.amount_min, baseComp.currency_code)} – ${money(baseComp.amount_max, baseComp.currency_code)} ${MONEY_PERIODS.find(([value]) => value === baseComp.period)?.[1] ?? baseComp.period}`
                              : "Not declared"}
                            wide
                          />
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <button type="button" disabled={busy} onClick={() => editDemand(demand)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Edit</button>
                          <button type="button" disabled={busy} onClick={() => setRequirementsDemandId(demand.id)} className="rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50">Requirements & market</button>
                          {demand.status !== "open" && demand.status !== "filled" && demand.status !== "cancelled" ? (
                            <button type="button" disabled={busy} onClick={() => void changeDemandStatus(demand, "open")} className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">Open demand</button>
                          ) : null}
                          {demand.status === "open" ? (
                            <button type="button" disabled={busy} onClick={() => void changeDemandStatus(demand, "paused")} className="rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50">Pause</button>
                          ) : null}
                          {!["filled", "cancelled"].includes(demand.status) ? (
                            <button type="button" disabled={busy} onClick={() => void changeDemandStatus(demand, "cancelled")} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50">Cancel</button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-6 rounded-2xl border border-dashed border-slate-300 p-8 text-center">
                  <div className="font-semibold text-slate-900">No demand declared yet</div>
                  <p className="mt-2 text-sm text-slate-500">Create the first structured demand on the left. Start as Draft if you are still defining the role.</p>
                </div>
              )}
            </section>
          </div>

          {requirementsDemandId ? (() => {
            const demand = demands.find((item) => item.id === requirementsDemandId);
            return demand ? (
              <DemandRequirements
                demandId={demand.id}
                demandTitle={demand.public_title}
                countryCode={demand.country_code}
                sponsorshipAvailable={demand.sponsorship_available}
                onClose={() => setRequirementsDemandId(null)}
              />
            ) : null;
          })() : null}
        </>
      ) : null}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t border-slate-100 pt-5 first:border-t-0 first:pt-0">
      <h3 className="mb-4 text-sm font-bold uppercase tracking-[0.12em] text-slate-500">{title}</h3>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <label className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium ${checked ? "border-slate-900 bg-slate-50 text-slate-950" : "border-slate-200 text-slate-700"}`}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function CountrySelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <select className="input" value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Select country</option>
      {COUNTRIES.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}
    </select>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{value}</div>
    </div>
  );
}

function DemandFact({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">{label}</div>
      <div className="mt-1 text-sm text-slate-700">{value}</div>
    </div>
  );
}
