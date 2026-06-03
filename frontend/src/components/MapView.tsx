import { useEffect, useLayoutEffect, useRef } from "react";
import * as maptilersdk from "@maptiler/sdk";
import "@maptiler/sdk/dist/maptiler-sdk.css";
import { GeocodingControl } from "@maptiler/geocoding-control/maptilersdk";
import type { PickEvent } from "@maptiler/geocoding-control/maptilersdk";

import { rectangleDimensions } from "../lib/geo";
import type { LatLon } from "../lib/url-state";

const apiKey = import.meta.env.VITE_MAPTILER_KEY as string | undefined;

// Match the zoom the MapTiler geocoding control flies to for an address pick
// so a click / URL restore feels equivalent to a search.
const SELECTED_ZOOM = 18;

const BOX_SOURCE = "measure-box";
const EMPTY_FC = { type: "FeatureCollection" as const, features: [] };

function boxFeatureCollection(a: LatLon, b: LatLon) {
  const ring = [
    [a.lon, a.lat],
    [b.lon, a.lat],
    [b.lon, b.lat],
    [a.lon, b.lat],
    [a.lon, a.lat],
  ];
  return {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        geometry: { type: "Polygon" as const, coordinates: [ring] },
        properties: {},
      },
    ],
  };
}

function setBoxData(
  map: maptilersdk.Map,
  corners: [LatLon, LatLon] | null,
): void {
  const src = map.getSource(BOX_SOURCE) as
    | maptilersdk.GeoJSONSource
    | undefined;
  if (!src) return;
  src.setData(
    corners ? boxFeatureCollection(corners[0], corners[1]) : EMPTY_FC,
  );
}

type Props = {
  onSelect?: (lat: number, lon: number) => void;
  onMapClick?: (lat: number, lon: number) => void;
  selected?: LatLon | null;
  drawing?: boolean;
  onRectangleDrawn?: (lengthM: number, widthM: number) => void;
  onDrawCancel?: () => void;
};

export function MapView({
  onSelect,
  onMapClick,
  selected,
  drawing = false,
  onRectangleDrawn,
  onDrawCancel,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maptilersdk.Map | null>(null);
  const markerRef = useRef<maptilersdk.Marker | null>(null);
  const onSelectRef = useRef(onSelect);
  const onMapClickRef = useRef(onMapClick);
  const selectedRef = useRef(selected);
  const drawingRef = useRef(drawing);
  const onRectangleDrawnRef = useRef(onRectangleDrawn);
  const onDrawCancelRef = useRef(onDrawCancel);
  const firstCornerRef = useRef<LatLon | null>(null);
  // Capture the initial selection so we can center the map on URL-restored
  // coordinates without making the init effect depend on `selected`.
  const initialSelectedRef = useRef(selected);

  useLayoutEffect(() => {
    onSelectRef.current = onSelect;
    onMapClickRef.current = onMapClick;
    selectedRef.current = selected;
    drawingRef.current = drawing;
    onRectangleDrawnRef.current = onRectangleDrawn;
    onDrawCancelRef.current = onDrawCancel;
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

    map.on("load", () => {
      map.addSource(BOX_SOURCE, { type: "geojson", data: EMPTY_FC });
      map.addLayer({
        id: "measure-box-fill",
        type: "fill",
        source: BOX_SOURCE,
        paint: { "fill-color": "#9ca3af", "fill-opacity": 0.25 },
      });
      map.addLayer({
        id: "measure-box-line",
        type: "line",
        source: BOX_SOURCE,
        paint: { "line-color": "#6b7280", "line-width": 2 },
      });
    });

    const gc = new GeocodingControl({ apiKey });
    map.addControl(gc);

    // PickEvent.feature.center is [lng, lat] (Position).
    const pickSub = gc.on("pick", (event: PickEvent) => {
      const coords = event.feature?.center;
      if (coords) onSelectRef.current?.(coords[1], coords[0]);
    });

    map.on("click", (event) => {
      const { lng, lat } = event.lngLat;

      // Draw mode swallows clicks: first click sets a corner, second finalises.
      if (drawingRef.current) {
        if (!firstCornerRef.current) {
          firstCornerRef.current = { lat, lon: lng };
          return;
        }
        const { lengthM, widthM } = rectangleDimensions(
          firstCornerRef.current,
          {
            lat,
            lon: lng,
          },
        );
        firstCornerRef.current = null;
        setBoxData(map, null);
        if (lengthM < 1 && widthM < 1) {
          onDrawCancelRef.current?.();
        } else {
          onRectangleDrawnRef.current?.(lengthM, widthM);
        }
        return;
      }

      // If something is already selected, a map click clears it (handled by the
      // parent); only fly in when the click is actually selecting a new spot.
      if (!selectedRef.current) {
        map.flyTo({ center: [lng, lat], zoom: SELECTED_ZOOM });
      }
      onMapClickRef.current?.(lat, lng);
    });

    map.on("mousemove", (event) => {
      if (!drawingRef.current || !firstCornerRef.current) return;
      const { lng, lat } = event.lngLat;
      setBoxData(map, [firstCornerRef.current, { lat, lon: lng }]);
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && drawingRef.current) onDrawCancelRef.current?.();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      pickSub.unsubscribe();
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Toggle the crosshair cursor and reset any half-drawn box when draw mode
  // turns on or off.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = drawing ? "crosshair" : "";
    firstCornerRef.current = null;
    setBoxData(map, null);
  }, [drawing]);

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
