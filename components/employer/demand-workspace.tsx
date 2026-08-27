"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { countryLabel } from "@/lib/reference/countries";
import DemandRequirements from "@/components/employer/demand-requirements";
import TalentMatches from "@/components/employer/talent-matches";

type DemandStatus = "draft" | "open" | "paused" | "needs_confirmation" | "filled" | "cancelled";
type Tab = "requirements" | "matches";

type Demand = {
  id: string;
  organisation_id: string;
  public_title: string;
  profession: string;
  discipline: string | null;
  positions_required: number;
  positions_remaining: number;
  status: DemandStatus;
  city: string | null;
  country_code: string | null;
  sponsorship_available: boolean;
  deleted_at: string | null;
};

type Organisation = {
  id: string;
  name: string;
};

const STATUS_LABELS: Record<DemandStatus, string> = {
  draft: "Draft",
  open: "Open",
  paused: "Paused",
  needs_confirmation: "Needs confirmation",
  filled: "Filled",
  cancelled: "Cancelled",
};

function statusClasses(status: DemandStatus) {
  if (status === "open") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "draft") return "border-slate-200 bg-slate-50 text-slate-700";
  if (status === "paused" || status === "needs_confirmation") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "filled") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

export default function DemandWorkspace({ demandId }: { demandId: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [demand, setDemand] = useState<Demand | null>(null);
  const [organisation, setOrganisation] = useState<Organisation | null>(null);
  const [tab, setTab] = useState<Tab>("requirements");

  useEffect(() => { void loadDemand(); }, [demandId]);

  async function loadDemand() {
    setLoading(true);
    setNotice(null);
    try {
      const demandResult = await supabase
        .from("open_demands")
        .select("id, organisation_id, public_title, profession, discipline, positions_required, positions_remaining, status, city, country_code, sponsorship_available, deleted_at")
        .eq("id", demandId)
        .is("deleted_at", null)
        .single();
      if (demandResult.error) throw demandResult.error;
      const loadedDemand = demandResult.data as Demand;
      setDemand(loadedDemand);

      const organisationResult = await supabase
        .from("organisations")
        .select("id, name")
        .eq("id", loadedDemand.organisation_id)
        .single();
      if (organisationResult.error) throw organisationResult.error;
      setOrganisation(organisationResult.data as Organisation);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load this demand workspace.");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="rounded-3xl border border-slate-200 bg-white p-8 text-slate-600">Loading demand workspace…</div>;
  }

  if (!demand) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-rose-50 p-8 text-rose-700">
        <div className="font-semibold">Demand could not be opened.</div>
        <div className="mt-2 text-sm">{notice || "It may have been removed from the register or you may not have access to it."}</div>
        <button type="button" onClick={() => router.push("/employer")} className="mt-4 rounded-xl border border-rose-300 bg-white px-4 py-2 text-sm font-semibold">Back to Employer Portal</button>
      </div>
    );
  }

  const location = [demand.city, demand.country_code ? countryLabel(demand.country_code) : null].filter(Boolean).join(", ");

  return (
    <div>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <button type="button" onClick={() => router.push("/employer")} className="text-sm font-semibold text-slate-500 hover:text-slate-900">← Employer Portal</button>
          <div className="mt-5 text-xs font-bold tracking-[0.22em] text-slate-500">AVIATION PASSPORT · DEMAND WORKSPACE</div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{demand.public_title}</h1>
            <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusClasses(demand.status)}`}>{STATUS_LABELS[demand.status]}</span>
          </div>
          <p className="mt-2 text-slate-600">{organisation?.name || "Organisation"} · {demand.profession}{demand.discipline ? ` · ${demand.discipline}` : ""}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
            <span>{demand.positions_remaining} remaining / {demand.positions_required} required</span>
            <span>{location || "Location not specified"}</span>
            {demand.sponsorship_available ? <span>Sponsorship available</span> : null}
          </div>
        </div>
      </div>

      {notice ? <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{notice}</div> : null}

      <div className="mt-8 flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <button
          type="button"
          onClick={() => setTab("requirements")}
          className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${tab === "requirements" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-50"}`}
        >
          Requirements & Market
        </button>
        <button
          type="button"
          onClick={() => setTab("matches")}
          className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${tab === "matches" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-50"}`}
        >
          Talent Matches{demand.status !== "open" ? " · Open demand required" : ""}
        </button>
      </div>

      <div className="mt-6">
        {tab === "requirements" ? (
          <DemandRequirements
            demandId={demand.id}
            demandTitle={demand.public_title}
            countryCode={demand.country_code}
            sponsorshipAvailable={demand.sponsorship_available}
            onClose={() => router.push("/employer")}
          />
        ) : (
          <TalentMatches demandId={demand.id} demandStatus={demand.status} />
        )}
      </div>
    </div>
  );
}
