import { redirect } from "next/navigation";
import { ResetPanel } from "@/components/auth/reset-panel";

export const metadata = { title: "Choose a new password — TubePulse" };

export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;

  // Same rule as the verify screen: without an email there is nothing to
  // verify a code against, so show the form that collects one.
  if (!email) redirect("/login/forgot");

  return <ResetPanel email={email} />;
}
