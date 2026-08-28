import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TrustCentre from "@/components/trust/trust-centre";

export default async function TrustPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <div className="mx-auto max-w-7xl">
        <TrustCentre />
      </div>
    </main>
  );
}
