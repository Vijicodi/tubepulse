import { ForgotPanel } from "@/components/auth/forgot-panel";

export const metadata = { title: "Reset your password — TubePulse" };

export default async function ForgotPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  // Prefilled when arriving from the reset screen's "send another code" link,
  // so nobody retypes an address they already gave us.
  const { email } = await searchParams;
  return <ForgotPanel email={email ?? ""} />;
}
