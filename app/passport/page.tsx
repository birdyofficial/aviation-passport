import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function PassportPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold tracking-wide text-slate-500">
              AVIATION PASSPORT
            </div>
            <h1 className="mt-2 text-4xl font-semibold text-slate-950">
              My Passport
            </h1>
            <p className="mt-2 text-slate-600">
              The application is connected to Supabase Auth. Our next build step
              is the actual worker profile form.
            </p>
          </div>
        </div>

        <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-semibold">V0.1 shell is alive</h2>
          <p className="mt-2 text-slate-600">
            Next: identity, licences, employment and aircraft exposure.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <span className="rounded-full bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700">
              A350 · blue dot = experience
            </span>
            <span className="rounded-full bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700">
              A320 · gold star = verified rating
            </span>
            <span className="rounded-full bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
              Green shield = current verified company authorisation
            </span>
          </div>
        </section>
      </div>
    </main>
  );
}
