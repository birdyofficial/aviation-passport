"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    const supabase = createClient();

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setMessage(error.message);
        setBusy(false);
        return;
      }

      router.push("/passport");
      router.refresh();
      return;
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
      setBusy(false);
      return;
    }

    setMessage(
      "Account created. If email confirmation is enabled in Supabase, confirm the email before signing in."
    );
    setBusy(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <div className="text-sm font-semibold tracking-wide text-slate-500">
          AVIATION PASSPORT
        </div>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">
          {mode === "signin" ? "Sign in" : "Create account"}
        </h1>

        <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Email
            </span>
            <input
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Password
            </span>
            <input
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900"
              type="password"
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          <button
            className="w-full rounded-xl bg-slate-950 px-4 py-3 font-medium text-white disabled:opacity-50"
            disabled={busy}
            type="submit"
          >
            {busy
              ? "Working..."
              : mode === "signin"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>

        {message ? (
          <p className="mt-4 rounded-xl bg-slate-100 p-3 text-sm text-slate-700">
            {message}
          </p>
        ) : null}

        <button
          className="mt-5 text-sm font-medium text-slate-600 underline"
          type="button"
          onClick={() =>
            setMode((current) =>
              current === "signin" ? "signup" : "signin"
            )
          }
        >
          {mode === "signin"
            ? "Need an account?"
            : "Already have an account?"}
        </button>
      </div>
    </main>
  );
}
