import { AuthPanel } from "@/components/auth/auth-panel";
import { SetupNotice } from "@/components/auth/setup-notice";
import { isSupabaseConfigured } from "@/lib/public-env";

export const metadata = { title: "Log in — TubePulse" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; mode?: string }>;
}) {
  const { next, error, mode } = await searchParams;

  if (!isSupabaseConfigured) return <SetupNotice />;

  return <AuthPanel
      next={next ?? "/projects"}
      initialError={error}
      initialMode={mode === "signup" ? "signup" : "login"}
    />;
}
