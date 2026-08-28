"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { countryLabel } from "@/lib/reference/countries";

type OpportunityStatus = "sent" | "viewed" | "interested" | "question" | "declined" | "interview" | "offer" | "accepted" | "withdrawn" | "closed";
type MoneyPeriod = "hour" | "day" | "week" | "month" | "year" | "one_off";

type Opportunity = {
  opportunity_id: string;
  status: OpportunityStatus;
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
  benefits: string[];
};

const STATUS_LABELS: Record<OpportunityStatus, string> = {
  sent: "New",
  viewed: "Viewed",
  interested: "Interested",
  question: "Question sent",
  declined: "Declined",
  interview: "Interview",
  offer: "Offer",
  accepted: "Accepted",
  withdrawn: "Withdrawn",
  closed: "Closed",
};

function statusClasses(status: OpportunityStatus) {
  if (status === "interested" || status === "accepted") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "question" || status === "viewed") return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "offer" || status === "interview") return "border-violet-200 bg-violet-50 text-violet-700";
  if (status === "declined" || status === "withdrawn" || status === "closed") return "border-slate-200 bg-slate-100 text-slate-600";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function formatDate(value: string) {
  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function employmentLabel(value: string | null) {
  if (!value) return "Employment type not specified";
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function rosterLabel(roster: Opportunity["roster"]) {
  if (!roster) return null;
  const shift = roster.shift && roster.shift !== "any"
    ? roster.shift.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
    : null;
  return [shift, roster.pattern].filter(Boolean).join(" · ") || null;
}

function formatCompensation(opportunity: Opportunity) {
  if (!opportunity.compensation_currency || !opportunity.compensation_period || (opportunity.compensation_min == null && opportunity.compensation_max == null)) {
    return "Not specified";
  }
  const formatter = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: opportunity.compensation_currency,
    maximumFractionDigits: 0,
  });
  const min = opportunity.compensation_min == null ? null : formatter.format(opportunity.compensation_min);
  const max = opportunity.compensation_max == null ? null : formatter.format(opportunity.compensation_max);
  const range = min && max ? `${min} – ${max}` : min || max || "Not specified";
  return `${range} / ${opportunity.compensation_period}`;
}

export default function OpportunitiesPanel() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [questionId, setQuestionId] = useState<string | null>(null);
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
        benefits: item.benefits ?? [],
      })));
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : error && typeof error === "object" && "message" in error
            ? String((error as { message?: unknown }).message || "Could not load opportunities.")
            : "Could not load opportunities.";
      setNotice({ type: "error", text: message });
    } finally {
      setLoading(false);
    }
  }

  async function respond(opportunity: Opportunity, action: "interested" | "question" | "declined") {
    setBusyId(opportunity.opportunity_id);
    setNotice(null);
    try {
      const payloadQuestion = action === "question" ? question.trim() : null;
      const { error } = await supabase.rpc("respond_to_opportunity", {
        p_opportunity_id: opportunity.opportunity_id,
        p_action: action,
        p_question: payloadQuestion,
      });
      if (error) throw error;

      if (action === "interested") {
        setNotice({
          type: "success",
          text: opportunity.worker_visibility === "anonymous_market" && !opportunity.identity_revealed
            ? "Interested sent. Your identity and employer-visible profile are now revealed to this employer for this opportunity."
            : "Interested sent.",
        });
      } else if (action === "question") {
        setNotice({
          type: "success",
          text: opportunity.worker_visibility === "anonymous_market" && !opportunity.identity_revealed
            ? "Question sent. You remain anonymous."
            : "Question sent.",
        });
      } else {
        setNotice({ type: "success", text: "Opportunity declined." });
      }

      setQuestion("");
      setQuestionId(null);
      await loadOpportunities();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : error && typeof error === "object" && "message" in error
            ? String((error as { message?: unknown }).message || "Could not respond to opportunity.")
            : "Could not respond to opportunity.";
      setNotice({ type: "error", text: message });
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <div className="rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Loading opportunities…</div>;
  }

  return (
    <div className="mt-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Demand-bound approaches only</div>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Opportunities</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Employers cannot send generic recruiter messages. Every approach here is the actual structured Open Demand you matched.
            </p>
          </div>
          <button type="button" onClick={() => void loadOpportunities()} className="self-start rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Refresh</button>
        </div>

        {notice ? (
          <div className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${notice.type === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
            {notice.text}
          </div>
        ) : null}

        {opportunities.length ? (
          <div className="mt-6 space-y-5">
            {opportunities.map((opportunity) => {
              const location = [opportunity.city, opportunity.country_code ? countryLabel(opportunity.country_code) : null].filter(Boolean).join(", ");
              const roster = rosterLabel(opportunity.roster);
              const anonymousUnrevealed = opportunity.worker_visibility === "anonymous_market" && !opportunity.identity_revealed;
              const terminal = ["declined", "withdrawn", "closed", "accepted"].includes(opportunity.status);

              return (
                <article key={opportunity.opportunity_id} className="rounded-2xl border border-slate-200 p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-xl font-semibold tracking-tight text-slate-950">{opportunity.public_title}</h3>
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusClasses(opportunity.status)}`}>{STATUS_LABELS[opportunity.status]}</span>
                        {opportunity.organisation_verified ? <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Verified organisation</span> : null}
                      </div>
                      <div className="mt-1 text-sm text-slate-700">{opportunity.organisation_name} · {opportunity.profession}{opportunity.discipline ? ` · ${opportunity.discipline}` : ""}</div>
                      <div className="mt-1 text-xs text-slate-500">Sent {formatDate(opportunity.sent_at)}</div>
                    </div>
                    {anonymousUnrevealed ? (
                      <div className="max-w-sm rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800">
                        You are still anonymous to this employer. Asking a question keeps you anonymous. Choosing Interested reveals your identity and employer-visible profile for this opportunity.
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <Fact label="Location" value={location || "Not specified"} />
                    <Fact label="Employment" value={employmentLabel(opportunity.employment_type)} />
                    <Fact label="Compensation" value={formatCompensation(opportunity)} />
                    <Fact label="Expected start" value={opportunity.expected_start_date ? formatDate(opportunity.expected_start_date) : "Not specified"} />
                    <Fact label="Roster" value={roster || "Not specified"} />
                    <Fact label="Sponsorship" value={opportunity.sponsorship_available ? "Available" : "Not offered"} />
                    <Fact label="Relocation" value={opportunity.relocation_assistance ? "Assistance offered" : "Not specified"} />
                    <Fact label="Identity" value={anonymousUnrevealed ? "Anonymous" : "Employer-visible"} />
                  </div>

                  <div className="mt-5 grid gap-4 lg:grid-cols-2">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">Why you matched</div>
                      <div className="mt-2 text-sm font-semibold text-emerald-700">All Mandatory requirements met</div>
                      {opportunity.mandatory_requirements.length ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {opportunity.mandatory_requirements.map((item) => <span key={item} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700">{item}</span>)}
                        </div>
                      ) : <div className="mt-2 text-xs text-slate-500">No specific Mandatory technical requirements were declared.</div>}
                    </div>

                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">Gaps the employer accepts</div>
                      {opportunity.trainable_gaps.length ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {opportunity.trainable_gaps.map((item) => <span key={item} className="rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700">{item}</span>)}
                        </div>
                      ) : <div className="mt-2 text-sm font-medium text-emerald-700">No Trainable gaps.</div>}
                      {opportunity.preferred_gaps.length ? (
                        <>
                          <div className="mt-4 text-[11px] font-bold uppercase tracking-[0.1em] text-amber-500">Preferred gaps</div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {opportunity.preferred_gaps.map((item) => <span key={item} className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">{item}</span>)}
                          </div>
                        </>
                      ) : null}
                    </div>
                  </div>

                  {opportunity.benefits.length ? (
                    <div className="mt-4 rounded-xl border border-slate-200 px-4 py-3">
                      <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">Benefits</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {opportunity.benefits.map((benefit) => <span key={benefit} className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{benefit}</span>)}
                      </div>
                    </div>
                  ) : null}

                  {opportunity.worker_question ? (
                    <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
                      <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-blue-500">Your question</div>
                      <div className="mt-1 text-sm text-blue-950">{opportunity.worker_question}</div>
                      {opportunity.employer_reply ? (
                        <div className="mt-3 rounded-lg border border-blue-100 bg-white px-3 py-2">
                          <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-blue-400">Employer reply</div>
                          <div className="mt-1 text-sm text-slate-800">{opportunity.employer_reply}</div>
                        </div>
                      ) : <div className="mt-2 text-xs text-blue-700">Awaiting employer reply.</div>}
                    </div>
                  ) : null}

                  {!terminal ? (
                    <div className="mt-5 border-t border-slate-100 pt-5">
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          disabled={busyId === opportunity.opportunity_id}
                          onClick={() => void respond(opportunity, "interested")}
                          className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          {anonymousUnrevealed ? "Interested — reveal my profile" : "Interested"}
                        </button>
                        <button
                          type="button"
                          disabled={busyId === opportunity.opportunity_id}
                          onClick={() => {
                            setQuestionId(questionId === opportunity.opportunity_id ? null : opportunity.opportunity_id);
                            setQuestion(opportunity.worker_question ?? "");
                          }}
                          className="rounded-xl border border-blue-300 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 disabled:opacity-50"
                        >
                          Ask a question{anonymousUnrevealed ? " anonymously" : ""}
                        </button>
                        <button
                          type="button"
                          disabled={busyId === opportunity.opportunity_id}
                          onClick={() => void respond(opportunity, "declined")}
                          className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 disabled:opacity-50"
                        >
                          Decline
                        </button>
                      </div>

                      {questionId === opportunity.opportunity_id ? (
                        <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4">
                          <label className="block text-sm font-semibold text-blue-950">Question for {opportunity.organisation_name}</label>
                          <textarea
                            className="input mt-2 min-h-24"
                            value={question}
                            onChange={(event) => setQuestion(event.target.value)}
                            placeholder="Ask a factual question about the opportunity…"
                          />
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={busyId === opportunity.opportunity_id || !question.trim()}
                              onClick={() => void respond(opportunity, "question")}
                              className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                            >
                              Send question
                            </button>
                            <button type="button" onClick={() => { setQuestionId(null); setQuestion(""); }} className="rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700">Cancel</button>
                          </div>
                          {anonymousUnrevealed ? <div className="mt-2 text-xs text-blue-700">Your identity stays hidden when you send this question.</div> : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-300 p-8 text-center">
            <div className="font-semibold text-slate-900">No opportunities yet</div>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
              When an employer sends you a structured opportunity from an Open Demand you match, it will appear here.
            </p>
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
