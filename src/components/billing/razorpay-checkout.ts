/**
 * Loading and opening Razorpay's checkout.
 *
 * Their script is a third-party global with no npm package worth having, so it
 * is loaded on demand — not in the root layout. Nobody visiting the landing
 * page should pay for a payments script they will not use, and this is a
 * marketing page whose whole point is that it loads fast.
 *
 * The `RazorpayGlobal` type below is ours. Razorpay ships no types, and the
 * alternative is `any` scattered across a component that handles money.
 */

/**
 * Exactly one of `subscription_id` or `order_id` is given, never both.
 * Razorpay decides which product it is opening from that field alone, and
 * sending both is how a refill ends up creating a mandate.
 */
type CheckoutTarget =
  | { subscription_id: string; order_id?: never }
  | { order_id: string; subscription_id?: never };

type CheckoutOptions = CheckoutTarget & {
  key: string;
  name: string;
  description: string;
  prefill: { email: string };
  theme: { color: string };
  notes?: Record<string, string>;
  handler: (response: RazorpaySuccess) => void;
  modal: { ondismiss: () => void };
};

/**
 * What Razorpay hands the success handler.
 *
 * The id fields differ by product — `razorpay_subscription_id` for a mandate,
 * `razorpay_order_id` for a one-off — so both are optional here and the caller
 * reads the one it asked for. None of it is trusted anyway: the server
 * re-verifies the signature and asks Razorpay directly.
 */
export interface RazorpaySuccess {
  razorpay_payment_id: string;
  razorpay_signature: string;
  razorpay_subscription_id?: string;
  razorpay_order_id?: string;
}

interface RazorpayInstance {
  open: () => void;
  on: (event: string, handler: (payload: unknown) => void) => void;
}

type RazorpayGlobal = new (options: CheckoutOptions) => RazorpayInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayGlobal;
  }
}

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

/** Load checkout.js once. Repeat calls reuse the tag already in the document. */
export function loadRazorpay(): Promise<RazorpayGlobal> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Checkout can only open in a browser."));
  }
  if (window.Razorpay) return Promise.resolve(window.Razorpay);

  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SCRIPT_SRC}"]`,
    );

    const onLoad = () => {
      if (window.Razorpay) resolve(window.Razorpay);
      else reject(new Error("Razorpay loaded but did not register itself."));
    };

    if (existing) {
      existing.addEventListener("load", onLoad, { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Could not load Razorpay checkout.")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("Could not load Razorpay checkout. Check your connection.")),
      { once: true },
    );
    document.body.appendChild(script);
  });
}

/** The brand colour Razorpay's popup is tinted with, read from the theme. */
export function brandColour(): string {
  if (typeof window === "undefined") return "#7c3aed";
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue("--brand-2")
    .trim();
  // Razorpay's popup only accepts hex. Anything else (oklch, colour-mix) is
  // rejected silently and the popup renders in its default blue.
  return /^#[0-9a-f]{3,8}$/i.test(value) ? value : "#7c3aed";
}
