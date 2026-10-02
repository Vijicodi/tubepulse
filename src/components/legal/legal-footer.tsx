import Link from "next/link";
import { BrandWordmark } from "@/components/brand/logo";
import { LEGAL, LEGAL_PAGES } from "@/lib/legal";

/** Every policy, linked. Used under the legal pages, the landing and pricing. */
export function LegalFooter() {
  return (
    <footer className="border-border/40 border-t px-6 py-12">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <BrandWordmark className="max-h-8 w-auto" />
          <nav aria-label="Policies" className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {LEGAL_PAGES.map((page) => (
              <Link
                key={page.href}
                href={page.href}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {page.label}
              </Link>
            ))}
          </nav>
        </div>
        <p className="text-muted-foreground text-xs">
          {LEGAL.brand} is operated by {LEGAL.legalName}. Prices in Indian rupees,
          inclusive of applicable taxes. Payments and autopay handled by Razorpay.{" "}
          <a href={`mailto:${LEGAL.email}`} className="hover:text-foreground underline underline-offset-2">
            {LEGAL.email}
          </a>
        </p>
      </div>
    </footer>
  );
}
