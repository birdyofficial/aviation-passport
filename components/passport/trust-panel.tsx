"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { countryLabel } from "@/lib/reference/countries";

type VerificationCase = {
  case_id: string;
  subject_type: string;
  subject_id: string;
  case_status: "pending" | "more_information" | "verified" | "rejected" | "expired";
  subject_label: string;
  subject_details: Record<string, unknown>;
  evidence_path: string | null;
  source_status: string;
  source_verified_at: string | null;
  reviewer_request: string | null;
  worker_note: string | null;
  reviewed_at: string | null;
  updated_at: string;
};

const STATUS_LABELS: Record<VerificationCase["case_status"], string> = {
  pending: "Pending review",
  more_information: "More information needed",
  verified: "Verified",
  rejected: "Rejected",
  expired: "Expired",
};

function statusClasses(status: VerificationCase["case_status"]) {
  if (status === "verified") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "more_information") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "rejected") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "expired") return "border-slate-300 bg-slate-100 text-slate-600";
  return "border-slate-200 bg-slate-100 text-slate-600";
}

function detailLabel(key: string) {
  const labels: Record<string, string> = {
    country_code: "Country",
    status: "Status",
    visa_type: "Visa type",
    expires_on: "Expires",
    licence_system: "Licence system",
    authority: "Issuing authority",
    authority_country_code: "Authority country",
    category_privileges: "Category / privileges",
    licence_number: "Licence number",
    issued_on: "Issued",
    limitations: "Limitations",
    official_designation: "Official designation",
    privilege_category: "Privilege",
    aircraft_family: "Aircraft family",
    aircraft_variant: "Variant",
    engine: "Engine",
    course_name: "Course",
    provider: "Provider",
    completed_on: "Completed",
    competency: "Competency",
    gained_on: "Gained",
    last_used_on: "Last used",
  };
  return labels[key] ?? key.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function detailValue(key: string, value: unknown) {
  if (value == null || value === "") return null;
  if ((key === "country_code" || key === "authority_country_code") && typeof value === "string") {
    return countryLabel(value);
  }
  if (typeof value === "string") return value.replaceAll("_", " ");
  return String(value);
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message || fallback);
  }
  return fallback;
}

export default function TrustPanel({ onActionChanged }: { onActionChanged?: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [cases, setCases] = useState<VerificationCase[]>([]);
  const [isVerifier, setIsVerifier] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [responseCaseId, setResponseCaseId] = useState<string | null>(null);
  const [responseText, setResponseText] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    void loadTrust();
  }, []);

  async function loadTrust() {
    setLoading(true);
    try {
      const [caseResult, verifierResult] = await Promise.all([
        supabase.rpc("get_my_verification_cases"),
        supabase.rpc("is_platform_verifier"),
      ]);
      if (caseResult.error) throw caseResult.error;
      setCases((caseResult.data ?? []) as VerificationCase[]);
      setIsVerifier(Boolean(verifierResult.data));
    } catch (error) {
      setNotice({ type: "error", text: errorMessage(error, "Could not load Trust Centre.") });
    } finally {
      setLoading(false);
    }
  }

  async function respond(caseItem: VerificationCase) {
    if (!responseText.trim()) return;
    setBusyId(caseItem.case_id);
    setNotice(null);
    try {
      const { error } = await supabase.rpc("respond_verification_case", {
        p_case_id: caseItem.case_id,
        p_note: responseText.trim(),
      });
      if (error) throw error;
      setResponseCaseId(null);
      setResponseText("");
      setNotice({ type: "success", text: "Your update has been returned to the verification queue." });
      await loadTrust();
      onActionChanged?.();
    } catch (error) {
      setNotice({ type: "error", text: errorMessage(error, "Could not send verification response.") });
    } finally {
      setBusyId(null);
    }
  }

  const counts = {
    verified: cases.filter((item) => item.case_status === "verified").length,
    pending: cases.filter((item) => item.case_status === "pending").length,
    action: cases.filter((item) => item.case_status === "more_information").length,
    rejected: cases.filter((item) => item.case_status === "rejected" || item.case_status === "expired").length,
  };

  return (
    <div className="mt-6 space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Evidence-backed professional record</div>
            <h2 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Trust</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Documentary facts are reviewed rather than self-awarded. Editing a verified item returns it to Pending automatically.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isVerifier ? <a href="/trust" className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white">Open Verifier Centre</a> : null}
            <button type="button" onClick={() => void loadTrust()} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700">Refresh</button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="Verified" value={counts.verified} />
          <Metric label="Pending" value={counts.pending} />
          <Metric label="Needs your action" value={counts.action} highlight={counts.action > 0} />
          <Metric label="Rejected / expired" value={counts.rejected} />
        </div>

        <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-800">
          Work rights, licences, ratings, training and competencies use documentary verification. Company authorisations, employment and aircraft exposure belong to employer attestation rather than a central verifier.
        </div>
      </section>

      {notice ? (
        <div className={`rounded-2xl border px-4 py-3 text-sm ${notice.type === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          {notice.text}
        </div>
      ) : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
        <h3 className="text-xl font-semibold text-slate-950">Verification record</h3>
        {loading ? (
          <div className="mt-5 text-sm text-slate-500">Loading verification record…</div>
        ) : cases.length ? (
          <div className="mt-5 space-y-4">
            {cases.map((item) => {
              const details = Object.entries(item.subject_details ?? {})
                .map(([key, value]) => [detailLabel(key), detailValue(key, value)] as const)
                .filter(([, value]) => value);

              return (
                <article key={item.case_id} className={`rounded-2xl border p-5 ${item.case_status === "more_information" ? "border-amber-300 bg-amber-50/40" : "border-slate-200"}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="font-semibold text-slate-950">{item.subject_label}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.1em] text-slate-400">{item.subject_type.replaceAll("_", " ")}</div>
                    </div>
                    <span className={`self-start rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses(item.case_status)}`}>{STATUS_LABELS[item.case_status]}</span>
                  </div>

                  {details.length ? (
                    <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {details.map(([label, value]) => (
                        <div key={label} className="rounded-xl bg-slate-50 px-3 py-2.5">
                          <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">{label}</div>
                          <div className="mt-1 text-sm text-slate-800">{value}</div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-4 text-xs text-slate-500">
                    {item.evidence_path ? "Evidence attached in private credential vault." : "No evidence document attached."}
                  </div>

                  {item.reviewer_request ? (
                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                      <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-amber-600">Verifier request</div>
                      <div className="mt-1 text-sm text-amber-950">{item.reviewer_request}</div>
                      {item.worker_note ? <div className="mt-3 rounded-lg bg-white px-3 py-2 text-sm text-slate-700"><strong>Your latest response:</strong> {item.worker_note}</div> : null}
                    </div>
                  ) : null}

                  {item.case_status === "more_information" ? (
                    responseCaseId === item.case_id ? (
                      <div className="mt-4">
                        <textarea className="input min-h-24" value={responseText} onChange={(e) => setResponseText(e.target.value)} placeholder="Explain what you updated or provide the requested information…" />
                        <div className="mt-2 flex gap-2">
                          <button type="button" disabled={busyId === item.case_id || !responseText.trim()} onClick={() => void respond(item)} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Send update</button>
                          <button type="button" onClick={() => { setResponseCaseId(null); setResponseText(""); }} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button>
                        </div>
                        <div className="mt-2 text-xs text-slate-500">If the verifier asked for a new document, update the relevant Passport record first, then return here and send your note.</div>
                      </div>
                    ) : (
                      <button type="button" onClick={() => { setResponseCaseId(item.case_id); setResponseText(""); }} className="mt-4 rounded-xl bg-amber-800 px-4 py-2 text-sm font-semibold text-white">Respond to verifier</button>
                    )
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            Add documentary credentials to your Passport and their verification record will appear here.
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${highlight ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${highlight ? "text-amber-900" : "text-slate-950"}`}>{value}</div>
    </div>
  );
}
