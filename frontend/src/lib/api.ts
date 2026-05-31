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

export async function getCloudCover(
  lat: number,
  lon: number,
  resolution: Resolution,
): Promise<CloudCover> {
  const { data, error, response } = await client.GET("/api/cloud-cover", {
    params: { query: { lat, lon, resolution } },
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
