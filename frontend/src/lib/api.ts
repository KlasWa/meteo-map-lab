import createClient from "openapi-fetch";

import type { paths } from "./api-schema";

const baseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export const client = createClient<paths>({ baseUrl });

export type Resolution = "hourly" | "daily" | "monthly";

export type CloudCover =
  paths["/api/cloud-cover"]["get"]["responses"]["200"]["content"]["application/json"];

export async function getHealth() {
  const { data, error } = await client.GET("/health");
  if (error || !data) throw new Error("health check failed");
  return data;
}

export type CloudParam = 16 | 29;

export async function getCloudCover(
  lat: number,
  lon: number,
  resolution: Resolution,
  param: CloudParam,
): Promise<CloudCover> {
  const { data, error, response } = await client.GET("/api/cloud-cover", {
    params: { query: { lat, lon, resolution, param } },
  });
  if (data) return data;
  // Surface the backend's status so the UI can show a useful message.
  if (response.status === 404) {
    throw new Error("No SMHI station near that location.");
  }
  if (response.status === 503) {
    throw new Error("SMHI is unavailable and no data is cached yet.");
  }
  throw new Error(error ? JSON.stringify(error) : "cloud-cover request failed");
}

export type Lightning =
  paths["/api/lightning"]["get"]["responses"]["200"]["content"]["application/json"];

export async function getLightning(
  lat: number,
  lon: number,
  resolution: Resolution,
): Promise<Lightning> {
  const { data, error, response } = await client.GET("/api/lightning", {
    params: { query: { lat, lon, resolution } },
  });
  if (data) return data;
  if (response.status === 503) {
    throw new Error("SMHI lightning is unavailable and no data is cached yet.");
  }
  throw new Error(error ? JSON.stringify(error) : "lightning request failed");
}

export type Purge =
  paths["/api/cache"]["delete"]["responses"]["200"]["content"]["application/json"];

export async function purgeCache(
  scope: "all" | "cloud" | "lightning" = "all",
): Promise<Purge> {
  const { data, error } = await client.DELETE("/api/cache", {
    params: { query: { scope } },
  });
  if (data) return data;
  throw new Error(error ? JSON.stringify(error) : "purge failed");
}
