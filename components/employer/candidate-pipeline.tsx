"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type MoneyPeriod = "hour" | "day" | "week" | "month" | "year" | "one_off";
type EmploymentType = "permanent" | "fixed_term" | "contractor" | "casual" | "part_time" | "self_employed" | "agency";
type PipelineStage = "approached" | "interested" | "conversation" | "interview" | "offer" | "accepted" | "hired" | "declined" | "withdrawn" | "closed";

type Allowance = {
  label: string;
  amount: number;
  currency: string;
  period: MoneyPeriod;
};

type Candidate = {
  opportunity_id: string;
  match_ref: string;
  pipeline_stage: PipelineStage;
  opportunity_status: string;
  sent_at: string;
  viewed_at: string | null;
  responded_at: string | null;
  identity_revealed: boolean;
  is_anonymous: boolean;
  worker_id: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  professional_headline: string | null;
  worker_question: string | null;
  employer_reply: string | null;
  offer_id: string | null;
  offer_status: string | null;
  offer_base_compensation: number | null;
  offer_currency: string | null;
  offer_period: MoneyPeriod | null;
  offer_employment_type: EmploymentType | null;
  offer_start_date: string | null;
  offer_roster: { shift?: string; pattern?: string } | null;
  offer_allowances: Allowance[] | null;
  offer_benefits: string[] | null;
  offer_sent_at: string | null;
  offer_accepted_at: string | null;
  offer_declined_at: string | null;
  hired_at: string | null;
};

type DemandDefaults = {
  employment_type: EmploymentType | null;
  expected_start_date: string | null;
  roster: { shift?: string; pattern?: string } | null;
  comp_min: number | null;
  comp_max: number | null;
  currency: string;
  period: MoneyPeriod;
  benefits: string[];
};

const STAGE_LABELS: Record<PipelineStage, string> = {
  approached: "Approached",
  interested: "Interested",
  conversation: "Conversation",
  interview: "Interview",
  offer: "Offer",
  accepted: "Accepted",
  hired: "Hired",
  declined: "Declined",
  withdrawn: "Withdrawn",
  closed: "Closed",
};

const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  permanent: "Permanent",
  fixed_term: "Fixed term",
  contractor: "Contractor",
  casual: "Casual",
  part_time: "Part time",
  self_employed: "Self-employed",
  agency: "Agency",
};

const PERIOD_LABELS: Record<MoneyPeriod, string> = {
  hour: "hour",
  day: "day",
  week: "week",
  month: "month",
  year: "year",
  one_off: "one-off",
};

const PIPELINE_STEPS: { key: PipelineStage; label: string }[] = [
  { key: "interested", label: "Interested" },
  { key: "conversation", label: "Conversation" },
  { key: "interview", label: "Interview" },
  { key: "offer", label: "Offer" },
  { key: "accepted", label: "Accepted" },
  { key: "hired", label: "Hired" },
];

function stageRank(stage: PipelineStage) {
  return PIPELINE_STEPS.findIndex((item) => item.key === stage);
}

function stageClasses(stage: PipelineStage) {
  if (stage === "hired") return "border-emerald-300 bg-emerald-100 text-emerald-800";
  if (stage === "accepted" || stage === "interested") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (stage === "offer" || stage === "interview" || stage === "conversation") return "border-violet-200 bg-violet-50 text-violet-700";
  if (stage === "declined" || stage === "withdrawn" || stage === "closed") return "border-slate-200 bg-slate-100 text-slate-600";
  return "border-blue-200 bg-blue-50 text-blue-700";
}

function formatMoney(amount: number | null, currency: string | null) {
  if (amount == null || !currency) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

function formatDate(value: string | null) {
  if (!value) return "Not specified";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message || fallback);
  }
  return fallback;
}

export default function CandidatePipeline({
  demandId,
  onDemandChanged,
}: {
  demandId: string;
  onDemandChanged?: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [defaults, setDefaults] = useState<DemandDefaults>({
    employment_type: "permanent",
    expected_start_date: null,
    roster: null,
    comp_min: null,
    comp_max: null,
    currency: "AUD",
    period: "year",
    benefits: [],
  });

  const [offerOpportunityId, setOfferOpportunityId] = useState<string | null>(null);
  const [offerForm, setOfferForm] = useState({
    amount: "",
    currency: "AUD",
    period: "year" as MoneyPeriod,
    employment_type: "permanent" as EmploymentType,
    start_date: "",
    shift: "any",
    roster_pattern: "",
    benefits_text: "",
    allowances: [] as { label: string; amount: string; currency: string; period: MoneyPeriod }[],
  });

  const [replyOpportunityId, setReplyOpportunityId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  useEffect(() => {
    void loadPipeline();
  }, [demandId]);

  async function loadPipeline() {
    setLoading(true);
    setNotice(null);
    try {
      const [pipelineResult, demandResult, compResult, benefitResult] = await Promise.all([
        supabase.rpc("get_demand_candidate_pipeline", { p_demand_id: demandId }),
        supabase.from("open_demands").select("employment_type, expected_start_date, roster").eq("id", demandId).single(),
        supabase.from("demand_compensation_components").select("amount_min, amount_max, currency_code, period").eq("demand_id", demandId).eq("component_type", "base_salary").limit(1),
        supabase.from("demand_benefits").select("label").eq("demand_id", demandId).order("created_at"),
      ]);
      if (pipelineResult.error) throw pipelineResult.error;
      if (demandResult.error) throw demandResult.error;
      if (compResult.error) throw compResult.error;
      if (benefitResult.error) throw benefitResult.error;

      setCandidates((pipelineResult.data ?? []).map((item: Candidate) => ({
        ...item,
        offer_allowances: Array.isArray(item.offer_allowances) ? item.offer_allowances : [],
        offer_benefits: item.offer_benefits ?? [],
      })));

      const demand = demandResult.data as {
        employment_type: EmploymentType | null;
        expected_start_date: string | null;
        roster: { shift?: string; pattern?: string } | null;
      };
      const comp = compResult.data?.[0] as { amount_min: number | null; amount_max: number | null; currency_code: string; period: MoneyPeriod } | undefined;
      setDefaults({
        employment_type: demand.employment_type,
        expected_start_date: demand.expected_start_date,
        roster: demand.roster,
        comp_min: comp?.amount_min ?? null,
        comp_max: comp?.amount_max ?? null,
        currency: comp?.currency_code ?? "AUD",
        period: comp?.period ?? "year",
        benefits: (benefitResult.data ?? []).map((item: { label: string }) => item.label),
      });
    } catch (error) {
      setNotice({ type: "error", text: errorMessage(error, "Could not load Candidate Pipeline.") });
    } finally {
      setLoading(false);
    }
  }

  function openOffer(candidate: Candidate) {
    const existingAllowances = (candidate.offer_allowances ?? []).map((item) => ({
      label: item.label ?? "",
      amount: item.amount == null ? "" : String(item.amount),
      currency: item.currency ?? candidate.offer_currency ?? defaults.currency,
      period: item.period ?? candidate.offer_period ?? defaults.period,
    }));

    setOfferOpportunityId(candidate.opportunity_id);
    setOfferForm({
      amount: candidate.offer_base_compensation == null ? "" : String(candidate.offer_base_compensation),
      currency: candidate.offer_currency ?? defaults.currency,
      period: candidate.offer_period ?? defaults.period,
      employment_type: candidate.offer_employment_type ?? defaults.employment_type ?? "permanent",
      start_date: candidate.offer_start_date ?? defaults.expected_start_date ?? "",
      shift: candidate.offer_roster?.shift ?? defaults.roster?.shift ?? "any",
      roster_pattern: candidate.offer_roster?.pattern ?? defaults.roster?.pattern ?? "",
      benefits_text: (candidate.offer_benefits?.length ? candidate.offer_benefits : defaults.benefits).join("\n"),
      allowances: existingAllowances,
    });
  }

  async function advance(candidate: Candidate, stage: "conversation" | "interview" | "hired" | "withdrawn" | "closed") {
    setBusyId(candidate.opportunity_id);
    setNotice(null);
    try {
      const { error } = await supabase.rpc("advance_candidate_pipeline", {
        p_opportunity_id: candidate.opportunity_id,
        p_stage: stage,
      });
      if (error) throw error;
      setNotice({
        type: "success",
        text: stage === "hired"
          ? "Candidate marked Hired. The demand's remaining positions were updated automatically."
          : `Candidate moved to ${STAGE_LABELS[stage]}.`,
      });
      await loadPipeline();
      if (stage === "hired") onDemandChanged?.();
    } catch (error) {
      setNotice({ type: "error", text: errorMessage(error, "Could not update candidate stage.") });
    } finally {
      setBusyId(null);
    }
  }

  async function sendOffer(candidate: Candidate) {
    const amount = Number(offerForm.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      setNotice({ type: "error", text: "Enter a valid base compensation amount." });
      return;
    }

    const allowances = offerForm.allowances
      .filter((item) => item.label.trim() && item.amount.trim())
      .map((item) => ({
        label: item.label.trim(),
        amount: Number(item.amount),
        currency: item.currency.trim().toUpperCase().slice(0, 3),
        period: item.period,
      }));

    if (allowances.some((item) => !Number.isFinite(item.amount) || item.amount < 0)) {
      setNotice({ type: "error", text: "Check the allowance amounts." });
      return;
    }

    const benefits = offerForm.benefits_text
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);

    setBusyId(candidate.opportunity_id);
    setNotice(null);
    try {
      const { error } = await supabase.rpc("send_structured_offer", {
        p_opportunity_id: candidate.opportunity_id,
        p_base_compensation: amount,
        p_currency_code: offerForm.currency.trim().toUpperCase(),
        p_period: offerForm.period,
        p_employment_type: offerForm.employment_type,
        p_start_date: offerForm.start_date || null,
        p_roster: {
          shift: offerForm.shift,
          pattern: offerForm.roster_pattern.trim() || undefined,
        },
        p_allowances: allowances,
        p_benefits: benefits,
      });
      if (error) throw error;
      setOfferOpportunityId(null);
      setNotice({ type: "success", text: candidate.offer_id ? "Structured offer updated and re-sent." : "Structured offer sent." });
      await loadPipeline();
    } catch (error) {
      setNotice({ type: "error", text: errorMessage(error, "Could not send structured offer.") });
    } finally {
      setBusyId(null);
    }
  }

  async function reply(candidate: Candidate) {
    if (!replyText.trim()) return;
    setBusyId(candidate.opportunity_id);
    setNotice(null);
    try {
      const { error } = await supabase.rpc("reply_to_opportunity_question", {
        p_demand_id: demandId,
        p_match_ref: candidate.match_ref,
        p_reply: replyText.trim(),
      });
      if (error) throw error;
      setReplyOpportunityId(null);
      setReplyText("");
      setNotice({ type: "success", text: "Reply sent through Aviation Passport." });
      await loadPipeline();
    } catch (error) {
      setNotice({ type: "error", text: errorMessage(error, "Could not send reply.") });
    } finally {
      setBusyId(null);
    }
  }

  const metrics = {
    approached: candidates.filter((item) => item.pipeline_stage === "approached").length,
    active: candidates.filter((item) => ["interested","conversation","interview","offer","accepted"].includes(item.pipeline_stage)).length,
    offers: candidates.filter((item) => ["offer","accepted"].includes(item.pipeline_stage)).length,
    hired: candidates.filter((item) => item.pipeline_stage === "hired").length,
  };

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Demand-bound hiring workflow</div>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Candidate Pipeline</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Interest becomes a structured hiring process. Conversation, interview, formal offer and hire remain tied to this exact Open Demand.
          </p>
        </div>
        <button type="button" onClick={() => void loadPipeline()} className="self-start rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Refresh</button>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Awaiting response" value={metrics.approached} />
        <Metric label="Active candidates" value={metrics.active} />
        <Metric label="Offer stage" value={metrics.offers} />
        <Metric label="Hired" value={metrics.hired} />
      </div>

      {defaults.comp_min != null || defaults.comp_max != null ? (
        <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-800">
          Declared demand package: {formatMoney(defaults.comp_min, defaults.currency)} – {formatMoney(defaults.comp_max, defaults.currency)} / {PERIOD_LABELS[defaults.period]}. Formal offers can differ, but Aviation Passport preserves both values.
        </div>
      ) : null}

      {notice ? (
        <div className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${notice.type === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          {notice.text}
        </div>
      ) : null}

      {loading && !candidates.length ? (
        <div className="mt-6 rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-500">Loading Candidate Pipeline…</div>
      ) : candidates.length ? (
        <div className="mt-6 space-y-5">
          {candidates.map((candidate) => {
            const fullName = candidate.is_anonymous
              ? `Anonymous Aviation Professional · ${candidate.match_ref.slice(0, 6).toUpperCase()}`
              : [candidate.first_name, candidate.middle_name, candidate.last_name].filter(Boolean).join(" ") || "Aviation Professional";
            const terminal = ["declined","withdrawn","closed","hired"].includes(candidate.pipeline_stage);
            const rank = stageRank(candidate.pipeline_stage);

            return (
              <article key={candidate.opportunity_id} className="rounded-2xl border border-slate-200 p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-slate-950">{fullName}</h3>
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${stageClasses(candidate.pipeline_stage)}`}>{STAGE_LABELS[candidate.pipeline_stage]}</span>
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      {candidate.is_anonymous ? "Identity protected until the worker chooses Interested" : candidate.professional_headline || "Aviation professional"}
                    </div>
                  </div>
                </div>

                {!terminal && candidate.pipeline_stage !== "approached" ? (
                  <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {PIPELINE_STEPS.map((step, index) => (
                      <div key={step.key} className={`rounded-lg border px-2 py-2 text-center text-[11px] font-semibold ${
                        candidate.pipeline_stage === step.key
                          ? "border-slate-950 bg-slate-950 text-white"
                          : rank >= index
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 bg-slate-50 text-slate-400"
                      }`}>
                        {step.label}
                      </div>
                    ))}
                  </div>
                ) : null}

                {candidate.worker_question ? (
                  <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
                    <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-blue-500">Worker question</div>
                    <div className="mt-1 text-sm text-blue-950">{candidate.worker_question}</div>
                    {candidate.employer_reply ? (
                      <div className="mt-3 rounded-lg border border-blue-100 bg-white px-3 py-2">
                        <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-blue-400">Your reply</div>
                        <div className="mt-1 text-sm text-slate-800">{candidate.employer_reply}</div>
                      </div>
                    ) : replyOpportunityId === candidate.opportunity_id ? (
                      <div className="mt-3">
                        <textarea className="input min-h-20" value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="Answer the worker's question…" />
                        <div className="mt-2 flex gap-2">
                          <button type="button" disabled={busyId === candidate.opportunity_id || !replyText.trim()} onClick={() => void reply(candidate)} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Send reply</button>
                          <button type="button" onClick={() => { setReplyOpportunityId(null); setReplyText(""); }} className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" onClick={() => { setReplyOpportunityId(candidate.opportunity_id); setReplyText(""); }} className="mt-3 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700">Reply</button>
                    )}
                  </div>
                ) : null}

                {candidate.offer_id ? (
                  <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-violet-500">Formal structured offer</div>
                        <div className="mt-1 text-lg font-semibold text-violet-950">
                          {formatMoney(candidate.offer_base_compensation, candidate.offer_currency)} / {candidate.offer_period ? PERIOD_LABELS[candidate.offer_period] : "period"}
                        </div>
                        <div className="mt-1 text-sm text-violet-800">
                          {candidate.offer_employment_type ? EMPLOYMENT_LABELS[candidate.offer_employment_type] : "Employment type"} · Start {formatDate(candidate.offer_start_date)}
                        </div>
                      </div>
                      <span className="rounded-full border border-violet-200 bg-white px-2.5 py-1 text-xs font-semibold text-violet-700">
                        {candidate.offer_status ? candidate.offer_status.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Offer"}
                      </span>
                    </div>
                    {candidate.offer_allowances?.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {candidate.offer_allowances.map((allowance, index) => (
                          <span key={`${allowance.label}-${index}`} className="rounded-lg border border-violet-200 bg-white px-2.5 py-1 text-xs text-violet-800">
                            {allowance.label}: {formatMoney(allowance.amount, allowance.currency)} / {PERIOD_LABELS[allowance.period]}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {candidate.offer_benefits?.length ? <div className="mt-3 text-xs text-violet-800">Benefits: {candidate.offer_benefits.join(" · ")}</div> : null}
                  </div>
                ) : null}

                {offerOpportunityId === candidate.opportunity_id ? (
                  <div className="mt-4 rounded-2xl border border-slate-300 bg-slate-50 p-5">
                    <div className="text-sm font-semibold text-slate-950">{candidate.offer_id ? "Edit structured offer" : "Create structured offer"}</div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <Field label="Base compensation"><input type="number" min="0" step="0.01" className="input" value={offerForm.amount} onChange={(e) => setOfferForm({ ...offerForm, amount: e.target.value })} /></Field>
                      <Field label="Currency"><input maxLength={3} className="input uppercase" value={offerForm.currency} onChange={(e) => setOfferForm({ ...offerForm, currency: e.target.value.toUpperCase() })} /></Field>
                      <Field label="Period">
                        <select className="input" value={offerForm.period} onChange={(e) => setOfferForm({ ...offerForm, period: e.target.value as MoneyPeriod })}>
                          {Object.entries(PERIOD_LABELS).map(([value, label]) => <option key={value} value={value}>per {label}</option>)}
                        </select>
                      </Field>
                      <Field label="Employment type">
                        <select className="input" value={offerForm.employment_type} onChange={(e) => setOfferForm({ ...offerForm, employment_type: e.target.value as EmploymentType })}>
                          {Object.entries(EMPLOYMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </Field>
                      <Field label="Start date"><input type="date" className="input" value={offerForm.start_date} onChange={(e) => setOfferForm({ ...offerForm, start_date: e.target.value })} /></Field>
                      <Field label="Shift">
                        <select className="input" value={offerForm.shift} onChange={(e) => setOfferForm({ ...offerForm, shift: e.target.value })}>
                          <option value="any">Any / mixed</option>
                          <option value="days">Day shift</option>
                          <option value="nights">Night shift</option>
                          <option value="rotating">Rotating days / nights</option>
                        </select>
                      </Field>
                      <Field label="Roster pattern"><input className="input" value={offerForm.roster_pattern} onChange={(e) => setOfferForm({ ...offerForm, roster_pattern: e.target.value })} placeholder="5 on / 3 off" /></Field>
                      <Field label="Benefits" hint="One benefit per line"><textarea className="input min-h-24" value={offerForm.benefits_text} onChange={(e) => setOfferForm({ ...offerForm, benefits_text: e.target.value })} /></Field>
                    </div>

                    <div className="mt-5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-slate-900">Allowances / package components</div>
                        <button type="button" onClick={() => setOfferForm({ ...offerForm, allowances: [...offerForm.allowances, { label: "", amount: "", currency: offerForm.currency, period: offerForm.period }] })} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">Add allowance</button>
                      </div>
                      {offerForm.allowances.length ? (
                        <div className="mt-3 space-y-2">
                          {offerForm.allowances.map((allowance, index) => (
                            <div key={index} className="grid gap-2 sm:grid-cols-[1.4fr_1fr_0.7fr_1fr_auto]">
                              <input className="input" value={allowance.label} onChange={(e) => setOfferForm({ ...offerForm, allowances: offerForm.allowances.map((item, i) => i === index ? { ...item, label: e.target.value } : item) })} placeholder="Housing allowance" />
                              <input type="number" min="0" step="0.01" className="input" value={allowance.amount} onChange={(e) => setOfferForm({ ...offerForm, allowances: offerForm.allowances.map((item, i) => i === index ? { ...item, amount: e.target.value } : item) })} placeholder="Amount" />
                              <input maxLength={3} className="input uppercase" value={allowance.currency} onChange={(e) => setOfferForm({ ...offerForm, allowances: offerForm.allowances.map((item, i) => i === index ? { ...item, currency: e.target.value.toUpperCase() } : item) })} />
                              <select className="input" value={allowance.period} onChange={(e) => setOfferForm({ ...offerForm, allowances: offerForm.allowances.map((item, i) => i === index ? { ...item, period: e.target.value as MoneyPeriod } : item) })}>
                                {Object.entries(PERIOD_LABELS).map(([value, label]) => <option key={value} value={value}>per {label}</option>)}
                              </select>
                              <button type="button" onClick={() => setOfferForm({ ...offerForm, allowances: offerForm.allowances.filter((_, i) => i !== index) })} className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700">Remove</button>
                            </div>
                          ))}
                        </div>
                      ) : <div className="mt-2 text-xs text-slate-500">No additional allowances.</div>}
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2">
                      <button type="button" disabled={busyId === candidate.opportunity_id || !offerForm.amount} onClick={() => void sendOffer(candidate)} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{candidate.offer_id ? "Update & send offer" : "Send structured offer"}</button>
                      <button type="button" onClick={() => setOfferOpportunityId(null)} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700">Cancel</button>
                    </div>
                  </div>
                ) : null}

                <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                  {candidate.pipeline_stage === "approached" ? <span className="rounded-lg bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500">Waiting for worker response</span> : null}
                  {candidate.pipeline_stage === "interested" ? <button type="button" disabled={busyId === candidate.opportunity_id} onClick={() => void advance(candidate, "conversation")} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white">Start conversation</button> : null}
                  {candidate.pipeline_stage === "conversation" ? <button type="button" disabled={busyId === candidate.opportunity_id} onClick={() => void advance(candidate, "interview")} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white">Move to interview</button> : null}
                  {["interested","conversation","interview","offer"].includes(candidate.pipeline_stage) ? <button type="button" disabled={busyId === candidate.opportunity_id} onClick={() => openOffer(candidate)} className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-violet-700">{candidate.offer_id ? "Edit offer" : "Create offer"}</button> : null}
                  {candidate.pipeline_stage === "accepted" ? <button type="button" disabled={busyId === candidate.opportunity_id} onClick={() => void advance(candidate, "hired")} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white">Mark hired</button> : null}
                  {!terminal && candidate.pipeline_stage !== "approached" ? <button type="button" disabled={busyId === candidate.opportunity_id} onClick={() => void advance(candidate, "withdrawn")} className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-semibold text-amber-700">Withdraw</button> : null}
                  {!terminal ? <button type="button" disabled={busyId === candidate.opportunity_id} onClick={() => void advance(candidate, "closed")} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600">Close</button> : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 p-8 text-center">
          <div className="font-semibold text-slate-900">No candidates in the pipeline yet</div>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-500">Send a structured opportunity from Talent Matches. Once the worker responds, the same demand becomes the hiring workflow.</p>
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}
