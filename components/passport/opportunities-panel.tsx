"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { countryLabel } from "@/lib/reference/countries";
import WorkerInterviewRounds from "@/components/passport/worker-interviews";

type OpportunityStatus = "sent" | "viewed" | "interested" | "question" | "declined" | "interview" | "offer" | "accepted" | "withdrawn" | "closed";
type PipelineStage = "approached" | "interested" | "interview" | "offer" | "accepted" | "hired" | "declined" | "withdrawn" | "closed";
type MoneyPeriod = "hour" | "day" | "week" | "month" | "year" | "one_off";
type EmploymentType = "permanent" | "fixed_term" | "contractor" | "casual" | "part_time" | "self_employed" | "agency";

type Allowance = {
  label: string;
  amount: number;
  currency: string;
  period: MoneyPeriod;
};

type Opportunity = {
  opportunity_id: string;
  status: OpportunityStatus;
  pipeline_stage: PipelineStage;
  sent_at: string;
  viewed_at: string | null;
  responded_at: string | null;
  worker_question: string | null;
  employer_reply: string | null;
  identity_revealed: boolean;
  worker_visibility: "private" | "anonymous_market" | "public" | string;
  demand_id: string;
  organisation_name: string;
  organisation_verified: boolean;
  public_title: string;
  profession: string;
  discipline: string | null;
  employment_type: string | null;
  city: string | null;
  country_code: string | null;
  sponsorship_available: boolean;
  relocation_assistance: boolean;
  expected_start_date: string | null;
  roster: { shift?: string; pattern?: string } | null;
  compensation_min: number | null;
  compensation_max: number | null;
  compensation_currency: string | null;
  compensation_period: MoneyPeriod | null;
  mandatory_requirements: string[];
  trainable_gaps: string[];
  preferred_gaps: string[];
  demand_benefits: string[];
  offer_id: string | null;
  offer_status: string | null;
  offer_base_compensation: number | null;
  offer_currency: string | null;
  offer_period: MoneyPeriod | null;
  offer_employment_type: EmploymentType | null;
  offer_start_date: string | null;
  offer_roster: { shift?: string; pattern?: string } | null;
  offer_allowances: Allowance[] | null;
  offer_benefits: string[];
  offer_sent_at: string | null;
  offer_accepted_at: string | null;
  hired_at: string | null;
  demand_cancelled: boolean;
};

const PIPELINE_LABELS: Record<PipelineStage, string> = {
  approached: "Opportunity received",
  interested: "Interested",
  interview: "Interviewing",
  offer: "Formal offer",
  accepted: "Offer accepted",
  hired: "Hired",
  declined: "Declined",
  withdrawn: "Employer withdrew",
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
  { key: "interview", label: "Interviewing" },
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
  if (stage === "interview" || stage === "offer") return "border-violet-200 bg-violet-50 text-violet-700";
  if (stage === "declined" || stage === "withdrawn" || stage === "closed") return "border-slate-200 bg-slate-100 text-slate-600";
  return "border-blue-200 bg-blue-50 text-blue-700";
}

function formatDate(value: string | null) {
  if (!value) return "Not specified";
  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function formatMoney(amount: number | null, currency: string | null) {
  if (amount == null || !currency) return "Not specified";
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

function employmentLabel(value: string | null) {
  if (!value) return "Not specified";
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function rosterLabel(roster: Opportunity["roster"]) {
  if (!roster) return "Not specified";
  const scheduleLabels: Record<string, string> = {
    monday_friday: "Monday–Friday",
    fixed_weekdays: "Fixed weekdays",
    days: "Day shift",
    nights: "Night shift",
    rotating: "Rotating days / nights",
    weekends: "Weekend-focused",
  };
  const shift = roster.shift && roster.shift !== "any"
    ? scheduleLabels[roster.shift] ?? roster.shift.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
    : null;
  return [shift, roster.pattern].filter(Boolean).join(" · ") || "Flexible / not specified";
}

function demandCompensation(opportunity: Opportunity) {
  if (!opportunity.compensation_currency || !opportunity.compensation_period || (opportunity.compensation_min == null && opportunity.compensation_max == null)) return "Not specified";
  const min = formatMoney(opportunity.compensation_min, opportunity.compensation_currency);
  const max = formatMoney(opportunity.compensation_max, opportunity.compensation_currency);
  const range = opportunity.compensation_min != null && opportunity.compensation_max != null ? `${min} – ${max}` : opportunity.compensation_min != null ? min : max;
  return `${range} / ${PERIOD_LABELS[opportunity.compensation_period]}`;
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String((error as { message?: unknown }).message || fallback);
  return fallback;
}

export default function OpportunitiesPanel({ onActionCountChanged }: { onActionCountChanged?: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [questionId, setQuestionId] = useState<string | null>(null);
  const [questionMode, setQuestionMode] = useState<"initial" | "offer">("initial");
  const [question, setQuestion] = useState("");

  useEffect(() => {
    void loadOpportunities();
  }, []);

  async function loadOpportunities() {
    setLoading(true);
    setNotice(null);
    try {
      const { data, error } = await supabase.rpc("get_my_opportunities");
      if (error) throw error;
      setOpportunities((data ?? []).map((item: Opportunity) => ({
        ...item,
        mandatory_requirements: item.mandatory_requirements ?? [],
        trainable_gaps: item.trainable_gaps ?? [],
        preferred_gaps: item.preferred_gaps ?? [],
        demand_benefits: item.demand_benefits ?? [],
        offer_allowances: Array.isArray(item.offer_allowances) ? item.offer_allowances : [],
        offer_benefits: item.offer_benefits ?? [],
      })));
    } catch (error) {
      setNotice({ type: "error", text: errorMessage(error, "Could not load opportunities.") });
    } finally {
      setLoading(false);
    }
  }

  async function dismissOpportunity(opportunity: Opportunity) {
    if (!window.confirm("Delete this opportunity from your list? It will disappear from your Opportunities view.")) return;

    setBusyId(opportunity.opportunity_id);
    setNotice(null);
    try {
      const { error } = await supabase.rpc("dismiss_my_opportunity", {
        p_opportunity_id: opportunity.opportunity_id,
      });
      if (error) throw error;
      setNotice({ type: "success", text: "Opportunity deleted from your list." });
      await loadOpportunities();
      onActionCountChanged?.();
    } catch (error) {
      setNotice({ type: "error", text: errorMessage(error, "Could not delete opportunity from your list.") });
    } finally {
      setBusyId(null);
    }
  }

  async function respondInitial(opportunity: Opportunity, action: "interested" | "question" | "declined") {
    setBusyId(opportunity.opportunity_id);
    setNotice(null);
    try {
      const { error } = await supabase.rpc("respond_to_opportunity", {
        p_opportunity_id: opportunity.opportunity_id,
        p_action: action,
        p_question: action === "question" ? question.trim() : null,
      });
      if (error) throw error;

      if (action === "interested") {
        setNotice({
          type: "success",
          text: opportunity.worker_visibility === "anonymous_market" && !opportunity.identity_revealed
            ? "Interested sent. Your identity and employer-visible Passport are revealed only to this employer for this opportunity."
            : "Interested sent.",
        });
      } else if (action === "question") {
        setNotice({ type: "success", text: opportunity.worker_visibility === "anonymous_market" && !opportunity.identity_revealed ? "Question sent. You remain anonymous." : "Question sent." });
      } else {
        setNotice({ type: "success", text: "Opportunity declined." });
      }

      setQuestion("");
      setQuestionId(null);
      await loadOpportunities();
      onActionCountChanged?.();
    } catch (error) {
      setNotice({ type: "error", text: errorMessage(error, "Could not respond to opportunity.") });
    } finally {
      setBusyId(null);
    }
  }

  async function respondOffer(opportunity: Opportunity, action: "accept" | "decline" | "question") {
    setBusyId(opportunity.opportunity_id);
    setNotice(null);
    try {
      const { error } = await supabase.rpc("respond_to_structured_offer", {
        p_opportunity_id: opportunity.opportunity_id,
        p_action: action,
        p_question: action === "question" ? question.trim() : null,
      });
      if (error) throw error;
      setNotice({
        type: "success",
        text: action === "accept" ? "Offer accepted." : action === "decline" ? "Offer declined." : "Question sent about the formal offer.",
      });
      setQuestion("");
      setQuestionId(null);
      await loadOpportunities();
      onActionCountChanged?.();
    } catch (error) {
      setNotice({ type: "error", text: errorMessage(error, "Could not respond to the formal offer.") });
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Loading opportunities…</div>;
  }

  return (
    <div className="mt-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Demand-bound approaches only</div>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Opportunities</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Every approach is a real declared demand. If you become Interested, Aviation Passport carries the process through interview, formal offer and hiring.</p>
          </div>
          <button type="button" onClick={() => void loadOpportunities()} className="self-start rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Refresh</button>
        </div>

        {notice ? <div className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${notice.type === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{notice.text}</div> : null}

        {opportunities.length ? (
          <div className="mt-6 space-y-5">
            {opportunities.map((opportunity) => {
              const location = [opportunity.city, opportunity.country_code ? countryLabel(opportunity.country_code) : null].filter(Boolean).join(", ");
              const anonymousUnrevealed = opportunity.worker_visibility === "anonymous_market" && !opportunity.identity_revealed;
              const demandCancelled = Boolean(opportunity.demand_cancelled) && opportunity.pipeline_stage !== "hired";
              const terminal = demandCancelled || ["declined","withdrawn","closed","hired"].includes(opportunity.pipeline_stage);
              const rank = stageRank(opportunity.pipeline_stage);
              const offerActive = !demandCancelled && opportunity.pipeline_stage === "offer" && opportunity.offer_status === "sent";
              const visibleStageLabel = demandCancelled ? "Cancelled" : PIPELINE_LABELS[opportunity.pipeline_stage];
              const canDeleteFromList = opportunity.pipeline_stage !== "hired" && (demandCancelled || opportunity.pipeline_stage === "declined");

              return (
                <article key={opportunity.opportunity_id} className={`rounded-2xl border p-5 ${demandCancelled ? "border-slate-300 bg-slate-50/60" : "border-slate-200"}`}>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-xl font-semibold tracking-tight text-slate-950">{opportunity.public_title}</h3>
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${demandCancelled ? "border-slate-300 bg-slate-200 text-slate-700" : stageClasses(opportunity.pipeline_stage)}`}>{visibleStageLabel}</span>
                        {opportunity.organisation_verified ? <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Verified organisation</span> : null}
                      </div>
                      <div className="mt-1 text-sm text-slate-700">{opportunity.organisation_name} · {opportunity.profession}{opportunity.discipline ? ` · ${opportunity.discipline}` : ""}</div>
                      <div className="mt-1 text-xs text-slate-500">{location || "Location not specified"} · Sent {formatDate(opportunity.sent_at)}</div>
                    </div>
                  </div>

                  {demandCancelled ? (
                    <div className="mt-4 rounded-xl border border-slate-300 bg-white px-4 py-3">
                      <div className="text-sm font-semibold text-slate-900">Opening cancelled by employer</div>
                      <div className="mt-1 text-xs leading-5 text-slate-600">
                        This opportunity is no longer active. It remains in your Opportunities history so you keep a record of the approach and any interview or offer activity that took place.
                      </div>
                    </div>
                  ) : null}

                  {anonymousUnrevealed ? <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800">You are still anonymous. Asking a question does not reveal you. Choosing Interested reveals your employer-visible Passport only for this opportunity.</div> : null}

                  {!terminal && opportunity.pipeline_stage !== "approached" ? (
                    <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-5">
                      {PIPELINE_STEPS.map((step, index) => (
                        <div key={step.key} className={`rounded-lg border px-2 py-2 text-center text-[11px] font-semibold ${
                          opportunity.pipeline_stage === step.key
                            ? "border-slate-950 bg-slate-950 text-white"
                            : rank >= index
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-slate-200 bg-slate-50 text-slate-400"
                        }`}>{step.label}</div>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Fact label="Location" value={location || "Not specified"} />
                    <Fact label="Employment" value={employmentLabel(opportunity.employment_type)} />
                    <Fact label="Declared compensation" value={demandCompensation(opportunity)} />
                    <Fact label="Roster" value={rosterLabel(opportunity.roster)} />
                    <Fact label="Expected start" value={formatDate(opportunity.expected_start_date)} />
                    <Fact label="Sponsorship" value={opportunity.sponsorship_available ? "Available" : "Not offered"} />
                    <Fact label="Relocation" value={opportunity.relocation_assistance ? "Assistance offered" : "Not specified"} />
                    <Fact label="Stage" value={visibleStageLabel} />
                  </div>

                  {opportunity.mandatory_requirements.length ? <TagSection label="Mandatory requirements" items={opportunity.mandatory_requirements} kind="mandatory" /> : null}
                  {opportunity.trainable_gaps.length ? <TagSection label="Employer-agreed trainable gaps" items={opportunity.trainable_gaps} kind="trainable" /> : null}
                  {opportunity.demand_benefits.length ? <TagSection label="Demand benefits" items={opportunity.demand_benefits} kind="benefit" /> : null}

                  {opportunity.worker_question ? (
                    <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
                      <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-blue-500">Conversation · Your question</div>
                      <div className="mt-1 text-sm text-blue-950">{opportunity.worker_question}</div>
                      {opportunity.employer_reply ? <div className="mt-3 rounded-lg border border-blue-100 bg-white px-3 py-2"><div className="text-[10px] font-bold uppercase tracking-[0.1em] text-blue-400">Employer reply</div><div className="mt-1 text-sm text-slate-800">{opportunity.employer_reply}</div></div> : <div className="mt-2 text-xs text-blue-700">Waiting for employer reply.</div>}
                    </div>
                  ) : null}

                  {!demandCancelled && ["interested", "interview", "offer", "accepted", "hired"].includes(opportunity.pipeline_stage) ? (
                    <WorkerInterviewRounds
                      opportunityId={opportunity.opportunity_id}
                      onActionChanged={() => {
                        void loadOpportunities();
                        onActionCountChanged?.();
                      }}
                    />
                  ) : null}

                  {opportunity.offer_id ? (
                    <div className="mt-5 rounded-2xl border border-violet-200 bg-violet-50 p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-xs font-bold uppercase tracking-[0.12em] text-violet-500">Formal offer</div>
                          <div className="mt-2 text-2xl font-semibold tracking-tight text-violet-950">{formatMoney(opportunity.offer_base_compensation, opportunity.offer_currency)} / {opportunity.offer_period ? PERIOD_LABELS[opportunity.offer_period] : "period"}</div>
                          <div className="mt-1 text-sm text-violet-800">{opportunity.offer_employment_type ? EMPLOYMENT_LABELS[opportunity.offer_employment_type] : "Employment type"} · Start {formatDate(opportunity.offer_start_date)} · {rosterLabel(opportunity.offer_roster)}</div>
                        </div>
                        <span className="rounded-full border border-violet-200 bg-white px-2.5 py-1 text-xs font-semibold text-violet-700">{opportunity.offer_status?.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "Offer"}</span>
                      </div>
                      {opportunity.offer_allowances?.length ? (
                        <div className="mt-4 grid gap-2 sm:grid-cols-2">
                          {opportunity.offer_allowances.map((allowance, index) => <Fact key={`${allowance.label}-${index}`} label={allowance.label} value={`${formatMoney(allowance.amount, allowance.currency)} / ${PERIOD_LABELS[allowance.period]}`} />)}
                        </div>
                      ) : null}
                      {opportunity.offer_benefits.length ? <TagSection label="Offer benefits" items={opportunity.offer_benefits} kind="benefit" /> : null}

                      {offerActive ? (
                        <div className="mt-5 flex flex-wrap gap-2 border-t border-violet-200 pt-4">
                          <button type="button" disabled={busyId === opportunity.opportunity_id} onClick={() => void respondOffer(opportunity, "accept")} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Accept offer</button>
                          <button type="button" disabled={busyId === opportunity.opportunity_id} onClick={() => { setQuestionId(opportunity.opportunity_id); setQuestionMode("offer"); setQuestion(""); }} className="rounded-xl border border-blue-200 bg-white px-4 py-2.5 text-sm font-semibold text-blue-700">Ask a question</button>
                          <button type="button" disabled={busyId === opportunity.opportunity_id} onClick={() => void respondOffer(opportunity, "decline")} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600">Decline offer</button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {!demandCancelled && opportunity.pipeline_stage === "approached" ? (
                    <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                      <button type="button" disabled={busyId === opportunity.opportunity_id} onClick={() => void respondInitial(opportunity, "interested")} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Interested{anonymousUnrevealed ? " — reveal to employer" : ""}</button>
                      <button type="button" disabled={busyId === opportunity.opportunity_id} onClick={() => { setQuestionId(opportunity.opportunity_id); setQuestionMode("initial"); setQuestion(""); }} className="rounded-xl border border-blue-200 bg-white px-4 py-2.5 text-sm font-semibold text-blue-700">Ask a question{anonymousUnrevealed ? " anonymously" : ""}</button>
                      <button type="button" disabled={busyId === opportunity.opportunity_id} onClick={() => void respondInitial(opportunity, "declined")} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600">Decline</button>
                    </div>
                  ) : null}

                  {!demandCancelled && questionId === opportunity.opportunity_id ? (
                    <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4">
                      <label className="block text-sm font-semibold text-blue-950">{questionMode === "offer" ? "Question about the formal offer" : `Question for ${opportunity.organisation_name}`}</label>
                      <textarea className="input mt-2 min-h-24" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask a factual question…" />
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" disabled={busyId === opportunity.opportunity_id || !question.trim()} onClick={() => questionMode === "offer" ? void respondOffer(opportunity, "question") : void respondInitial(opportunity, "question")} className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Send question</button>
                        <button type="button" onClick={() => { setQuestionId(null); setQuestion(""); }} className="rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700">Cancel</button>
                      </div>
                      {anonymousUnrevealed ? <div className="mt-2 text-xs text-blue-700">Your identity stays hidden.</div> : null}
                    </div>
                  ) : null}

                  {!demandCancelled && opportunity.pipeline_stage === "accepted" ? <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">You accepted the formal offer. The employer can now complete the hire in Aviation Passport.</div> : null}
                  {opportunity.pipeline_stage === "hired" ? <div className="mt-5 rounded-xl border border-emerald-300 bg-emerald-100 px-4 py-3 text-sm font-semibold text-emerald-900">Hired · Congratulations. This outcome is now recorded against the original demand.</div> : null}

                  {canDeleteFromList ? (
                    <div className="mt-5 border-t border-slate-200 pt-4">
                      <button
                        type="button"
                        disabled={busyId === opportunity.opportunity_id}
                        onClick={() => void dismissOpportunity(opportunity)}
                        className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      >
                        Delete from list
                      </button>
                      <div className="mt-2 text-xs leading-5 text-slate-500">
                        Removes this item from your Opportunities view. Hired opportunities always remain.
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-300 p-8 text-center">
            <div className="font-semibold text-slate-900">No opportunities yet</div>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">When an employer sends a opportunity from a demand you match, it will appear here.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-medium text-slate-800">{value}</div>
    </div>
  );
}

function TagSection({ label, items, kind }: { label: string; items: string[]; kind: "mandatory" | "trainable" | "benefit" }) {
  const classes = kind === "mandatory" ? "border-rose-100 bg-rose-50 text-rose-700" : kind === "trainable" ? "border-violet-100 bg-violet-50 text-violet-700" : "border-emerald-100 bg-emerald-50 text-emerald-700";
  return (
    <div className="mt-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">{label}</div>
      <div className="mt-2 flex flex-wrap gap-2">{items.map((item) => <span key={item} className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${classes}`}>{item}</span>)}</div>
    </div>
  );
}
