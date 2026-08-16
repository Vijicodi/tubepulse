import { KeyRound } from "lucide-react";

/**
 * Shown instead of the auth form when Supabase keys are missing.
 *
 * A blank form that silently fails is the worst possible first-run experience.
 * This says exactly which two values are missing and where they go.
 */
export function SetupNotice() {
  return (
    <div className="surface-glass animate-rise w-full max-w-md rounded-2xl p-8">
      <span className="bg-muted/50 grid size-11 place-items-center rounded-xl">
        <KeyRound className="text-muted-foreground size-5" aria-hidden />
      </span>

      <h1 className="mt-5 text-2xl font-semibold tracking-tight">
        Add your Supabase keys
      </h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Authentication is wired up and waiting. It needs two values before it can
        talk to your project.
      </p>

      <ol className="mt-6 space-y-4 text-sm">
        <Step n={1}>
          Open your Supabase dashboard →{" "}
          <span className="text-foreground font-medium">
            Project Settings → API
          </span>
          .
        </Step>
        <Step n={2}>
          Copy the <Code>Project URL</Code> and the <Code>anon public</Code> key.
        </Step>
        <Step n={3}>
          Paste them into <Code>.env.local</Code> as{" "}
          <Code>NEXT_PUBLIC_SUPABASE_URL</Code> and{" "}
          <Code>NEXT_PUBLIC_SUPABASE_ANON_KEY</Code>, then restart the dev server.
        </Step>
      </ol>

      <p className="text-muted-foreground mt-6 border-t pt-4 text-xs">
        Never put these in <Code>.env.example</Code> — that file is committed to
        the public repository.
      </p>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="bg-brand-gradient mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[0.65rem] font-semibold text-white">
        {n}
      </span>
      <span className="text-muted-foreground">{children}</span>
    </li>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="bg-muted/60 text-foreground rounded px-1.5 py-0.5 font-mono text-[0.78em]">
      {children}
    </code>
  );
}
