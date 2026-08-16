"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { VoicePanel } from "./voice-panel";

/**
 * The two-panel workspace.
 *
 * Desktop: sidebar | voice agent | live workspace.
 * Below lg the voice panel stacks above the workspace, and the sidebar becomes
 * a drawer — three columns on a phone would make all three unusable.
 *
 * Client component only because of the drawer's open state; the pages rendered
 * inside `children` stay server components and do their own queries under RLS.
 */
export function WorkspaceShell({
  email,
  eyebrow,
  children,
}: {
  email: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="flex h-svh overflow-hidden">
      {/* Sidebar — static on desktop, drawer below lg */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {navOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close navigation"
            onClick={() => setNavOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <div className="animate-rise absolute inset-y-0 left-0">
            <Sidebar onNavigate={() => setNavOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar email={email} eyebrow={eyebrow} onOpenNav={() => setNavOpen(true)} />

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[minmax(340px,26rem)_1fr] lg:overflow-hidden lg:p-5">
          <div className="min-h-[32rem] lg:min-h-0">
            <VoicePanel />
          </div>

          <main className="min-h-0 lg:overflow-y-auto">{children}</main>
        </div>
      </div>
    </div>
  );
}
