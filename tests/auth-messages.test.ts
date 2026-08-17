import { describe, expect, it } from "vitest";
import { friendly } from "../src/lib/auth/messages";
import { OTP_LENGTH, OTP_SLOTS } from "../src/lib/auth/otp";

describe("friendly", () => {
  it("does not claim a wrong code has expired", () => {
    // The exact string Supabase returns for BOTH a mistyped and a stale code.
    // The old mapping matched /expired/ first and always said "expired", which
    // sent a real person hunting for a timing problem they did not have.
    const out = friendly("Token has expired or is invalid");
    expect(out).toMatch(/wrong or has expired/i);
    expect(out).not.toBe("That code has expired. Send yourself a new one.");
  });

  it("still handles an unambiguously expired token", () => {
    expect(friendly("Token has expired")).toMatch(/expired/i);
  });

  it("handles an unambiguously invalid token", () => {
    expect(friendly("Invalid token")).toMatch(/not right/i);
  });

  it("explains a bad password without leaking which half was wrong", () => {
    const out = friendly("Invalid login credentials");
    expect(out).toBe("That email and password do not match an account.");
  });

  it("points an existing account at the login tab", () => {
    expect(friendly("User already registered")).toMatch(/already exists/i);
  });

  it("softens rate limiting", () => {
    expect(friendly("email rate limit exceeded")).toMatch(/too many attempts/i);
  });

  it("passes anything unrecognised straight through", () => {
    expect(friendly("Some brand new upstream failure")).toBe(
      "Some brand new upstream failure",
    );
  });
});

describe("OTP length", () => {
  it("renders exactly one slot per digit", () => {
    // Guards the drift that broke sign-up: the dashboard emitted 8 digits while
    // the form accepted 6, and nothing failed loudly.
    expect(OTP_SLOTS).toHaveLength(OTP_LENGTH);
    expect(OTP_SLOTS[0]).toBe(0);
    expect(OTP_SLOTS.at(-1)).toBe(OTP_LENGTH - 1);
  });

  it("matches the Supabase dashboard setting documented in docs/auth-setup.md", () => {
    expect(OTP_LENGTH).toBe(6);
  });
});
