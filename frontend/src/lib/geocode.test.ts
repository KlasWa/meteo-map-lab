import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { reverseGeocode } from "./geocode";

const originalFetch = globalThis.fetch;

describe("reverseGeocode", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns place_name from the first feature", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          {
            place_name: "Stockholm, Stockholm County, Sweden",
            text: "Stockholm",
          },
        ],
      }),
    } as Response);

    const result = await reverseGeocode(59.32938, 18.06871);
    expect(result).toBe("Stockholm, Stockholm County, Sweden");
  });

  it("falls back to text when place_name is missing", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ features: [{ text: "Some Lake" }] }),
    } as Response);

    expect(await reverseGeocode(0, 0)).toBe("Some Lake");
  });

  it("returns null when the response has no features", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ features: [] }),
    } as Response);

    expect(await reverseGeocode(0, 0)).toBeNull();
  });

  it("returns null on a non-OK response (rate-limit, bad key, …)", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({}),
    } as Response);

    expect(await reverseGeocode(0, 0)).toBeNull();
  });

  it("passes the abort signal through to fetch", async () => {
    const controller = new AbortController();
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ features: [] }),
    } as Response);

    await reverseGeocode(0, 0, controller.signal);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBe(controller.signal);
  });

  it("sends lon,lat (not lat,lon) — MapTiler convention", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ features: [] }),
    } as Response);

    await reverseGeocode(59.32938, 18.06871);

    const url = fetchMock.mock.calls[0][0] as string;
    // lon comes first in the URL path
    expect(url).toContain("/18.06871,59.32938.json");
  });
});
