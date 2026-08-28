"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { countryLabel } from "@/lib/reference/countries";

type MarketStatus = "not_open" | "selected_opportunities" | "actively_looking" | "contract_only";
type MoneyPeriod = "hour" | "day" | "week" | "month" | "year" | "one_off";
type OpportunityStatus = "sent" | "viewed" | "interested" | "question" | "declined" | "interview" | "offer" | "accepted" | "withdrawn" | "closed";
type FactStatus = "neutral" | "ok" | "check" | "gap";

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
  work_right_state: "verified" | "pending" | "sponsorship" | "not_required" | "unconfirmed" | string;
  work_right_compatible: boolean;

  location_label: string;
  location_compatible: boolean;

  availability_label: string;
  availability_compatible: boolean | null;
  available_from: string | null;
  expected_start_date: string | null;
  earliest_start_date: string | null;
  notice_value: number | null;
  notice_unit: string | null;

  compensation_label: string;
  compensation_compatible: boolean | null;
  visible_minimum_compensation: number | null;
  visible_minimum_currency: string | null;
  visible_minimum_period: MoneyPeriod | null;

  opportunity_id: string | null;
  opportunity_status: OpportunityStatus | null;
  opportunity_sent_at: string | null;
  identity_revealed: boolean;
  worker_question: string | null;
  employer_reply: string | null;

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

const OPPORTUNITY_LABELS: Record<OpportunityStatus, string> = {
  sent: "Opportunity sent",
  viewed: "Viewed by worker",
  interested: "Interested",
  question: "Question received",
  declined: "Declined",
  interview: "Interview",
  offer: "Offer",
  accepted: "Accepted",
  withdrawn: "Withdrawn",
  closed: "Closed",
};

function matchClasses(label: string) {
  if (label === "Exact Match") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (label === "Strong Match") return "border-blue-200 bg-blue-50 text-blue-700";
  if (label === "Trainable Match") return "border-violet-200 bg-violet-50 text-violet-700";
  if (label === "Mobility Match") return "border-amber-200 bg-amber-50 text-amber-700";
  if (label === "Location Check" || label === "Availability Check") return "border-amber-200 bg-amber-50 text-amber-700";
  if (label === "Compensation Gap") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function opportunityClasses(status: OpportunityStatus) {
  if (status === "interested" || status === "accepted") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "question" || status === "viewed") return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "declined" || status === "withdrawn" || status === "closed") return "border-slate-200 bg-slate-100 text-slate-600";
  if (status === "offer" || status === "interview") return "border-violet-200 bg-violet-50 text-violet-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function formatAvailability(match: TalentMatch) {
  if (match.available_from) {
    return match.expected_start_date
      ? `${match.availability_label} · From ${formatDate(match.available_from)}`
      : `From ${formatDate(match.available_from)}`;
  }
  if (match.earliest_start_date) return `From ${formatDate(match.earliest_start_date)}`;
  if (match.notice_value != null && match.notice_unit) {
    const unit = match.notice_value === 1 ? match.notice_unit.replace(/s$/, "") : match.notice_unit;
    return `${match.notice_value} ${unit} notice`;
  }
  return match.availability_label || "Not specified";
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

function workRightStatus(match: TalentMatch): FactStatus {
  if (!match.work_right_compatible || match.work_right_state === "unconfirmed") return "gap";
  if (match.work_right_state === "verified") return "ok";
  if (match.work_right_state === "pending" || match.work_right_state === "sponsorship") return "check";
  return "neutral";
}

function availabilityStatus(match: TalentMatch): FactStatus {
  if (match.availability_compatible === true) return "ok";
  if (match.availability_compatible === false) return "check";
  return "neutral";
}

export default function TalentMatches({ demandId, demandStatus }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(false);
  const [sendingRef, setSendingRef] = useState<string | null>(null);
  const [replyingRef, setReplyingRef] = useState<string | null>(null);
  const [replyRef, setReplyRef] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [matches, setMatches] = useState<TalentMatch[]>([]);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

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
      setNotice({ type: "error", text: message });
    } finally {
      setLoading(false);
    }
  }

  async function sendOpportunity(match: TalentMatch) {
    setSendingRef(match.match_ref);
    setNotice(null);
    try {
      const { error } = await supabase.rpc("send_demand_opportunity", {
        p_demand_id: demandId,
        p_match_ref: match.match_ref,
      });
      if (error) throw error;
      setNotice({
        type: "success",
        text: match.is_anonymous
          ? "Opportunity sent through Aviation Passport. The worker remains anonymous until they choose to reveal their Passport."
          : "Opportunity sent.",
      });
      await loadMatches();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : error && typeof error === "object" && "message" in error
            ? String((error as { message?: unknown }).message || "Could not send opportunity.")
            : "Could not send opportunity.";
      setNotice({ type: "error", text: message });
    } finally {
      setSendingRef(null);
    }
  }

  async function replyToQuestion(match: TalentMatch) {
    if (!replyText.trim()) return;
    setReplyingRef(match.match_ref);
    setNotice(null);
    try {
      const { error } = await supabase.rpc("reply_to_opportunity_question", {
        p_demand_id: demandId,
        p_match_ref: match.match_ref,
        p_reply: replyText.trim(),
      });
      if (error) throw error;
      setNotice({ type: "success", text: "Reply sent through Aviation Passport." });
      setReplyRef(null);
      setReplyText("");
      await loadMatches();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : error && typeof error === "object" && "message" in error
            ? String((error as { message?: unknown }).message || "Could not send reply.")
            : "Could not send reply.";
      setNotice({ type: "error", text: message });
    } finally {
      setReplyingRef(null);
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

  const readyNow = matches.filter((item) =>
    item.work_right_compatible
    && item.location_compatible
    && item.availability_compatible !== false
    && item.compensation_compatible !== false
  ).length;

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Demand-bound talent access</div>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Talent Matches</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Review compatibility, then send the declared Open Demand as a structured opportunity. There is no generic recruiter message.
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
        <Metric label="Compatible now" value={String(readyNow)} />
      </div>

      <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-800">
        Public profiles appear by name. Anonymous Market profiles can receive this opportunity without revealing identity; the worker controls whether an Interested response reveals their Passport.
      </div>

      {notice ? (
        <div className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${notice.type === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          {notice.text}
        </div>
      ) : null}

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
                      {match.opportunity_status ? <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${opportunityClasses(match.opportunity_status)}`}>{OPPORTUNITY_LABELS[match.opportunity_status]}</span> : null}
                    </div>
                    <div className="mt-1 text-sm text-slate-700">{match.is_anonymous ? "Demand-compatible aviation professional" : match.professional_headline || "Aviation professional"}</div>
                    <div className="mt-1 text-xs text-slate-500">{location || "Location not listed"} · {MARKET_LABELS[match.market_status]}</div>
                    {match.is_anonymous ? <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800">This worker is participating anonymously. Sending the opportunity does not reveal their identity.</div> : null}
                  </div>

                  <div className="shrink-0">
                    {!match.opportunity_status ? (
                      <button
                        type="button"
                        disabled={sendingRef === match.match_ref}
                        onClick={() => void sendOpportunity(match)}
                        className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        {sendingRef === match.match_ref ? "Sending…" : "Send opportunity"}
                      </button>
                    ) : (
                      <div className={`rounded-xl border px-4 py-2.5 text-sm font-semibold ${opportunityClasses(match.opportunity_status)}`}>
                        {OPPORTUNITY_LABELS[match.opportunity_status]}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <Fact label="Work rights" value={match.work_right_label} status={workRightStatus(match)} />
                  <Fact label="Location" value={match.location_label} status={match.location_compatible ? "ok" : "check"} />
                  <Fact label="Availability" value={formatAvailability(match)} status={availabilityStatus(match)} />
                  <Fact label="Compensation" value={visibleMinimum ? `${match.compensation_label} · ${visibleMinimum}` : match.compensation_label} status={match.compensation_compatible === false ? "gap" : match.compensation_compatible === true ? "ok" : "check"} />
                </div>

                {match.opportunity_status === "question" && match.worker_question ? (
                  <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
                    <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-blue-500">Worker question</div>
                    <div className="mt-1 text-sm text-blue-950">{match.worker_question}</div>
                    {match.is_anonymous ? <div className="mt-2 text-xs text-blue-700">Identity remains protected while the worker asks this question.</div> : null}

                    {match.employer_reply ? (
                      <div className="mt-3 rounded-lg border border-blue-100 bg-white px-3 py-2">
                        <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-blue-400">Your reply</div>
                        <div className="mt-1 text-sm text-slate-800">{match.employer_reply}</div>
                      </div>
                    ) : (
                      <div className="mt-3">
                        {replyRef === match.match_ref ? (
                          <div>
                            <textarea className="input min-h-20" value={replyText} onChange={(event) => setReplyText(event.target.value)} placeholder="Answer the worker's question…" />
                            <div className="mt-2 flex gap-2">
                              <button type="button" disabled={replyingRef === match.match_ref || !replyText.trim()} onClick={() => void replyToQuestion(match)} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{replyingRef === match.match_ref ? "Sending…" : "Send reply"}</button>
                              <button type="button" onClick={() => { setReplyRef(null); setReplyText(""); }} className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <button type="button" onClick={() => { setReplyRef(match.match_ref); setReplyText(""); }} className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700">Reply to question</button>
                        )}
                      </div>
                    )}
                  </div>
                ) : null}

                {match.opportunity_status === "interested" && match.identity_revealed ? (
                  <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
                    The worker is interested and has released their identity and employer-visible profile for this opportunity.
                  </div>
                ) : null}

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
            A worker must be receptive and meet every Mandatory requirement. Public and Anonymous Market profiles can appear here; Private profiles cannot.
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

function Fact({ label, value, status = "neutral" }: { label: string; value: string; status?: FactStatus }) {
  const classes = status === "ok"
    ? "bg-emerald-50 text-emerald-800"
    : status === "gap"
      ? "bg-rose-50 text-rose-800"
      : status === "check"
        ? "bg-amber-50 text-amber-800"
        : "bg-slate-50 text-slate-700";
  return (
    <div className={`rounded-xl px-3 py-3 ${classes}`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] opacity-60">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}
