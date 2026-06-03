import { describe, expect, it } from "vitest";

import { haversineMeters, rotatedRectangle } from "./geo";

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

describe("rotatedRectangle", () => {
  // Baseline roughly E-W; the third point lies north of it.
  const a = { lat: 59, lon: 18 };
  const b = { lat: 59, lon: 18.002 };
  const c = { lat: 59.0005, lon: 18.001 };

  it("keeps the baseline as one side (corners 0 and 1 are a and b)", () => {
    const { corners } = rotatedRectangle(a, b, c);
    expect(corners[0].lat).toBeCloseTo(a.lat, 9);
    expect(corners[0].lon).toBeCloseTo(a.lon, 9);
    expect(corners[1].lat).toBeCloseTo(b.lat, 9);
    expect(corners[1].lon).toBeCloseTo(b.lon, 9);
  });

  it("length is the baseline span, width the perpendicular span", () => {
    const { lengthM, widthM } = rotatedRectangle(a, b, c);
    const baseline = haversineMeters(59, 18, 59, 18.002);
    const perp = haversineMeters(59, 18, 59.0005, 18);
    expect(lengthM).toBeCloseTo(Math.max(baseline, perp), 0);
    expect(widthM).toBeCloseTo(Math.min(baseline, perp), 0);
  });

  it("width is the perpendicular distance only (independent of position along the baseline)", () => {
    const near = rotatedRectangle(a, b, { lat: 59.0005, lon: 18.0005 });
    const far = rotatedRectangle(a, b, { lat: 59.0005, lon: 18.01 });
    expect(near.widthM).toBeCloseTo(far.widthM, 1);
  });

  it("offsets the far corners perpendicular to the baseline toward the third point", () => {
    const { corners } = rotatedRectangle(a, b, c);
    // corners[2] = b + perp offset, corners[3] = a + perp offset; both ~north.
    expect(corners[3].lat).toBeCloseTo(59.0005, 4);
    expect(corners[2].lat).toBeCloseTo(59.0005, 4);
  });

  it("returns length >= width for a rotated (diagonal) baseline", () => {
    const r = rotatedRectangle(
      { lat: 0, lon: 0 },
      { lat: 0.001, lon: 0.001 },
      { lat: 0.0015, lon: 0.0005 },
    );
    expect(r.lengthM).toBeGreaterThanOrEqual(r.widthM);
  });

  it("is ~zero for a fully degenerate input", () => {
    const p = { lat: 59, lon: 18 };
    const { lengthM, widthM } = rotatedRectangle(p, p, p);
    expect(lengthM).toBeCloseTo(0, 5);
    expect(widthM).toBeCloseTo(0, 5);
  });
});
