import { describe, expect, it } from "vitest";

import {
  getRiskInputs,
  setFactor,
  setLength,
  setMeasuredDimensions,
  subscribe,
} from "./riskInputs";

describe("riskInputs store", () => {
  it("has sensible defaults", () => {
    const s = getRiskInputs();
    expect(s.width).toBe("10");
    expect(s.height).toBe("5");
    expect(s.factor).toBe(1);
  });

  it("returns a stable reference until a setter runs, new ref after", () => {
    const before = getRiskInputs();
    expect(getRiskInputs()).toBe(before);
    setLength("7");
    expect(getRiskInputs()).not.toBe(before);
    expect(getRiskInputs().length).toBe("7");
  });

  it("notifies subscribers; unsubscribe stops notifications", () => {
    let count = 0;
    const unsub = subscribe(() => {
      count += 1;
    });
    setLength("1");
    expect(count).toBe(1);
    unsub();
    setLength("2");
    expect(count).toBe(1);
  });

  it("setFactor updates the factor", () => {
    setFactor(2);
    expect(getRiskInputs().factor).toBe(2);
  });

  it("setMeasuredDimensions updates length and width and bumps flash tick", () => {
    const tickBefore = getRiskInputs().measureFlashTick;
    setMeasuredDimensions("12.5", "8.3");
    const s = getRiskInputs();
    expect(s.length).toBe("12.5");
    expect(s.width).toBe("8.3");
    expect(s.measureFlashTick).toBe(tickBefore + 1);
  });
});
