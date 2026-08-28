import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen">
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-20">
        <div className="mb-6 inline-flex w-fit rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600">
          Aviation Passport · V0.10
        </div>

        <h1 className="max-w-4xl text-5xl font-semibold tracking-tight text-slate-950 sm:text-7xl">
          One aviation career.
          <br />
          Entered once.
        </h1>

        <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-600">
          A structured professional identity for aviation workers and a transparent
          global labour market for employers.
        </p>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/login"
            className="rounded-xl bg-slate-950 px-5 py-3 font-medium text-white"
          >
            Sign in
          </Link>
          <Link
            href="/passport"
            className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-medium text-slate-900"
          >
            My Passport
          </Link>
          <Link
            href="/employer"
            className="rounded-xl border border-slate-300 bg-white px-5 py-3 font-medium text-slate-900"
          >
            Employer Portal
          </Link>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="text-sm text-slate-500">Experience</div>
            <div className="mt-2 text-xl font-semibold">A350 🔵</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="text-sm text-slate-500">Type rated</div>
            <div className="mt-2 text-xl font-semibold">A320 ⭐</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="text-sm text-slate-500">Company authorised</div>
            <div className="mt-2 text-xl font-semibold">
              A320 <span aria-label="company authorised">🛡️</span>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Custom green shield will replace the emoji in the product UI.
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
