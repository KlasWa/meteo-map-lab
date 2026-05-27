import { useEffect, useState } from "react";

import { MapView } from "./components/MapView";
import { getHealth, getMetrics } from "./lib/api";

type Metrics = Awaited<ReturnType<typeof getMetrics>>;

export default function App() {
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  useEffect(() => {
    getHealth()
      .then(() => setBackendOk(true))
      .catch(() => setBackendOk(false));
  }, []);

  async function handleSelect(lat: number, lon: number) {
    try {
      setMetrics(await getMetrics(lat, lon));
    } catch {
      setMetrics(null);
    }
  }

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <div style={{ flex: 1 }}>
        <MapView onSelect={handleSelect} />
      </div>
      <aside style={{ width: 320, padding: 16, fontFamily: "sans-serif" }}>
        <h1>elvy-map</h1>
        <p>
          Backend:{" "}
          {backendOk === null ? "checking…" : backendOk ? "ok" : "down"}
        </p>
        {metrics ? (
          <ul>
            <li>lat: {metrics.lat}</li>
            <li>lon: {metrics.lon}</li>
            <li>cloud cover: {metrics.cloud_cover_pct}%</li>
            <li>lightning prob: {metrics.lightning_probability}</li>
            <li>note: {metrics.note}</li>
          </ul>
        ) : (
          <p>Search an address to see stub metrics.</p>
        )}
      </aside>
    </div>
  );
}
