"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { countryLabel } from "@/lib/reference/countries";

type MarketStatus = "not_open" | "selected_opportunities" | "actively_looking" | "contract_only";
type MoneyPeriod = "hour" | "day" | "week" | "month" | "year" | "one_off";

type TalentMatch = {
  match_ref: string;
  worker_id: string | null;
  is_anonymous: boolean;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  professional_headline: string | null;
  current_city: string | null;
  current_country_code: string | null;
  market_status: MarketStatus;
  match_label: "Exact Match" | "Strong Match" | "Trainable Match" | "Mobility Match" | string;
  trust_label: string;
  work_right_label: string;
  location_label: string;
  location_compatible: boolean;
  earliest_start_date: string | null;
  notice_value: number | null;
  notice_unit: string | null;
  compensation_label: string;
  compensation_compatible: boolean | null;
  visible_minimum_compensation: number | null;
  visible_minimum_currency: string | null;
  visible_minimum_period: MoneyPeriod | null;
  trainable_gap_count: number;
  preferred_gap_count: number;
  trainable_gaps: string[];
  preferred_gaps: string[];
  verified_match: boolean;
};

type Props = {
  demandId: string;
  demandStatus: string;
};

const MARKET_LABELS: Record<MarketStatus, string> = {
  not_open: "Not open",
  selected_opportunities: "Open to selected opportunities",
  actively_looking: "Actively looking",
  contract_only: "Contract only",
};

function matchClasses(label: string) {
  if (label === "Exact Match") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (label === "Strong Match") return "border-blue-200 bg-blue-50 text-blue-700";
  if (label === "Trainable Match") return "border-violet-200 bg-violet-50 text-violet-700";
  if (label === "Mobility Match") return "border-amber-200 bg-amber-50 text-amber-700";
  if (label === "Location Check") return "border-amber-200 bg-amber-50 text-amber-700";
  if (label === "Compensation Gap") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function formatAvailability(match: TalentMatch) {
  if (match.earliest_start_date) return `From ${formatDate(match.earliest_start_date)}`;
  if (match.notice_value != null && match.notice_unit) {
    const unit = match.notice_value === 1 ? match.notice_unit.replace(/s$/, "") : match.notice_unit;
    return `${match.notice_value} ${unit} notice`;
  }
  return "Not specified";
}

function formatVisibleMinimum(match: TalentMatch) {
  if (match.visible_minimum_compensation == null || !match.visible_minimum_currency || !match.visible_minimum_period) return null;
  try {
    const amount = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: match.visible_minimum_currency,
      maximumFractionDigits: 0,
    }).format(match.visible_minimum_compensation);
    return `${amount} / ${match.visible_minimum_period}`;
  } catch {
    return `${match.visible_minimum_currency} ${match.visible_minimum_compensation.toLocaleString()} / ${match.visible_minimum_period}`;
  }
}

export default function TalentMatches({ demandId, demandStatus }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<TalentMatch[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (demandStatus === "open") void loadMatches();
    else setMatches([]);
  }, [demandId, demandStatus]);

  async function loadMatches() {
    setLoading(true);
    setNotice(null);
    try {
      const { data, error } = await supabase.rpc("get_demand_talent_matches", { p_demand_id: demandId });
      if (error) throw error;
      setMatches((data ?? []).map((item: TalentMatch) => ({
        ...item,
        trainable_gap_count: Number(item.trainable_gap_count ?? 0),
        preferred_gap_count: Number(item.preferred_gap_count ?? 0),
        trainable_gaps: item.trainable_gaps ?? [],
        preferred_gaps: item.preferred_gaps ?? [],
      })));
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : error && typeof error === "object" && "message" in error
            ? String((error as { message?: unknown }).message || "Could not load talent matches.")
            : "Could not load talent matches.";
      setNotice(message);
    } finally {
      setLoading(false);
    }
  }

  if (demandStatus !== "open") {
    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mx-auto max-w-2xl text-center">
          <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Demand-bound talent access</div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Open this demand to see matched people</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Individual Passports are never exposed through a general talent database. Talent access activates only while this demand is Open.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Demand-bound talent access</div>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Talent Matches</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            These are receptive workers whose structured Passport satisfies every Mandatory requirement. Location and compensation compatibility are shown clearly instead of silently removing an otherwise relevant person.
          </p>
        </div>
        <button type="button" disabled={loading} onClick={() => void loadMatches()} className="self-start rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          {loading ? "Refreshing…" : "Refresh matches"}
        </button>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Talent matches" value={String(matches.length)} />
        <Metric label="Identified" value={String(matches.filter((item) => !item.is_anonymous).length)} />
        <Metric label="Anonymous" value={String(matches.filter((item) => item.is_anonymous).length)} />
        <Metric label="Ready now" value={String(matches.filter((item) => item.location_compatible && item.compensation_compatible !== false).length)} />
      </div>

      <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-800">
        Talent access remains demand-bound. Public profiles appear by name; Anonymous Market profiles appear without identity or exact personal details; Private profiles never appear as individual matches.
      </div>

      {notice ? <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{notice}</div> : null}

      {loading && !matches.length ? (
        <div className="mt-6 rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-500">Calculating demand-specific talent matches…</div>
      ) : matches.length ? (
        <div className="mt-6 space-y-4">
          {matches.map((match) => {
            const fullName = match.is_anonymous ? "Anonymous Aviation Professional" : [match.first_name, match.middle_name, match.last_name].filter(Boolean).join(" ");
            const location = match.is_anonymous ? "Identity and exact location withheld" : [match.current_city, match.current_country_code ? countryLabel(match.current_country_code) : null].filter(Boolean).join(", ");
            const visibleMinimum = formatVisibleMinimum(match);
            const anonymousReference = match.match_ref.slice(0, 6).toUpperCase();

            return (
              <article key={match.match_ref} className="rounded-2xl border border-slate-200 p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-slate-950">{fullName}</h3>
                      {match.is_anonymous ? <span className="rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">Anonymous · {anonymousReference}</span> : null}
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${matchClasses(match.match_label)}`}>{match.match_label}</span>
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${match.verified_match ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}>{match.trust_label}</span>
                    </div>
                    <div className="mt-1 text-sm text-slate-700">{match.is_anonymous ? "Demand-compatible aviation professional" : match.professional_headline || "Aviation professional"}</div>
                    <div className="mt-1 text-xs text-slate-500">{location || "Location not listed"} · {MARKET_LABELS[match.market_status]}</div>
                    {match.is_anonymous ? <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800">This worker is participating anonymously. The employer can assess demand compatibility, but identity remains protected until the worker chooses to reveal it.</div> : null}
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <Fact label="Work rights" value={match.work_right_label} />
                  <Fact label="Location" value={match.location_label} status={match.location_compatible ? "ok" : "check"} />
                  <Fact label="Availability" value={formatAvailability(match)} />
                  <Fact label="Compensation" value={visibleMinimum ? `${match.compensation_label} · ${visibleMinimum}` : match.compensation_label} status={match.compensation_compatible === false ? "gap" : match.compensation_compatible === true ? "ok" : "check"} />
                </div>

                {match.trainable_gaps.length || match.preferred_gaps.length ? (
                  <div className="mt-5 border-t border-slate-100 pt-4">
                    {match.trainable_gaps.length ? (
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-violet-500">Employer-agreed trainable gaps</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {match.trainable_gaps.map((gap) => <span key={gap} className="rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700">{gap}</span>)}
                        </div>
                      </div>
                    ) : null}
                    {match.preferred_gaps.length ? (
                      <div className={match.trainable_gaps.length ? "mt-4" : ""}>
                        <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-amber-500">Preferred gaps</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {match.preferred_gaps.map((gap) => <span key={gap} className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">{gap}</span>)}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-5 rounded-xl bg-emerald-50 px-3 py-2.5 text-xs font-medium text-emerald-700">No Trainable or Preferred gaps detected.</div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 p-8 text-center">
          <div className="font-semibold text-slate-900">No talent matches yet</div>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            A worker must be receptive and meet every Mandatory requirement. Public and Anonymous Market profiles can appear here; Private profiles cannot. Explicit “Not interested” location preferences are respected.
          </p>
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{value}</div>
    </div>
  );
}

function Fact({ label, value, status = "neutral" }: { label: string; value: string; status?: "neutral" | "ok" | "check" | "gap" }) {
  const classes = status === "ok"
    ? "bg-emerald-50 text-emerald-800"
    : status === "gap"
      ? "bg-rose-50 text-rose-800"
      : status === "check"
        ? "bg-amber-50 text-amber-800"
        : "bg-slate-50 text-slate-700";
  return (
    <div className={`rounded-xl px-3 py-3 ${classes}`}>
      <div className="text-[11px] font-bold uppercase tracking-[0.1em] opacity-60">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}
