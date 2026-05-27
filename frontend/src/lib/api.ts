import createClient from "openapi-fetch";

import type { paths } from "./api-schema";

const baseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export const client = createClient<paths>({ baseUrl });

export async function getHealth() {
  const { data, error } = await client.GET("/health");
  if (error || !data) throw new Error("health check failed");
  return data;
}

export async function getMetrics(lat: number, lon: number) {
  const { data, error } = await client.GET("/api/metrics", {
    params: { query: { lat, lon } },
  });
  if (error || !data) throw new Error("metrics request failed");
  return data;
}
