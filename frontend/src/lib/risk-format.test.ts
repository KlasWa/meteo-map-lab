import { describe, expect, it } from "vitest";

import { formatPercent, formatReturnPeriod } from "./risk-format";

describe("formatPercent", () => {
  it("formats zero", () => {
    expect(formatPercent(0)).toBe("0%");
  });
  it("formats a small probability with adaptive precision", () => {
    // 0.0012 -> 0.12%
    expect(formatPercent(0.0012)).toBe("0.12%");
  });
  it("formats a tiny probability without collapsing to 0%", () => {
    expect(formatPercent(0.0000005)).toBe("0.00005%");
  });
  it("keeps whole-number percentages intact", () => {
    expect(formatPercent(0.1)).toBe("10%");
    expect(formatPercent(0.5)).toBe("50%");
    expect(formatPercent(0.2)).toBe("20%");
  });
  it("trims trailing fractional zeros only", () => {
    // 0.05 -> 5% (not "5.0%")
    expect(formatPercent(0.05)).toBe("5%");
  });
});

describe("formatReturnPeriod", () => {
  it("renders a dash for null", () => {
    expect(formatReturnPeriod(null)).toBe("—");
  });
  it("renders 1-in-N years rounded to 2 significant figures", () => {
    expect(formatReturnPeriod(1234)).toBe("≈ 1 in 1,200 years");
  });
  it("renders sub-year periods", () => {
    expect(formatReturnPeriod(0.5)).toBe("≈ 1 in 0.5 years");
  });
});
