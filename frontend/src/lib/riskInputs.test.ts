import { describe, expect, it } from "vitest";

import { getRiskInputs, setFactor, setLength, subscribe } from "./riskInputs";

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
});
