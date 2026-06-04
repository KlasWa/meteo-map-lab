import { describe, expect, it } from "vitest";

import { fillLightningGaps } from "./lightning-fill";

const H = 3_600_000;
const DAY15 = Date.UTC(2024, 6, 15); // 2024-07-15 00:00 UTC
const DAY16 = Date.UTC(2024, 6, 16);
const DAY17 = Date.UTC(2024, 6, 17);
const DAY18 = Date.UTC(2024, 6, 18);

const asPairs = (pts: { ts: number; count: number }[]) =>
  pts.map((p) => [p.ts, p.count]);

describe("fillLightningGaps", () => {
  it("inserts zero-count days for gaps between strike days", () => {
    const points = [
      { ts: DAY15, count: 2 },
      { ts: DAY16, count: 1 },
    ];
    const filled = fillLightningGaps(points, "daily", DAY15, DAY18);
    expect(asPairs(filled)).toEqual([
      [DAY15, 2],
      [DAY16, 1],
      [DAY17, 0],
      [DAY18, 0],
    ]);
  });

  it("zero-fills hourly buckets, keeping existing counts", () => {
    const filled = fillLightningGaps(
      [{ ts: DAY15 + H, count: 1 }],
      "hourly",
      DAY15,
      DAY15 + 3 * H,
    );
    expect(asPairs(filled)).toEqual([
      [DAY15, 0],
      [DAY15 + H, 1],
      [DAY15 + 2 * H, 0],
      [DAY15 + 3 * H, 0],
    ]);
  });

  it("steps months across a year boundary", () => {
    const JUN24 = Date.UTC(2024, 5, 1);
    const JUL24 = Date.UTC(2024, 6, 1);
    const JAN25 = Date.UTC(2025, 0, 1);
    const filled = fillLightningGaps(
      [{ ts: JUL24, count: 5 }],
      "monthly",
      JUN24,
      JAN25,
    );
    expect(filled).toHaveLength(8); // Jun..Jan inclusive
    expect(filled[0]).toEqual({ ts: JUN24, count: 0 });
    expect(filled[1]).toEqual({ ts: JUL24, count: 5 });
    expect(filled.at(-1)).toEqual({ ts: JAN25, count: 0 });
  });

  it("aligns an unaligned `from` to its bucket start", () => {
    // A `from` in the middle of the day still produces the day's 00:00 key.
    const filled = fillLightningGaps([], "daily", DAY15 + 13 * H, DAY16 + H);
    expect(asPairs(filled)).toEqual([
      [DAY15, 0],
      [DAY16, 0],
    ]);
  });

  it("returns a single bucket when from and to share one", () => {
    const filled = fillLightningGaps(
      [{ ts: DAY15, count: 3 }],
      "daily",
      DAY15 + H,
      DAY15 + 5 * H,
    );
    expect(asPairs(filled)).toEqual([[DAY15, 3]]);
  });
});
