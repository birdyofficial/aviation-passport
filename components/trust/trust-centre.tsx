"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { countryLabel } from "@/lib/reference/countries";

type QueueItem = {
  case_id: string;
  worker_id: string;
  worker_name: string;
  subject_type: string;
  subject_id: string;
  case_status: "pending" | "more_information";
  subject_label: string;
  subject_details: Record<string, unknown>;
  evidence_path: string | null;
  source_status: string;
  reviewer_request: string | null;
  worker_note: string | null;
  created_at: string;
  updated_at: string;
};

function detailLabel(key: string) {
  return key.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function detailValue(key: string, value: unknown) {
  if (value == null || value === "") return null;
  if ((key === "country_code" || key === "authority_country_code") && typeof value === "string") return countryLabel(value);
  if (typeof value === "string") return value.replaceAll("_", " ");
  return String(value);
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String((error as { message?: unknown }).message || fallback);
  return fallback;
}

export default function TrustCentre() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [authorised, setAuthorised] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [noteByCase, setNoteByCase] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => { void loadQueue(); }, []);

  async function loadQueue() {
    setLoading(true);
    try {
      const verifier = await supabase.rpc("is_platform_verifier");
      if (verifier.error) throw verifier.error;
      setAuthorised(Boolean(verifier.data));
      if (!verifier.data) return;

      const { data, error } = await supabase.rpc("get_verification_queue");
      if (error) throw error;
      setQueue((data ?? []) as QueueItem[]);
    } catch (error) {
      setNotice({ type: "error", text: errorMessage(error, "Could not load verification queue.") });
    } finally {
      setLoading(false);
    }
  }

  async function review(item: QueueItem, action: "verify" | "request_information" | "reject") {
    const note = (noteByCase[item.case_id] ?? "").trim();
    if (action === "request_information" && !note) {
      setNotice({ type: "error", text: "Explain what information the worker needs to provide." });
      return;
    }

    setBusyId(item.case_id);
    setNotice(null);
    try {
      const { error } = await supabase.rpc("review_verification_case", {
        p_case_id: item.case_id,
        p_action: action,
        p_note: note || null,
      });
      if (error) throw error;
      setNoteByCase((current) => ({ ...current, [item.case_id]: "" }));
      setNotice({
        type: "success",
        text: action === "verify" ? "Credential verified." : action === "reject" ? "Credential rejected." : "More information requested.",
      });
      await loadQueue();
    } catch (error) {
      setNotice({ type: "error", text: errorMessage(error, "Could not review verification case.") });
    } finally {
      setBusyId(null);
    }
  }

  async function openEvidence(item: QueueItem) {
    if (!item.evidence_path) return;
    setBusyId(item.case_id);
    try {
      const { data, error } = await supabase.storage.from("credential-evidence").createSignedUrl(item.evidence_path, 600);
      if (error) throw error;
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      setNotice({ type: "error", text: errorMessage(error, "Could not open evidence.") });
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <div className="rounded-3xl border border-slate-200 bg-white p-8 text-slate-600">Loading Verification & Trust Centre…</div>;
  }

  if (!authorised) {
    return (
      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-8">
        <h1 className="text-2xl font-semibold text-amber-950">Verifier access required</h1>
        <p className="mt-2 text-sm text-amber-800">This workspace is restricted to Aviation Passport platform verifiers.</p>
        <a href="/passport" className="mt-5 inline-flex rounded-xl bg-amber-950 px-4 py-2 text-sm font-semibold text-white">Back to Passport</a>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs font-bold tracking-[0.22em] text-slate-500">AVIATION PASSPORT</div>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">Verification & Trust Centre</h1>
          <p className="mt-2 max-w-3xl text-slate-600">Review documentary facts without letting workers self-award trust signals.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/passport" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700">My Passport</a>
          <a href="/employer" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700">Employer Portal</a>
          <button type="button" onClick={() => void loadQueue()} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white">Refresh queue</button>
        </div>
      </div>

      {notice ? (
        <div className={`mt-6 rounded-2xl border px-4 py-3 text-sm ${notice.type === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{notice.text}</div>
      ) : null}

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Metric label="Active queue" value={queue.length} />
        <Metric label="Pending review" value={queue.filter((item) => item.case_status === "pending").length} />
        <Metric label="Waiting for worker" value={queue.filter((item) => item.case_status === "more_information").length} />
      </div>

      <div className="mt-6 space-y-5">
        {queue.length ? queue.map((item) => {
          const details = Object.entries(item.subject_details ?? {})
            .map(([key, value]) => [detailLabel(key), detailValue(key, value)] as const)
            .filter(([, value]) => value);

          return (
            <article key={item.case_id} className={`rounded-3xl border bg-white p-6 shadow-sm ${item.case_status === "more_information" ? "border-amber-300" : "border-slate-200"}`}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">{item.subject_type.replaceAll("_", " ")}</div>
                  <h2 className="mt-1 text-xl font-semibold text-slate-950">{item.subject_label}</h2>
                  <div className="mt-1 text-sm text-slate-600">{item.worker_name}</div>
                </div>
                <span className={`self-start rounded-full border px-2.5 py-1 text-xs font-semibold ${item.case_status === "more_information" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-blue-200 bg-blue-50 text-blue-700"}`}>
                  {item.case_status === "more_information" ? "Waiting for worker" : "Pending review"}
                </span>
              </div>

              {details.length ? (
                <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {details.map(([label, value]) => (
                    <div key={label} className="rounded-xl bg-slate-50 px-3 py-2.5">
                      <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">{label}</div>
                      <div className="mt-1 text-sm text-slate-800">{value}</div>
                    </div>
                  ))}
                </div>
              ) : null}

              {item.reviewer_request ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                  <strong>Previous request:</strong> {item.reviewer_request}
                </div>
              ) : null}
              {item.worker_note ? (
                <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-950">
                  <strong>Worker response:</strong> {item.worker_note}
                </div>
              ) : null}

              <div className="mt-5 flex flex-wrap gap-2">
                {item.evidence_path ? (
                  <button type="button" disabled={busyId === item.case_id} onClick={() => void openEvidence(item)} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700">Open evidence</button>
                ) : <span className="rounded-xl bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800">No evidence attached</span>}
              </div>

              <div className="mt-5">
                <label className="text-sm font-semibold text-slate-800">Reviewer note / information request</label>
                <textarea className="input mt-2 min-h-20" value={noteByCase[item.case_id] ?? ""} onChange={(e) => setNoteByCase((current) => ({ ...current, [item.case_id]: e.target.value }))} placeholder="Required for Request information; optional for Verify / Reject…" />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" disabled={busyId === item.case_id} onClick={() => void review(item, "verify")} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Verify</button>
                  <button type="button" disabled={busyId === item.case_id} onClick={() => void review(item, "request_information")} className="rounded-xl bg-amber-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Request information</button>
                  <button type="button" disabled={busyId === item.case_id} onClick={() => void review(item, "reject")} className="rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50">Reject</button>
                </div>
              </div>
            </article>
          );
        }) : (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <div className="text-lg font-semibold text-slate-900">Verification queue is clear</div>
            <div className="mt-2 text-sm text-slate-500">New or edited documentary credentials will appear here automatically.</div>
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-3xl font-semibold text-slate-950">{value}</div></div>;
}
