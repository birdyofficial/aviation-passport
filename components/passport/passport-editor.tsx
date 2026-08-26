"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { COUNTRIES, EU_COUNTRY_CODES, countryLabel } from "@/lib/reference/countries";
import { LICENCE_SYSTEMS } from "@/lib/reference/licensing";

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

type Tab = "preview" | "identity" | "licences" | "employment";

type Notice = { type: "success" | "error"; text: string } | null;

type IdentityForm = {
  first_name: string;
  middle_name: string;
  last_name: string;
  professional_headline: string;
  current_city: string;
  current_country_code: string;
  preferred_currency: string;
  visibility: Profile["visibility"];
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
  visibility: "aviation_network",
  market_status: "not_open",
  primary_nationality: "",
  nationality_visibility: "visible",
};

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

  const [authorities, setAuthorities] = useState<Authority[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [families, setFamilies] = useState<AircraftFamily[]>([]);
  const [variants, setVariants] = useState<AircraftVariant[]>([]);
  const [engines, setEngines] = useState<Engine[]>([]);
  const [variantEngines, setVariantEngines] = useState<VariantEngine[]>([]);

  const [identityForm, setIdentityForm] = useState<IdentityForm>(emptyProfile);
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
    description: "",
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
    last_worked_on: "",
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
        visibility: loadedProfile.visibility,
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

  async function addLicence(event: FormEvent) {
    event.preventDefault();
    if (!profile || !userId) return;
    setBusy(true);
    setNotice(null);
    try {
      const evidencePath = await uploadEvidence(licenceForm.evidence, "licences");
      const selectedAuthority = authorities.find((item) => item.id === licenceForm.authority_id);
      const selectedSystem = LICENCE_SYSTEMS.find((item) => item.code === licenceForm.licence_system_code);
      const licenceSystem = licenceForm.licence_system_code === "OTHER"
        ? licenceForm.custom_licence_system.trim()
        : selectedSystem?.label ?? "";
      if (!licenceSystem) throw new Error("Select or enter the licence system.");
      if (!selectedAuthority && !licenceForm.custom_authority_name.trim()) throw new Error("Select or enter the issuing authority.");
      const { error } = await supabase.from("worker_licences").insert({
        worker_id: userId,
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
      });
      if (error) throw error;
      setLicenceForm({ issuing_country_code: "", authority_id: "", custom_authority_name: "", licence_system_code: "", custom_licence_system: "", category_privileges: "", licence_number: "", issued_on: "", expires_on: "", limitations: "", evidence: null });
      setNotice({ type: "success", text: "Licence submitted. Verification is pending." });
      await loadData();
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not add licence." });
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
      const evidencePath = await uploadEvidence(ratingForm.evidence, "ratings");
      const { error } = await supabase.from("licence_ratings").insert({
        licence_id: ratingForm.licence_id,
        official_designation: ratingForm.official_designation.trim(),
        privilege_category: ratingForm.privilege_category.trim() || null,
        aircraft_family_id: ratingForm.aircraft_family_id && ratingForm.aircraft_family_id !== "__custom__" ? ratingForm.aircraft_family_id : null,
        custom_aircraft_family: ratingForm.aircraft_family_id === "__custom__" ? ratingForm.custom_aircraft_family.trim() || null : null,
        aircraft_variant_id: ratingForm.aircraft_family_id === "__custom__" ? null : ratingForm.aircraft_variant_id || null,
        engine_id: ratingForm.engine_id || null,
        evidence_path: evidencePath,
      });
      if (error) throw error;
      setRatingForm({ licence_id: "", official_designation: "", privilege_category: "", aircraft_family_id: "", custom_aircraft_family: "", aircraft_variant_id: "", engine_id: "", evidence: null });
      setNotice({ type: "success", text: "Rating submitted. The gold star appears only after verification." });
      await loadData();
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not add rating." });
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
          description: employmentForm.description.trim() || null,
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

      setEmploymentForm({ employer_name: "", job_title: "", discipline: "", city: "", country_code: "", employment_type: "permanent", start_date: "", end_date: "", is_current: false, description: "", environment_ids: [] });
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
        exposure_end: exposureForm.exposure_end || null,
        last_worked_on: exposureForm.last_worked_on || null,
      });
      if (error) throw error;
      setExposureForm({ employment_id: "", aircraft_family_id: "", custom_aircraft_family: "", aircraft_variant_id: "", engine_id: "", discipline: "", exposure: "regular", exposure_start: "", exposure_end: "", last_worked_on: "" });
      setNotice({ type: "success", text: "Aircraft experience added — the blue dot is now derived from this record." });
      await loadData();
      setTab("preview");
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Could not add aircraft exposure." });
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

  const filteredRatingVariants = ratingForm.aircraft_family_id === "__custom__" ? [] : variants.filter((item) => item.family_id === ratingForm.aircraft_family_id);
  const filteredExposureVariants = exposureForm.aircraft_family_id === "__custom__" ? [] : variants.filter((item) => item.family_id === exposureForm.aircraft_family_id);
  const allowedExposureEngineIds = exposureForm.aircraft_variant_id
    ? new Set(variantEngines.filter((item) => item.variant_id === exposureForm.aircraft_variant_id).map((item) => item.engine_id))
    : null;
  const filteredExposureEngines = allowedExposureEngineIds?.size
    ? engines.filter((item) => allowedExposureEngineIds.has(item.id))
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

  return (
    <div>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs font-bold tracking-[0.22em] text-slate-500">AVIATION PASSPORT</div>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">My Passport</h1>
          <p className="mt-2 max-w-2xl text-slate-600">One structured aviation identity. Build it once; let the career record become increasingly self-maintaining.</p>
        </div>
        <button onClick={signOut} className="self-start rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Sign out</button>
      </div>

      <div className="mt-8 flex gap-2 overflow-x-auto border-b border-slate-200 pb-px">
        {([
          ["preview", "Passport Preview"],
          ["identity", "Professional Identity"],
          ["licences", "Licences & Ratings"],
          ["employment", "Employment & Aircraft"],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold transition ${tab === key ? "border-slate-950 text-slate-950" : "border-transparent text-slate-500 hover:text-slate-800"}`}
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
                    const latest = exposure.map((item) => item.last_worked_on).filter(Boolean).sort().at(-1) ?? null;
                    return (
                      <div key={key} className="group relative flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
                        <span className="font-semibold text-slate-900">{label}</span>
                        {exposure.length ? <BlueDot /> : null}
                        {rated ? <GoldStar /> : null}
                        {authorised ? <GreenShield /> : null}
                        <div className="pointer-events-none absolute left-0 top-full z-20 mt-2 hidden min-w-56 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 shadow-lg group-hover:block">
                          <div className="font-semibold text-slate-900">{[manufacturerName, label].filter(Boolean).join(" ")}</div>
                          {exposure.length ? <div className="mt-1">Experience records: {exposure.length}</div> : null}
                          {latest ? <div>Last recorded work: {formatDate(latest)}</div> : null}
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
                          <div className="font-semibold text-slate-900">{authorityById[licence.authority_id]?.name ?? "Aviation authority"}</div>
                          <div className="mt-1 text-sm text-slate-600">{licence.licence_scheme}{licence.category_privileges ? ` · ${licence.category_privileges}` : ""}</div>
                        </div>
                        <EvidenceStatus status={licence.verification_status} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="mt-4 text-sm text-slate-500">No licences added yet.</p>}
            </div>
          </section>

          <aside className="space-y-6">
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="font-semibold text-slate-950">Work rights</h3>
              {workRights.length ? <div className="mt-3 space-y-3">{workRights.map((right) => <div key={right.id} className="rounded-xl bg-slate-50 p-3"><div className="font-semibold text-slate-900">{countryLabel(right.country_code)}</div><div className="mt-1 text-sm text-slate-600">{formatStatus(right.status)}</div></div>)}</div> : <p className="mt-2 text-sm text-slate-500">No work rights added.</p>}
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
              <Field label="Profile visibility"><select className="input" value={identityForm.visibility} onChange={(e) => setIdentityForm({ ...identityForm, visibility: e.target.value as Profile["visibility"] })}><option value="public">Public</option><option value="aviation_network">Aviation network</option><option value="anonymous_market">Anonymous market</option><option value="private">Private</option></select></Field>
              <Field label="Market status"><select className="input" value={identityForm.market_status} onChange={(e) => setIdentityForm({ ...identityForm, market_status: e.target.value as Profile["market_status"] })}><option value="not_open">Not open</option><option value="selected_opportunities">Open to selected opportunities</option><option value="actively_looking">Actively looking</option><option value="contract_only">Contract only</option></select></Field>
            </div>
            <button disabled={busy} className="mt-7 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save Professional Identity"}</button>
          </form>

          {profile ? (
            <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Work Rights</h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Add every country where you can work. The matching engine will treat each country separately even when you use a regional shortcut.</p>
                </div>
                <button type="button" disabled={busy} onClick={addEuWorkRights} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Add EU-27 unrestricted</button>
              </div>

              <form onSubmit={addWorkRight} className="mt-6 grid gap-4 lg:grid-cols-4">
                <Field label="Country"><CountrySelect value={workRightForm.country_code} onChange={(value) => setWorkRightForm({ ...workRightForm, country_code: value })} excludeCodes={workRights.map((item) => item.country_code)} /></Field>
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
                  {authorities.filter((authority) => !licenceForm.issuing_country_code || authority.country_code === licenceForm.issuing_country_code).map((authority) => <option key={authority.id} value={authority.id}>{authority.country_code ? `${authority.country_code} - ` : ""}{authority.name}{authority.code ? ` (${authority.code})` : ""}</option>)}
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
            <button disabled={busy} className="mt-6 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">Submit licence</button>
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
                  {families.map((family) => <option key={family.id} value={family.id}>{manufacturerById[family.manufacturer_id]?.name} — {family.display_name}</option>)}
                  <option value="__custom__">Not listed — enter aircraft family/type</option>
                </select>
              </Field>
              {ratingForm.aircraft_family_id === "__custom__" ? <Field label="Aircraft family / type"><input className="input" value={ratingForm.custom_aircraft_family} onChange={(e) => setRatingForm({ ...ratingForm, custom_aircraft_family: e.target.value })} placeholder="e.g. NH90, Eurofighter Typhoon" required /></Field> : null}
              {ratingForm.aircraft_family_id && ratingForm.aircraft_family_id !== "__custom__" ? <Field label="Variant (optional)"><select className="input" value={ratingForm.aircraft_variant_id} onChange={(e) => setRatingForm({ ...ratingForm, aircraft_variant_id: e.target.value })}><option value="">Whole family / not mapped</option>{filteredRatingVariants.map((variant) => <option key={variant.id} value={variant.id}>{variant.display_name}</option>)}</select></Field> : null}
              {ratingForm.aircraft_family_id !== "__custom__" ? <Field label="Engine (optional)"><select className="input" value={ratingForm.engine_id} onChange={(e) => setRatingForm({ ...ratingForm, engine_id: e.target.value })}><option value="">Not specified</option>{engines.map((engine) => <option key={engine.id} value={engine.id}>{engine.display_name}</option>)}</select></Field> : null}
              <Field label="Proof document" hint="PDF/JPG/PNG/WebP · up to 50 MB"><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="file-input" onChange={(e) => setRatingForm({ ...ratingForm, evidence: e.target.files?.[0] ?? null })} /></Field>
            </div>
            <button disabled={busy || !licences.length} className="mt-6 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">Submit rating</button>
          </form>

          <section className="xl:col-span-2 rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
            <h3 className="text-xl font-semibold text-slate-950">Current licence records</h3>
            {licences.length ? <div className="mt-5 grid gap-4 lg:grid-cols-2">{licences.map((licence) => {
              const linkedRatings = ratings.filter((rating) => rating.licence_id === licence.id);
              const authorityName = licence.issuing_authority_name || (licence.authority_id ? authorityById[licence.authority_id]?.name : null) || "Issuing authority";
              return <div key={licence.id} className="rounded-2xl border border-slate-200 p-5"><div className="flex items-start justify-between gap-4"><div><div className="font-semibold text-slate-950">{authorityName}</div>{licence.issuing_country_code ? <div className="mt-1 text-xs text-slate-500">{countryLabel(licence.issuing_country_code)}</div> : null}<div className="mt-1 text-sm text-slate-600">{licence.licence_scheme} · {licence.category_privileges || "No category entered"}</div></div><EvidenceStatus status={licence.verification_status} /></div>{linkedRatings.length ? <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">{linkedRatings.map((rating) => <div key={rating.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2"><div className="text-sm"><span className="font-semibold text-slate-900">{rating.official_designation}</span>{rating.aircraft_family_id ? <span className="text-slate-500"> · {familyById[rating.aircraft_family_id]?.display_name}</span> : rating.custom_aircraft_family ? <span className="text-slate-500"> · {rating.custom_aircraft_family}</span> : null}</div><EvidenceStatus status={rating.verification_status} /></div>)}</div> : null}</div>;
            })}</div> : <p className="mt-3 text-sm text-slate-500">No licences submitted yet.</p>}
          </section>
        </div>
      ) : null}

      {tab === "employment" && profile ? (
        <div className="mt-6 space-y-6">
          <div className="grid gap-6 xl:grid-cols-2">
            <form onSubmit={addEmployment} className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Add Employment</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">Aircraft experience is anchored to the place and period where it was actually gained.</p>
              <div className="mt-6 space-y-4">
                <Field label="Employer"><input className="input" value={employmentForm.employer_name} onChange={(e) => setEmploymentForm({ ...employmentForm, employer_name: e.target.value })} required /></Field>
                <Field label="Job title"><input className="input" value={employmentForm.job_title} onChange={(e) => setEmploymentForm({ ...employmentForm, job_title: e.target.value })} required /></Field>
                <Field label="Discipline" hint="e.g. Avionics / B2, Mechanical, Structures"><input className="input" value={employmentForm.discipline} onChange={(e) => setEmploymentForm({ ...employmentForm, discipline: e.target.value })} /></Field>
                <div className="grid gap-4 sm:grid-cols-2"><Field label="City"><input className="input" value={employmentForm.city} onChange={(e) => setEmploymentForm({ ...employmentForm, city: e.target.value })} /></Field><Field label="Country"><CountrySelect value={employmentForm.country_code} onChange={(value) => setEmploymentForm({ ...employmentForm, country_code: value })} /></Field></div>
                <Field label="Employment type"><select className="input" value={employmentForm.employment_type} onChange={(e) => setEmploymentForm({ ...employmentForm, employment_type: e.target.value })}><option value="permanent">Permanent</option><option value="fixed_term">Fixed term</option><option value="contractor">Contractor</option><option value="casual">Casual</option><option value="part_time">Part-time</option><option value="self_employed">Self-employed</option><option value="agency">Agency</option></select></Field>
                <div className="grid gap-4 sm:grid-cols-2"><Field label="Start date"><input type="date" className="input" value={employmentForm.start_date} onChange={(e) => setEmploymentForm({ ...employmentForm, start_date: e.target.value })} required /></Field><Field label="End date"><input type="date" disabled={employmentForm.is_current} className="input disabled:bg-slate-100" value={employmentForm.end_date} onChange={(e) => setEmploymentForm({ ...employmentForm, end_date: e.target.value })} /></Field></div>
                <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700"><input type="checkbox" checked={employmentForm.is_current} onChange={(e) => setEmploymentForm({ ...employmentForm, is_current: e.target.checked, end_date: e.target.checked ? "" : employmentForm.end_date })} />Current role</label>
                <Field label="Environment" hint="Select every environment that genuinely applies"><div className="grid gap-2 sm:grid-cols-2">{environments.map((environment) => <label key={environment.id} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${employmentForm.environment_ids.includes(environment.id) ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 text-slate-700"}`}><input className="sr-only" type="checkbox" checked={employmentForm.environment_ids.includes(environment.id)} onChange={() => toggleEnvironment(environment.id)} />{environment.label}</label>)}</div></Field>
                <Field label="Short description"><textarea className="input min-h-24" value={employmentForm.description} onChange={(e) => setEmploymentForm({ ...employmentForm, description: e.target.value })} /></Field>
              </div>
              <button disabled={busy} className="mt-6 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">Add employment</button>
            </form>

            <form onSubmit={addExposure} className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Add Aircraft Exposure</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">This is the source of the blue dot. Recency and exposure level stay visible behind it.</p>
              <div className="mt-6 space-y-4">
                <Field label="Employment"><select className="input" value={exposureForm.employment_id} onChange={(e) => setExposureForm({ ...exposureForm, employment_id: e.target.value })} required><option value="">Select employment</option>{employments.map((employment) => <option key={employment.id} value={employment.id}>{employment.employer_name} · {employment.job_title}</option>)}</select></Field>
                <Field label="Aircraft family"><select className="input" value={exposureForm.aircraft_family_id} onChange={(e) => setExposureForm({ ...exposureForm, aircraft_family_id: e.target.value, custom_aircraft_family: "", aircraft_variant_id: "", engine_id: "" })} required><option value="">Select family</option>{families.map((family) => <option key={family.id} value={family.id}>{manufacturerById[family.manufacturer_id]?.name} — {family.display_name}</option>)}<option value="__custom__">Not listed — enter aircraft family/type</option></select></Field>
                {exposureForm.aircraft_family_id === "__custom__" ? <Field label="Aircraft family / type"><input className="input" value={exposureForm.custom_aircraft_family} onChange={(e) => setExposureForm({ ...exposureForm, custom_aircraft_family: e.target.value })} placeholder="e.g. NH90, Eurofighter Typhoon" required /></Field> : null}
                {exposureForm.aircraft_family_id !== "__custom__" ? <Field label="Variant"><select className="input" value={exposureForm.aircraft_variant_id} onChange={(e) => setExposureForm({ ...exposureForm, aircraft_variant_id: e.target.value, engine_id: "" })}><option value="">Family-level experience</option>{filteredExposureVariants.map((variant) => <option key={variant.id} value={variant.id}>{variant.display_name}</option>)}</select></Field> : null}
                {exposureForm.aircraft_family_id !== "__custom__" ? <Field label="Engine"><select className="input" value={exposureForm.engine_id} onChange={(e) => setExposureForm({ ...exposureForm, engine_id: e.target.value })}><option value="">Not specified</option>{filteredExposureEngines.map((engine) => <option key={engine.id} value={engine.id}>{engine.display_name}</option>)}</select></Field> : null}
                <Field label="Discipline"><input className="input" value={exposureForm.discipline} onChange={(e) => setExposureForm({ ...exposureForm, discipline: e.target.value })} /></Field>
                <Field label="Exposure level"><select className="input" value={exposureForm.exposure} onChange={(e) => setExposureForm({ ...exposureForm, exposure: e.target.value as Exposure["exposure"] })}><option value="primary">Primary</option><option value="regular">Regular</option><option value="occasional">Occasional</option><option value="limited">Limited</option></select></Field>
                <div className="grid gap-4 sm:grid-cols-2"><Field label="Exposure start"><input type="date" className="input" value={exposureForm.exposure_start} onChange={(e) => setExposureForm({ ...exposureForm, exposure_start: e.target.value })} /></Field><Field label="Exposure end"><input type="date" className="input" value={exposureForm.exposure_end} onChange={(e) => setExposureForm({ ...exposureForm, exposure_end: e.target.value })} /></Field></div>
                <Field label="Last worked on"><input type="date" className="input" value={exposureForm.last_worked_on} onChange={(e) => setExposureForm({ ...exposureForm, last_worked_on: e.target.value })} /></Field>
              </div>
              <button disabled={busy || !employments.length} className="mt-6 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">Add aircraft experience</button>
            </form>
          </div>

          <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
            <h3 className="text-xl font-semibold text-slate-950">Career records</h3>
            {employments.length ? <div className="mt-5 space-y-5">{employments.map((employment) => {
              const envLabels = employmentEnvironments.filter((item) => item.employment_id === employment.id).map((item) => environmentById[item.environment_id]?.label).filter(Boolean);
              const employmentExposure = exposures.filter((item) => item.employment_id === employment.id);
              return <div key={employment.id} className="rounded-2xl border border-slate-200 p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="font-semibold text-slate-950">{employment.employer_name}</div><div className="mt-1 text-sm text-slate-600">{employment.job_title}{employment.discipline ? ` · ${employment.discipline}` : ""}</div><div className="mt-1 text-xs text-slate-500">{formatDate(employment.start_date)} — {employment.is_current ? "Present" : formatDate(employment.end_date)}</div></div><span className={`self-start rounded-full px-2.5 py-1 text-xs font-semibold ${employment.employer_confirmed ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{employment.employer_confirmed ? "Employer confirmed" : "Worker record"}</span></div>{envLabels.length ? <div className="mt-3 flex flex-wrap gap-2">{envLabels.map((label) => <span key={label} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{label}</span>)}</div> : null}{employmentExposure.length ? <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{employmentExposure.map((exposure) => <div key={exposure.id} className="rounded-xl bg-slate-50 px-3 py-3"><div className="flex items-center gap-2 font-semibold text-slate-900"><BlueDot />{exposure.aircraft_family_id ? familyById[exposure.aircraft_family_id]?.display_name : exposure.custom_aircraft_family || "Aircraft"}{exposure.aircraft_variant_id ? ` · ${variantById[exposure.aircraft_variant_id]?.display_name}` : ""}</div><div className="mt-1 text-xs text-slate-500">{formatStatus(exposure.exposure)} exposure{exposure.last_worked_on ? ` · last ${formatDate(exposure.last_worked_on)}` : ""}</div>{exposure.engine_id ? <div className="mt-1 text-xs text-slate-500">{engineById[exposure.engine_id]?.display_name}</div> : null}</div>)}</div> : null}</div>;
            })}</div> : <p className="mt-3 text-sm text-slate-500">No employment records yet.</p>}
          </section>
        </div>
      ) : null}
    </div>
  );
}

function CountrySelect({
  value,
  onChange,
  excludeCodes = [],
}: {
  value: string;
  onChange: (value: string) => void;
  excludeCodes?: string[];
}) {
  const excluded = new Set(excludeCodes.filter((code) => code !== value));
  return (
    <select className="input" value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Select country</option>
      {COUNTRIES.filter((country) => !excluded.has(country.code)).map((country) => (
        <option key={country.code} value={country.code}>{country.code} - {country.name}</option>
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
