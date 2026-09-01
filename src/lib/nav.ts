import {
  Anchor,
  CalendarDays,
  CreditCard,
  FlaskConical,
  Bookmark,
  FileText,
  Receipt,
  ChartNoAxesColumn,
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
  /** One line saying what the page is for. */
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
    ready: true,
  },
  {
    href: "/outliers",
    label: "Outliers",
    icon: TrendingUp,
    description: "Videos that beat their own channel's median.",
    ready: true,
  },
  {
    href: "/patterns",
    label: "Patterns",
    icon: ChartNoAxesColumn,
    description: "When to post, how long to run, and what the titles do.",
    ready: true,
  },
  {
    href: "/idea-lab",
    label: "Idea lab",
    icon: FlaskConical,
    description: "Source-backed concepts generated from current patterns.",
    ready: true,
  },
  {
    href: "/saved-ideas",
    label: "Saved ideas",
    icon: Bookmark,
    description: "Your shortlisted concepts, ready to refine.",
    ready: true,
  },
  {
    href: "/calendar",
    label: "Calendar",
    icon: CalendarDays,
    description: "What you are making, and when.",
    ready: true,
  },
  {
    href: "/hooks",
    label: "Hook library",
    icon: Anchor,
    description: "Title shapes that beat their own channel, across every project.",
    ready: true,
  },
  {
    href: "/transcript",
    label: "Extract transcript",
    icon: FileText,
    description: "Pull the spoken-word transcript from any public video.",
    ready: true,
  },
  {
    href: "/runs",
    label: "Runs",
    icon: Receipt,
    description: "Everything you have spent an allowance on, and what it cost.",
    ready: true,
  },
  {
    href: "/billing",
    label: "Billing",
    icon: CreditCard,
    description: "Your plan, what it renews at, and how to stop it.",
    ready: true,
  },
];

export function navItemFor(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
}
