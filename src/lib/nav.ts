import {
  FlaskConical,
  Bookmark,
  FileText,
  LayoutGrid,
  Sparkles,
  SquareKanban,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

/**
 * The workspace navigation, defined once.
 *
 * The sidebar, the page titles and the route protection in middleware.ts all
 * read from this list, so adding a page is one edit rather than four — and a
 * page cannot end up in the sidebar without a title or protection.
 */
export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown under LIVE WORKSPACE at the top of the right-hand panel. */
  description: string;
  /** True once the feature behind it actually does something. */
  ready: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/projects",
    label: "All projects",
    icon: LayoutGrid,
    description: "Return to any private research workspace or start a new one.",
    ready: true,
  },
  {
    href: "/project",
    label: "Project",
    icon: SquareKanban,
    description: "The workspace you are currently researching in.",
    ready: true,
  },
  {
    href: "/competitors",
    label: "Competitors",
    icon: Sparkles,
    description: "Channels you are tracking in this project.",
    ready: false,
  },
  {
    href: "/outliers",
    label: "Outliers",
    icon: TrendingUp,
    description: "Videos that beat their own channel's median.",
    ready: false,
  },
  {
    href: "/idea-lab",
    label: "Idea lab",
    icon: FlaskConical,
    description: "Source-backed concepts generated from current patterns.",
    ready: false,
  },
  {
    href: "/saved-ideas",
    label: "Saved ideas",
    icon: Bookmark,
    description: "Your shortlisted concepts, ready to refine.",
    ready: false,
  },
  {
    href: "/transcript",
    label: "Extract transcript",
    icon: FileText,
    description: "Pull the spoken-word transcript from any public video.",
    ready: false,
  },
];

export function navItemFor(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
}
