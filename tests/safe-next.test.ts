import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/auth/safe-next";

describe("safeNext — only ever redirect inside the app", () => {
  it.each([
    "/projects",
    "/billing?plan=studio&cycle=yearly",
    "/pricing?plan=creator#plans",
    "/channels/123",
  ])("keeps an in-app path: %s", (path) => {
    expect(safeNext(path)).toBe(path);
  });

  // Each of these left the site in a browser. `/\example.com` is the one found
  // live on 2026-10-04: browsers read a backslash as a slash, so it is `//`.
  it.each([
    "//example.com",
    "/\\example.com",
    "/%5Cexample.com",
    "/%5C%5Cexample.com",
    "\\\\example.com",
    "https://example.com",
    "javascript:alert(1)",
    "/\texample.com",
    "/%09/example.com",
    "",
    "projects",
  ])("refuses %j", (bad) => {
    expect(safeNext(bad)).toBe("/projects");
  });
});

describe("safeNext with a custom fallback", () => {
  it("uses the caller's fallback for an off-site target", () => {
    expect(safeNext("//example.com", "/project")).toBe("/project");
    expect(safeNext("/outliers", "/project")).toBe("/outliers");
  });
});
