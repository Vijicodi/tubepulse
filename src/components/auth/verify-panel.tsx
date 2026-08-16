"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { resendCode, verifyEmailCode, type AuthResult } from "@/lib/auth/actions";

const initial: AuthResult = { error: null };
const RESEND_COOLDOWN = 45;

/**
 * The 6-digit code step.
 *
 * Submits automatically once the sixth digit lands — asking someone to type six
 * digits and then reach for a button is a pointless extra step, and the code is
 * either right or it is not.
 */
export function VerifyPanel({ email }: { email: string }) {
  const [code, setCode] = useState("");
  const [verifyState, verifyAction] = useActionState(verifyEmailCode, initial);
  const [resendState, resendAction] = useActionState(resendCode, initial);
  const [cooldown, setCooldown] = useState(0);
  const [sentOnce, setSentOnce] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  return (
    <div className="surface-glass animate-rise w-full max-w-md rounded-2xl p-7 sm:p-8">
      <span className="bg-brand-gradient grid size-11 place-items-center rounded-xl text-white">
        <MailCheck className="size-5" aria-hidden />
      </span>

      <h1 className="mt-5 text-3xl font-semibold tracking-tight">Check your email</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        We sent a 6-digit code to{" "}
        <span className="text-foreground font-medium break-all">{email}</span>.
        Enter it below to open your workspace.
      </p>

      {verifyState.error && (
        <p
          role="alert"
          className="border-destructive/40 bg-destructive/10 text-destructive mt-5 rounded-lg border px-3 py-2 text-sm"
        >
          {verifyState.error}
        </p>
      )}

      <form action={verifyAction} id="verify-form" className="mt-6 space-y-5">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="code" value={code} />

        <div className="flex justify-center">
          <InputOTP
            maxLength={6}
            value={code}
            onChange={setCode}
            onComplete={(value) => {
              // Submit as soon as the sixth digit arrives.
              const form = document.getElementById("verify-form") as HTMLFormElement | null;
              if (value.length === 6) form?.requestSubmit();
            }}
            aria-label="6-digit verification code"
          >
            <InputOTPGroup className="gap-2">
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <InputOTPSlot
                  key={index}
                  index={index}
                  className="size-12 rounded-lg border text-lg"
                />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>

        <VerifySubmit disabled={code.length !== 6} />
      </form>

      <div className="mt-6 flex items-center justify-between border-t pt-5 text-sm">
        <Link
          href="/login"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back
        </Link>

        <form
          action={(formData) => {
            setCooldown(RESEND_COOLDOWN);
            setSentOnce(true);
            return resendAction(formData);
          }}
        >
          <input type="hidden" name="email" value={email} />
          <ResendButton cooldown={cooldown} />
        </form>
      </div>

      {sentOnce && cooldown > 0 && !resendState.error && (
        <p className="text-muted-foreground mt-3 text-center text-xs">
          New code sent. It can take a minute to arrive — check spam too.
        </p>
      )}
      {resendState.error && (
        <p className="text-destructive mt-3 text-center text-xs">{resendState.error}</p>
      )}
    </div>
  );
}

function VerifySubmit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={disabled || pending}
      className="bg-brand-gradient h-11 w-full text-white"
    >
      {pending ? (
        <>
          <Loader2 className="animate-spin" aria-hidden />
          Verifying
        </>
      ) : (
        "Verify and continue"
      )}
    </Button>
  );
}

function ResendButton({ cooldown }: { cooldown: number }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="ghost"
      size="sm"
      disabled={pending || cooldown > 0}
      className="text-muted-foreground hover:text-foreground"
    >
      {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
    </Button>
  );
}
