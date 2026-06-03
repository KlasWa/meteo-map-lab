import { describe, expect, it } from "vitest";

import { haversineMeters, rectangleDimensions } from "./geo";

describe("haversineMeters", () => {
  it("is ~111 km for one degree of latitude", () => {
    const d = haversineMeters(59, 18, 60, 18);
    expect(d).toBeGreaterThan(111_000);
    expect(d).toBeLessThan(111_600);
  });

  it("is zero for identical points", () => {
    expect(haversineMeters(59, 18, 59, 18)).toBeCloseTo(0, 5);
  });

  it("is symmetric", () => {
    const a = haversineMeters(59, 18, 59.001, 18.002);
    const b = haversineMeters(59.001, 18.002, 59, 18);
    expect(a).toBeCloseTo(b, 6);
  });
});

describe("rectangleDimensions", () => {
  it("returns length >= width", () => {
    const { lengthM, widthM } = rectangleDimensions(
      { lat: 59, lon: 18 },
      { lat: 59.0005, lon: 18.002 },
    );
    expect(lengthM).toBeGreaterThanOrEqual(widthM);
  });

  it("assigns the larger span to length and smaller to width", () => {
    const a = { lat: 59, lon: 18 };
    const b = { lat: 59.0005, lon: 18.002 };
    const { lengthM, widthM } = rectangleDimensions(a, b);
    const ew = haversineMeters(59.00025, 18, 59.00025, 18.002);
    const ns = haversineMeters(59, 18, 59.0005, 18);
    expect(lengthM).toBeCloseTo(Math.max(ew, ns), 3);
    expect(widthM).toBeCloseTo(Math.min(ew, ns), 3);
  });

  it("is ~zero for a degenerate point", () => {
    const { lengthM, widthM } = rectangleDimensions(
      { lat: 59, lon: 18 },
      { lat: 59, lon: 18 },
    );
    expect(lengthM).toBeCloseTo(0, 5);
    expect(widthM).toBeCloseTo(0, 5);
  });
});
