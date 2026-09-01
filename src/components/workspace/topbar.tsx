"use client";

import { usePathname } from "next/navigation";
import { LogOut, Menu, PanelLeft, PanelLeftClose } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/actions";
import { navItemFor } from "@/lib/nav";

export function Topbar({
  email,
  eyebrow,
  onOpenNav,
  sidebarCollapsed = false,
  onToggleSidebar,
}: {
  email: string;
  eyebrow: string;
  onOpenNav?: () => void;
  /** Desktop only. Drives the toggle's icon and its label. */
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}) {
  const pathname = usePathname();
  const current = navItemFor(pathname);

  return (
    <header className="flex items-center justify-between gap-4 border-b px-4 py-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenNav}
          aria-label="Open navigation"
          className="lg:hidden"
        >
          <Menu className="size-5" aria-hidden />
        </Button>

        {/* Desktop collapse. Hidden below lg, where the sidebar is a drawer and
            there is nothing to collapse. The label says what the button DOES
            rather than what it shows, which is what a screen reader needs, and
            `aria-expanded` carries the state instead of a second sentence. */}
        {onToggleSidebar && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleSidebar}
            aria-label={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
            aria-expanded={!sidebarCollapsed}
            title={`${sidebarCollapsed ? "Show" : "Hide"} sidebar (Ctrl+B)`}
            className="hidden lg:inline-flex"
          >
            {sidebarCollapsed ? (
              <PanelLeft className="size-5" aria-hidden />
            ) : (
              <PanelLeftClose className="size-5" aria-hidden />
            )}
          </Button>
        )}

        <div className="min-w-0">
          <p className="text-muted-foreground truncate text-xs">{eyebrow}</p>
          <h1 className="truncate text-[0.95rem] font-semibold tracking-tight">
            {current?.label ?? "Workspace"}
          </h1>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <span className="text-muted-foreground hidden max-w-[16rem] truncate text-xs md:inline">
          {email}
        </span>

        <form action={signOut}>
          <Button type="submit" variant="ghost" size="sm" className="gap-1.5">
            <LogOut className="size-4" aria-hidden />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </form>
      </div>
    </header>
  );
}
