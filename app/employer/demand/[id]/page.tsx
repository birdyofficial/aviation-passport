import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DemandWorkspace from "@/components/employer/demand-workspace";

export default async function DemandWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    redirect("/login");
  }

  const { id } = await params;

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <div className="mx-auto max-w-7xl">
        <DemandWorkspace demandId={id} />
      </div>
    </main>
  );
}
