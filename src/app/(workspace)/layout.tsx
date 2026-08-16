import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace/shell";
import { createServerClient, getUser } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/public-env";

/**
 * Every workspace page renders inside this.
 *
 * Middleware already redirects signed-out users, but this checks again: a
 * layout that trusts middleware alone breaks the moment someone adds a route
 * outside the matcher. Two cheap checks beat one clever one.
 */
export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isSupabaseConfigured) redirect("/login");

  const user = await getUser();
  if (!user) redirect("/login");

  // How many projects exist decides the eyebrow copy — "set up your first
  // project" is wrong once they have four.
  const supabase = await createServerClient();
  const { count } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true });

  const eyebrow =
    (count ?? 0) === 0 ? "Set up your first project" : "Voice research workspace";

  return (
    <WorkspaceShell email={user.email ?? ""} eyebrow={eyebrow}>
      {children}
    </WorkspaceShell>
  );
}
