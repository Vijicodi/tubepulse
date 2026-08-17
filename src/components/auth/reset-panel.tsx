"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { ArrowLeft, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { resetPassword, type AuthResult } from "@/lib/auth/actions";
import { OTP_LENGTH, OTP_SLOTS } from "@/lib/auth/otp";

const initial: AuthResult = { error: null };

/**
 * Step two of a password reset: the code and the new password, on one screen.
 *
 * One screen rather than two deliberately — splitting them means holding a
 * verified recovery session across a navigation, and a code that has already
 * been spent if the second step fails. Here a failure leaves the person exactly
 * where they are, able to retype.
 *
 * No auto-submit on the last digit, unlike the sign-up screen: the password
 * field below is still empty at that point, so submitting would only produce an
 * error. The length comes from OTP_LENGTH like everywhere else.
 */
export function ResetPanel({ email }: { email: string }) {
  const [code, setCode] = useState("");
  const [state, action] = useActionState(resetPassword, initial);

  return (
    <div className="surface-glass animate-rise w-full max-w-md rounded-2xl p-7 sm:p-8">
      <span className="bg-brand-gradient grid size-11 place-items-center rounded-xl text-white">
        <ShieldCheck className="size-5" aria-hidden />
      </span>

      <h1 className="mt-5 text-3xl font-semibold tracking-tight">
        Pick a better one
      </h1>
      <p className="text-muted-foreground mt-2 text-sm">
        We sent {OTP_LENGTH} digits to{" "}
        <span className="text-foreground font-medium break-all">{email}</span>.
        Enter them, choose a new password, and we&apos;ll say no more about it.
      </p>

      {state.error && (
        <p
          role="alert"
          className="border-destructive/40 bg-destructive/10 text-destructive mt-5 rounded-lg border px-3 py-2 text-sm"
        >
          {state.error}
        </p>
      )}

      <form action={action} className="mt-6 space-y-6">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="code" value={code} />

        <div className="flex justify-center">
          <InputOTP
            maxLength={OTP_LENGTH}
            value={code}
            onChange={setCode}
            aria-label={`${OTP_LENGTH}-digit reset code`}
          >
            <InputOTPGroup className="gap-2">
              {OTP_SLOTS.map((index) => (
                <InputOTPSlot
                  key={index}
                  index={index}
                  className="size-12 rounded-lg border text-lg"
                />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-xs">
            New password
          </Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            minLength={8}
            className="h-11"
            required
          />
        </div>

        <SubmitButton disabled={code.length !== OTP_LENGTH} />
      </form>

      <div className="mt-6 flex items-center justify-between border-t pt-5 text-sm">
        <Link
          href="/login"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back
        </Link>
        <Link
          href={`/login/forgot?email=${encodeURIComponent(email)}`}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          Send another code
        </Link>
      </div>
    </div>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
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
          Updating
        </>
      ) : (
        "Set new password"
      )}
    </Button>
  );
}
