import { describe, expect, it } from "vitest";
import { webhooksCanReachUs } from "@/lib/apify/reachable";

/**
 * Apify validates requestUrl when the run is created and rejects the whole run
 * if it cannot be called. Getting this wrong in one direction breaks every
 * local scrape; in the other it silently drops the webhook in production and
 * leaves finished scrapes waiting on a poll that the UI may never make.
 */
describe("whether Apify can reach us", () => {
  it("refuses localhost, which is what broke the scrape", () => {
    expect(webhooksCanReachUs("http://localhost:3111")).toBe(false);
    expect(webhooksCanReachUs("https://localhost:3111")).toBe(false);
    expect(webhooksCanReachUs("http://127.0.0.1:3111")).toBe(false);
    expect(webhooksCanReachUs("http://0.0.0.0:3111")).toBe(false);
  });

  it("refuses plain http, which Apify will not call either", () => {
    expect(webhooksCanReachUs("http://tubepulse.app")).toBe(false);
  });

  it("refuses machine-local hostnames", () => {
    expect(webhooksCanReachUs("https://vishruth-laptop.local")).toBe(false);
  });

  it("refuses a malformed URL rather than throwing", () => {
    expect(webhooksCanReachUs("")).toBe(false);
    expect(webhooksCanReachUs("not a url")).toBe(false);
  });

  it("accepts a real deployed address", () => {
    expect(webhooksCanReachUs("https://tubepulse.app")).toBe(true);
    expect(webhooksCanReachUs("https://tubepulse.vercel.app/")).toBe(true);
  });
});
