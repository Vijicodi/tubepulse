"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRight, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  signInWithGoogle,
  signInWithPassword,
  signUpWithPassword,
  type AuthResult,
} from "@/lib/auth/actions";
import { cn } from "@/lib/utils";
import { OTP_LENGTH } from "@/lib/auth/otp";

const initial: AuthResult = { error: null };

/**
 * Log in / Create account, as one panel with a segmented switch.
 *
 * Both modes post to a server action, so there is no client-side Supabase call
 * and no token handling in the browser. `useActionState` keeps the returned
 * error next to the form without a round trip through global state.
 */
export function AuthPanel({
  next,
  initialError,
}: {
  next: string;
  initialError?: string;
}) {
  const [mode, setMode] = useState<"login" | "signup">("login");

  const [loginState, loginAction] = useActionState(signInWithPassword, initial);
  const [signupState, signupAction] = useActionState(signUpWithPassword, initial);

  const error = mode === "login" ? loginState.error : signupState.error;

  return (
    <div className="surface-glass animate-rise w-full max-w-md rounded-2xl p-7 sm:p-8">
      <div className="bg-muted/40 text-muted-foreground mb-6 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs">
        <Lock className="size-3" aria-hidden />
        Private by default
      </div>

      <h1 className="text-3xl font-semibold tracking-tight">
        {mode === "login" ? "Right where you left off" : "Let’s get you set up"}
      </h1>
      <p className="text-muted-foreground mt-2 text-sm">
        {mode === "login"
          ? "Email and password. We’ll keep this brief."
          : `A ${OTP_LENGTH}-digit code lands in your inbox. Ten seconds, then you’re in.`}
      </p>

      {/* Segmented switch */}
      <div
        role="tablist"
        aria-label="Log in or create an account"
        className="bg-muted/40 mt-6 grid grid-cols-2 gap-1 rounded-full p-1"
      >
        {(["login", "signup"] as const).map((value) => (
          <button
            key={value}
            role="tab"
            type="button"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium transition-colors",
              mode === value
                ? "bg-background text-foreground ring-border shadow-sm ring-1"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {value === "login" ? "Log in" : "Create account"}
          </button>
        ))}
      </div>

      {(error || initialError) && (
        <p
          role="alert"
          className="border-destructive/40 bg-destructive/10 text-destructive mt-5 rounded-lg border px-3 py-2 text-sm"
        >
          {error ?? initialError}
        </p>
      )}

      <form
        action={mode === "login" ? loginAction : signupAction}
        className="mt-5 space-y-4"
      >
        <input type="hidden" name="next" value={next} />

        {mode === "signup" && (
          <Field
            id="displayName"
            name="displayName"
            label="Display name (optional)"
            placeholder="Maya Creator"
            autoComplete="name"
          />
        )}

        <Field
          id="email"
          name="email"
          type="email"
          label="Email address"
          placeholder="you@gmail.com"
          autoComplete="email"
          required
        />

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <Label htmlFor="password" className="text-xs">
              Password
            </Label>
            {/* Only offered on the log-in tab. On sign-up there is no password
                to have forgotten yet, and the link would just be noise. */}
            {mode === "login" && (
              <Link
                href="/login/forgot"
                className="text-muted-foreground hover:text-foreground text-xs transition-colors"
              >
                Forgot password?
              </Link>
            )}
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            placeholder={mode === "signup" ? "At least 8 characters" : "••••••••••••"}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            className="h-11"
            required
            minLength={mode === "signup" ? 8 : undefined}
          />
        </div>

        <SubmitButton label={mode === "login" ? "Log in" : "Sign up"} />
      </form>

      <div className="my-6 flex items-center gap-3">
        <span className="bg-border h-px flex-1" />
        <span className="text-muted-foreground text-xs">or</span>
        <span className="bg-border h-px flex-1" />
      </div>

      <form action={signInWithGoogle}>
        <input type="hidden" name="next" value={next} />
        <GoogleButton />
      </form>

      <p className="text-muted-foreground mt-6 text-center text-xs">
        By continuing you agree to keep your API keys to yourself.
      </p>
    </div>
  );
}

function Field({
  id,
  label,
  ...props
}: React.ComponentProps<typeof Input> & { id: string; label: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input id={id} className="h-11" {...props} />
    </div>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="bg-brand-gradient h-11 w-full text-white">
      {pending ? (
        <>
          <Loader2 className="animate-spin" aria-hidden />
          Working
        </>
      ) : (
        <>
          {label}
          <ArrowRight aria-hidden />
        </>
      )}
    </Button>
  );
}

function GoogleButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" disabled={pending} className="h-11 w-full">
      {pending ? (
        <Loader2 className="animate-spin" aria-hidden />
      ) : (
        <GoogleGlyph className="size-4" />
      )}
      Continue with Google
    </Button>
  );
}

/** lucide dropped brand icons in v1, so the Google mark is drawn inline. */
function GoogleGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.45a5.5 5.5 0 0 1-2.39 3.62v3h3.86c2.26-2.08 3.58-5.15 3.58-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.94-2.91l-3.86-3c-1.08.72-2.45 1.15-4.08 1.15-3.13 0-5.79-2.11-6.74-4.96H1.28v3.09A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.26 14.28a7.2 7.2 0 0 1 0-4.56V6.63H1.28a12 12 0 0 0 0 10.74l3.98-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.23 0 12 0A12 12 0 0 0 1.28 6.63l3.98 3.09C6.21 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}
