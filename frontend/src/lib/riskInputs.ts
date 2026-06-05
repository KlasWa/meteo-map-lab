import { useSyncExternalStore } from "react";

import type { LocationFactor } from "./api";

export interface RiskInputsState {
  length: string; // metres, kept as strings to mirror the <input> values
  width: string;
  height: string;
  lineLength: string;
  factor: LocationFactor;
  /** Bumped when length/width are set together from map measure (UI flash). */
  measureFlashTick: number;
}

// In-memory module state: re-initialised on reload (no localStorage), and shared
// across the session so the inputs survive location switches and remounts.
let state: RiskInputsState = {
  length: "20",
  width: "10",
  height: "5",
  lineLength: "",
  factor: 1,
  measureFlashTick: 0,
};

const listeners = new Set<() => void>();

// useSyncExternalStore requires a snapshot that is stable between mutations, so
// we return the same `state` object until a setter replaces it.
export function getRiskInputs(): RiskInputsState {
  return state;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function set(patch: Partial<RiskInputsState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

export const setLength = (length: string) => set({ length });
export const setWidth = (width: string) => set({ width });

/** Set length and width from a map measurement and signal the inputs to flash. */
export const setMeasuredDimensions = (length: string, width: string) =>
  set({ length, width, measureFlashTick: state.measureFlashTick + 1 });
export const setHeight = (height: string) => set({ height });
export const setLineLength = (lineLength: string) => set({ lineLength });
export const setFactor = (factor: LocationFactor) => set({ factor });

export function useRiskInputs(): RiskInputsState {
  return useSyncExternalStore(subscribe, getRiskInputs, getRiskInputs);
}
