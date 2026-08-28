"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { COUNTRIES, EU_COUNTRY_CODES, countryLabel } from "@/lib/reference/countries";
import { LICENCE_SYSTEMS } from "@/lib/reference/licensing";
import OpportunitiesPanel from "@/components/passport/opportunities-panel";

type Profile = {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  professional_headline: string | null;
  current_city: string | null;
  current_country_code: string | null;
  preferred_currency: string;
  visibility: "public" | "aviation_network" | "anonymous_market" | "private";
  market_status: "not_open" | "selected_opportunities" | "actively_looking" | "contract_only";
  bio: string | null;
};

type Nationality = {
  id: string;
  country_code: string;
  is_primary: boolean;
  visibility: "visible" | "employers_only" | "hidden";
};

type WorkRight = {
  id: string;
  country_code: string;
  status: "citizen" | "permanent_resident" | "unrestricted" | "temporary" | "sponsorship_required";
  visa_type: string | null;
  expires_on: string | null;
  verification_status: string;
};

type Authority = { id: string; code: string; name: string; country_code: string | null };
type Environment = { id: number; code: string; label: string };
type Manufacturer = { id: string; name: string };
type AircraftFamily = { id: string; manufacturer_id: string; code: string; display_name: string };
type AircraftVariant = { id: string; family_id: string; code: string; display_name: string };
type Engine = { id: string; manufacturer: string | null; code: string; display_name: string };
type VariantEngine = { variant_id: string; engine_id: string };

type Licence = {
  id: string;
  authority_id: string | null;
  issuing_country_code: string | null;
  issuing_authority_name: string | null;
  licence_scheme: string;
  category_privileges: string | null;
  licence_number: string | null;
  issued_on: string | null;
  expires_on: string | null;
  limitations: string | null;
  evidence_path: string | null;
  verification_status: string;
  verified_at: string | null;
};

type Rating = {
  id: string;
  licence_id: string;
  official_designation: string;
  privilege_category: string | null;
  aircraft_family_id: string | null;
  custom_aircraft_family: string | null;
  aircraft_variant_id: string | null;
  engine_id: string | null;
  evidence_path: string | null;
  verification_status: string;
};

type Employment = {
  id: string;
  employer_name: string;
  job_title: string;
  discipline: string | null;
  city: string | null;
  country_code: string | null;
  employment_type: string | null;
  start_date: string;
  end_date: string | null;
  is_current: boolean;
  description: string | null;
  employer_confirmed: boolean;
};

type EmploymentEnvironment = { employment_id: string; environment_id: number };

type Exposure = {
  id: string;
  employment_id: string;
  aircraft_family_id: string | null;
  custom_aircraft_family: string | null;
  aircraft_variant_id: string | null;
  engine_id: string | null;
  discipline: string | null;
  exposure: "primary" | "regular" | "occasional" | "limited";
  exposure_start: string | null;
  exposure_end: string | null;
  last_worked_on: string | null;
  employer_confirmed: boolean;
};

type CurrentAuthorisation = {
  worker_id: string;
  authorisation_id: string;
  aircraft_family_id: string | null;
  custom_aircraft_family: string | null;
  aircraft_variant_id: string | null;
  authorisation_name: string;
  expires_on: string | null;
};

type CompanyAuthorisation = {
  id: string;
  worker_id: string;
  organisation_id: string | null;
  employment_id: string | null;
  employer_name: string;
  authorisation_name: string;
  aircraft_family_id: string | null;
  custom_aircraft_family: string | null;
  aircraft_variant_id: string | null;
  competency_id: string | null;
  issued_on: string | null;
  expires_on: string | null;
  ended_on: string | null;
  revoked_on: string | null;
  evidence_path: string | null;
  verification_status: string;
  verified_at: string | null;
};

type TrainingRecord = {
  id: string;
  course_name: string;
  provider: string | null;
  completed_on: string | null;
  expires_on: string | null;
  evidence_path: string | null;
  verification_status: string;
  verified_at: string | null;
};

type CompetencyCatalogItem = {
  id: string;
  code: string;
  label: string;
  aircraft_specific: boolean;
};

type WorkerCompetency = {
  id: string;
  worker_id: string;
  competency_id: string | null;
  custom_competency_name: string | null;
  aircraft_family_id: string | null;
  aircraft_variant_id: string | null;
  engine_id: string | null;
  gained_on: string | null;
  last_used_on: string | null;
  evidence_path: string | null;
  verification_status: string;
  verified_at: string | null;
};

type MarketPreference = {
  worker_id: string;
  earliest_start_date: string | null;
  notice_days: number | null;
  notice_value: number | null;
  notice_unit: "days" | "weeks" | "months" | null;
  willing_to_relocate: boolean;
  willing_fifo: boolean;
  willing_dido: boolean;
  willing_commute: boolean;
  willing_international: boolean;
  willing_temporary_assignment: boolean;
  preferred_employment_types: string[];
  minimum_compensation: number | null;
  minimum_compensation_currency: string | null;
  minimum_compensation_period: "hour" | "day" | "week" | "month" | "year" | "one_off";
  compensation_visibility: "private" | "compatibility_only" | "visible";
  roster_preferences: { flexibility?: string; preferred_pattern?: string } | null;
};

type WorkerEnvironmentPreference = {
  worker_id: string;
  environment_id: number;
};

type LocationPreference = {
  id: string;
  worker_id: string;
  country_code: string;
  city: string | null;
  preference: "preferred" | "acceptable" | "exceptional_only" | "not_interested";
  relocation_mode: string | null;
};

type Tab = "preview" | "identity" | "licences" | "employment" | "training" | "authorisations" | "market" | "opportunities";

type Notice = { type: "success" | "error"; text: string } | null;

type PublicProfileVisibility = "public" | "anonymous_market" | "private";

type IdentityForm = {
  first_name: string;
  middle_name: string;
  last_name: string;
  professional_headline: string;
  current_city: string;
  current_country_code: string;
  preferred_currency: string;
  visibility: PublicProfileVisibility;
  market_status: Profile["market_status"];
  primary_nationality: string;
  nationality_visibility: Nationality["visibility"];
};

const emptyProfile: IdentityForm = {
  first_name: "",
  middle_name: "",
  last_name: "",
  professional_headline: "",
  current_city: "",
  current_country_code: "",
  preferred_currency: "AUD",
  visibility: "anonymous_market",
  market_status: "not_open",
  primary_nationality: "",
  nationality_visibility: "visible",
};

const AIRCRAFT_MANUFACTURER_ORDER = [
  "Boeing",
  "Airbus",
  "Airbus Helicopters",
  "ATR",
  "Embraer",
  "Bombardier",
  "De Havilland Canada",
  "COMAC",
  "Fokker",
  "Saab",
  "Bell",
  "Leonardo",
  "Sikorsky",
  "NHIndustries",
  "Eurofighter",
];

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

const TRAINING_OPTIONS = [
  "Human Factors",
  "EWIS",
  "Fuel Tank Safety",
  "Dangerous Goods",
  "Safety Management System (SMS)",
  "Continuation Training",
  "ETOPS",
  "RVSM",
  "Airside / Airport Safety",
  "First Aid",
];

const EMPLOYMENT_TYPE_OPTIONS = [
  ["permanent", "Permanent"],
  ["fixed_term", "Fixed term"],
  ["contractor", "Contractor"],
  ["casual", "Casual"],
  ["part_time", "Part time"],
  ["agency", "Agency"],
  ["self_employed", "Self-employed"],
] as const;

const ROSTER_FLEXIBILITY_OPTIONS = [
  ["any", "Any roster"],
  ["shift_ok", "Shift / rotating rosters OK"],
  ["days_preferred", "Day shift preferred"],
  ["nights_preferred", "Night shift preferred"],
  ["weekdays_preferred", "Standard weekdays preferred"],
] as const;

const LOCATION_MODE_OPTIONS = [
  ["any", "Any suitable arrangement"],
  ["relocate", "Relocate"],
  ["fifo", "FIFO"],
  ["dido", "DIDO"],
  ["commute", "Commute"],
  ["temporary_assignment", "Temporary assignment"],
] as const;

function cleanCountryCode(value: string) {
  return value.trim().toUpperCase().slice(0, 2);
}

function formatDate(value: string | null) {
  if (!value) return "Present";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-AU", { month: "short", year: "numeric" }).format(date);
}

function formatStatus(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function isExpired(value: string | null) {
  if (!value) return false;
  const expiry = new Date(`${value}T23:59:59`);
  return !Number.isNaN(expiry.getTime()) && expiry.getTime() < Date.now();
}

function noticePeriodLabel(preference: MarketPreference) {
  if (preference.notice_value != null && preference.notice_unit) {
    const singular = preference.notice_value === 1
      ? preference.notice_unit.replace(/s$/, "")
      : preference.notice_unit;
    return `${preference.notice_value} ${singular} notice`;
  }
  return preference.notice_days != null ? `${preference.notice_days} days notice` : "Not specified";
}

function EvidenceStatus({ status }: { status: string }) {
  const verified = status === "verified";
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
        verified
          ? "bg-emerald-50 text-emerald-700"
          : status === "rejected" || status === "expired"
            ? "bg-rose-50 text-rose-700"
            : "bg-amber-50 text-amber-700"
      }`}
    >
      {verified ? "Verified" : formatStatus(status)}
    </span>
  );
}

function BlueDot() {
  return <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-600" aria-label="Aircraft experience" title="Aircraft experience" />;
}

function GoldStar() {
  return <span className="text-base leading-none text-amber-500" aria-label="Verified type rating" title="Verified type rating">★</span>;
}

function GreenShield() {
  return (
    <svg className="h-4 w-4 text-emerald-600" viewBox="0 0 24 24" fill="currentColor" aria-label="Current verified company authorisation">
      <path d="M12 2.25 4.5 5.1v5.72c0 4.77 2.97 9.15 7.5 10.93 4.53-1.78 7.5-6.16 7.5-10.93V5.1L12 2.25Zm0 3.02 4.75 1.8v3.75c0 3.38-1.91 6.62-4.75 8.16-2.84-1.54-4.75-4.78-4.75-8.16V7.07L12 5.27Z" />
    </svg>
  );
}

export default function PassportEditor() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [tab, setTab] = useState<Tab>("preview");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [userId, setUserId] = useState("");

  const [profile, setProfile] = useState<Profile | null>(null);
  const [nationalities, setNationalities] = useState<Nationality[]>([]);
  const [workRights, setWorkRights] = useState<WorkRight[]>([]);
  const [licences, setLicences] = useState<Licence[]>([]);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [employments, setEmployments] = useState<Employment[]>([]);
  const [employmentEnvironments, setEmploymentEnvironments] = useState<EmploymentEnvironment[]>([]);
  const [exposures, setExposures] = useState<Exposure[]>([]);
  const [authorisations, setAuthorisations] = useState<CurrentAuthorisation[]>([]);
  const [companyAuthorisations, setCompanyAuthorisations] = useState<CompanyAuthorisation[]>([]);
  const [trainingRecords, setTrainingRecords] = useState<TrainingRecord[]>([]);
  const [workerCompetencies, setWorkerCompetencies] = useState<WorkerCompetency[]>([]);
  const [marketPreference, setMarketPreference] = useState<MarketPreference | null>(null);
  const [marketEnvironmentPreferences, setMarketEnvironmentPreferences] = useState<WorkerEnvironmentPreference[]>([]);
  const [locationPreferences, setLocationPreferences] = useState<LocationPreference[]>([]);

  const [authorities, setAuthorities] = useState<Authority[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [families, setFamilies] = useState<AircraftFamily[]>([]);
  const [variants, setVariants] = useState<AircraftVariant[]>([]);
  const [engines, setEngines] = useState<Engine[]>([]);
  const [variantEngines, setVariantEngines] = useState<VariantEngine[]>([]);
  const [competencyCatalog, setCompetencyCatalog] = useState<CompetencyCatalogItem[]>([]);

  const [identityForm, setIdentityForm] = useState<IdentityForm>(emptyProfile);
  const [editingLicenceId, setEditingLicenceId] = useState<string | null>(null);
  const [editingRatingId, setEditingRatingId] = useState<string | null>(null);
  const [editingTrainingId, setEditingTrainingId] = useState<string | null>(null);
  const [editingCompetencyId, setEditingCompetencyId] = useState<string | null>(null);
  const [editingAuthorisationId, setEditingAuthorisationId] = useState<string | null>(null);
  const [editingLocationPreferenceId, setEditingLocationPreferenceId] = useState<string | null>(null);
  const [workRightForm, setWorkRightForm] = useState({
    country_code: "",
    status: "unrestricted" as WorkRight["status"],
    visa_type: "",
    expires_on: "",
  });
  const [licenceForm, setLicenceForm] = useState({
    issuing_country_code: "",
    authority_id: "",
    custom_authority_name: "",
    licence_system_code: "",
    custom_licence_system: "",
    category_privileges: "",
    licence_number: "",
    issued_on: "",
    expires_on: "",
    limitations: "",
    evidence: null as File | null,
  });
  const [ratingForm, setRatingForm] = useState({
    licence_id: "",
    official_designation: "",
    privilege_category: "",
    aircraft_family_id: "",
    custom_aircraft_family: "",
    aircraft_variant_id: "",
    engine_id: "",
    evidence: null as File | null,
  });
  const [employmentForm, setEmploymentForm] = useState({
    employer_name: "",
    job_title: "",
    discipline: "",
    city: "",
    country_code: "",
    employment_type: "permanent",
    start_date: "",
    end_date: "",
    is_current: false,
    environment_ids: [] as number[],
  });
  const [exposureForm, setExposureForm] = useState({
    employment_id: "",
    aircraft_family_id: "",
    custom_aircraft_family: "",
    aircraft_variant_id: "",
    engine_id: "",
    discipline: "",
    exposure: "regular" as Exposure["exposure"],
    exposure_start: "",
    exposure_end: "",
    is_current: false,
  });
  const [trainingForm, setTrainingForm] = useState({
    course_key: "",
    custom_course_name: "",
    provider: "",
    completed_on: "",
    expires_on: "",
    evidence: null as File | null,
  });
  const [competencyForm, setCompetencyForm] = useState({
    competency_id: "",
    custom_competency_name: "",
    aircraft_family_id: "",
    aircraft_variant_id: "",
    engine_id: "",
    gained_on: "",
    last_used_on: "",
    evidence: null as File | null,
  });

  const [authorisationForm, setAuthorisationForm] = useState({
    employment_id: "",
    custom_employer_name: "",
    authorisation_name: "",
    aircraft_family_id: "",
    custom_aircraft_family: "",
    aircraft_variant_id: "",
    competency_id: "",
    issued_on: "",
    expires_on: "",
    is_current: true,
    ended_on: "",
    evidence: null as File | null,
  });

  const [marketForm, setMarketForm] = useState({
    earliest_start_date: "",
    notice_value: "",
    notice_unit: "weeks" as "days" | "weeks" | "months",
    willing_to_relocate: false,
    willing_fifo: false,
    willing_dido: false,
    willing_commute: false,
    willing_international: false,
    willing_temporary_assignment: false,
    preferred_employment_types: [] as string[],
    environment_ids: [] as number[],
    minimum_compensation: "",
    minimum_compensation_currency: "AUD",
    minimum_compensation_period: "year" as MarketPreference["minimum_compensation_period"],
    compensation_visibility: "compatibility_only" as MarketPreference["compensation_visibility"],
    roster_flexibility: "any",
    preferred_roster_pattern: "",
  });

  const [locationPreferenceForm, setLocationPreferenceForm] = useState({
    country_code: "",
    city: "",
    preference: "preferred" as LocationPreference["preference"],
    relocation_mode: "any",
  });

  async function loadData() {
    setLoading(true);
    setNotice(null);

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      router.push("/login");
      router.refresh();
      return;
    }

    setUserId(authData.user.id);

    const [
      profileResult,
      nationalitiesResult,
      workRightsResult,
      authoritiesResult,
      licencesResult,
      ratingsResult,
      environmentsResult,
      manufacturersResult,
      familiesResult,
      variantsResult,
      enginesResult,
      variantEnginesResult,
      employmentResult,
      employmentEnvironmentsResult,
      exposureResult,
      authorisationsResult,
      companyAuthorisationsResult,
      trainingResult,
      competencyCatalogResult,
      workerCompetenciesResult,
      marketPreferenceResult,
      marketEnvironmentPreferencesResult,
      locationPreferencesResult,
    ] = await Promise.all([
      supabase.from("worker_profiles").select("*").maybeSingle(),
      supabase.from("worker_nationalities").select("*").order("is_primary", { ascending: false }),
      supabase.from("worker_work_rights").select("*").order("country_code"),
      supabase.from("licence_authorities").select("*").order("name"),
      supabase.from("worker_licences").select("*").order("created_at", { ascending: false }),
      supabase.from("licence_ratings").select("*").order("created_at", { ascending: false }),
      supabase.from("environments").select("*").eq("active", true).order("id"),
      supabase.from("aircraft_manufacturers").select("*").order("name"),
      supabase.from("aircraft_families").select("*").order("display_name"),
      supabase.from("aircraft_variants").select("*").order("display_name"),
      supabase.from("engine_types").select("*").order("display_name"),
      supabase.from("aircraft_variant_engines").select("*"),
      supabase.from("employment_records").select("*").order("start_date", { ascending: false }),
      supabase.from("employment_environments").select("*"),
      supabase.from("employment_aircraft_exposure").select("*").order("created_at", { ascending: false }),
      supabase.from("worker_current_authorisations").select("*"),
      supabase.from("company_authorisations").select("*").order("created_at", { ascending: false }),
      supabase.from("training_records").select("*").order("created_at", { ascending: false }),
      supabase.from("competency_catalog").select("*").order("label"),
      supabase.from("worker_competencies").select("*").order("created_at", { ascending: false }),
      supabase.from("worker_market_preferences").select("*").maybeSingle(),
      supabase.from("worker_environment_preferences").select("*"),
      supabase.from("worker_location_preferences").select("*").order("created_at", { ascending: true }),
    ]);

    const firstError = [
      profileResult,
      nationalitiesResult,
      workRightsResult,
      authoritiesResult,
      licencesResult,
      ratingsResult,
      environmentsResult,
      manufacturersResult,
      familiesResult,
      variantsResult,
      enginesResult,
      variantEnginesResult,
      employmentResult,
      employmentEnvironmentsResult,
      exposureResult,
      authorisationsResult,
      companyAuthorisationsResult,
      trainingResult,
      competencyCatalogResult,
      workerCompetenciesResult,
      marketPreferenceResult,
      marketEnvironmentPreferencesResult,
      locationPreferencesResult,
    ].find((result) => result.error)?.error;

    if (firstError) {
      setNotice({ type: "error", text: firstError.message });
      setLoading(false);
      return;
    }

    const loadedProfile = profileResult.data as Profile | null;
    const loadedNationalities = (nationalitiesResult.data ?? []) as Nationality[];
    const loadedWorkRights = (workRightsResult.data ?? []) as WorkRight[];

    setProfile(loadedProfile);
    setNationalities(loadedNationalities);
    setWorkRights(loadedWorkRights);
    setAuthorities((authoritiesResult.data ?? []) as Authority[]);
    setLicences((licencesResult.data ?? []) as Licence[]);
    setRatings((ratingsResult.data ?? []) as Rating[]);
    setEnvironments((environmentsResult.data ?? []) as Environment[]);
    setManufacturers((manufacturersResult.data ?? []) as Manufacturer[]);
    setFamilies((familiesResult.data ?? []) as AircraftFamily[]);
    setVariants((variantsResult.data ?? []) as AircraftVariant[]);
    setEngines((enginesResult.data ?? []) as Engine[]);
    setVariantEngines((variantEnginesResult.data ?? []) as VariantEngine[]);
    setEmployments((employmentResult.data ?? []) as Employment[]);
    setEmploymentEnvironments((employmentEnvironmentsResult.data ?? []) as EmploymentEnvironment[]);
    setExposures((exposureResult.data ?? []) as Exposure[]);
    setAuthorisations((authorisationsResult.data ?? []) as CurrentAuthorisation[]);
    setCompanyAuthorisations((companyAuthorisationsResult.data ?? []) as CompanyAuthorisation[]);
    setTrainingRecords((trainingResult.data ?? []) as TrainingRecord[]);
    setCompetencyCatalog((competencyCatalogResult.data ?? []) as CompetencyCatalogItem[]);
    setWorkerCompetencies((workerCompetenciesResult.data ?? []) as WorkerCompetency[]);
    const loadedMarketPreference = marketPreferenceResult.data as MarketPreference | null;
    const loadedMarketEnvironmentPreferences = (marketEnvironmentPreferencesResult.data ?? []) as WorkerEnvironmentPreference[];
    setMarketPreference(loadedMarketPreference);
    setMarketEnvironmentPreferences(loadedMarketEnvironmentPreferences);
    setLocationPreferences((locationPreferencesResult.data ?? []) as LocationPreference[]);

    setMarketForm({
      earliest_start_date: loadedMarketPreference?.earliest_start_date ?? "",
      notice_value: loadedMarketPreference?.notice_value != null
        ? String(loadedMarketPreference.notice_value)
        : loadedMarketPreference?.notice_days != null
          ? String(loadedMarketPreference.notice_days)
          : "",
      notice_unit: loadedMarketPreference?.notice_unit ?? "days",
      willing_to_relocate: loadedMarketPreference?.willing_to_relocate ?? false,
      willing_fifo: loadedMarketPreference?.willing_fifo ?? false,
      willing_dido: loadedMarketPreference?.willing_dido ?? false,
      willing_commute: loadedMarketPreference?.willing_commute ?? false,
      willing_international: loadedMarketPreference?.willing_international ?? false,
      willing_temporary_assignment: loadedMarketPreference?.willing_temporary_assignment ?? false,
      preferred_employment_types: loadedMarketPreference?.preferred_employment_types ?? [],
      environment_ids: loadedMarketEnvironmentPreferences.map((item) => item.environment_id),
      minimum_compensation: loadedMarketPreference?.minimum_compensation == null ? "" : String(loadedMarketPreference.minimum_compensation),
      minimum_compensation_currency: loadedMarketPreference?.minimum_compensation_currency ?? loadedProfile?.preferred_currency ?? "AUD",
      minimum_compensation_period: loadedMarketPreference?.minimum_compensation_period ?? "year",
      compensation_visibility: loadedMarketPreference?.compensation_visibility ?? "compatibility_only",
      roster_flexibility: loadedMarketPreference?.roster_preferences?.flexibility ?? "any",
      preferred_roster_pattern: loadedMarketPreference?.roster_preferences?.preferred_pattern ?? "",
    });

    const primaryNationality = loadedNationalities.find((item) => item.is_primary) ?? loadedNationalities[0];

    if (loadedProfile) {
      setIdentityForm({
        first_name: loadedProfile.first_name,
        middle_name: loadedProfile.middle_name ?? "",
        last_name: loadedProfile.last_name,
        professional_headline: loadedProfile.professional_headline ?? "",
        current_city: loadedProfile.current_city ?? "",
        current_country_code: loadedProfile.current_country_code ?? "",
        preferred_currency: loadedProfile.preferred_currency,
        visibility: loadedProfile.visibility === "aviation_network" ? "public" : loadedProfile.visibility,
        market_status: loadedProfile.market_status,
        primary_nationality: primaryNationality?.country_code ?? "",
        nationality_visibility: primaryNationality?.visibility ?? "visible",
      });
    }

    setLoading(false);
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function uploadEvidence(file: File | null, folder: string) {
    if (!file || !userId) return null;
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const path = `${userId}/${folder}/${crypto.randomUUID()}-${safeName}`;
    const { error } = await supabase.storage.from("credential-evidence").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });
    if (error) throw error;
    return path;
  }

  async function saveIdentity(event: FormEvent) {
    event.preventDefault();
    if (!userId) return;
    setBusy(true);
    setNotice(null);

    try {
      const countryCode = cleanCountryCode(identityForm.current_country_code);
      const { error: profileError } = await supabase.from("worker_profiles").upsert({
        id: userId,
        first_name: identityForm.first_name.trim(),
        middle_name: identityForm.middle_name.trim() || null,
        last_name: identityForm.last_name.trim(),
        professional_headline: identityForm.professional_headline.trim() || null,
        current_city: identityForm.current_city.trim() || null,
        current_country_code: countryCode || null,
        preferred_currency: identityForm.preferred_currency.trim().toUpperCase().slice(0, 3),
        visibility: identityForm.visibility,
        market_status: identityForm.market_status,
      });
      if (profileError) throw profileError;

      const nationality = cleanCountryCode(identityForm.primary_nationality);
      if (nationality) {
        await supabase.from("worker_nationalities").update({ is_primary: false }).eq("worker_id", userId);
        const { error } = await supabase.from("worker_nationalities").upsert(
          {
            worker_id: userId,
            country_code: nationality,
            is_primary: true,
            visibility: identityForm.nationality_visibility,
          },
          { onConflict: "worker_id,country_code" },
        );
        if (error) throw error;
      }


      setNotice({ type: "success", text: "Professional identity saved." });
      await loadData();
      setTab("preview");
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not save identity." });
    } finally {
      setBusy(false);
    }
  }

  async function addWorkRight(event: FormEvent) {
    event.preventDefault();
    if (!userId || !workRightForm.country_code) return;
    setBusy(true);
    setNotice(null);
    try {
      const { error } = await supabase.from("worker_work_rights").upsert(
        {
          worker_id: userId,
          country_code: workRightForm.country_code,
          status: workRightForm.status,
          visa_type: workRightForm.visa_type.trim() || null,
          expires_on: workRightForm.expires_on || null,
        },
        { onConflict: "worker_id,country_code" },
      );
      if (error) throw error;
      setWorkRightForm({ country_code: "", status: "unrestricted", visa_type: "", expires_on: "" });
      setNotice({ type: "success", text: "Work right added." });
      await loadData();
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not add work right." });
    } finally {
      setBusy(false);
    }
  }

  async function addEuWorkRights() {
    if (!userId) return;
    setBusy(true);
    setNotice(null);
    try {
      const existing = new Set(workRights.map((item) => item.country_code));
      const missingCodes = EU_COUNTRY_CODES.filter((countryCode) => !existing.has(countryCode));
      if (!missingCodes.length) {
        setNotice({ type: "success", text: "EU-27 work rights are already present." });
        return;
      }
      const rows = missingCodes.map((countryCode) => ({
        worker_id: userId,
        country_code: countryCode,
        status: "unrestricted" as const,
        visa_type: "EU free movement",
        expires_on: null,
      }));
      const { error } = await supabase.from("worker_work_rights").insert(rows);
      if (error) throw error;
      setNotice({ type: "success", text: `${missingCodes.length} EU work-right records added.` });
      await loadData();
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not add EU work rights." });
    } finally {
      setBusy(false);
    }
  }

  async function removeWorkRight(id: string) {
    setBusy(true);
    setNotice(null);
    try {
      const { error } = await supabase.from("worker_work_rights").delete().eq("id", id);
      if (error) throw error;
      setNotice({ type: "success", text: "Work right removed." });
      await loadData();
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not remove work right." });
    } finally {
      setBusy(false);
    }
  }

  function resetLicenceForm() {
    setEditingLicenceId(null);
    setLicenceForm({
      issuing_country_code: "",
      authority_id: "",
      custom_authority_name: "",
      licence_system_code: "",
      custom_licence_system: "",
      category_privileges: "",
      licence_number: "",
      issued_on: "",
      expires_on: "",
      limitations: "",
      evidence: null,
    });
  }

  function editLicence(licence: Licence) {
    const knownSystem = LICENCE_SYSTEMS.find((item) => item.code !== "OTHER" && item.label === licence.licence_scheme);
    setEditingLicenceId(licence.id);
    setLicenceForm({
      issuing_country_code: licence.issuing_country_code ?? "",
      authority_id: licence.authority_id ?? "__custom__",
      custom_authority_name: licence.authority_id ? "" : licence.issuing_authority_name ?? "",
      licence_system_code: knownSystem?.code ?? "OTHER",
      custom_licence_system: knownSystem ? "" : licence.licence_scheme,
      category_privileges: licence.category_privileges ?? "",
      licence_number: licence.licence_number ?? "",
      issued_on: licence.issued_on ?? "",
      expires_on: licence.expires_on ?? "",
      limitations: licence.limitations ?? "",
      evidence: null,
    });
    setNotice(licence.verification_status === "verified"
      ? { type: "success", text: "Editing this verified licence will return it to verification pending when saved." }
      : null);
  }

  async function removeLicence(licence: Licence) {
    if (!window.confirm("Remove this licence and all ratings linked to it?")) return;
    setBusy(true);
    setNotice(null);
    try {
      const linkedRatings = ratings.filter((rating) => rating.licence_id === licence.id);
      const evidencePaths = [licence.evidence_path, ...linkedRatings.map((rating) => rating.evidence_path)].filter(Boolean) as string[];
      const { error } = await supabase.from("worker_licences").delete().eq("id", licence.id);
      if (error) throw error;
      if (evidencePaths.length) {
        await supabase.storage.from("credential-evidence").remove(evidencePaths);
      }
      if (editingLicenceId === licence.id) resetLicenceForm();
      if (linkedRatings.some((rating) => rating.id === editingRatingId)) resetRatingForm();
      setNotice({ type: "success", text: "Licence removed." });
      await loadData();
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not remove licence." });
    } finally {
      setBusy(false);
    }
  }

  function resetRatingForm() {
    setEditingRatingId(null);
    setRatingForm({
      licence_id: "",
      official_designation: "",
      privilege_category: "",
      aircraft_family_id: "",
      custom_aircraft_family: "",
      aircraft_variant_id: "",
      engine_id: "",
      evidence: null,
    });
  }

  function editRating(rating: Rating) {
    setEditingRatingId(rating.id);
    setRatingForm({
      licence_id: rating.licence_id,
      official_designation: rating.official_designation,
      privilege_category: rating.privilege_category ?? "",
      aircraft_family_id: rating.aircraft_family_id ?? (rating.custom_aircraft_family ? "__custom__" : ""),
      custom_aircraft_family: rating.custom_aircraft_family ?? "",
      aircraft_variant_id: rating.aircraft_variant_id ?? "",
      engine_id: rating.engine_id ?? "",
      evidence: null,
    });
    setNotice(rating.verification_status === "verified"
      ? { type: "success", text: "Editing this verified rating will remove the gold star until the updated rating is reviewed again." }
      : null);
  }

  async function removeRating(rating: Rating) {
    if (!window.confirm("Remove this aircraft rating?")) return;
    setBusy(true);
    setNotice(null);
    try {
      const { error } = await supabase.from("licence_ratings").delete().eq("id", rating.id);
      if (error) throw error;
      if (rating.evidence_path) {
        await supabase.storage.from("credential-evidence").remove([rating.evidence_path]);
      }
      if (editingRatingId === rating.id) resetRatingForm();
      setNotice({ type: "success", text: "Rating removed." });
      await loadData();
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not remove rating." });
    } finally {
      setBusy(false);
    }
  }

  async function addLicence(event: FormEvent) {
    event.preventDefault();
    if (!profile || !userId) return;
    setBusy(true);
    setNotice(null);
    try {
      const existingLicence = editingLicenceId ? licences.find((item) => item.id === editingLicenceId) : null;
      const uploadedEvidence = licenceForm.evidence ? await uploadEvidence(licenceForm.evidence, "licences") : null;
      const evidencePath = uploadedEvidence ?? existingLicence?.evidence_path ?? null;
      const selectedAuthority = authorities.find((item) => item.id === licenceForm.authority_id);
      const selectedSystem = LICENCE_SYSTEMS.find((item) => item.code === licenceForm.licence_system_code);
      const licenceSystem = licenceForm.licence_system_code === "OTHER"
        ? licenceForm.custom_licence_system.trim()
        : selectedSystem?.label ?? "";
      if (!licenceSystem) throw new Error("Select or enter the licence system.");
      if (!selectedAuthority && !licenceForm.custom_authority_name.trim()) throw new Error("Select or enter the issuing authority.");

      const payload = {
        authority_id: selectedAuthority?.id ?? null,
        issuing_country_code: licenceForm.issuing_country_code || selectedAuthority?.country_code || null,
        issuing_authority_name: selectedAuthority?.name ?? licenceForm.custom_authority_name.trim(),
        licence_scheme: licenceSystem,
        category_privileges: licenceForm.category_privileges.trim() || null,
        licence_number: licenceForm.licence_number.trim() || null,
        issued_on: licenceForm.issued_on || null,
        expires_on: licenceForm.expires_on || null,
        limitations: licenceForm.limitations.trim() || null,
        evidence_path: evidencePath,
      };

      const result = editingLicenceId
        ? await supabase.from("worker_licences").update(payload).eq("id", editingLicenceId)
        : await supabase.from("worker_licences").insert({ worker_id: userId, ...payload });

      if (result.error) throw result.error;

      if (uploadedEvidence && existingLicence?.evidence_path && existingLicence.evidence_path !== uploadedEvidence) {
        await supabase.storage.from("credential-evidence").remove([existingLicence.evidence_path]);
      }

      const wasEditing = Boolean(editingLicenceId);
      resetLicenceForm();
      setNotice({ type: "success", text: wasEditing ? "Licence updated. Verification has returned to pending." : "Licence submitted. Verification is pending." });
      await loadData();
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not save licence." });
    } finally {
      setBusy(false);
    }
  }

  async function addRating(event: FormEvent) {
    event.preventDefault();
    if (!profile || !userId) return;
    setBusy(true);
    setNotice(null);
    try {
      const existingRating = editingRatingId ? ratings.find((item) => item.id === editingRatingId) : null;
      const uploadedEvidence = ratingForm.evidence ? await uploadEvidence(ratingForm.evidence, "ratings") : null;
      const evidencePath = uploadedEvidence ?? existingRating?.evidence_path ?? null;

      const payload = {
        licence_id: ratingForm.licence_id,
        official_designation: ratingForm.official_designation.trim(),
        privilege_category: ratingForm.privilege_category.trim() || null,
        aircraft_family_id: ratingForm.aircraft_family_id && ratingForm.aircraft_family_id !== "__custom__" ? ratingForm.aircraft_family_id : null,
        custom_aircraft_family: ratingForm.aircraft_family_id === "__custom__" ? ratingForm.custom_aircraft_family.trim() || null : null,
        aircraft_variant_id: ratingForm.aircraft_family_id === "__custom__" ? null : ratingForm.aircraft_variant_id || null,
        engine_id: ratingForm.engine_id || null,
        evidence_path: evidencePath,
      };

      const result = editingRatingId
        ? await supabase.from("licence_ratings").update(payload).eq("id", editingRatingId)
        : await supabase.from("licence_ratings").insert(payload);

      if (result.error) throw result.error;

      if (uploadedEvidence && existingRating?.evidence_path && existingRating.evidence_path !== uploadedEvidence) {
        await supabase.storage.from("credential-evidence").remove([existingRating.evidence_path]);
      }

      const wasEditing = Boolean(editingRatingId);
      resetRatingForm();
      setNotice({ type: "success", text: wasEditing ? "Rating updated. The gold star is removed until re-verification." : "Rating submitted. The gold star appears only after verification." });
      await loadData();
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not save rating." });
    } finally {
      setBusy(false);
    }
  }

  async function addEmployment(event: FormEvent) {
    event.preventDefault();
    if (!profile || !userId) return;
    setBusy(true);
    setNotice(null);
    try {
      const { data, error } = await supabase
        .from("employment_records")
        .insert({
          worker_id: userId,
          employer_name: employmentForm.employer_name.trim(),
          job_title: employmentForm.job_title.trim(),
          discipline: employmentForm.discipline.trim() || null,
          city: employmentForm.city.trim() || null,
          country_code: cleanCountryCode(employmentForm.country_code) || null,
          employment_type: employmentForm.employment_type,
          start_date: employmentForm.start_date,
          end_date: employmentForm.is_current ? null : employmentForm.end_date || null,
          is_current: employmentForm.is_current,
          description: null,
        })
        .select("id")
        .single();
      if (error) throw error;

      if (employmentForm.environment_ids.length) {
        const { error: envError } = await supabase.from("employment_environments").insert(
          employmentForm.environment_ids.map((environmentId) => ({
            employment_id: data.id,
            environment_id: environmentId,
          })),
        );
        if (envError) throw envError;
      }

      setEmploymentForm({ employer_name: "", job_title: "", discipline: "", city: "", country_code: "", employment_type: "permanent", start_date: "", end_date: "", is_current: false, environment_ids: [] });
      setNotice({ type: "success", text: "Employment record added. Now attach aircraft exposure to it." });
      await loadData();
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not add employment." });
    } finally {
      setBusy(false);
    }
  }

  async function addExposure(event: FormEvent) {
    event.preventDefault();
    if (!profile || !userId) return;
    setBusy(true);
    setNotice(null);
    try {
      const { error } = await supabase.from("employment_aircraft_exposure").insert({
        employment_id: exposureForm.employment_id,
        worker_id: userId,
        aircraft_family_id: exposureForm.aircraft_family_id === "__custom__" ? null : exposureForm.aircraft_family_id,
        custom_aircraft_family: exposureForm.aircraft_family_id === "__custom__" ? exposureForm.custom_aircraft_family.trim() || null : null,
        aircraft_variant_id: exposureForm.aircraft_family_id === "__custom__" ? null : exposureForm.aircraft_variant_id || null,
        engine_id: exposureForm.engine_id || null,
        discipline: exposureForm.discipline.trim() || null,
        exposure: exposureForm.exposure,
        exposure_start: exposureForm.exposure_start || null,
        exposure_end: exposureForm.is_current ? null : exposureForm.exposure_end || null,
        last_worked_on: null,
      });
      if (error) throw error;
      setExposureForm({ employment_id: "", aircraft_family_id: "", custom_aircraft_family: "", aircraft_variant_id: "", engine_id: "", discipline: "", exposure: "regular", exposure_start: "", exposure_end: "", is_current: false });
      setNotice({ type: "success", text: "Aircraft experience added — the blue dot is now derived from this record." });
      await loadData();
      setTab("preview");
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not add aircraft exposure." });
    } finally {
      setBusy(false);
    }
  }

  function resetTrainingForm() {
    setEditingTrainingId(null);
    setTrainingForm({ course_key: "", custom_course_name: "", provider: "", completed_on: "", expires_on: "", evidence: null });
  }

  function editTraining(record: TrainingRecord) {
    const knownCourse = TRAINING_OPTIONS.includes(record.course_name);
    setEditingTrainingId(record.id);
    setTrainingForm({
      course_key: knownCourse ? record.course_name : "__custom__",
      custom_course_name: knownCourse ? "" : record.course_name,
      provider: record.provider ?? "",
      completed_on: record.completed_on ?? "",
      expires_on: record.expires_on ?? "",
      evidence: null,
    });
    setNotice(record.verification_status === "verified" ? { type: "success", text: "Editing verified training will return it to verification pending when saved." } : null);
  }

  async function saveTraining(event: FormEvent) {
    event.preventDefault();
    if (!profile || !userId) return;
    setBusy(true);
    setNotice(null);
    try {
      const existing = editingTrainingId ? trainingRecords.find((item) => item.id === editingTrainingId) : null;
      const courseName = trainingForm.course_key === "__custom__" ? trainingForm.custom_course_name.trim() : trainingForm.course_key;
      if (!courseName) throw new Error("Select or enter the training course.");
      const uploadedEvidence = trainingForm.evidence ? await uploadEvidence(trainingForm.evidence, "training") : null;
      const evidencePath = uploadedEvidence ?? existing?.evidence_path ?? null;
      const payload = {
        course_name: courseName,
        provider: trainingForm.provider.trim() || null,
        completed_on: trainingForm.completed_on || null,
        expires_on: trainingForm.expires_on || null,
        evidence_path: evidencePath,
      };
      const result = editingTrainingId
        ? await supabase.from("training_records").update(payload).eq("id", editingTrainingId)
        : await supabase.from("training_records").insert({ worker_id: userId, ...payload });
      if (result.error) throw result.error;
      if (uploadedEvidence && existing?.evidence_path && existing.evidence_path !== uploadedEvidence) {
        await supabase.storage.from("credential-evidence").remove([existing.evidence_path]);
      }
      const wasEditing = Boolean(editingTrainingId);
      resetTrainingForm();
      setNotice({ type: "success", text: wasEditing ? "Training updated. Verification has returned to pending." : "Training added." });
      await loadData();
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not save training." });
    } finally {
      setBusy(false);
    }
  }

  async function removeTraining(record: TrainingRecord) {
    if (!window.confirm("Remove this training record?")) return;
    setBusy(true);
    setNotice(null);
    try {
      const { error } = await supabase.from("training_records").delete().eq("id", record.id);
      if (error) throw error;
      if (record.evidence_path) await supabase.storage.from("credential-evidence").remove([record.evidence_path]);
      if (editingTrainingId === record.id) resetTrainingForm();
      setNotice({ type: "success", text: "Training removed." });
      await loadData();
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not remove training." });
    } finally {
      setBusy(false);
    }
  }

  function resetCompetencyForm() {
    setEditingCompetencyId(null);
    setCompetencyForm({ competency_id: "", custom_competency_name: "", aircraft_family_id: "", aircraft_variant_id: "", engine_id: "", gained_on: "", last_used_on: "", evidence: null });
  }

  function editCompetency(record: WorkerCompetency) {
    setEditingCompetencyId(record.id);
    setCompetencyForm({
      competency_id: record.competency_id ?? "__custom__",
      custom_competency_name: record.custom_competency_name ?? "",
      aircraft_family_id: record.aircraft_family_id ?? "",
      aircraft_variant_id: record.aircraft_variant_id ?? "",
      engine_id: record.engine_id ?? "",
      gained_on: record.gained_on ?? "",
      last_used_on: record.last_used_on ?? "",
      evidence: null,
    });
    setNotice(record.verification_status === "verified" ? { type: "success", text: "Editing a verified competency will return it to verification pending when saved." } : null);
  }

  async function saveCompetency(event: FormEvent) {
    event.preventDefault();
    if (!profile || !userId) return;
    setBusy(true);
    setNotice(null);
    try {
      const existing = editingCompetencyId ? workerCompetencies.find((item) => item.id === editingCompetencyId) : null;
      const selectedCatalog = competencyCatalog.find((item) => item.id === competencyForm.competency_id);
      const customName = competencyForm.competency_id === "__custom__" ? competencyForm.custom_competency_name.trim() : "";
      if (!selectedCatalog && !customName) throw new Error("Select or enter a competency.");
      if (selectedCatalog?.aircraft_specific && !competencyForm.aircraft_family_id) throw new Error("This competency is aircraft-specific. Select an aircraft family.");
      const uploadedEvidence = competencyForm.evidence ? await uploadEvidence(competencyForm.evidence, "competencies") : null;
      const evidencePath = uploadedEvidence ?? existing?.evidence_path ?? null;
      const payload = {
        competency_id: selectedCatalog?.id ?? null,
        custom_competency_name: customName || null,
        aircraft_family_id: competencyForm.aircraft_family_id || null,
        aircraft_variant_id: competencyForm.aircraft_variant_id || null,
        engine_id: competencyForm.engine_id || null,
        gained_on: competencyForm.gained_on || null,
        last_used_on: competencyForm.last_used_on || null,
        evidence_path: evidencePath,
      };
      const result = editingCompetencyId
        ? await supabase.from("worker_competencies").update(payload).eq("id", editingCompetencyId)
        : await supabase.from("worker_competencies").insert({ worker_id: userId, ...payload });
      if (result.error) throw result.error;
      if (uploadedEvidence && existing?.evidence_path && existing.evidence_path !== uploadedEvidence) {
        await supabase.storage.from("credential-evidence").remove([existing.evidence_path]);
      }
      const wasEditing = Boolean(editingCompetencyId);
      resetCompetencyForm();
      setNotice({ type: "success", text: wasEditing ? "Competency updated. Verification has returned to pending." : "Competency added." });
      await loadData();
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not save competency." });
    } finally {
      setBusy(false);
    }
  }

  async function removeCompetency(record: WorkerCompetency) {
    if (!window.confirm("Remove this competency?")) return;
    setBusy(true);
    setNotice(null);
    try {
      const { error } = await supabase.from("worker_competencies").delete().eq("id", record.id);
      if (error) throw error;
      if (record.evidence_path) await supabase.storage.from("credential-evidence").remove([record.evidence_path]);
      if (editingCompetencyId === record.id) resetCompetencyForm();
      setNotice({ type: "success", text: "Competency removed." });
      await loadData();
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not remove competency." });
    } finally {
      setBusy(false);
    }
  }

  function resetAuthorisationForm() {
    setEditingAuthorisationId(null);
    setAuthorisationForm({
      employment_id: "",
      custom_employer_name: "",
      authorisation_name: "",
      aircraft_family_id: "",
      custom_aircraft_family: "",
      aircraft_variant_id: "",
      competency_id: "",
      issued_on: "",
      expires_on: "",
      is_current: true,
      ended_on: "",
      evidence: null,
    });
  }

  function editAuthorisation(record: CompanyAuthorisation) {
    setEditingAuthorisationId(record.id);
    setAuthorisationForm({
      employment_id: record.employment_id ?? (employments.some((item) => item.employer_name === record.employer_name) ? employments.find((item) => item.employer_name === record.employer_name)?.id ?? "" : "__custom__"),
      custom_employer_name: record.employment_id ? "" : record.employer_name,
      authorisation_name: record.authorisation_name,
      aircraft_family_id: record.aircraft_family_id ?? (record.custom_aircraft_family ? "__custom__" : ""),
      custom_aircraft_family: record.custom_aircraft_family ?? "",
      aircraft_variant_id: record.aircraft_variant_id ?? "",
      competency_id: record.competency_id ?? "",
      issued_on: record.issued_on ?? "",
      expires_on: record.expires_on ?? "",
      is_current: !record.ended_on && !record.revoked_on,
      ended_on: record.ended_on ?? record.revoked_on ?? "",
      evidence: null,
    });
    setNotice(record.verification_status === "verified"
      ? { type: "success", text: "Editing this verified authorisation will remove the green shield until the updated record is reviewed again." }
      : null);
  }

  async function saveAuthorisation(event: FormEvent) {
    event.preventDefault();
    if (!profile || !userId) return;
    setBusy(true);
    setNotice(null);
    try {
      const existing = editingAuthorisationId ? companyAuthorisations.find((item) => item.id === editingAuthorisationId) : null;
      const linkedEmployment = authorisationForm.employment_id && authorisationForm.employment_id !== "__custom__"
        ? employments.find((item) => item.id === authorisationForm.employment_id)
        : null;
      const employerName = linkedEmployment?.employer_name ?? authorisationForm.custom_employer_name.trim();
      if (!employerName) throw new Error("Select an employment record or enter the employer name.");
      if (!authorisationForm.authorisation_name.trim()) throw new Error("Enter the authorisation name.");
      if (!authorisationForm.is_current && !authorisationForm.ended_on) throw new Error("Enter when the historical authorisation ended.");

      const uploadedEvidence = authorisationForm.evidence ? await uploadEvidence(authorisationForm.evidence, "authorisations") : null;
      const evidencePath = uploadedEvidence ?? existing?.evidence_path ?? null;
      const payload = {
        employment_id: linkedEmployment?.id ?? null,
        employer_name: employerName,
        authorisation_name: authorisationForm.authorisation_name.trim(),
        aircraft_family_id: authorisationForm.aircraft_family_id && authorisationForm.aircraft_family_id !== "__custom__" ? authorisationForm.aircraft_family_id : null,
        custom_aircraft_family: authorisationForm.aircraft_family_id === "__custom__" ? authorisationForm.custom_aircraft_family.trim() || null : null,
        aircraft_variant_id: authorisationForm.aircraft_family_id === "__custom__" ? null : authorisationForm.aircraft_variant_id || null,
        competency_id: authorisationForm.competency_id || null,
        issued_on: authorisationForm.issued_on || null,
        expires_on: authorisationForm.expires_on || null,
        ended_on: authorisationForm.is_current ? null : authorisationForm.ended_on || null,
        revoked_on: null,
        evidence_path: evidencePath,
      };

      const result = editingAuthorisationId
        ? await supabase.from("company_authorisations").update(payload).eq("id", editingAuthorisationId)
        : await supabase.from("company_authorisations").insert({ worker_id: userId, ...payload });
      if (result.error) throw result.error;

      if (uploadedEvidence && existing?.evidence_path && existing.evidence_path !== uploadedEvidence) {
        await supabase.storage.from("credential-evidence").remove([existing.evidence_path]);
      }

      const wasEditing = Boolean(editingAuthorisationId);
      resetAuthorisationForm();
      setNotice({ type: "success", text: wasEditing ? "Authorisation updated. Verification has returned to pending." : "Authorisation submitted. The green shield appears only after verification." });
      await loadData();
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not save authorisation." });
    } finally {
      setBusy(false);
    }
  }

  async function removeAuthorisation(record: CompanyAuthorisation) {
    if (!window.confirm("Remove this company authorisation?")) return;
    setBusy(true);
    setNotice(null);
    try {
      const { error } = await supabase.from("company_authorisations").delete().eq("id", record.id);
      if (error) throw error;
      if (record.evidence_path) await supabase.storage.from("credential-evidence").remove([record.evidence_path]);
      if (editingAuthorisationId === record.id) resetAuthorisationForm();
      setNotice({ type: "success", text: "Company authorisation removed." });
      await loadData();
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not remove authorisation." });
    } finally {
      setBusy(false);
    }
  }

  function toggleMarketEmploymentType(value: string) {
    setMarketForm((current) => ({
      ...current,
      preferred_employment_types: current.preferred_employment_types.includes(value)
        ? current.preferred_employment_types.filter((item) => item !== value)
        : [...current.preferred_employment_types, value],
    }));
  }

  function toggleMarketEnvironment(id: number) {
    setMarketForm((current) => ({
      ...current,
      environment_ids: current.environment_ids.includes(id)
        ? current.environment_ids.filter((item) => item !== id)
        : [...current.environment_ids, id],
    }));
  }

  async function saveMarketPreferences(event: FormEvent) {
    event.preventDefault();
    if (!userId) return;
    setBusy(true);
    setNotice(null);
    try {
      const minimumCompensation = marketForm.minimum_compensation.trim()
        ? Number(marketForm.minimum_compensation)
        : null;
      if (minimumCompensation != null && (!Number.isFinite(minimumCompensation) || minimumCompensation < 0)) {
        throw new Error("Enter a valid minimum compensation amount.");
      }
      const noticeValue = marketForm.notice_value.trim() ? Number(marketForm.notice_value) : null;
      if (noticeValue != null && (!Number.isInteger(noticeValue) || noticeValue < 0)) {
        throw new Error("Notice period must be a whole number.");
      }
      const noticeDays = noticeValue == null
        ? null
        : marketForm.notice_unit === "weeks"
          ? noticeValue * 7
          : marketForm.notice_unit === "months"
            ? noticeValue * 30
            : noticeValue;
      const currency = marketForm.minimum_compensation_currency.trim().toUpperCase().slice(0, 3);
      if (minimumCompensation != null && currency.length !== 3) {
        throw new Error("Enter a three-letter currency code for minimum compensation.");
      }

      const { error: preferenceError } = await supabase.from("worker_market_preferences").upsert({
        worker_id: userId,
        earliest_start_date: marketForm.earliest_start_date || null,
        notice_days: noticeDays,
        notice_value: noticeValue,
        notice_unit: noticeValue == null ? null : marketForm.notice_unit,
        willing_to_relocate: marketForm.willing_to_relocate,
        willing_fifo: marketForm.willing_fifo,
        willing_dido: marketForm.willing_dido,
        willing_commute: marketForm.willing_commute,
        willing_international: marketForm.willing_international,
        willing_temporary_assignment: marketForm.willing_temporary_assignment,
        preferred_employment_types: marketForm.preferred_employment_types,
        minimum_compensation: minimumCompensation,
        minimum_compensation_currency: minimumCompensation == null ? null : currency,
        minimum_compensation_period: marketForm.minimum_compensation_period,
        compensation_visibility: marketForm.compensation_visibility,
        roster_preferences: {
          flexibility: marketForm.roster_flexibility,
          preferred_pattern: marketForm.preferred_roster_pattern.trim() || undefined,
        },
      }, { onConflict: "worker_id" });
      if (preferenceError) throw preferenceError;

      const { error: clearEnvironmentError } = await supabase.from("worker_environment_preferences").delete().eq("worker_id", userId);
      if (clearEnvironmentError) throw clearEnvironmentError;
      if (marketForm.environment_ids.length) {
        const { error: environmentError } = await supabase.from("worker_environment_preferences").insert(
          marketForm.environment_ids.map((environmentId) => ({ worker_id: userId, environment_id: environmentId })),
        );
        if (environmentError) throw environmentError;
      }

      setNotice({ type: "success", text: "Market preferences saved." });
      await loadData();
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not save market preferences." });
    } finally {
      setBusy(false);
    }
  }

  function resetLocationPreferenceForm() {
    setEditingLocationPreferenceId(null);
    setLocationPreferenceForm({ country_code: "", city: "", preference: "preferred", relocation_mode: "any" });
  }

  function editLocationPreference(record: LocationPreference) {
    setEditingLocationPreferenceId(record.id);
    setLocationPreferenceForm({
      country_code: record.country_code,
      city: record.city ?? "",
      preference: record.preference,
      relocation_mode: record.relocation_mode ?? "any",
    });
  }

  async function saveLocationPreference(event: FormEvent) {
    event.preventDefault();
    if (!userId || !locationPreferenceForm.country_code) return;
    setBusy(true);
    setNotice(null);
    try {
      const payload = {
        country_code: locationPreferenceForm.country_code,
        city: locationPreferenceForm.city.trim() || null,
        preference: locationPreferenceForm.preference,
        relocation_mode: locationPreferenceForm.relocation_mode === "any" ? null : locationPreferenceForm.relocation_mode,
      };
      const result = editingLocationPreferenceId
        ? await supabase.from("worker_location_preferences").update(payload).eq("id", editingLocationPreferenceId)
        : await supabase.from("worker_location_preferences").insert({ worker_id: userId, ...payload });
      if (result.error) throw result.error;
      const wasEditing = Boolean(editingLocationPreferenceId);
      resetLocationPreferenceForm();
      setNotice({ type: "success", text: wasEditing ? "Location preference updated." : "Location preference added." });
      await loadData();
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not save location preference." });
    } finally {
      setBusy(false);
    }
  }

  async function removeLocationPreference(record: LocationPreference) {
    if (!window.confirm("Remove this location preference?")) return;
    setBusy(true);
    setNotice(null);
    try {
      const { error } = await supabase.from("worker_location_preferences").delete().eq("id", record.id);
      if (error) throw error;
      if (editingLocationPreferenceId === record.id) resetLocationPreferenceForm();
      setNotice({ type: "success", text: "Location preference removed." });
      await loadData();
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not remove location preference." });
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  function toggleEnvironment(id: number) {
    setEmploymentForm((current) => ({
      ...current,
      environment_ids: current.environment_ids.includes(id)
        ? current.environment_ids.filter((item) => item !== id)
        : [...current.environment_ids, id],
    }));
  }

  const manufacturerById = useMemo(() => Object.fromEntries(manufacturers.map((item) => [item.id, item])), [manufacturers]);
  const familyById = useMemo(() => Object.fromEntries(families.map((item) => [item.id, item])), [families]);
  const variantById = useMemo(() => Object.fromEntries(variants.map((item) => [item.id, item])), [variants]);
  const engineById = useMemo(() => Object.fromEntries(engines.map((item) => [item.id, item])), [engines]);
  const authorityById = useMemo(() => Object.fromEntries(authorities.map((item) => [item.id, item])), [authorities]);
  const employmentById = useMemo(() => Object.fromEntries(employments.map((item) => [item.id, item])), [employments]);
  const environmentById = useMemo(() => Object.fromEntries(environments.map((item) => [item.id, item])), [environments]);

  const sortedEnvironments = useMemo(() => {
    const rank = new Map(ENVIRONMENT_ORDER.map((code, index) => [code, index]));
    return [...environments].sort((a, b) => {
      const aRank = rank.get(a.code) ?? 999;
      const bRank = rank.get(b.code) ?? 999;
      return aRank - bRank || a.label.localeCompare(b.label);
    });
  }, [environments]);

  const aircraftFamilyGroups = useMemo(() => {
    const preferredRank = new Map(AIRCRAFT_MANUFACTURER_ORDER.map((name, index) => [name, index]));
    const grouped = new Map<string, AircraftFamily[]>();

    for (const family of families) {
      const manufacturerName = manufacturerById[family.manufacturer_id]?.name ?? "Other";
      const group = grouped.get(manufacturerName) ?? [];
      group.push(family);
      grouped.set(manufacturerName, group);
    }

    return [...grouped.entries()]
      .map(([manufacturerName, groupFamilies]) => ({
        manufacturerName,
        families: [...groupFamilies].sort((a, b) => a.display_name.localeCompare(b.display_name, undefined, { numeric: true })),
      }))
      .sort((a, b) => {
        const aRank = preferredRank.get(a.manufacturerName) ?? 999;
        const bRank = preferredRank.get(b.manufacturerName) ?? 999;
        return aRank - bRank || a.manufacturerName.localeCompare(b.manufacturerName);
      });
  }, [families, manufacturerById]);

  const competencyById = useMemo(() => Object.fromEntries(competencyCatalog.map((item) => [item.id, item])), [competencyCatalog]);

  const filteredRatingVariants = ratingForm.aircraft_family_id === "__custom__" ? [] : variants.filter((item) => item.family_id === ratingForm.aircraft_family_id);
  const filteredExposureVariants = exposureForm.aircraft_family_id === "__custom__" ? [] : variants.filter((item) => item.family_id === exposureForm.aircraft_family_id);
  const filteredCompetencyVariants = competencyForm.aircraft_family_id ? variants.filter((item) => item.family_id === competencyForm.aircraft_family_id) : [];
  const filteredAuthorisationVariants = authorisationForm.aircraft_family_id && authorisationForm.aircraft_family_id !== "__custom__" ? variants.filter((item) => item.family_id === authorisationForm.aircraft_family_id) : [];
  const allowedExposureEngineIds = exposureForm.aircraft_variant_id
    ? new Set(variantEngines.filter((item) => item.variant_id === exposureForm.aircraft_variant_id).map((item) => item.engine_id))
    : null;
  const filteredExposureEngines = allowedExposureEngineIds?.size
    ? engines.filter((item) => allowedExposureEngineIds.has(item.id))
    : engines;
  const allowedCompetencyEngineIds = competencyForm.aircraft_variant_id
    ? new Set(variantEngines.filter((item) => item.variant_id === competencyForm.aircraft_variant_id).map((item) => item.engine_id))
    : null;
  const filteredCompetencyEngines = allowedCompetencyEngineIds?.size
    ? engines.filter((item) => allowedCompetencyEngineIds.has(item.id))
    : engines;

  const aircraftSummary = useMemo(() => {
    type Summary = {
      key: string;
      label: string;
      manufacturerName: string | null;
      exposure: Exposure[];
      rated: boolean;
      authorised: boolean;
    };
    const result = new Map<string, Summary>();

    function identity(familyId: string | null, customName: string | null | undefined) {
      if (familyId) {
        const family = familyById[familyId];
        if (!family) return null;
        return {
          key: `known:${family.id}`,
          label: family.display_name,
          manufacturerName: manufacturerById[family.manufacturer_id]?.name ?? null,
        };
      }
      const custom = customName?.trim();
      if (!custom) return null;
      return { key: `custom:${custom.toLowerCase()}`, label: custom, manufacturerName: null };
    }

    for (const exposure of exposures) {
      const item = identity(exposure.aircraft_family_id, exposure.custom_aircraft_family);
      if (!item) continue;
      const existing = result.get(item.key) ?? { ...item, exposure: [], rated: false, authorised: false };
      existing.exposure.push(exposure);
      result.set(item.key, existing);
    }
    for (const rating of ratings) {
      if (rating.verification_status !== "verified") continue;
      const item = identity(rating.aircraft_family_id, rating.custom_aircraft_family);
      if (!item) continue;
      const existing = result.get(item.key) ?? { ...item, exposure: [], rated: false, authorised: false };
      existing.rated = true;
      result.set(item.key, existing);
    }
    for (const authorisation of authorisations) {
      const item = identity(authorisation.aircraft_family_id, authorisation.custom_aircraft_family);
      if (!item) continue;
      const existing = result.get(item.key) ?? { ...item, exposure: [], rated: false, authorised: false };
      existing.authorised = true;
      result.set(item.key, existing);
    }
    return [...result.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [exposures, ratings, authorisations, familyById, manufacturerById]);

  if (loading) {
    return <div className="rounded-3xl border border-slate-200 bg-white p-8 text-slate-600">Loading your Aviation Passport…</div>;
  }

  const primaryNationality = nationalities.find((item) => item.is_primary) ?? nationalities[0];
  const euWorkRightCodes = new Set(workRights.map((item) => item.country_code).filter((code) => EU_COUNTRY_CODES.includes(code as (typeof EU_COUNTRY_CODES)[number])));
  const hasFullEuWorkRights = EU_COUNTRY_CODES.every((code) => euWorkRightCodes.has(code));
  const previewWorkRights = hasFullEuWorkRights
    ? workRights.filter((item) => !EU_COUNTRY_CODES.includes(item.country_code as (typeof EU_COUNTRY_CODES)[number]))
    : workRights;

  return (
    <div>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs font-bold tracking-[0.22em] text-slate-500">AVIATION PASSPORT</div>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">My Passport</h1>
          <p className="mt-2 max-w-2xl text-slate-600">One structured aviation identity. Build it once; let the career record become increasingly self-maintaining.</p>
        </div>
        <div className="flex flex-wrap gap-2 self-start">
          <a href="/employer" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Employer Portal</a>
          <button onClick={signOut} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Sign out</button>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm sm:grid-cols-4 xl:grid-cols-8">
        {([
          ["preview", "Passport"],
          ["identity", "Identity"],
          ["licences", "Licences"],
          ["employment", "Employment"],
          ["training", "Training"],
          ["authorisations", "Authorisations"],
          ["market", "Preferences"],
          ["opportunities", "Opportunities"],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`min-w-0 rounded-xl px-3 py-2.5 text-center text-sm font-semibold transition ${
              tab === key
                ? "bg-slate-950 text-white"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {notice ? (
        <div className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${notice.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>{notice.text}</div>
      ) : null}

      {!profile && tab !== "identity" ? (
        <div className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="font-semibold text-amber-950">Start with your identity</h2>
          <p className="mt-1 text-sm text-amber-800">Save Professional Identity once before adding licences or employment records.</p>
          <button onClick={() => setTab("identity")} className="mt-4 rounded-xl bg-amber-950 px-4 py-2 text-sm font-semibold text-white">Create identity</button>
        </div>
      ) : null}

      {tab === "preview" && profile ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-500">AVIATION PASSPORT</div>
                <h2 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">{[profile.first_name, profile.middle_name, profile.last_name].filter(Boolean).join(" ")}</h2>
                <p className="mt-1 text-lg text-slate-700">{profile.professional_headline || "Aviation professional"}</p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-600">
                  {profile.current_city || profile.current_country_code ? <span>{[profile.current_city, countryLabel(profile.current_country_code)].filter(Boolean).join(", ")}</span> : null}
                  {primaryNationality ? <span>Nationality: {countryLabel(primaryNationality.country_code)}</span> : null}
                  <span>{formatStatus(profile.market_status)}</span>
                </div>
              </div>
              <div className="rounded-2xl bg-slate-950 px-4 py-3 text-center text-white">
                <div className="text-[11px] font-bold tracking-[0.18em] text-slate-400">PREFERRED CURRENCY</div>
                <div className="mt-1 text-xl font-semibold">{profile.preferred_currency}</div>
              </div>
            </div>


            <div className="mt-8 border-t border-slate-100 pt-6">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-lg font-semibold text-slate-950">Aircraft</h3>
                <div className="hidden items-center gap-4 text-xs text-slate-500 sm:flex"><span className="flex items-center gap-1.5"><BlueDot /> Experience</span><span className="flex items-center gap-1.5"><GoldStar /> Rated</span><span className="flex items-center gap-1.5"><GreenShield /> Authorised</span></div>
              </div>
              {aircraftSummary.length ? (
                <div className="mt-4 flex flex-wrap gap-2.5">
                  {aircraftSummary.map(({ key, label, manufacturerName, exposure, rated, authorised }) => {
                    const hasCurrentExposure = exposure.some((item) => !item.exposure_end);
                    const latestEnd = exposure.map((item) => item.exposure_end).filter(Boolean).sort().at(-1) ?? null;
                    return (
                      <div key={key} className="group relative flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
                        <span className="font-semibold text-slate-900">{label}</span>
                        {exposure.length ? <BlueDot /> : null}
                        {rated ? <GoldStar /> : null}
                        {authorised ? <GreenShield /> : null}
                        <div className="pointer-events-none absolute left-0 top-full z-20 mt-2 hidden min-w-56 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 shadow-lg group-hover:block">
                          <div className="font-semibold text-slate-900">{[manufacturerName, label].filter(Boolean).join(" ")}</div>
                          {exposure.length ? <div className="mt-1">Experience records: {exposure.length}</div> : null}
                          {hasCurrentExposure ? <div>Current aircraft exposure</div> : latestEnd ? <div>Latest exposure ended: {formatDate(latestEnd)}</div> : null}
                          {rated ? <div className="mt-1 text-amber-700">Verified type rating</div> : null}
                          {authorised ? <div className="text-emerald-700">Current company authorisation</div> : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : <p className="mt-4 text-sm text-slate-500">No aircraft experience added yet.</p>}
            </div>

            <div className="mt-8 border-t border-slate-100 pt-6">
              <h3 className="text-lg font-semibold text-slate-950">Licences</h3>
              {licences.length ? (
                <div className="mt-4 space-y-3">
                  {licences.map((licence) => (
                    <div key={licence.id} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="font-semibold text-slate-900">{licence.issuing_authority_name || (licence.authority_id ? authorityById[licence.authority_id]?.name : null) || "Aviation authority"}</div>
                          <div className="mt-1 text-sm text-slate-600">{licence.licence_scheme}{licence.category_privileges ? ` · ${licence.category_privileges}` : ""}</div>
                        </div>
                        <EvidenceStatus status={licence.verification_status} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="mt-4 text-sm text-slate-500">No licences added yet.</p>}
            </div>

            <div className="mt-8 border-t border-slate-100 pt-6">
              <h3 className="text-lg font-semibold text-slate-950">Training & Competencies</h3>
              {trainingRecords.length || workerCompetencies.length ? (
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Training</div>
                    <div className="mt-2 space-y-2">
                      {trainingRecords.length ? trainingRecords.map((record) => (
                        <div key={record.id} className="rounded-xl bg-slate-50 px-3 py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-slate-900">{record.course_name}</span>
                            {record.expires_on ? <span className={`text-xs font-semibold ${isExpired(record.expires_on) ? "text-rose-600" : "text-emerald-600"}`}>{isExpired(record.expires_on) ? "Expired" : "Current"}</span> : null}
                          </div>
                          {record.provider ? <div className="mt-1 text-xs text-slate-500">{record.provider}</div> : null}
                        </div>
                      )) : <p className="text-sm text-slate-500">No training recorded.</p>}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Competencies</div>
                    <div className="mt-2 space-y-2">
                      {workerCompetencies.length ? workerCompetencies.map((record) => {
                        const competencyName = record.competency_id ? competencyById[record.competency_id]?.label : record.custom_competency_name;
                        const aircraftName = record.aircraft_family_id ? familyById[record.aircraft_family_id]?.display_name : null;
                        return (
                          <div key={record.id} className="rounded-xl bg-slate-50 px-3 py-2.5">
                            <div className="text-sm font-semibold text-slate-900">{competencyName || "Competency"}</div>
                            {aircraftName ? <div className="mt-1 text-xs text-slate-500">{aircraftName}</div> : null}
                          </div>
                        );
                      }) : <p className="text-sm text-slate-500">No competencies recorded.</p>}
                    </div>
                  </div>
                </div>
              ) : <p className="mt-4 text-sm text-slate-500">No training or competencies added yet.</p>}
            </div>

            <div className="mt-8 border-t border-slate-100 pt-6">
              <h3 className="text-lg font-semibold text-slate-950">Company Authorisations</h3>
              {companyAuthorisations.length ? (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {companyAuthorisations.map((record) => {
                    const familyName = record.aircraft_family_id ? familyById[record.aircraft_family_id]?.display_name : record.custom_aircraft_family;
                    const current = !record.ended_on && !record.revoked_on && (!record.expires_on || !isExpired(record.expires_on));
                    return (
                      <div key={record.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-slate-900">{record.authorisation_name}</div>
                            <div className="mt-1 text-sm text-slate-600">{record.employer_name}{familyName ? ` · ${familyName}` : ""}</div>
                          </div>
                          {record.verification_status === "verified" && current ? <GreenShield /> : <EvidenceStatus status={record.verification_status} />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : <p className="mt-4 text-sm text-slate-500">No company authorisations added yet.</p>}
            </div>
          </section>

          <aside className="space-y-6">
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="font-semibold text-slate-950">Work rights</h3>
              {workRights.length ? <div className="mt-3 space-y-3">
                {hasFullEuWorkRights ? <div className="rounded-xl bg-slate-50 p-3"><div className="flex items-center gap-2 font-semibold text-slate-900"><span aria-hidden="true">🇪🇺</span><span>European Union</span></div><div className="mt-1 text-sm text-slate-600">Work rights across all EU member states</div></div> : null}
                {previewWorkRights.map((right) => <div key={right.id} className="rounded-xl bg-slate-50 p-3"><div className="font-semibold text-slate-900">{countryLabel(right.country_code)}</div><div className="mt-1 text-sm text-slate-600">{formatStatus(right.status)}</div></div>)}
              </div> : <p className="mt-2 text-sm text-slate-500">No work rights added.</p>}
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="font-semibold text-slate-950">Market preferences</h3>
              {marketPreference ? (
                <div className="mt-3 space-y-3 text-sm">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-xs font-bold uppercase tracking-[0.1em] text-slate-400">Availability</div>
                    <div className="mt-1 font-semibold text-slate-900">{marketPreference.earliest_start_date ? `From ${formatDate(marketPreference.earliest_start_date)}` : noticePeriodLabel(marketPreference)}</div>
                  </div>
                  {[marketPreference.willing_to_relocate, marketPreference.willing_fifo, marketPreference.willing_dido, marketPreference.willing_commute, marketPreference.willing_international, marketPreference.willing_temporary_assignment].some(Boolean) ? (
                    <div className="flex flex-wrap gap-2">
                      {marketPreference.willing_to_relocate ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">Relocation</span> : null}
                      {marketPreference.willing_fifo ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">FIFO</span> : null}
                      {marketPreference.willing_dido ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">DIDO</span> : null}
                      {marketPreference.willing_commute ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">Commute</span> : null}
                      {marketPreference.willing_international ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">International</span> : null}
                      {marketPreference.willing_temporary_assignment ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">Temporary assignment</span> : null}
                    </div>
                  ) : null}
                  {locationPreferences.filter((item) => item.preference !== "not_interested").length ? <div><div className="text-xs font-bold uppercase tracking-[0.1em] text-slate-400">Locations</div><div className="mt-1 text-slate-700">{locationPreferences.filter((item) => item.preference !== "not_interested").slice(0, 4).map((item) => [item.city, countryLabel(item.country_code)].filter(Boolean).join(", ")).join(" · ")}{locationPreferences.filter((item) => item.preference !== "not_interested").length > 4 ? " · …" : ""}</div></div> : null}
                  {marketPreference.roster_preferences?.flexibility && marketPreference.roster_preferences.flexibility !== "any" ? <div><div className="text-xs font-bold uppercase tracking-[0.1em] text-slate-400">Roster</div><div className="mt-1 text-slate-700">{ROSTER_FLEXIBILITY_OPTIONS.find(([value]) => value === marketPreference.roster_preferences?.flexibility)?.[1] ?? formatStatus(marketPreference.roster_preferences.flexibility)}{marketPreference.roster_preferences.preferred_pattern ? ` · ${marketPreference.roster_preferences.preferred_pattern}` : ""}</div></div> : marketPreference.roster_preferences?.preferred_pattern ? <div><div className="text-xs font-bold uppercase tracking-[0.1em] text-slate-400">Roster</div><div className="mt-1 text-slate-700">{marketPreference.roster_preferences.preferred_pattern}</div></div> : null}
                  {marketPreference.minimum_compensation != null ? <div><div className="text-xs font-bold uppercase tracking-[0.1em] text-slate-400">Compensation</div><div className="mt-1 text-slate-700">{marketPreference.compensation_visibility === "visible" ? `${marketPreference.minimum_compensation_currency ?? profile.preferred_currency} ${Number(marketPreference.minimum_compensation).toLocaleString()} / ${marketPreference.minimum_compensation_period}` : marketPreference.compensation_visibility === "compatibility_only" ? "Compatibility only — amount hidden" : "Private"}</div></div> : null}
                </div>
              ) : <p className="mt-2 text-sm text-slate-500">No market preferences saved.</p>}
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="font-semibold text-slate-950">Career history</h3>
              {employments.length ? <div className="mt-4 space-y-4">{employments.map((employment) => <div key={employment.id}><div className="font-semibold text-slate-900">{employment.employer_name}</div><div className="text-sm text-slate-600">{employment.job_title}</div><div className="mt-1 text-xs text-slate-500">{formatDate(employment.start_date)} — {employment.is_current ? "Present" : formatDate(employment.end_date)}</div></div>)}</div> : <p className="mt-2 text-sm text-slate-500">No employment history yet.</p>}
            </section>
          </aside>
        </div>
      ) : null}

      {tab === "identity" ? (
        <div className="mt-6 space-y-6">
          <form onSubmit={saveIdentity} className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
            <div className="max-w-3xl">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Professional Identity</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">Cold professional facts only. Nationality stays separate from work rights and has its own privacy control.</p>
            </div>
            <div className="mt-7 grid gap-5 md:grid-cols-2">
              <Field label="First name"><input className="input" value={identityForm.first_name} onChange={(e) => setIdentityForm({ ...identityForm, first_name: e.target.value })} required /></Field>
              <Field label="Middle name"><input className="input" value={identityForm.middle_name} onChange={(e) => setIdentityForm({ ...identityForm, middle_name: e.target.value })} /></Field>
              <Field label="Last name"><input className="input" value={identityForm.last_name} onChange={(e) => setIdentityForm({ ...identityForm, last_name: e.target.value })} required /></Field>
              <Field label="Professional headline" hint="e.g. B2 Aircraft Maintenance Engineer"><input className="input" value={identityForm.professional_headline} onChange={(e) => setIdentityForm({ ...identityForm, professional_headline: e.target.value })} /></Field>
              <Field label="Current city"><input className="input" value={identityForm.current_city} onChange={(e) => setIdentityForm({ ...identityForm, current_city: e.target.value })} /></Field>
              <Field label="Current country"><CountrySelect value={identityForm.current_country_code} onChange={(value) => setIdentityForm({ ...identityForm, current_country_code: value })} /></Field>
              <Field label="Preferred currency" hint="All market money will eventually display in this currency"><input className="input uppercase" maxLength={3} value={identityForm.preferred_currency} onChange={(e) => setIdentityForm({ ...identityForm, preferred_currency: e.target.value.toUpperCase() })} required /></Field>
              <Field label="Primary nationality"><CountrySelect value={identityForm.primary_nationality} onChange={(value) => setIdentityForm({ ...identityForm, primary_nationality: value })} /></Field>
              <Field label="Nationality visibility"><select className="input" value={identityForm.nationality_visibility} onChange={(e) => setIdentityForm({ ...identityForm, nationality_visibility: e.target.value as typeof identityForm.nationality_visibility })}><option value="visible">Visible</option><option value="employers_only">Employers only</option><option value="hidden">Hidden</option></select></Field>
              <Field label="Profile visibility" hint={identityForm.visibility === "public" ? "Named profile can appear to authorised employers when you match their Open Demand." : identityForm.visibility === "anonymous_market" ? "You can appear as an anonymous match and receive platform-mediated opportunities without revealing your identity." : "You do not appear as an individual Talent Match."}><select className="input" value={identityForm.visibility} onChange={(e) => setIdentityForm({ ...identityForm, visibility: e.target.value as PublicProfileVisibility })}><option value="private">Private</option><option value="anonymous_market">Anonymous market</option><option value="public">Public</option></select></Field>
              <Field label="Market status"><select className="input" value={identityForm.market_status} onChange={(e) => setIdentityForm({ ...identityForm, market_status: e.target.value as Profile["market_status"] })}><option value="not_open">Not open</option><option value="selected_opportunities">Open to selected opportunities</option><option value="actively_looking">Actively looking</option><option value="contract_only">Contract only</option></select></Field>
            </div>
            <button disabled={busy} className="mt-7 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save Professional Identity"}</button>
          </form>

          {profile ? (
            <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Work Rights</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Add every country where you can work. Select “European Union — all EU member states” from the country list to add all EU work rights at once.</p>
              </div>

              <form onSubmit={addWorkRight} className="mt-6 grid gap-4 lg:grid-cols-4">
                <Field label="Country"><CountrySelect value={workRightForm.country_code} onChange={(value) => {
                  if (value === "__EU27__") {
                    void addEuWorkRights();
                    return;
                  }
                  setWorkRightForm({ ...workRightForm, country_code: value });
                }} excludeCodes={workRights.map((item) => item.country_code)} includeEu27 /></Field>
                <Field label="Status"><select className="input" value={workRightForm.status} onChange={(e) => setWorkRightForm({ ...workRightForm, status: e.target.value as WorkRight["status"] })}><option value="citizen">Citizen</option><option value="permanent_resident">Permanent resident</option><option value="unrestricted">Unrestricted work rights</option><option value="temporary">Temporary work rights</option><option value="sponsorship_required">Sponsorship required</option></select></Field>
                <Field label="Visa / right type"><input className="input" value={workRightForm.visa_type} onChange={(e) => setWorkRightForm({ ...workRightForm, visa_type: e.target.value })} /></Field>
                <Field label="Expiry (if applicable)"><input type="date" className="input" value={workRightForm.expires_on} onChange={(e) => setWorkRightForm({ ...workRightForm, expires_on: e.target.value })} /></Field>
                <button disabled={busy || !workRightForm.country_code} className="self-end rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40 lg:col-span-4 lg:justify-self-start">Add work right</button>
              </form>

              {workRights.length ? (
                <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {workRights.map((right) => (
                    <div key={right.id} className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 p-4">
                      <div>
                        <div className="font-semibold text-slate-950">{countryLabel(right.country_code)}</div>
                        <div className="mt-1 text-sm text-slate-600">{formatStatus(right.status)}{right.visa_type ? ` · ${right.visa_type}` : ""}</div>
                        {right.expires_on ? <div className="mt-1 text-xs text-slate-500">Expires {formatDate(right.expires_on)}</div> : null}
                      </div>
                      <button type="button" disabled={busy} onClick={() => void removeWorkRight(right.id)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50">Remove</button>
                    </div>
                  ))}
                </div>
              ) : <p className="mt-5 text-sm text-slate-500">No work rights added yet.</p>}
            </section>
          ) : null}
        </div>
      ) : null}

      {tab === "licences" && profile ? (
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <form onSubmit={addLicence} className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Add Licence</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">The licence system tells Aviation Passport how to interpret the credential globally; the issuing authority records who actually issued it. For EASA Part-66, choose the national competent authority rather than EASA itself.</p>
            <div className="mt-6 space-y-4">
              <Field label="Licence system" hint="Examples: EASA Part-66, CASA CASR Part 66, FAA Mechanic Certificate">
                <select className="input" value={licenceForm.licence_system_code} onChange={(e) => setLicenceForm({ ...licenceForm, licence_system_code: e.target.value })} required>
                  <option value="">Select licence system</option>
                  {LICENCE_SYSTEMS.map((system) => <option key={system.code} value={system.code}>{system.label}</option>)}
                </select>
              </Field>
              {licenceForm.licence_system_code === "OTHER" ? <Field label="Licence system / framework name"><input className="input" value={licenceForm.custom_licence_system} onChange={(e) => setLicenceForm({ ...licenceForm, custom_licence_system: e.target.value })} required /></Field> : null}
              {licenceForm.licence_system_code === "EASA_PART66" ? <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-900">EASA defines the Part-66 framework, but the licence is issued by a national competent authority such as Germany&apos;s LBA, France&apos;s DGAC/DSAC, Italy&apos;s ENAC, etc.</div> : null}
              <Field label="Issuing country"><CountrySelect value={licenceForm.issuing_country_code} onChange={(value) => setLicenceForm({ ...licenceForm, issuing_country_code: value, authority_id: "" })} /></Field>
              <Field label="Issuing authority">
                <select className="input" value={licenceForm.authority_id} onChange={(e) => {
                  const authority = authorities.find((item) => item.id === e.target.value);
                  setLicenceForm({ ...licenceForm, authority_id: e.target.value, issuing_country_code: authority?.country_code ?? licenceForm.issuing_country_code, custom_authority_name: "" });
                }} required>
                  <option value="">Select authority</option>
                  {authorities.filter((authority) => !licenceForm.issuing_country_code || authority.country_code === licenceForm.issuing_country_code).map((authority) => <option key={authority.id} value={authority.id}>{authority.name}{authority.code ? ` (${authority.code})` : ""}</option>)}
                  <option value="__custom__">Not listed — enter authority manually</option>
                </select>
              </Field>
              {licenceForm.authority_id === "__custom__" ? <Field label="Exact issuing authority name"><input className="input" value={licenceForm.custom_authority_name} onChange={(e) => setLicenceForm({ ...licenceForm, custom_authority_name: e.target.value })} required /></Field> : null}
              <Field label="Category / privileges" hint="e.g. B2, B1.1, Airframe + Powerplant, M2, E"><input className="input" value={licenceForm.category_privileges} onChange={(e) => setLicenceForm({ ...licenceForm, category_privileges: e.target.value })} /></Field>
              <Field label="Licence number" hint="Stored privately"><input className="input" value={licenceForm.licence_number} onChange={(e) => setLicenceForm({ ...licenceForm, licence_number: e.target.value })} /></Field>
              <div className="grid gap-4 sm:grid-cols-2"><Field label="Issued"><input type="date" className="input" value={licenceForm.issued_on} onChange={(e) => setLicenceForm({ ...licenceForm, issued_on: e.target.value })} /></Field><Field label="Expires"><input type="date" className="input" value={licenceForm.expires_on} onChange={(e) => setLicenceForm({ ...licenceForm, expires_on: e.target.value })} /></Field></div>
              <Field label="Limitations"><textarea className="input min-h-20" value={licenceForm.limitations} onChange={(e) => setLicenceForm({ ...licenceForm, limitations: e.target.value })} /></Field>
              <Field label="Proof document" hint="PDF/JPG/PNG/WebP · private credential vault · up to 50 MB"><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="file-input" onChange={(e) => setLicenceForm({ ...licenceForm, evidence: e.target.files?.[0] ?? null })} /></Field>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <button disabled={busy} className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{editingLicenceId ? "Save licence changes" : "Submit licence"}</button>
              {editingLicenceId ? <button type="button" disabled={busy} onClick={resetLicenceForm} className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 disabled:opacity-50">Cancel edit</button> : null}
            </div>
          </form>

          <form onSubmit={addRating} className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Add Aircraft Rating</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">The gold star is never self-selected. It appears only after this rating and its parent licence are verified.</p>
            <div className="mt-6 space-y-4">
              <Field label="Linked licence"><select className="input" value={ratingForm.licence_id} onChange={(e) => setRatingForm({ ...ratingForm, licence_id: e.target.value })} required><option value="">Select licence</option>{licences.map((licence) => <option key={licence.id} value={licence.id}>{licence.issuing_authority_name || (licence.authority_id ? authorityById[licence.authority_id]?.code : null) || "Authority"} · {licence.licence_scheme} · {licence.category_privileges ?? "Privileges"}</option>)}</select></Field>
              <Field label="Official designation" hint="Exactly as written on the licence"><input className="input" value={ratingForm.official_designation} onChange={(e) => setRatingForm({ ...ratingForm, official_designation: e.target.value })} required /></Field>
              <Field label="Privilege/category"><input className="input" value={ratingForm.privilege_category} onChange={(e) => setRatingForm({ ...ratingForm, privilege_category: e.target.value })} /></Field>
              <Field label="Mapped aircraft family">
                <select className="input" value={ratingForm.aircraft_family_id} onChange={(e) => setRatingForm({ ...ratingForm, aircraft_family_id: e.target.value, custom_aircraft_family: "", aircraft_variant_id: "", engine_id: "" })}>
                  <option value="">No aircraft mapping</option>
                  {aircraftFamilyGroups.map((group) => (
                    <optgroup key={group.manufacturerName} label={group.manufacturerName}>
                      {group.families.map((family) => <option key={family.id} value={family.id}>{family.display_name}</option>)}
                    </optgroup>
                  ))}
                  <option value="__custom__">Not listed — enter aircraft family/type</option>
                </select>
              </Field>
              {ratingForm.aircraft_family_id === "__custom__" ? <Field label="Aircraft family / type"><input className="input" value={ratingForm.custom_aircraft_family} onChange={(e) => setRatingForm({ ...ratingForm, custom_aircraft_family: e.target.value })} placeholder="e.g. NH90, Eurofighter Typhoon" required /></Field> : null}
              {ratingForm.aircraft_family_id && ratingForm.aircraft_family_id !== "__custom__" ? <Field label="Variant (optional)"><select className="input" value={ratingForm.aircraft_variant_id} onChange={(e) => setRatingForm({ ...ratingForm, aircraft_variant_id: e.target.value })}><option value="">Whole family / not mapped</option>{filteredRatingVariants.map((variant) => <option key={variant.id} value={variant.id}>{variant.display_name}</option>)}</select></Field> : null}
              {ratingForm.aircraft_family_id !== "__custom__" ? <Field label="Engine (optional)"><select className="input" value={ratingForm.engine_id} onChange={(e) => setRatingForm({ ...ratingForm, engine_id: e.target.value })}><option value="">Not specified</option>{engines.map((engine) => <option key={engine.id} value={engine.id}>{engine.display_name}</option>)}</select></Field> : null}
              <Field label="Proof document" hint="PDF/JPG/PNG/WebP · up to 50 MB"><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="file-input" onChange={(e) => setRatingForm({ ...ratingForm, evidence: e.target.files?.[0] ?? null })} /></Field>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <button disabled={busy || !licences.length} className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">{editingRatingId ? "Save rating changes" : "Submit rating"}</button>
              {editingRatingId ? <button type="button" disabled={busy} onClick={resetRatingForm} className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 disabled:opacity-50">Cancel edit</button> : null}
            </div>
          </form>

          <section className="xl:col-span-2 rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
            <h3 className="text-xl font-semibold text-slate-950">Current licence records</h3>
            {licences.length ? <div className="mt-5 grid gap-4 lg:grid-cols-2">{licences.map((licence) => {
              const linkedRatings = ratings.filter((rating) => rating.licence_id === licence.id);
              const authorityName = licence.issuing_authority_name || (licence.authority_id ? authorityById[licence.authority_id]?.name : null) || "Issuing authority";
              return (
                <div key={licence.id} className="rounded-2xl border border-slate-200 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-semibold text-slate-950">{authorityName}</div>
                      {licence.issuing_country_code ? <div className="mt-1 text-xs text-slate-500">{countryLabel(licence.issuing_country_code)}</div> : null}
                      <div className="mt-1 text-sm text-slate-600">{licence.licence_scheme} · {licence.category_privileges || "No category entered"}</div>
                    </div>
                    <EvidenceStatus status={licence.verification_status} />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" disabled={busy} onClick={() => editLicence(licence)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Edit licence</button>
                    <button type="button" disabled={busy} onClick={() => void removeLicence(licence)} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Remove licence</button>
                  </div>

                  {linkedRatings.length ? (
                    <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                      {linkedRatings.map((rating) => (
                        <div key={rating.id} className="rounded-xl bg-slate-50 px-3 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="text-sm">
                              <span className="font-semibold text-slate-900">{rating.official_designation}</span>
                              {rating.aircraft_family_id ? <span className="text-slate-500"> · {familyById[rating.aircraft_family_id]?.display_name}</span> : rating.custom_aircraft_family ? <span className="text-slate-500"> · {rating.custom_aircraft_family}</span> : null}
                            </div>
                            <EvidenceStatus status={rating.verification_status} />
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button type="button" disabled={busy} onClick={() => editRating(rating)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50">Edit rating</button>
                            <button type="button" disabled={busy} onClick={() => void removeRating(rating)} className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Remove rating</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}</div> : <p className="mt-3 text-sm text-slate-500">No licences submitted yet.</p>}
          </section>
        </div>
      ) : null}

      {tab === "employment" && profile ? (
        <div className="mt-6 space-y-6">
          <div className="grid gap-6 xl:grid-cols-2">
            <form onSubmit={addEmployment} className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Add Employment</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">Aircraft experience is anchored to the employer and period where it was actually gained.</p>
              <div className="mt-6 space-y-4">
                <Field label="Employer"><input className="input" value={employmentForm.employer_name} onChange={(e) => setEmploymentForm({ ...employmentForm, employer_name: e.target.value })} required /></Field>
                <Field label="Job title"><input className="input" value={employmentForm.job_title} onChange={(e) => setEmploymentForm({ ...employmentForm, job_title: e.target.value })} required /></Field>
                <Field label="Discipline" hint="e.g. Avionics / B2, Mechanical, Structures"><input className="input" value={employmentForm.discipline} onChange={(e) => setEmploymentForm({ ...employmentForm, discipline: e.target.value })} /></Field>
                <div className="grid gap-4 sm:grid-cols-2"><Field label="City"><input className="input" value={employmentForm.city} onChange={(e) => setEmploymentForm({ ...employmentForm, city: e.target.value })} /></Field><Field label="Country"><CountrySelect value={employmentForm.country_code} onChange={(value) => setEmploymentForm({ ...employmentForm, country_code: value })} /></Field></div>
                <Field label="Employment type"><select className="input" value={employmentForm.employment_type} onChange={(e) => setEmploymentForm({ ...employmentForm, employment_type: e.target.value })}><option value="permanent">Permanent</option><option value="fixed_term">Fixed term</option><option value="contractor">Contractor</option><option value="casual">Casual</option><option value="part_time">Part-time</option><option value="self_employed">Self-employed</option><option value="agency">Agency</option></select></Field>
                <div className="grid gap-4 sm:grid-cols-2"><Field label="Start date"><input type="date" className="input" value={employmentForm.start_date} onChange={(e) => setEmploymentForm({ ...employmentForm, start_date: e.target.value })} required /></Field><Field label="End date"><input type="date" disabled={employmentForm.is_current} className="input disabled:bg-slate-100" value={employmentForm.end_date} onChange={(e) => setEmploymentForm({ ...employmentForm, end_date: e.target.value })} /></Field></div>
                <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700"><input type="checkbox" checked={employmentForm.is_current} onChange={(e) => setEmploymentForm({ ...employmentForm, is_current: e.target.checked, end_date: e.target.checked ? "" : employmentForm.end_date })} />Current role</label>
                <Field label="Environment" hint="Select every environment that genuinely applies"><div className="grid gap-2 sm:grid-cols-2">{sortedEnvironments.map((environment) => <label key={environment.id} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${employmentForm.environment_ids.includes(environment.id) ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 text-slate-700"}`}><input className="sr-only" type="checkbox" checked={employmentForm.environment_ids.includes(environment.id)} onChange={() => toggleEnvironment(environment.id)} />{environment.label}</label>)}</div></Field>
              </div>
              <button disabled={busy} className="mt-6 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">Add employment</button>
            </form>

            <form onSubmit={addExposure} className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Add Aircraft Exposure</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">This is the source of the blue dot. Recency and exposure level stay visible behind it.</p>
              <div className="mt-6 space-y-4">
                <Field label="Employment"><select className="input" value={exposureForm.employment_id} onChange={(e) => setExposureForm({ ...exposureForm, employment_id: e.target.value })} required><option value="">Select employment</option>{employments.map((employment) => <option key={employment.id} value={employment.id}>{employment.employer_name} · {employment.job_title}</option>)}</select></Field>
                <Field label="Aircraft family"><select className="input" value={exposureForm.aircraft_family_id} onChange={(e) => setExposureForm({ ...exposureForm, aircraft_family_id: e.target.value, custom_aircraft_family: "", aircraft_variant_id: "", engine_id: "" })} required><option value="">Select family</option>{aircraftFamilyGroups.map((group) => <optgroup key={group.manufacturerName} label={group.manufacturerName}>{group.families.map((family) => <option key={family.id} value={family.id}>{family.display_name}</option>)}</optgroup>)}<option value="__custom__">Not listed — enter aircraft family/type</option></select></Field>
                {exposureForm.aircraft_family_id === "__custom__" ? <Field label="Aircraft family / type"><input className="input" value={exposureForm.custom_aircraft_family} onChange={(e) => setExposureForm({ ...exposureForm, custom_aircraft_family: e.target.value })} placeholder="e.g. NH90, Eurofighter Typhoon" required /></Field> : null}
                {exposureForm.aircraft_family_id !== "__custom__" ? <Field label="Variant"><select className="input" value={exposureForm.aircraft_variant_id} onChange={(e) => setExposureForm({ ...exposureForm, aircraft_variant_id: e.target.value, engine_id: "" })}><option value="">Family-level experience</option>{filteredExposureVariants.map((variant) => <option key={variant.id} value={variant.id}>{variant.display_name}</option>)}</select></Field> : null}
                {exposureForm.aircraft_family_id !== "__custom__" ? <Field label="Engine"><select className="input" value={exposureForm.engine_id} onChange={(e) => setExposureForm({ ...exposureForm, engine_id: e.target.value })}><option value="">Not specified</option>{filteredExposureEngines.map((engine) => <option key={engine.id} value={engine.id}>{engine.display_name}</option>)}</select></Field> : null}
                <Field label="Discipline"><input className="input" value={exposureForm.discipline} onChange={(e) => setExposureForm({ ...exposureForm, discipline: e.target.value })} /></Field>
                <Field label="Exposure level"><select className="input" value={exposureForm.exposure} onChange={(e) => setExposureForm({ ...exposureForm, exposure: e.target.value as Exposure["exposure"] })}><option value="primary">Primary</option><option value="regular">Regular</option><option value="occasional">Occasional</option><option value="limited">Limited</option></select></Field>
                <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700"><input type="checkbox" checked={exposureForm.is_current} onChange={(e) => setExposureForm({ ...exposureForm, is_current: e.target.checked, exposure_end: e.target.checked ? "" : exposureForm.exposure_end })} />Current exposure</label>
                <div className={`grid gap-4 ${exposureForm.is_current ? "" : "sm:grid-cols-2"}`}>
                  <Field label="Exposure start"><input type="date" className="input" value={exposureForm.exposure_start} onChange={(e) => setExposureForm({ ...exposureForm, exposure_start: e.target.value })} required /></Field>
                  {!exposureForm.is_current ? <Field label="Exposure end"><input type="date" className="input" value={exposureForm.exposure_end} onChange={(e) => setExposureForm({ ...exposureForm, exposure_end: e.target.value })} required /></Field> : null}
                </div>
              </div>
              <button disabled={busy || !employments.length} className="mt-6 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">Add aircraft experience</button>
            </form>
          </div>

          <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
            <h3 className="text-xl font-semibold text-slate-950">Career records</h3>
            {employments.length ? <div className="mt-5 space-y-5">{employments.map((employment) => {
              const envLabels = employmentEnvironments.filter((item) => item.employment_id === employment.id).map((item) => environmentById[item.environment_id]?.label).filter(Boolean);
              const employmentExposure = exposures.filter((item) => item.employment_id === employment.id);
              return <div key={employment.id} className="rounded-2xl border border-slate-200 p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="font-semibold text-slate-950">{employment.employer_name}</div><div className="mt-1 text-sm text-slate-600">{employment.job_title}{employment.discipline ? ` · ${employment.discipline}` : ""}</div><div className="mt-1 text-xs text-slate-500">{formatDate(employment.start_date)} — {employment.is_current ? "Present" : formatDate(employment.end_date)}</div></div><span className={`self-start rounded-full px-2.5 py-1 text-xs font-semibold ${employment.employer_confirmed ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{employment.employer_confirmed ? "Employer confirmed" : "Worker record"}</span></div>{envLabels.length ? <div className="mt-3 flex flex-wrap gap-2">{envLabels.map((label) => <span key={label} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{label}</span>)}</div> : null}{employmentExposure.length ? <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{employmentExposure.map((exposure) => <div key={exposure.id} className="rounded-xl bg-slate-50 px-3 py-3"><div className="flex items-center gap-2 font-semibold text-slate-900"><BlueDot />{exposure.aircraft_family_id ? familyById[exposure.aircraft_family_id]?.display_name : exposure.custom_aircraft_family || "Aircraft"}{exposure.aircraft_variant_id ? ` · ${variantById[exposure.aircraft_variant_id]?.display_name}` : ""}</div><div className="mt-1 text-xs text-slate-500">{formatStatus(exposure.exposure)} exposure · {exposure.exposure_start ? formatDate(exposure.exposure_start) : "Start not recorded"} — {exposure.exposure_end ? formatDate(exposure.exposure_end) : "Present"}</div>{exposure.engine_id ? <div className="mt-1 text-xs text-slate-500">{engineById[exposure.engine_id]?.display_name}</div> : null}</div>)}</div> : null}</div>;
            })}</div> : <p className="mt-3 text-sm text-slate-500">No employment records yet.</p>}
          </section>
        </div>
      ) : null}

      {tab === "training" && profile ? (
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <div className="space-y-6">
            <form onSubmit={saveTraining} className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">{editingTrainingId ? "Edit Training" : "Add Training"}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">Formal courses and recurrent training. Exact provider, dates and evidence only.</p>
              <div className="mt-6 space-y-4">
                <Field label="Course">
                  <select className="input" value={trainingForm.course_key} onChange={(e) => setTrainingForm({ ...trainingForm, course_key: e.target.value, custom_course_name: e.target.value === "__custom__" ? trainingForm.custom_course_name : "" })} required>
                    <option value="">Select course</option>
                    {TRAINING_OPTIONS.map((course) => <option key={course} value={course}>{course}</option>)}
                    <option value="__custom__">Not listed — enter exact course name</option>
                  </select>
                </Field>
                {trainingForm.course_key === "__custom__" ? <Field label="Exact course name"><input className="input" value={trainingForm.custom_course_name} onChange={(e) => setTrainingForm({ ...trainingForm, custom_course_name: e.target.value })} required /></Field> : null}
                <Field label="Provider / issuing organisation"><input className="input" value={trainingForm.provider} onChange={(e) => setTrainingForm({ ...trainingForm, provider: e.target.value })} /></Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Completed / issued"><input type="date" className="input" value={trainingForm.completed_on} onChange={(e) => setTrainingForm({ ...trainingForm, completed_on: e.target.value })} /></Field>
                  <Field label="Expiry (if applicable)"><input type="date" className="input" value={trainingForm.expires_on} onChange={(e) => setTrainingForm({ ...trainingForm, expires_on: e.target.value })} /></Field>
                </div>
                <Field label="Evidence" hint="PDF/JPG/PNG/WebP · private credential vault · up to 50 MB"><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="file-input" onChange={(e) => setTrainingForm({ ...trainingForm, evidence: e.target.files?.[0] ?? null })} /></Field>
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <button disabled={busy} className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{editingTrainingId ? "Save training changes" : "Add training"}</button>
                {editingTrainingId ? <button type="button" disabled={busy} onClick={resetTrainingForm} className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700">Cancel edit</button> : null}
              </div>
            </form>

            <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-950">Training records</h3>
              {trainingRecords.length ? <div className="mt-4 space-y-3">{trainingRecords.map((record) => (
                <div key={record.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-950">{record.course_name}</div>
                      {record.provider ? <div className="mt-1 text-sm text-slate-600">{record.provider}</div> : null}
                      <div className="mt-1 text-xs text-slate-500">{record.completed_on ? `Completed ${formatDate(record.completed_on)}` : "Completion date not recorded"}{record.expires_on ? ` · ${isExpired(record.expires_on) ? "Expired" : "Expires"} ${formatDate(record.expires_on)}` : " · No expiry recorded"}</div>
                    </div>
                    <EvidenceStatus status={record.verification_status} />
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button type="button" disabled={busy} onClick={() => editTraining(record)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700">Edit</button>
                    <button type="button" disabled={busy} onClick={() => void removeTraining(record)} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700">Remove</button>
                  </div>
                </div>
              ))}</div> : <p className="mt-3 text-sm text-slate-500">No training records yet.</p>}
            </section>
          </div>

          <div className="space-y-6">
            <form onSubmit={saveCompetency} className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">{editingCompetencyId ? "Edit Competency" : "Add Competency"}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">Technical capability, separate from training and company authorisation.</p>
              <div className="mt-6 space-y-4">
                <Field label="Competency">
                  <select className="input" value={competencyForm.competency_id} onChange={(e) => setCompetencyForm({ ...competencyForm, competency_id: e.target.value, custom_competency_name: "", aircraft_family_id: "", aircraft_variant_id: "", engine_id: "" })} required>
                    <option value="">Select competency</option>
                    {competencyCatalog.map((item) => <option key={item.id} value={item.id}>{item.label}{item.aircraft_specific ? " — aircraft specific" : ""}</option>)}
                    <option value="__custom__">Not listed — enter competency</option>
                  </select>
                </Field>
                {competencyForm.competency_id === "__custom__" ? <Field label="Exact competency"><input className="input" value={competencyForm.custom_competency_name} onChange={(e) => setCompetencyForm({ ...competencyForm, custom_competency_name: e.target.value })} required /></Field> : null}
                <Field label={`Aircraft family${competencyCatalog.find((item) => item.id === competencyForm.competency_id)?.aircraft_specific ? "" : " (optional)"}`}>
                  <select className="input" value={competencyForm.aircraft_family_id} onChange={(e) => setCompetencyForm({ ...competencyForm, aircraft_family_id: e.target.value, aircraft_variant_id: "", engine_id: "" })}>
                    <option value="">No aircraft specified</option>
                    {aircraftFamilyGroups.map((group) => <optgroup key={group.manufacturerName} label={group.manufacturerName}>{group.families.map((family) => <option key={family.id} value={family.id}>{family.display_name}</option>)}</optgroup>)}
                  </select>
                </Field>
                {competencyForm.aircraft_family_id ? <Field label="Variant (optional)"><select className="input" value={competencyForm.aircraft_variant_id} onChange={(e) => setCompetencyForm({ ...competencyForm, aircraft_variant_id: e.target.value, engine_id: "" })}><option value="">All / not specified</option>{filteredCompetencyVariants.map((variant) => <option key={variant.id} value={variant.id}>{variant.display_name}</option>)}</select></Field> : null}
                {competencyForm.aircraft_variant_id && filteredCompetencyEngines.length ? <Field label="Engine (optional)"><select className="input" value={competencyForm.engine_id} onChange={(e) => setCompetencyForm({ ...competencyForm, engine_id: e.target.value })}><option value="">Not specified</option>{filteredCompetencyEngines.map((engine) => <option key={engine.id} value={engine.id}>{engine.display_name}</option>)}</select></Field> : null}
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Gained / qualified on"><input type="date" className="input" value={competencyForm.gained_on} onChange={(e) => setCompetencyForm({ ...competencyForm, gained_on: e.target.value })} /></Field>
                  <Field label="Last used (optional)"><input type="date" className="input" value={competencyForm.last_used_on} onChange={(e) => setCompetencyForm({ ...competencyForm, last_used_on: e.target.value })} /></Field>
                </div>
                <Field label="Evidence" hint="PDF/JPG/PNG/WebP · private credential vault · up to 50 MB"><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="file-input" onChange={(e) => setCompetencyForm({ ...competencyForm, evidence: e.target.files?.[0] ?? null })} /></Field>
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <button disabled={busy} className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{editingCompetencyId ? "Save competency changes" : "Add competency"}</button>
                {editingCompetencyId ? <button type="button" disabled={busy} onClick={resetCompetencyForm} className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700">Cancel edit</button> : null}
              </div>
            </form>

            <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-950">Competencies</h3>
              {workerCompetencies.length ? <div className="mt-4 space-y-3">{workerCompetencies.map((record) => {
                const competencyName = record.competency_id ? competencyById[record.competency_id]?.label : record.custom_competency_name;
                const familyName = record.aircraft_family_id ? familyById[record.aircraft_family_id]?.display_name : null;
                const variantName = record.aircraft_variant_id ? variantById[record.aircraft_variant_id]?.display_name : null;
                const engineName = record.engine_id ? engineById[record.engine_id]?.display_name : null;
                return (
                  <div key={record.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-950">{competencyName || "Competency"}</div>
                        {[familyName, variantName, engineName].filter(Boolean).length ? <div className="mt-1 text-sm text-slate-600">{[familyName, variantName, engineName].filter(Boolean).join(" · ")}</div> : null}
                        <div className="mt-1 text-xs text-slate-500">{record.gained_on ? `Gained ${formatDate(record.gained_on)}` : "Qualification date not recorded"}{record.last_used_on ? ` · Last used ${formatDate(record.last_used_on)}` : ""}</div>
                      </div>
                      <EvidenceStatus status={record.verification_status} />
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button type="button" disabled={busy} onClick={() => editCompetency(record)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700">Edit</button>
                      <button type="button" disabled={busy} onClick={() => void removeCompetency(record)} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700">Remove</button>
                    </div>
                  </div>
                );
              })}</div> : <p className="mt-3 text-sm text-slate-500">No competencies added yet.</p>}
            </section>
          </div>
        </div>
      ) : null}

      {tab === "authorisations" && profile ? (
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <form onSubmit={saveAuthorisation} className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">{editingAuthorisationId ? "Edit Company Authorisation" : "Add Company Authorisation"}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">A company authorisation is an objective privilege granted by an employer. Submit the fact and evidence; the green shield appears only after verification.</p>
            <div className="mt-6 space-y-4">
              <Field label="Employer / employment record">
                <select className="input" value={authorisationForm.employment_id} onChange={(e) => setAuthorisationForm({ ...authorisationForm, employment_id: e.target.value, custom_employer_name: "" })} required>
                  <option value="">Select employment</option>
                  {employments.map((employment) => <option key={employment.id} value={employment.id}>{employment.employer_name} — {employment.job_title}</option>)}
                  <option value="__custom__">Not linked — enter employer manually</option>
                </select>
              </Field>
              {authorisationForm.employment_id === "__custom__" ? <Field label="Employer name"><input className="input" value={authorisationForm.custom_employer_name} onChange={(e) => setAuthorisationForm({ ...authorisationForm, custom_employer_name: e.target.value })} required /></Field> : null}
              <Field label="Authorisation name" hint="Use the exact company wording where possible"><input className="input" value={authorisationForm.authorisation_name} onChange={(e) => setAuthorisationForm({ ...authorisationForm, authorisation_name: e.target.value })} required /></Field>

              <Field label="Aircraft family (optional)">
                <select className="input" value={authorisationForm.aircraft_family_id} onChange={(e) => setAuthorisationForm({ ...authorisationForm, aircraft_family_id: e.target.value, custom_aircraft_family: "", aircraft_variant_id: "" })}>
                  <option value="">No aircraft specified</option>
                  {aircraftFamilyGroups.map((group) => <optgroup key={group.manufacturerName} label={group.manufacturerName}>{group.families.map((family) => <option key={family.id} value={family.id}>{family.display_name}</option>)}</optgroup>)}
                  <option value="__custom__">Not listed — enter aircraft family/type</option>
                </select>
              </Field>
              {authorisationForm.aircraft_family_id === "__custom__" ? <Field label="Aircraft family / type"><input className="input" value={authorisationForm.custom_aircraft_family} onChange={(e) => setAuthorisationForm({ ...authorisationForm, custom_aircraft_family: e.target.value })} required /></Field> : null}
              {authorisationForm.aircraft_family_id && authorisationForm.aircraft_family_id !== "__custom__" ? <Field label="Variant (optional)"><select className="input" value={authorisationForm.aircraft_variant_id} onChange={(e) => setAuthorisationForm({ ...authorisationForm, aircraft_variant_id: e.target.value })}><option value="">All / not specified</option>{filteredAuthorisationVariants.map((variant) => <option key={variant.id} value={variant.id}>{variant.display_name}</option>)}</select></Field> : null}

              <Field label="Linked competency (optional)"><select className="input" value={authorisationForm.competency_id} onChange={(e) => setAuthorisationForm({ ...authorisationForm, competency_id: e.target.value })}><option value="">No competency specified</option>{competencyCatalog.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
              <div className="grid gap-4 sm:grid-cols-2"><Field label="Issued"><input type="date" className="input" value={authorisationForm.issued_on} onChange={(e) => setAuthorisationForm({ ...authorisationForm, issued_on: e.target.value })} /></Field><Field label="Expiry (if applicable)"><input type="date" className="input" value={authorisationForm.expires_on} onChange={(e) => setAuthorisationForm({ ...authorisationForm, expires_on: e.target.value })} /></Field></div>
              <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700"><input type="checkbox" checked={authorisationForm.is_current} onChange={(e) => setAuthorisationForm({ ...authorisationForm, is_current: e.target.checked, ended_on: e.target.checked ? "" : authorisationForm.ended_on })} />Current authorisation</label>
              {!authorisationForm.is_current ? <Field label="Authorisation ended"><input type="date" className="input" value={authorisationForm.ended_on} onChange={(e) => setAuthorisationForm({ ...authorisationForm, ended_on: e.target.value })} required /></Field> : null}
              <Field label="Evidence" hint="PDF/JPG/PNG/WebP · private credential vault · up to 50 MB"><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="file-input" onChange={(e) => setAuthorisationForm({ ...authorisationForm, evidence: e.target.files?.[0] ?? null })} /></Field>
            </div>
            <div className="mt-6 flex flex-wrap gap-3"><button disabled={busy} className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{editingAuthorisationId ? "Save authorisation changes" : "Submit authorisation"}</button>{editingAuthorisationId ? <button type="button" disabled={busy} onClick={resetAuthorisationForm} className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700">Cancel edit</button> : null}</div>
          </form>

          <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Authorisation records</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Historical authorisations remain part of your career record. Only a verified, current authorisation can create the green shield.</p>
            {companyAuthorisations.length ? <div className="mt-6 space-y-3">{companyAuthorisations.map((record) => {
              const familyName = record.aircraft_family_id ? familyById[record.aircraft_family_id]?.display_name : record.custom_aircraft_family;
              const variantName = record.aircraft_variant_id ? variantById[record.aircraft_variant_id]?.display_name : null;
              const competencyName = record.competency_id ? competencyById[record.competency_id]?.label : null;
              const current = !record.ended_on && !record.revoked_on && (!record.expires_on || !isExpired(record.expires_on));
              return <div key={record.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><div className="font-semibold text-slate-950">{record.authorisation_name}</div><div className="mt-1 text-sm text-slate-600">{record.employer_name}</div>{[familyName, variantName, competencyName].filter(Boolean).length ? <div className="mt-1 text-xs text-slate-500">{[familyName, variantName, competencyName].filter(Boolean).join(" · ")}</div> : null}<div className="mt-1 text-xs text-slate-500">{record.issued_on ? `Issued ${formatDate(record.issued_on)}` : "Issue date not recorded"}{record.ended_on ? ` · Ended ${formatDate(record.ended_on)}` : record.expires_on ? ` · ${isExpired(record.expires_on) ? "Expired" : "Expires"} ${formatDate(record.expires_on)}` : current ? " · Current" : ""}</div></div><div className="flex items-center gap-2">{record.verification_status === "verified" && current ? <GreenShield /> : null}<EvidenceStatus status={record.verification_status} /></div></div><div className="mt-3 flex gap-2"><button type="button" disabled={busy} onClick={() => editAuthorisation(record)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700">Edit</button><button type="button" disabled={busy} onClick={() => void removeAuthorisation(record)} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700">Remove</button></div></div>;
            })}</div> : <p className="mt-4 text-sm text-slate-500">No company authorisations submitted yet.</p>}
          </section>
        </div>
      ) : null}

      {tab === "market" && profile ? (
        <div className="mt-6 grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <form onSubmit={saveMarketPreferences} className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Market Preferences</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Tell Aviation Passport what opportunities actually fit you. These facts drive two-way matching; they are not recruiter profile fluff.</p>

            <div className="mt-7 border-t border-slate-100 pt-6">
              <h3 className="font-semibold text-slate-950">Availability</h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Earliest start date" hint="Leave blank if availability is better represented by notice period"><input type="date" className="input" value={marketForm.earliest_start_date} onChange={(e) => setMarketForm({ ...marketForm, earliest_start_date: e.target.value })} /></Field>
                <Field label="Notice period">
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <input type="number" min="0" step="1" className="input" value={marketForm.notice_value} onChange={(e) => setMarketForm({ ...marketForm, notice_value: e.target.value })} placeholder="e.g. 4" />
                    <select className="input min-w-28" value={marketForm.notice_unit} onChange={(e) => setMarketForm({ ...marketForm, notice_unit: e.target.value as "days" | "weeks" | "months" })}>
                      <option value="days">Days</option>
                      <option value="weeks">Weeks</option>
                      <option value="months">Months</option>
                    </select>
                  </div>
                </Field>
              </div>
            </div>

            <div className="mt-7 border-t border-slate-100 pt-6">
              <h3 className="font-semibold text-slate-950">Mobility</h3>
              <p className="mt-1 text-sm text-slate-500">Select every arrangement you would genuinely consider.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  ["willing_to_relocate", "Relocation"],
                  ["willing_fifo", "FIFO"],
                  ["willing_dido", "DIDO"],
                  ["willing_commute", "Regular commute"],
                  ["willing_international", "Permanent international role"],
                  ["willing_temporary_assignment", "Temporary international assignment"],
                ].map(([key, label]) => (
                  <label key={key} className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700">
                    <input type="checkbox" checked={Boolean(marketForm[key as keyof typeof marketForm])} onChange={(e) => setMarketForm({ ...marketForm, [key]: e.target.checked })} />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-7 border-t border-slate-100 pt-6">
              <h3 className="font-semibold text-slate-950">Employment types</h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {EMPLOYMENT_TYPE_OPTIONS.map(([value, label]) => <label key={value} className={`cursor-pointer rounded-full border px-3.5 py-2 text-sm font-semibold ${marketForm.preferred_employment_types.includes(value) ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-700"}`}><input type="checkbox" className="sr-only" checked={marketForm.preferred_employment_types.includes(value)} onChange={() => toggleMarketEmploymentType(value)} />{label}</label>)}
              </div>
            </div>

            <div className="mt-7 border-t border-slate-100 pt-6">
              <h3 className="font-semibold text-slate-950">Preferred environments</h3>
              <p className="mt-1 text-sm text-slate-500">These are preferences, not claims about your experience.</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {sortedEnvironments.map((environment) => <label key={environment.id} className={`cursor-pointer rounded-xl border px-3 py-2.5 text-sm font-medium ${marketForm.environment_ids.includes(environment.id) ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 text-slate-700"}`}><input type="checkbox" className="sr-only" checked={marketForm.environment_ids.includes(environment.id)} onChange={() => toggleMarketEnvironment(environment.id)} />{environment.label}</label>)}
              </div>
            </div>

            <div className="mt-7 border-t border-slate-100 pt-6">
              <h3 className="font-semibold text-slate-950">Roster</h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Roster flexibility"><select className="input" value={marketForm.roster_flexibility} onChange={(e) => setMarketForm({ ...marketForm, roster_flexibility: e.target.value })}>{ROSTER_FLEXIBILITY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
                <Field label="Preferred pattern (optional)" hint="Examples: 14/14, 5 on / 3 off"><input className="input" value={marketForm.preferred_roster_pattern} onChange={(e) => setMarketForm({ ...marketForm, preferred_roster_pattern: e.target.value })} placeholder="No preference" /></Field>
              </div>
            </div>

            <div className="mt-7 border-t border-slate-100 pt-6">
              <h3 className="font-semibold text-slate-950">Minimum compensation</h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">Optional. By default employers only learn whether an opportunity is compatible — not your number.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-4">
                <Field label="Amount"><input type="number" min="0" step="0.01" className="input" value={marketForm.minimum_compensation} onChange={(e) => setMarketForm({ ...marketForm, minimum_compensation: e.target.value })} /></Field>
                <Field label="Currency"><input className="input uppercase" maxLength={3} value={marketForm.minimum_compensation_currency} onChange={(e) => setMarketForm({ ...marketForm, minimum_compensation_currency: e.target.value.toUpperCase() })} /></Field>
                <Field label="Period"><select className="input" value={marketForm.minimum_compensation_period} onChange={(e) => setMarketForm({ ...marketForm, minimum_compensation_period: e.target.value as MarketPreference["minimum_compensation_period"] })}><option value="hour">Hour</option><option value="day">Day</option><option value="week">Week</option><option value="month">Month</option><option value="year">Year</option><option value="one_off">One-off</option></select></Field>
                <Field label="Employer visibility"><select className="input" value={marketForm.compensation_visibility} onChange={(e) => setMarketForm({ ...marketForm, compensation_visibility: e.target.value as MarketPreference["compensation_visibility"] })}><option value="compatibility_only">Compatibility only</option><option value="private">Private</option><option value="visible">Visible</option></select></Field>
              </div>
              <div className="mt-3 rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-900">Compatibility only means an employer can see that its declared compensation meets your threshold, without seeing the threshold itself.</div>
            </div>

            <button disabled={busy} className="mt-7 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">Save market preferences</button>
          </form>

          <div className="space-y-6">
            <form onSubmit={saveLocationPreference} className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
              <h2 className="text-xl font-semibold tracking-tight text-slate-950">{editingLocationPreferenceId ? "Edit Location" : "Add Location"}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">Add countries or cities you prefer, would consider, or deliberately exclude.</p>
              <div className="mt-5 space-y-4">
                <Field label="Country"><CountrySelect value={locationPreferenceForm.country_code} onChange={(value) => setLocationPreferenceForm({ ...locationPreferenceForm, country_code: value })} /></Field>
                <Field label="City / region (optional)"><input className="input" value={locationPreferenceForm.city} onChange={(e) => setLocationPreferenceForm({ ...locationPreferenceForm, city: e.target.value })} placeholder="e.g. Brisbane" /></Field>
                <Field label="Interest"><select className="input" value={locationPreferenceForm.preference} onChange={(e) => setLocationPreferenceForm({ ...locationPreferenceForm, preference: e.target.value as LocationPreference["preference"] })}><option value="preferred">Preferred</option><option value="acceptable">Acceptable</option><option value="exceptional_only">Exceptional opportunity only</option><option value="not_interested">Not interested</option></select></Field>
                <Field label="How you would work there"><select className="input" value={locationPreferenceForm.relocation_mode} onChange={(e) => setLocationPreferenceForm({ ...locationPreferenceForm, relocation_mode: e.target.value })}>{LOCATION_MODE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
              </div>
              <div className="mt-5 flex gap-3"><button disabled={busy || !locationPreferenceForm.country_code} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{editingLocationPreferenceId ? "Save location" : "Add location"}</button>{editingLocationPreferenceId ? <button type="button" disabled={busy} onClick={resetLocationPreferenceForm} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancel</button> : null}</div>
            </form>

            <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
              <h3 className="font-semibold text-slate-950">Location preferences</h3>
              {locationPreferences.length ? <div className="mt-4 space-y-3">{locationPreferences.map((record) => <div key={record.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><div className="font-semibold text-slate-950">{[record.city, countryLabel(record.country_code)].filter(Boolean).join(", ")}</div><div className="mt-1 text-sm text-slate-600">{formatStatus(record.preference)}{record.relocation_mode ? ` · ${record.relocation_mode === "temporary_assignment" ? "Temporary assignment" : record.relocation_mode.toUpperCase()}` : " · Any arrangement"}</div></div></div><div className="mt-3 flex gap-2"><button type="button" disabled={busy} onClick={() => editLocationPreference(record)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700">Edit</button><button type="button" disabled={busy} onClick={() => void removeLocationPreference(record)} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700">Remove</button></div></div>)}</div> : <p className="mt-3 text-sm text-slate-500">No location preferences added yet.</p>}
            </section>
          </div>
        </div>
      ) : null}

      {tab === "opportunities" && profile ? <OpportunitiesPanel /> : null}
    </div>
  );
}

function CountrySelect({
  value,
  onChange,
  excludeCodes = [],
  includeEu27 = false,
}: {
  value: string;
  onChange: (value: string) => void;
  excludeCodes?: string[];
  includeEu27?: boolean;
}) {
  const excluded = new Set(excludeCodes.filter((code) => code !== value));
  return (
    <select className="input" value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Select country</option>
      {includeEu27 ? <option value="__EU27__">European Union — all EU member states</option> : null}
      {COUNTRIES.filter((country) => !excluded.has(country.code)).map((country) => (
        <option key={country.code} value={country.code}>{country.name}</option>
      ))}
    </select>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs leading-5 text-slate-500">{hint}</span> : null}
    </label>
  );
}
