import { useEffect, useLayoutEffect, useRef } from "react";
import * as maptilersdk from "@maptiler/sdk";
import "@maptiler/sdk/dist/maptiler-sdk.css";
import { GeocodingControl } from "@maptiler/geocoding-control/maptilersdk";
import type {
  Feature,
  PickEvent,
} from "@maptiler/geocoding-control/maptilersdk";

import { rotatedRectangle } from "../lib/geo";
import type { LatLon } from "../lib/url-state";

const apiKey = import.meta.env.VITE_MAPTILER_KEY as string | undefined;

// Match the zoom used for a search pick or map click so both feel equivalent.
const SELECTED_ZOOM = 18;

/** easeTo (not flyTo) so the camera settles with the aside CSS transition. */
function easeMapToSelection(map: maptilersdk.Map, pt: LatLon): void {
  map.easeTo({
    center: [pt.lon, pt.lat],
    padding: { bottom: 0 },
    zoom: SELECTED_ZOOM,
    duration: 600,
  });
}

// Ignore map clicks briefly after geocoder use so a list pick is not undone when
// the dropdown closes and the pointer hits the map underneath.
const GEOCODER_CLICK_SUPPRESS_MS = 800;

const GEOCODER_ROOT_SELECTOR =
  "maptiler-geocoder, .maplibregl-ctrl-geocoder, .maptiler-ctrl-geocoder";

const GEOCODER_FEATURE_ITEM_TAG = "MAPTILER-GEOCODER-FEATURE-ITEM";

interface GeocoderFeatureItemEl extends HTMLElement {
  feature?: Feature;
}

/** Feature for a tapped result row (shadow DOM; only click, not touch, by default). */
function featureFromGeocoderResultTap(event: Event): Feature | undefined {
  for (const node of event.composedPath()) {
    if (!(node instanceof HTMLElement)) continue;
    if (node.tagName === GEOCODER_FEATURE_ITEM_TAG) {
      return (node as GeocoderFeatureItemEl).feature;
    }
  }
  return undefined;
}

function coordsFromGeocoderFeature(
  feature: Feature | undefined,
): LatLon | null {
  if (!feature) return null;
  if (feature.center?.length === 2) {
    return { lat: feature.center[1], lon: feature.center[0] };
  }
  const geom = feature.geometry;
  if (
    geom?.type === "Point" &&
    Array.isArray(geom.coordinates) &&
    geom.coordinates.length >= 2
  ) {
    return { lat: geom.coordinates[1], lon: geom.coordinates[0] };
  }
  return null;
}

/** True when the event originated inside the geocoder (incl. shadow DOM). */
function eventTargetsGeocoder(event: Event): boolean {
  for (const node of event.composedPath()) {
    if (!(node instanceof Element)) continue;
    if (
      node.matches(GEOCODER_ROOT_SELECTOR) ||
      node.closest(GEOCODER_ROOT_SELECTOR)
    ) {
      return true;
    }
  }
  return false;
}

// Finger movement below this (px) counts as a tap, not a pan gesture.
const TAP_SLOP_PX = 12;

const MEASURE_HOLD_MS = 450;
const MEASURE_FADE_MS = 500;
const MEASURE_FILL_OPACITY = 0.35;

const BOX_SOURCE = "measure-box";
const BOX_FILL_LAYER = "measure-box-fill";
const BOX_LINE_LAYER = "measure-box-line";
const EMPTY_FC = { type: "FeatureCollection" as const, features: [] };

function lineFC(a: LatLon, b: LatLon) {
  return {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        geometry: {
          type: "LineString" as const,
          coordinates: [
            [a.lon, a.lat],
            [b.lon, b.lat],
          ],
        },
        properties: {},
      },
    ],
  };
}

function polygonFC(corners: readonly LatLon[]) {
  const ring = [...corners, corners[0]].map((p) => [p.lon, p.lat]);
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

function setMeasureData(
  map: maptilersdk.Map,
  data:
    | ReturnType<typeof lineFC>
    | ReturnType<typeof polygonFC>
    | typeof EMPTY_FC,
): void {
  const src = map.getSource(BOX_SOURCE) as
    | maptilersdk.GeoJSONSource
    | undefined;
  if (!src) return;
  src.setData(data);
}

function latLonFromEvent(lngLat: { lat: number; lng: number }): LatLon {
  return { lat: lngLat.lat, lon: lngLat.lng };
}

function updateMeasurePreview(
  map: maptilersdk.Map,
  cornerA: LatLon,
  cornerB: LatLon | null,
  cursor: LatLon,
): void {
  if (!cornerB) {
    setMeasureData(map, lineFC(cornerA, cursor));
    return;
  }
  const { corners } = rotatedRectangle(cornerA, cornerB, cursor);
  setMeasureData(map, polygonFC(corners));
}

function resetMeasurePaint(map: maptilersdk.Map): void {
  if (!map.getLayer(BOX_FILL_LAYER)) return;
  map.setPaintProperty(BOX_FILL_LAYER, "fill-opacity", MEASURE_FILL_OPACITY);
  map.setPaintProperty(BOX_LINE_LAYER, "line-opacity", 1);
}

function cancelMeasureFade(frameRef: { current: number | null }): void {
  if (frameRef.current !== null) {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }
}

function fadeOutMeasureShape(
  map: maptilersdk.Map,
  fadeActiveRef: { current: boolean },
  frameRef: { current: number | null },
  holdTimerRef: { current: number | null },
  onDone?: () => void,
): void {
  cancelMeasureFade(frameRef);
  if (holdTimerRef.current !== null) {
    window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
  }
  fadeActiveRef.current = true;
  resetMeasurePaint(map);

  holdTimerRef.current = window.setTimeout(() => {
    holdTimerRef.current = null;
    const fadeStart = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - fadeStart) / MEASURE_FADE_MS);
      const rem = 1 - t;
      if (map.getLayer(BOX_FILL_LAYER)) {
        map.setPaintProperty(
          BOX_FILL_LAYER,
          "fill-opacity",
          MEASURE_FILL_OPACITY * rem,
        );
        map.setPaintProperty(BOX_LINE_LAYER, "line-opacity", rem);
      }
      if (t < 1) {
        frameRef.current = requestAnimationFrame(step);
        return;
      }
      frameRef.current = null;
      fadeActiveRef.current = false;
      resetMeasurePaint(map);
      setMeasureData(map, EMPTY_FC);
      onDone?.();
    };
    frameRef.current = requestAnimationFrame(step);
  }, MEASURE_HOLD_MS);
}

function setDrawGestures(map: maptilersdk.Map, enabled: boolean): void {
  if (enabled) {
    map.dragPan.enable();
    map.touchZoomRotate.enable();
    map.doubleClickZoom.enable();
    map.getCanvas().style.cursor = "";
    map.getCanvas().style.touchAction = "";
  } else {
    map.dragPan.disable();
    map.touchZoomRotate.disable();
    map.doubleClickZoom.disable();
    map.getCanvas().style.cursor = "crosshair";
    // Keep taps on the map from scrolling the page while measuring.
    map.getCanvas().style.touchAction = "none";
  }
}

type Props = {
  // Called when a place is picked via the geocoding control (search). The
  // address comes straight from the picked feature, so the parent can show
  // it without a second lookup.
  onSelect?: (lat: number, lon: number, address?: string) => void;
  // Called on a raw map click. No address — parent should reverse-geocode if
  // it wants one.
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
  // The two locked corners of the baseline. cornerA set after click 1, cornerB
  // after click 2; click 3 finalises the rectangle.
  const cornerARef = useRef<LatLon | null>(null);
  const cornerBRef = useRef<LatLon | null>(null);
  const measureFadeActiveRef = useRef(false);
  const measureFadeFrameRef = useRef<number | null>(null);
  const measureFadeHoldRef = useRef<number | null>(null);
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

    // MapTiler/MapLibre tracks window.resize but not container resize, so the
    // canvas stretches/crops when the aside animates next to it. Observe the
    // container and resize() on every change (RO fires at most once per frame).
    // const resizeObs = new ResizeObserver(() => map.resize());
    // resizeObs.observe(container);

    map.on("load", () => {
      map.addSource(BOX_SOURCE, { type: "geojson", data: EMPTY_FC });
      map.addLayer({
        id: BOX_FILL_LAYER,
        type: "fill",
        source: BOX_SOURCE,
        paint: {
          "fill-color": "#f59e0b",
          "fill-opacity": MEASURE_FILL_OPACITY,
        },
      });
      map.addLayer({
        id: BOX_LINE_LAYER,
        type: "line",
        source: BOX_SOURCE,
        paint: { "line-color": "#ea580c", "line-width": 2, "line-opacity": 1 },
      });
    });

    // No MapTiler markers/geometry — we show a single red marker for selection.
    const gc = new GeocodingControl({
      apiKey,
      marker: false,
      markerOnSelected: false,
      showResultMarkers: false,
      fullGeometryStyle: false,
      pickedResultStyle: "marker-only",
      clearListOnPick: true,
      // Camera moves in applyGeocoderPick — the control skips flyTo when the
      // feature id matches its last pick (e.g. pan away, search same place).
      flyTo: false,
    });
    map.addControl(gc);

    let suppressMapClickUntil = 0;
    let suppressClickUntil = 0;
    let lastGeocoderPickId: string | number | undefined;
    let lastGeocoderPickAt = 0;
    const markGeocoderInteraction = () => {
      suppressMapClickUntil = Date.now() + GEOCODER_CLICK_SUPPRESS_MS;
    };

    const onGeocoderInteraction = (event: Event) => {
      if (eventTargetsGeocoder(event)) markGeocoderInteraction();
    };

    const applyGeocoderPick = (feature: Feature | undefined) => {
      const pt = coordsFromGeocoderFeature(feature);
      if (!pt) return;

      // Always re-center — geocoder flyTo is off; its built-in fly also skips
      // when the feature id was picked before, even after the user panned away.
      easeMapToSelection(map, pt);

      const pickId = feature?.id;
      const now = Date.now();
      if (
        pickId !== undefined &&
        pickId === lastGeocoderPickId &&
        now - lastGeocoderPickAt < 600
      ) {
        return;
      }
      lastGeocoderPickId = pickId;
      lastGeocoderPickAt = now;
      markGeocoderInteraction();
      // Block the synthetic click mobile browsers emit after a result tap.
      suppressClickUntil = Date.now() + 500;
      gc.clearMap();
      onSelectRef.current?.(pt.lat, pt.lon, feature?.place_name);
    };

    // Mobile: list items only listen for click, which often never fires after
    // the search input blurs. Fire the row's "select" event so the geocoder
    // runs its normal pick path (clearListOnPick, pick event) before our hook.
    const onGeocoderResultTouchEnd = (event: TouchEvent) => {
      if (!featureFromGeocoderResultTap(event)) return;
      event.preventDefault();
      markGeocoderInteraction();
      suppressClickUntil = Date.now() + 500;
      for (const node of event.composedPath()) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.tagName === GEOCODER_FEATURE_ITEM_TAG) {
          node.dispatchEvent(
            new CustomEvent("select", { bubbles: true, composed: true }),
          );
          return;
        }
      }
    };

    const mapContainer = map.getContainer();
    mapContainer.addEventListener("pointerdown", onGeocoderInteraction, true);
    mapContainer.addEventListener("touchstart", onGeocoderInteraction, {
      capture: true,
      passive: true,
    });
    mapContainer.addEventListener("touchend", onGeocoderResultTouchEnd, {
      capture: true,
      passive: false,
    });

    const pickSub = gc.on("pick", (event: PickEvent) => {
      applyGeocoderPick(event.feature);
    });

    let touchStart: { x: number; y: number } | null = null;

    const placeMeasurePoint = (pt: LatLon): boolean => {
      if (!drawingRef.current) return false;

      // Three taps: corner A, corner B (one side), then the opposite side.
      if (!cornerARef.current) {
        cornerARef.current = pt;
        setMeasureData(map, EMPTY_FC);
        return true;
      }
      if (!cornerBRef.current) {
        cornerBRef.current = pt;
        setMeasureData(map, lineFC(cornerARef.current, pt));
        return true;
      }
      const { lengthM, widthM, corners } = rotatedRectangle(
        cornerARef.current,
        cornerBRef.current,
        pt,
      );
      cornerARef.current = null;
      cornerBRef.current = null;
      setMeasureData(map, polygonFC(corners));

      if (lengthM < 1 && widthM < 1) {
        fadeOutMeasureShape(
          map,
          measureFadeActiveRef,
          measureFadeFrameRef,
          measureFadeHoldRef,
          () => onDrawCancelRef.current?.(),
        );
      } else {
        onRectangleDrawnRef.current?.(lengthM, widthM);
        fadeOutMeasureShape(
          map,
          measureFadeActiveRef,
          measureFadeFrameRef,
          measureFadeHoldRef,
        );
      }
      return true;
    };

    const previewMeasureAt = (cursor: LatLon) => {
      if (!drawingRef.current || !cornerARef.current) return;
      updateMeasurePreview(map, cornerARef.current, cornerBRef.current, cursor);
    };

    map.on("touchstart", (event) => {
      if (!drawingRef.current) return;
      const t = event.originalEvent.touches[0];
      if (!t) return;
      touchStart = { x: t.clientX, y: t.clientY };
    });

    map.on("touchend", (event) => {
      if (!drawingRef.current || !touchStart) return;
      const t = event.originalEvent.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - touchStart.x;
      const dy = t.clientY - touchStart.y;
      touchStart = null;
      if (dx * dx + dy * dy > TAP_SLOP_PX * TAP_SLOP_PX) return;
      if (placeMeasurePoint(latLonFromEvent(event.lngLat))) {
        // MapLibre also emits click after touchend; skip the duplicate.
        suppressClickUntil = Date.now() + 500;
      }
    });

    map.on("touchcancel", () => {
      touchStart = null;
    });

    map.on("click", (event) => {
      const domEvent = event.originalEvent;
      if (
        (domEvent && eventTargetsGeocoder(domEvent)) ||
        Date.now() < suppressMapClickUntil
      ) {
        return;
      }

      const pt = latLonFromEvent(event.lngLat);

      // Touchend places measure corners and exits draw mode before the
      // synthetic click arrives; suppress that click entirely so it does not
      // fall through to the selection-toggle handler below.
      if (Date.now() < suppressClickUntil) return;

      if (drawingRef.current && placeMeasurePoint(pt)) return;

      // If something is already selected, a map click clears it (handled by the
      // parent); only fly in when the click is actually selecting a new spot.
      // easeTo with a fixed duration (rather than flyTo's auto ballistic curve)
      // so the camera animation ends in step with the parent's aside CSS
      // transition (~300ms). flyTo's auto-curve outlasts the transition by
      // 1-2s, leaving the camera mid-flight after the layout has settled —
      // the point reads as not-yet-centered relative to the new map size.
      if (!selectedRef.current) {
        easeMapToSelection(map, pt);
      }
      onMapClickRef.current?.(pt.lat, pt.lon);
    });

    map.on("mousemove", (event) => {
      previewMeasureAt(latLonFromEvent(event.lngLat));
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && drawingRef.current) onDrawCancelRef.current?.();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      // resizeObs.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      mapContainer.removeEventListener(
        "pointerdown",
        onGeocoderInteraction,
        true,
      );
      mapContainer.removeEventListener(
        "touchstart",
        onGeocoderInteraction,
        true,
      );
      mapContainer.removeEventListener(
        "touchend",
        onGeocoderResultTouchEnd,
        true,
      );
      cancelMeasureFade(measureFadeFrameRef);
      if (measureFadeHoldRef.current !== null) {
        window.clearTimeout(measureFadeHoldRef.current);
        measureFadeHoldRef.current = null;
      }
      measureFadeActiveRef.current = false;
      pickSub.unsubscribe();
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Toggle draw gestures; entering measure mode clears any in-progress shape.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      if (drawing) {
        cancelMeasureFade(measureFadeFrameRef);
        if (measureFadeHoldRef.current !== null) {
          window.clearTimeout(measureFadeHoldRef.current);
          measureFadeHoldRef.current = null;
        }
        measureFadeActiveRef.current = false;
        setDrawGestures(map, false);
        cornerARef.current = null;
        cornerBRef.current = null;
        resetMeasurePaint(map);
        setMeasureData(map, EMPTY_FC);
        return;
      }

      setDrawGestures(map, true);
      if (!measureFadeActiveRef.current) {
        resetMeasurePaint(map);
        setMeasureData(map, EMPTY_FC);
      }
    };

    if (map.loaded()) apply();
    else map.once("load", apply);
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
