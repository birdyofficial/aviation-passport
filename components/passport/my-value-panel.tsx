"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { countryLabel } from "@/lib/reference/countries";

type MoneyPeriod = "hour" | "day" | "week" | "month" | "year" | "one_off";
type MarketLocation = { country_code: string; city: string | null; demand_count: number };
type ImprovementSignal = { label: string; type: "preferred" | "trainable"; demand_count: number };

type ValueSnapshot = {
  preferred_currency: string;
  compatible_open_demands: number;
  verified_compatible_demands: number;
  compatible_countries: number;
  salary_sample_size: number;
  salary_period: MoneyPeriod | null;
  market_range_low: number | null;
  market_midpoint: number | null;
  market_range_high: number | null;
  confidence_label: string;
  demand_strength: string;
  top_markets: MarketLocation[];
  improvement_signals: ImprovementSignal[];
};

const PERIOD_LABELS: Record<MoneyPeriod, string> = {
  hour: "hour", day: "day", week: "week", month: "month", year: "year", one_off: "one-off",
};

function money(value: number | null, currency: string) {
  if (value == null) return "—";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString()}`;
  }
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String((error as { message?: unknown }).message || fallback);
  return fallback;
}

export default function MyValuePanel() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<ValueSnapshot | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => { void loadValue(); }, []);

  async function loadValue() {
    setLoading(true);
    setNotice(null);
    try {
      const { data, error } = await supabase.rpc("get_my_value_snapshot");
      if (error) throw error;
      const row = data?.[0] as ValueSnapshot | undefined;
      if (!row) throw new Error("My Value could not be calculated.");
      setSnapshot({
        ...row,
        top_markets: Array.isArray(row.top_markets) ? row.top_markets : [],
        improvement_signals: Array.isArray(row.improvement_signals) ? row.improvement_signals : [],
      });
    } catch (error) {
      setNotice(errorMessage(error, "Could not calculate My Value."));
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Calculating My Value from live Open Demand…</div>;
  if (!snapshot) return <div className="mt-6 rounded-3xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">{notice || "My Value is unavailable."}</div>;

  const rangeAvailable = snapshot.salary_sample_size >= 3 && snapshot.market_range_low != null && snapshot.market_range_high != null;
  const payBasis = snapshot.salary_period ? ` / ${PERIOD_LABELS[snapshot.salary_period]}` : "";

  return (
    <div className="mt-6 space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Live labour-market intelligence</div>
            <h2 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">My Value</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              What employers are currently declaring for profiles like yours. This is market intelligence, not a promise of salary or a judgement of your personal worth.
            </p>
          </div>
          <button type="button" onClick={() => void loadValue()} className="self-start rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Refresh market</button>
        </div>

        <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Compatible Open Demand" value={String(snapshot.compatible_open_demands)} sub="Live roles your structured Passport can satisfy" />
          <Metric label="Demand strength" value={snapshot.demand_strength} sub={`${snapshot.compatible_countries} compatible ${snapshot.compatible_countries === 1 ? "country" : "countries"}`} />
          <Metric label="Trust-backed fit" value={`${snapshot.verified_compatible_demands} / ${snapshot.compatible_open_demands}`} sub="Compatible demand supported by verified hard facts" />
          <Metric label="Market confidence" value={snapshot.confidence_label} sub={`${snapshot.salary_sample_size} comparable ${snapshot.salary_sample_size === 1 ? "package" : "packages"}`} />
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-6">
          <div className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Current market compensation</div>
          {rangeAvailable ? (
            <>
              <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
                {money(snapshot.market_range_low, snapshot.preferred_currency)} – {money(snapshot.market_range_high, snapshot.preferred_currency)}{payBasis}
              </div>
              <div className="mt-2 text-sm text-slate-600">
                Market midpoint around <strong>{money(snapshot.market_midpoint, snapshot.preferred_currency)}{payBasis}</strong>, based on {snapshot.salary_sample_size} comparable live packages in {snapshot.preferred_currency}.
              </div>
            </>
          ) : snapshot.salary_sample_size ? (
            <>
              <div className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">Market sample still building</div>
              <div className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Aviation Passport currently sees {snapshot.salary_sample_size} comparable live {snapshot.preferred_currency}{snapshot.salary_period ? ` / ${PERIOD_LABELS[snapshot.salary_period]}` : ""} {snapshot.salary_sample_size === 1 ? "package" : "packages"} for your compatible demand. We require at least <strong>3</strong> before showing a compensation range.
              </div>
            </>
          ) : (
            <>
              <div className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">No comparable pay sample yet</div>
              <div className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                There may still be compatible Open Demand, but not enough compensation data in your preferred currency and a common pay basis to estimate a range.
              </div>
            </>
          )}
          <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-800">
            Salary intelligence is aggregated. Aviation Passport never reveals another worker's private minimum or a confidential employer's individual package here.
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Where your profile is in demand</div>
          <h3 className="mt-1 text-xl font-semibold text-slate-950">Market reach</h3>
          {snapshot.top_markets.length ? (
            <div className="mt-5 space-y-3">
              {snapshot.top_markets.map((market, index) => (
                <div key={`${market.country_code}-${market.city}-${index}`} className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3">
                  <div>
                    <div className="font-semibold text-slate-900">{[market.city, countryLabel(market.country_code)].filter(Boolean).join(", ")}</div>
                    <div className="mt-1 text-xs text-slate-500">Non-confidential compatible demand</div>
                  </div>
                  <div className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">{market.demand_count}</div>
                </div>
              ))}
            </div>
          ) : <div className="mt-5 rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">No public/limited location sample yet. Confidential demand can still contribute to aggregate counts.</div>}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Opportunity value</div>
          <h3 className="mt-1 text-xl font-semibold text-slate-950">What could strengthen your position</h3>
          {snapshot.improvement_signals.length ? (
            <div className="mt-5 space-y-3">
              {snapshot.improvement_signals.map((signal, index) => (
                <div key={`${signal.type}-${signal.label}-${index}`} className="rounded-xl border border-slate-200 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="font-semibold text-slate-900">{signal.label}</div>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${signal.type === "trainable" ? "border-violet-200 bg-violet-50 text-violet-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>{signal.type === "trainable" ? "Trainable gap" : "Preferred gap"}</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">Appears in {signal.demand_count} compatible live {signal.demand_count === 1 ? "demand" : "demands"}.</div>
                </div>
              ))}
            </div>
          ) : <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm leading-6 text-emerald-800">No recurring Trainable or Preferred gaps are currently detected across your compatible Open Demand.</div>}
          <p className="mt-4 text-xs leading-5 text-slate-500">These are market signals, not instructions. They show where employers repeatedly declare preferences or trainable gaps that may improve future ranking or package leverage.</p>
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="text-xs font-bold uppercase tracking-[0.1em] text-slate-400">{label}</div><div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{value}</div><div className="mt-1 text-xs leading-5 text-slate-500">{sub}</div></div>;
}
