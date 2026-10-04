import { SUPPORT_EMAIL } from "@/lib/support";

/**
 * Who runs TubePulse, defined once.
 *
 * Razorpay reviews the website against the KYC on the merchant account, and
 * rejects it when the name on the policy pages does not match. Every legal
 * page reads from here, so the name, address and phone can never disagree
 * between Terms, Privacy and Contact.
 *
 * `address` and `phone` must be filled with the exact details on the Razorpay
 * KYC before the site is submitted for review. While either is blank the
 * Contact page omits that line rather than printing a placeholder.
 */
export const LEGAL = {
  /** The merchant on the Razorpay account. Must match the KYC exactly. */
  legalName: "Vishruth Vijay",
  brand: "TubePulse",
  site: "tube-pulse.org",
  email: SUPPORT_EMAIL,
  /** Full operating address with PIN code, as on the Razorpay KYC. */
  address: "",
  /** Support phone number, as on the Razorpay KYC. */
  phone: "",
  /** Courts for disputes — the city of the operating address. */
  jurisdiction: "",
  /** Shown on every policy page. Change it whenever a policy changes. */
  updated: "4 October 2026",
  /** How fast support replies, promised on Contact and in the policies. */
  replyWithin: "2 working days",
} as const;

/** The policy pages, in footer order. Razorpay asks for each by name. */
export const LEGAL_PAGES = [
  { href: "/about", label: "About us" },
  { href: "/contact", label: "Contact us" },
  { href: "/pricing", label: "Pricing" },
  { href: "/terms", label: "Terms & conditions" },
  { href: "/privacy", label: "Privacy policy" },
  { href: "/refunds", label: "Cancellation & refunds" },
  { href: "/shipping", label: "Shipping & delivery" },
] as const;
