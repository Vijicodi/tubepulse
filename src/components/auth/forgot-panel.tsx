"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { ArrowLeft, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset, type AuthResult } from "@/lib/auth/actions";
import { OTP_LENGTH } from "@/lib/auth/otp";

const initial: AuthResult = { error: null };

/**
 * Step one of a password reset: ask for the email.
 *
 * Deliberately says nothing about whether the address has an account. The
 * screen after this one is reached either way, so an attacker learns nothing
 * from the response.
 */
export function ForgotPanel({ email = "" }: { email?: string }) {
  const [state, action] = useActionState(requestPasswordReset, initial);

  return (
    <div className="surface-glass animate-rise w-full max-w-md rounded-2xl p-7 sm:p-8">
      <span className="bg-brand-gradient grid size-11 place-items-center rounded-xl text-white">
        <KeyRound className="size-5" aria-hidden />
      </span>

      <h1 className="mt-5 text-3xl font-semibold tracking-tight">
        Forgotten already?
      </h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Happens to the best of us. Tell us the address and we&apos;ll send a{" "}
        {OTP_LENGTH}-digit code to get you back in.
      </p>

      {state.error && (
        <p
          role="alert"
          className="border-destructive/40 bg-destructive/10 text-destructive mt-5 rounded-lg border px-3 py-2 text-sm"
        >
          {state.error}
        </p>
      )}

      <form action={action} className="mt-6 space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-xs">
            Email address
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@gmail.com"
            defaultValue={email}
            className="h-11"
            required
          />
        </div>

        <SubmitButton />
      </form>

      <div className="mt-6 border-t pt-5 text-sm">
        <Link
          href="/login"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to log in
        </Link>
      </div>
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      className="bg-brand-gradient h-11 w-full text-white"
    >
      {pending ? (
        <>
          <Loader2 className="animate-spin" aria-hidden />
          Sending
        </>
      ) : (
        "Send me a code"
      )}
    </Button>
  );
}
