"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type InterviewOption = {
  id: string;
  starts_at: string;
  sort_order: number;
};

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

const COMMON_TIMEZONES = [
  "Australia/Brisbane",
  "Australia/Sydney",
  "Australia/Perth",
  "Asia/Hong_Kong",
  "Asia/Singapore",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Europe/Berlin",
  "Europe/London",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Pacific/Auckland",
];

function browserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function localWallTimeToIso(value: string, timeZone: string) {
  if (!value) throw new Error("Enter all three interview options.");
  const [datePart, timePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let guess = desired;

  for (let i = 0; i < 4; i += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(guess));

    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const represented = Date.UTC(
      Number(map.year),
      Number(map.month) - 1,
      Number(map.day),
      Number(map.hour),
      Number(map.minute),
      Number(map.second),
    );
    const diff = desired - represented;
    guess += diff;
    if (Math.abs(diff) < 1000) break;
  }

  return new Date(guess).toISOString();
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

export default function EmployerInterviewManager({
  opportunityId,
  pipelineStage,
  onActionChanged,
  onCreateOffer,
}: {
  opportunityId: string;
  pipelineStage: string;
  onActionChanged?: () => void;
  onCreateOffer?: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [rounds, setRounds] = useState<InterviewRound[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [formMode, setFormMode] = useState<"new" | "repropose" | null>(null);
  const [editingInterviewId, setEditingInterviewId] = useState<string | null>(null);
  const [outcomeNotes, setOutcomeNotes] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    title: "",
    timezone_name: browserTimeZone(),
    channel: "microsoft_teams",
    connection_details: "",
    duration_minutes: "60",
    options: ["", "", ""] as [string, string, string],
  });

  useEffect(() => {
    void loadRounds();
  }, [opportunityId]);

  async function loadRounds() {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_interview_rounds_for_opportunity", {
        p_opportunity_id: opportunityId,
      });
      if (error) throw error;
      setRounds((data ?? []).map((item: InterviewRound) => ({
        ...item,
        options: Array.isArray(item.options) ? item.options : [],
      })));
    } catch (error) {
      setNotice({ type: "error", text: errorMessage(error, "Could not load interview rounds.") });
    } finally {
      setLoading(false);
    }
  }

  function openNewRound() {
    setEditingInterviewId(null);
    setFormMode("new");
    setForm({
      title: `Interview ${rounds.length + 1}`,
      timezone_name: browserTimeZone(),
      channel: "microsoft_teams",
      connection_details: "",
      duration_minutes: "60",
      options: ["", "", ""],
    });
  }

  function openReproposal(round: InterviewRound) {
    setEditingInterviewId(round.interview_id);
    setFormMode("repropose");
    setForm({
      title: round.title,
      timezone_name: round.timezone_name,
      channel: round.channel,
      connection_details: round.connection_details ?? "",
      duration_minutes: String(round.duration_minutes || 60),
      options: ["", "", ""],
    });
  }

  async function submitProposal() {
    let starts: string[];
    try {
      starts = form.options.map((value) => localWallTimeToIso(value, form.timezone_name));
    } catch (error) {
      setNotice({ type: "error", text: errorMessage(error, "Check the interview times and timezone.") });
      return;
    }

    setBusyId(editingInterviewId ?? opportunityId);
    setNotice(null);
    try {
      if (formMode === "new") {
        const { error } = await supabase.rpc("schedule_interview_round", {
          p_opportunity_id: opportunityId,
          p_title: form.title.trim() || `Interview ${rounds.length + 1}`,
          p_timezone_name: form.timezone_name.trim(),
          p_channel: form.channel,
          p_connection_details: form.connection_details.trim() || null,
          p_duration_minutes: Number(form.duration_minutes) || 60,
          p_option_starts: starts,
        });
        if (error) throw error;
        setNotice({ type: "success", text: "Three interview options sent to the candidate." });
      } else if (editingInterviewId) {
        const { error } = await supabase.rpc("repropose_interview_round", {
          p_interview_id: editingInterviewId,
          p_timezone_name: form.timezone_name.trim(),
          p_channel: form.channel,
          p_connection_details: form.connection_details.trim() || null,
          p_duration_minutes: Number(form.duration_minutes) || 60,
          p_option_starts: starts,
        });
        if (error) throw error;
        setNotice({ type: "success", text: "Three new interview options sent." });
      }

      setFormMode(null);
      setEditingInterviewId(null);
      await loadRounds();
      onActionChanged?.();
    } catch (error) {
      setNotice({ type: "error", text: errorMessage(error, "Could not send interview options.") });
    } finally {
      setBusyId(null);
    }
  }

  async function acceptCounter(round: InterviewRound) {
    setBusyId(round.interview_id);
    setNotice(null);
    try {
      const { error } = await supabase.rpc("accept_interview_counter", {
        p_interview_id: round.interview_id,
      });
      if (error) throw error;
      setNotice({ type: "success", text: "Candidate's counter-proposed interview time confirmed." });
      await loadRounds();
      onActionChanged?.();
    } catch (error) {
      setNotice({ type: "error", text: errorMessage(error, "Could not accept interview counter-proposal.") });
    } finally {
      setBusyId(null);
    }
  }

  async function completeRound(round: InterviewRound) {
    setBusyId(round.interview_id);
    setNotice(null);
    try {
      const { error } = await supabase.rpc("complete_interview_round", {
        p_interview_id: round.interview_id,
        p_outcome_note: (outcomeNotes[round.interview_id] ?? "").trim() || null,
      });
      if (error) throw error;
      setNotice({ type: "success", text: `${round.title} marked completed.` });
      await loadRounds();
      onActionChanged?.();
    } catch (error) {
      setNotice({ type: "error", text: errorMessage(error, "Could not complete interview round.") });
    } finally {
      setBusyId(null);
    }
  }

  async function cancelRound(round: InterviewRound) {
    setBusyId(round.interview_id);
    setNotice(null);
    try {
      const { error } = await supabase.rpc("cancel_interview_round", {
        p_interview_id: round.interview_id,
      });
      if (error) throw error;
      setNotice({ type: "success", text: `${round.title} cancelled.` });
      await loadRounds();
      onActionChanged?.();
    } catch (error) {
      setNotice({ type: "error", text: errorMessage(error, "Could not cancel interview round.") });
    } finally {
      setBusyId(null);
    }
  }

  const activeRound = rounds.find((round) => !["completed", "cancelled"].includes(round.interview_status));
  const completedRounds = rounds.filter((round) => round.interview_status === "completed");
  const canSchedule = pipelineStage === "interested" || (pipelineStage === "interview" && !activeRound && completedRounds.length === 0);

  return (
    <div className="mt-5 rounded-2xl border border-violet-100 bg-violet-50/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-violet-500">Interviewing</div>
          <div className="mt-1 text-sm text-violet-900">
            HR proposes three times. The candidate can accept one or counter-propose another time.
          </div>
        </div>
        {canSchedule && !formMode ? (
          <button type="button" onClick={openNewRound} className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white">
            {rounds.length ? "Schedule another interview" : "Schedule interview"}
          </button>
        ) : null}
      </div>

      {notice ? (
        <div className={`mt-4 rounded-xl border px-3 py-2 text-sm ${notice.type === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{notice.text}</div>
      ) : null}

      {loading ? <div className="mt-4 text-sm text-slate-500">Loading interview rounds…</div> : null}

      {rounds.length ? (
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
                <div className="mt-3">
                  <div className="text-xs font-semibold text-slate-600">Waiting for candidate to choose:</div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    {round.options.map((option) => (
                      <div key={option.id} className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">{formatInZone(option.starts_at, round.timezone_name)}</div>
                    ))}
                  </div>
                </div>
              ) : null}

              {round.interview_status === "counter_proposed" && round.counter_start_at ? (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <div className="text-xs font-bold uppercase tracking-[0.1em] text-amber-600">Candidate counter-proposal</div>
                  <div className="mt-1 font-semibold text-amber-950">{formatInZone(round.counter_start_at, round.timezone_name)}</div>
                  {round.counter_timezone_name && round.counter_timezone_name !== round.timezone_name ? (
                    <div className="mt-1 text-xs text-amber-800">Candidate timezone: {formatInZone(round.counter_start_at, round.counter_timezone_name)}</div>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" disabled={busyId === round.interview_id} onClick={() => void acceptCounter(round)} className="rounded-lg bg-amber-800 px-3 py-2 text-xs font-semibold text-white">Accept counter</button>
                    <button type="button" onClick={() => openReproposal(round)} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-800">Send 3 new options</button>
                  </div>
                </div>
              ) : null}

              {round.interview_status === "confirmed" && round.selected_start_at ? (
                <div className="mt-3">
                  <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
                    <div className="text-xs font-bold uppercase tracking-[0.1em] text-blue-500">Confirmed interview</div>
                    <div className="mt-1 font-semibold text-blue-950">{formatInZone(round.selected_start_at, round.timezone_name)}</div>
                    <div className="mt-1 text-xs text-blue-800">{CHANNEL_LABELS[round.channel] ?? round.channel}{round.connection_details ? ` · ${round.connection_details}` : ""}</div>
                  </div>
                  <div className="mt-3">
                    <textarea className="input min-h-16" value={outcomeNotes[round.interview_id] ?? ""} onChange={(e) => setOutcomeNotes((current) => ({ ...current, [round.interview_id]: e.target.value }))} placeholder="Optional outcome note for the hiring record…" />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" disabled={busyId === round.interview_id} onClick={() => void completeRound(round)} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white">Mark interview completed</button>
                      <button type="button" disabled={busyId === round.interview_id} onClick={() => void cancelRound(round)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600">Cancel round</button>
                    </div>
                  </div>
                </div>
              ) : null}

              {round.interview_status === "completed" ? (
                <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-900">
                  Completed{round.selected_start_at ? ` · ${formatInZone(round.selected_start_at, round.timezone_name)}` : ""}
                  {round.outcome_note ? <div className="mt-2 text-xs text-emerald-800">{round.outcome_note}</div> : null}
                </div>
              ) : null}

              {round.interview_status === "proposed" ? (
                <button type="button" disabled={busyId === round.interview_id} onClick={() => void cancelRound(round)} className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600">Cancel round</button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {formMode ? (
        <div className="mt-4 rounded-xl border border-violet-200 bg-white p-5">
          <div className="text-sm font-semibold text-slate-950">{formMode === "new" ? "Schedule interview round" : "Send three new options"}</div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {formMode === "new" ? (
              <Field label="Round name"><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Technical Interview" /></Field>
            ) : null}
            <Field label="Interview timezone">
              <input list="ap-timezones" className="input" value={form.timezone_name} onChange={(e) => setForm({ ...form, timezone_name: e.target.value })} />
              <datalist id="ap-timezones">{COMMON_TIMEZONES.map((zone) => <option key={zone} value={zone} />)}</datalist>
            </Field>
            <Field label="Channel">
              <select className="input" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
                {Object.entries(CHANNEL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field label="Duration"><select className="input" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option><option value="90">90 minutes</option><option value="120">120 minutes</option></select></Field>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {form.options.map((value, index) => (
              <Field key={index} label={`Option ${index + 1}`}>
                <input type="datetime-local" className="input" value={value} onChange={(e) => setForm({ ...form, options: form.options.map((item, i) => i === index ? e.target.value : item) as [string, string, string] })} />
              </Field>
            ))}
          </div>

          <div className="mt-4">
            <Field label="Connection details" hint="Meeting link, passcode, physical location, phone number or other joining instructions.">
              <textarea className="input min-h-20" value={form.connection_details} onChange={(e) => setForm({ ...form, connection_details: e.target.value })} placeholder="Teams link / passcode / office address / phone details…" />
            </Field>
          </div>

          <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
            Enter the three options in <strong>{form.timezone_name}</strong>. Aviation Passport stores them as absolute times and shows the candidate both the interview timezone and their local equivalent.
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={Boolean(busyId)} onClick={() => void submitProposal()} className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Send 3 options</button>
            <button type="button" onClick={() => { setFormMode(null); setEditingInterviewId(null); }} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button>
          </div>
        </div>
      ) : null}

      {completedRounds.length > 0 && pipelineStage === "interview" && !activeRound && !formMode ? (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-violet-100 pt-4">
          <button type="button" onClick={openNewRound} className="rounded-xl border border-violet-200 bg-white px-4 py-2 text-sm font-semibold text-violet-700">Schedule another interview</button>
          {onCreateOffer ? <button type="button" onClick={onCreateOffer} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white">Create offer</button> : null}
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>{children}{hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}</label>;
}
