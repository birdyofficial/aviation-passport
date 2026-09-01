"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type InterviewOption = { id: string; starts_at: string; sort_order: number };
type InterviewRound = {
  interview_id: string;
  opportunity_id: string;
  round_number: number;
  title: string;
  interview_status: "proposed" | "counter_proposed" | "confirmed" | "completed" | "cancelled";
  timezone_name: string;
  channel: string;
  connection_details: string | null;
  duration_minutes: number;
  selected_start_at: string | null;
  counter_start_at: string | null;
  counter_timezone_name: string | null;
  outcome_note: string | null;
  confirmed_at: string | null;
  completed_at: string | null;
  options: InterviewOption[];
};

const CHANNEL_LABELS: Record<string, string> = {
  in_person: "In person",
  microsoft_teams: "Microsoft Teams",
  zoom: "Zoom",
  google_meet: "Google Meet",
  webex: "Webex",
  discord: "Discord",
  phone: "Phone",
  other: "Other",
};

function localZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function formatInZone(value: string | null, timeZone: string) {
  if (!value) return "Not scheduled";
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone,
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String((error as { message?: unknown }).message || fallback);
  return fallback;
}

export default function WorkerInterviewRounds({
  opportunityId,
  onActionChanged,
}: {
  opportunityId: string;
  onActionChanged?: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [rounds, setRounds] = useState<InterviewRound[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [counterId, setCounterId] = useState<string | null>(null);
  const [counterValue, setCounterValue] = useState("");
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const candidateZone = localZone();

  useEffect(() => { void loadRounds(); }, [opportunityId]);

  async function loadRounds() {
    try {
      const { data, error } = await supabase.rpc("get_my_interview_rounds");
      if (error) throw error;
      setRounds(((data ?? []) as InterviewRound[])
        .filter((item) => item.opportunity_id === opportunityId)
        .map((item) => ({ ...item, options: Array.isArray(item.options) ? item.options : [] })));
    } catch (error) {
      setNotice({ type: "error", text: errorMessage(error, "Could not load interview schedule.") });
    }
  }

  async function acceptOption(round: InterviewRound, option: InterviewOption) {
    setBusyId(round.interview_id);
    setNotice(null);
    try {
      const { error } = await supabase.rpc("respond_to_interview_round", {
        p_interview_id: round.interview_id,
        p_action: "accept",
        p_option_id: option.id,
        p_counter_start: null,
        p_counter_timezone_name: null,
      });
      if (error) throw error;
      setNotice({ type: "success", text: `${round.title} confirmed.` });
      await loadRounds();
      onActionChanged?.();
    } catch (error) {
      setNotice({ type: "error", text: errorMessage(error, "Could not confirm interview time.") });
    } finally {
      setBusyId(null);
    }
  }

  async function counter(round: InterviewRound) {
    if (!counterValue) return;
    const candidateDate = new Date(counterValue);
    if (Number.isNaN(candidateDate.getTime())) {
      setNotice({ type: "error", text: "Enter a valid counter-proposed time." });
      return;
    }

    setBusyId(round.interview_id);
    setNotice(null);
    try {
      const { error } = await supabase.rpc("respond_to_interview_round", {
        p_interview_id: round.interview_id,
        p_action: "counter",
        p_option_id: null,
        p_counter_start: candidateDate.toISOString(),
        p_counter_timezone_name: candidateZone,
      });
      if (error) throw error;
      setCounterId(null);
      setCounterValue("");
      setNotice({ type: "success", text: "Your counter-proposed interview time was sent to HR." });
      await loadRounds();
      onActionChanged?.();
    } catch (error) {
      setNotice({ type: "error", text: errorMessage(error, "Could not send counter-proposal.") });
    } finally {
      setBusyId(null);
    }
  }

  async function cancelRound(round: InterviewRound) {
    if (!window.confirm(`Cancel ${round.title}? HR will be notified that a new interview time needs to be scheduled.`)) return;

    setBusyId(round.interview_id);
    setNotice(null);
    try {
      const { error } = await supabase.rpc("cancel_interview_round", {
        p_interview_id: round.interview_id,
      });
      if (error) throw error;
      setNotice({ type: "success", text: `${round.title} cancelled. HR can now send a new set of interview times.` });
      await loadRounds();
      onActionChanged?.();
    } catch (error) {
      setNotice({ type: "error", text: errorMessage(error, "Could not cancel interview.") });
    } finally {
      setBusyId(null);
    }
  }

  if (!rounds.length) return null;

  return (
    <div className="mt-5 rounded-2xl border border-violet-100 bg-violet-50/40 p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-violet-500">Interviewing</div>
      <div className="mt-1 text-sm text-violet-900">Each interview round keeps its own schedule and joining details.</div>

      {notice ? <div className={`mt-3 rounded-xl border px-3 py-2 text-sm ${notice.type === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{notice.text}</div> : null}

      <div className="mt-4 space-y-3">
        {rounds.map((round) => (
          <div key={round.interview_id} className="rounded-xl border border-violet-100 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-slate-950">{round.title}</div>
                <div className="mt-1 text-xs text-slate-500">Round {round.round_number} · {CHANNEL_LABELS[round.channel] ?? round.channel} · {round.duration_minutes} min</div>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                round.interview_status === "completed" ? "bg-emerald-50 text-emerald-700" :
                round.interview_status === "confirmed" ? "bg-blue-50 text-blue-700" :
                round.interview_status === "counter_proposed" ? "bg-amber-50 text-amber-800" :
                round.interview_status === "cancelled" ? "bg-slate-100 text-slate-500" :
                "bg-violet-50 text-violet-700"
              }`}>
                {round.interview_status.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
              </span>
            </div>

            {round.interview_status === "proposed" ? (
              <div className="mt-4">
                <div className="text-sm font-semibold text-slate-800">Choose one of HR's three options</div>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  {round.options.map((option) => (
                    <button key={option.id} type="button" disabled={busyId === round.interview_id} onClick={() => void acceptOption(round, option)} className="rounded-xl border border-violet-200 bg-white p-3 text-left hover:bg-violet-50 disabled:opacity-50">
                      <div className="text-sm font-semibold text-slate-900">{formatInZone(option.starts_at, round.timezone_name)}</div>
                      {candidateZone !== round.timezone_name ? <div className="mt-2 text-xs font-medium text-blue-700">Your local time: {formatInZone(option.starts_at, candidateZone)}</div> : null}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => { setCounterId(round.interview_id); setCounterValue(""); }} className="mt-3 rounded-xl border border-amber-200 bg-white px-4 py-2 text-sm font-semibold text-amber-800">None fit — propose another time</button>
              </div>
            ) : null}

            {counterId === round.interview_id && round.interview_status === "proposed" ? (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <label className="text-sm font-semibold text-amber-950">Your counter-proposal · {candidateZone}</label>
                <input type="datetime-local" className="input mt-2" value={counterValue} onChange={(e) => setCounterValue(e.target.value)} />
                <div className="mt-3 flex gap-2">
                  <button type="button" disabled={busyId === round.interview_id || !counterValue} onClick={() => void counter(round)} className="rounded-lg bg-amber-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Send counter</button>
                  <button type="button" onClick={() => { setCounterId(null); setCounterValue(""); }} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-800">Cancel</button>
                </div>
              </div>
            ) : null}

            {round.interview_status === "counter_proposed" && round.counter_start_at ? (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                Counter-proposal sent: <strong>{formatInZone(round.counter_start_at, candidateZone)}</strong>. Waiting for HR to accept it or send three new options.
              </div>
            ) : null}

            {round.interview_status === "confirmed" && round.selected_start_at ? (
              <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
                <div className="text-xs font-bold uppercase tracking-[0.1em] text-blue-500">Interview confirmed</div>
                <div className="mt-1 text-lg font-semibold text-blue-950">{formatInZone(round.selected_start_at, round.timezone_name)}</div>
                {candidateZone !== round.timezone_name ? <div className="mt-1 text-sm font-semibold text-blue-800">Your local time: {formatInZone(round.selected_start_at, candidateZone)}</div> : null}
                <div className="mt-3 text-sm text-blue-900"><strong>{CHANNEL_LABELS[round.channel] ?? round.channel}</strong>{round.connection_details ? ` · ${round.connection_details}` : ""}</div>
                <div className="mt-4 border-t border-blue-200 pt-3">
                  <button
                    type="button"
                    disabled={busyId === round.interview_id}
                    onClick={() => void cancelRound(round)}
                    className="rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50"
                  >
                    Cancel interview
                  </button>
                  <div className="mt-2 text-xs leading-5 text-blue-700">
                    If you can no longer attend, cancelling keeps the interview history and returns scheduling to HR so they can send three new options.
                  </div>
                </div>
              </div>
            ) : null}

            {round.interview_status === "completed" ? (
              <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-900">
                Completed{round.selected_start_at ? ` · ${formatInZone(round.selected_start_at, candidateZone)}` : ""}.
              </div>
            ) : null}

            {round.interview_status === "cancelled" ? <div className="mt-3 text-sm text-slate-500">This interview was cancelled. HR can schedule and send a new set of interview options.</div> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
