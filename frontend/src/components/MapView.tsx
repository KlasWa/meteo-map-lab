import { useEffect, useLayoutEffect, useRef } from "react";
import * as maptilersdk from "@maptiler/sdk";
import "@maptiler/sdk/dist/maptiler-sdk.css";
import { GeocodingControl } from "@maptiler/geocoding-control/maptilersdk";
import type { PickEvent } from "@maptiler/geocoding-control/maptilersdk";

const apiKey = import.meta.env.VITE_MAPTILER_KEY as string | undefined;

type Props = {
  onSelect?: (lat: number, lon: number) => void;
};

export function MapView({ onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onSelectRef = useRef(onSelect);

  // Keep ref in sync with the latest prop without re-running the map effect.
  // useLayoutEffect runs synchronously after DOM updates, before pick events
  // can fire, so the ref is always current when the callback is invoked.
  useLayoutEffect(() => {
    onSelectRef.current = onSelect;
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !apiKey) return;

    maptilersdk.config.apiKey = apiKey;
    const map = new maptilersdk.Map({
      container,
      style: "https://api.maptiler.com/maps/hybrid-v4/style.json",
      center: [15.0, 62.0], // Sweden [lng, lat]
      zoom: 4,
    });

    const gc = new GeocodingControl({ apiKey });
    map.addControl(gc);

    // In v3, GeocodingControl uses the MapTiler SDK event system:
    // gc.on(eventName, listener) returns a Subscription with unsubscribe().
    // The PickEvent has `feature` directly on the event object (BaseEvent &
    // { feature: Feature | undefined }) — not via event.detail.
    // Feature.center is [lng, lat] (Position = [x, y]), so lat = coords[1].
    const subscription = gc.on("pick", (event: PickEvent) => {
      const coords = event.feature?.center;
      if (coords) {
        onSelectRef.current?.(coords[1], coords[0]);
      }
    });

    return () => {
      subscription.unsubscribe();
      map.remove();
    };
  }, []);

  if (!apiKey) {
    return (
      <div style={{ padding: 16, fontFamily: "sans-serif" }}>
        Set <code>VITE_MAPTILER_KEY</code> in <code>frontend/.env</code> to load
        the map.
      </div>
    );
  }

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
