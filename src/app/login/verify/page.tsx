import { redirect } from "next/navigation";
import { VerifyPanel } from "@/components/auth/verify-panel";

export const metadata = { title: "Verify your email — TubePulse" };

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;

  // Landing here without an email means the flow was skipped or the link was
  // shared. Send them back rather than showing a code box for nobody.
  if (!email) redirect("/login");

  return <VerifyPanel email={email} />;
}
