"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { useSidebarCollapsed } from "./use-sidebar";

/**
 * The workspace shell: sidebar and the page itself.
 *
 * There WAS a third column here holding a voice agent. It is gone, and the
 * reasoning is in docs/decisions/0005: typing a channel URL was never the hard
 * part, so a voice layer on top solved nothing while billing by the minute
 * against a product priced by the scrape. Removing it gives the page back
 * roughly 400px, which is the difference between a readable data table and a
 * cramped one.
 *
 * Client component only because of the drawer's open state and the desktop
 * collapse; the pages rendered inside `children` stay server components and do
 * their own queries under RLS.
 *
 * TWO SEPARATE PIECES OF STATE, deliberately. `navOpen` is the mobile drawer,
 * which is transient and always starts shut. `collapsed` is the desktop rail,
 * which is a remembered preference. Merging them would mean a phone inheriting
 * a choice made on a desktop, on a layout where the sidebar is a drawer and
 * "collapsed" means nothing.
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
  const { collapsed, toggle } = useSidebarCollapsed();

  return (
    <div className="flex h-svh overflow-hidden">
      {/* Sidebar — static on desktop, drawer below lg.
          Collapsing animates the WIDTH rather than unmounting: keeping it in
          the tree preserves scroll position and keeps the transition smooth,
          and `overflow-hidden` stops the labels spilling out mid-animation. */}
      <div
        className={cn(
          "hidden overflow-hidden transition-[width] duration-200 ease-out lg:block",
          collapsed ? "w-0" : "w-64",
        )}
      >
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
        <Topbar
          email={email}
          eyebrow={eyebrow}
          onOpenNav={() => setNavOpen(true)}
          sidebarCollapsed={collapsed}
          onToggleSidebar={toggle}
        />

        {/* Native scrolling, deliberately. Lenis is banned under (workspace)/ —
            fighting a data table to scroll is misery by day three. */}
        <main className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
