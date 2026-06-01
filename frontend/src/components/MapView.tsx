import { useEffect, useLayoutEffect, useRef } from "react";
import * as maptilersdk from "@maptiler/sdk";
import "@maptiler/sdk/dist/maptiler-sdk.css";
import { GeocodingControl } from "@maptiler/geocoding-control/maptilersdk";
import type { PickEvent } from "@maptiler/geocoding-control/maptilersdk";

import type { LatLon } from "../lib/url-state";

const apiKey = import.meta.env.VITE_MAPTILER_KEY as string | undefined;

// Match the zoom the MapTiler geocoding control flies to for an address pick
// so a click / URL restore feels equivalent to a search.
const SELECTED_ZOOM = 18;

type Props = {
  onSelect?: (lat: number, lon: number) => void;
  onMapClick?: (lat: number, lon: number) => void;
  selected?: LatLon | null;
};

export function MapView({ onSelect, onMapClick, selected }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maptilersdk.Map | null>(null);
  const markerRef = useRef<maptilersdk.Marker | null>(null);
  const onSelectRef = useRef(onSelect);
  const onMapClickRef = useRef(onMapClick);
  const selectedRef = useRef(selected);
  // Capture the initial selection so we can center the map on URL-restored
  // coordinates without making the init effect depend on `selected`.
  const initialSelectedRef = useRef(selected);

  useLayoutEffect(() => {
    onSelectRef.current = onSelect;
    onMapClickRef.current = onMapClick;
    selectedRef.current = selected;
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !apiKey) return;

    maptilersdk.config.apiKey = apiKey;
    const initial = initialSelectedRef.current;
    const map = new maptilersdk.Map({
      container,
      style: "https://api.maptiler.com/maps/hybrid-v4/style.json",
      center: initial ? [initial.lon, initial.lat] : [15.0, 62.0],
      zoom: initial ? SELECTED_ZOOM : 4,
    });
    mapRef.current = map;

    const gc = new GeocodingControl({ apiKey });
    map.addControl(gc);

    // PickEvent.feature.center is [lng, lat] (Position).
    const pickSub = gc.on("pick", (event: PickEvent) => {
      const coords = event.feature?.center;
      if (coords) onSelectRef.current?.(coords[1], coords[0]);
    });

    map.on("click", (event) => {
      const { lng, lat } = event.lngLat;
      // If something is already selected, a map click clears it (handled by the
      // parent); only fly in when the click is actually selecting a new spot.
      if (!selectedRef.current) {
        map.flyTo({ center: [lng, lat], zoom: SELECTED_ZOOM });
      }
      onMapClickRef.current?.(lat, lng);
    });

    return () => {
      pickSub.unsubscribe();
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Keep a single marker in sync with the selected coordinate. Reuses the
  // marker across updates so clicks/picks don't flicker.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!selected) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    const lngLat: [number, number] = [selected.lon, selected.lat];
    if (markerRef.current) {
      markerRef.current.setLngLat(lngLat);
    } else {
      markerRef.current = new maptilersdk.Marker({ color: "#f43f5e" })
        .setLngLat(lngLat)
        .addTo(map);
    }
  }, [selected]);

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
