# Lightning strike risk for a point (IEC 62305) — design

Date: 2026-06-02
Status: Approved (pending implementation plan)

## Goal

Answer "what is the chance/risk of being hit by lightning at this specific
point?" by computing an IEC 62305-style estimate from the lightning-strike data
the app already caches. The user supplies a structure's dimensions; the system
derives a local ground flash density from cached SMHI strikes and returns the
expected annual number of direct strikes, the annual probability, a return
period, and a supplementary service-line figure.

## Scope

In scope:
- Empirical ground flash density `N_G` derived from cached strikes.
- Structure direct-strike collection area `A_D` from user-supplied L/W/H.
- Service-line incidence area `A_L` from an optional line length.
- IEC location factor `C_D` (user-selected).
- Expected annual events, Poisson annual probability, return period, and a
  presentational hazard band.
- A backend endpoint and a frontend input/result panel.

Out of scope (explicitly):
- Full IEC 62305-2 R1 life-safety risk assessment (probability-of-damage and
  loss factors, tolerable-risk thresholds). The hazard band is a presentational
  heuristic, NOT an IEC R1 compliance verdict.
- Protection-measure modelling (LPS, SPDs).
- Transformer / line-installation factors beyond defaults (`C_I = C_T = 1`).

## The math (pure core)

Implemented in a new pure module `backend/app/services/lightning_risk.py` — no
I/O, only the IEC formulas, so it is trivially unit-testable.

### Empirical ground flash density

```
N_G = ground_flashes_in_radius / (pi * R^2) / span_years        [flashes/km^2/yr]
```

- `R` = existing `settings.lightning_radius_km` (50 km) → area ≈ 7 854 km².
- `ground_flashes` = cached strikes with `cloud_indicator == 0` only
  (cloud-to-ground). Cloud flashes (`cloud_indicator == 1`) are excluded because
  IEC `N_G` is a *ground* flash density.
- `span_years = settings.lightning_history_months / 12`. This is the window the
  `LightningService` keeps fully cached (it re-fetches every day in the window
  on each request). Documented assumption: a stale or partially-filled cache
  under-counts `N_G`; that condition is surfaced via the `stale` flag.
- `N_G == 0` (no recorded ground flashes in the window) is valid and yields a
  probability of 0.

### Structure collection area

L, W, H are the structure length, width, and height in metres.

```
A_D = L*W + 6*H*(L + W) + 9*pi*H^2        [m^2]   -> /1e6 -> km^2
```

(`L*W` footprint, `6H(L+W)` the lateral attractive strip at a 3H radius, and
`9*pi*H^2 = pi*(3H)^2` the corner quarter-discs.)

### Service-line incidence area (optional)

`L_c` = incoming line length in metres.

```
A_L = 40 * L_c        [m^2]   -> /1e6 -> km^2
```

### Expected annual events

```
N_D = N_G * A_D_km2 * C_D        (direct strikes to the structure)
N_L = N_G * A_L_km2              (strikes to the incoming line; C_I = C_T = 1)
```

`C_D` is the IEC location factor, user-selected:

| Situation                                   | C_D  |
|---------------------------------------------|------|
| Surrounded by taller objects/trees          | 0.25 |
| Surrounded by objects of equal/lower height | 0.50 |
| Isolated (no nearby objects)                | 1.00 |
| Isolated on a hilltop / promontory          | 2.00 |

### Probability

Strikes are treated as Poisson events.

```
P_annual   = 1 - exp(-N_D)        (chance of >= 1 direct strike this year)
return_yrs = 1 / N_D              ("about 1 in X years"); undefined when N_D == 0
```

The **headline** number is `P_annual`. `N_L` is reported as a separate
supplementary figure (strikes to the incoming line are relevant to surge/damage,
not literally "being hit").

### Hazard band (presentational heuristic)

Based on `P_annual`. Labelled in the UI as a heuristic, not an IEC verdict:

| Band      | P_annual         |
|-----------|------------------|
| Very low  | < 1e-4           |
| Low       | 1e-4 .. < 1e-3   |
| Moderate  | 1e-3 .. < 1e-2   |
| High      | >= 1e-2          |

## Backend

### Service

`LightningService.ground_flash_density(lat, lon, now_ms=None)`:
- Reuses the same fetch + bounding-box + haversine path as `get_lightning`. A
  shared private helper `_strikes_within(lat, lon, start_ms, now_ms)` is
  extracted from `get_lightning` to avoid duplicating the bbox/haversine logic.
- Returns: `N_G`, ground flash count, total flash count, `span_years`, and
  `stale`.
- Raises `LightningUnavailable` (same as `get_lightning`) when SMHI is down and
  nothing is cached.

### Endpoint

`GET /api/lightning-risk`

Query parameters:
- `lat: float`, `lon: float` (required)
- `length_m: float > 0`, `width_m: float > 0`, `height_m: float > 0` (required)
- `location_factor: float` — constrained to the enum values {0.25, 0.5, 1.0,
  2.0}; default `1.0`
- `line_length_m: float > 0` (optional; omit → no `N_L` / `expected_line_per_year`)

Errors:
- `422` on non-positive dimensions or an out-of-set location factor (FastAPI
  query validation).
- `503` on `LightningUnavailable`, mirroring `/api/lightning`.

### Response schema

`backend/app/schemas/lightning_risk.py` → `RiskResponse`:
- echoed inputs: `lat`, `lon`, `length_m`, `width_m`, `height_m`,
  `location_factor`, `line_length_m | None`
- `n_g` (flashes/km²/yr)
- `collection_area_km2` (structure `A_D`)
- `expected_direct_per_year` (`N_D`)
- `annual_probability` (`P_annual`)
- `return_period_years | None` (None when `N_D == 0`)
- `expected_line_per_year | None` (`N_L`; None when no line length given)
- `hazard_band` (string)
- `ground_flash_count`, `total_flash_count`
- `span_years`
- `radius_km` (the `R` used for `N_G`)
- `stale: bool`
- `attribution: str = "Data: SMHI (CC BY 4.0)"`

## Frontend

A collapsible "Strike risk" panel under the existing lightning section in
`App.tsx`:
- Number inputs: length, width, height (metres); optional line length (metres).
- A location-factor `<select>` (the four `C_D` options above).
- A "Calculate" button → `getLightningRisk(...)` in `lib/api.ts`, reusing the
  currently-selected lat/lon.
- A result card showing: the headline annual probability, "≈ 1 in X years",
  expected direct strikes/yr, the local `N_G`, the hazard band (labelled a
  heuristic), and the supplementary line figure when present.
- Matches existing daisyUI `card` / `badge` / `select` patterns. Propagates the
  `stale` badge consistently with the rest of the UI.

API types are regenerated from the backend OpenAPI schema via `make gen-api`
(commit the updated `openapi.json` and `api-schema.d.ts`).

## Error handling summary

| Condition                          | Behaviour                                   |
|------------------------------------|---------------------------------------------|
| No ground flashes in window        | `N_G = 0` → `P_annual = 0`, band "Very low", `return_period_years = None` |
| SMHI down + empty cache            | `503`                                       |
| SMHI down + cache present          | Compute from cache, `stale = true`          |
| Non-positive dimension             | `422`                                       |
| Location factor not in {0.25,0.5,1,2} | `422`                                    |
| Missing `line_length_m`            | Omit `N_L` / `expected_line_per_year`       |

## Testing

- **Pure math** (`lightning_risk.py`): known L/W/H → known `A_D`; `A_L` from
  `L_c`; `N_D`/`N_L`; `N_G = 0` → `P = 0` and `return_period = None`; Poisson
  `P_annual` and hazard-band boundaries.
- **Service** (`ground_flash_density`): seeded strikes verifying ground-vs-cloud
  filtering, radius cutoff (haversine), and annualization over `span_years`.
- **Endpoint**: happy path; optional line param present/absent; `422` on bad
  dimensions and bad location factor; `503` when `LightningUnavailable`.
  Follows the existing `test_cloud_cover_service` and route-test style.

## Files touched

New:
- `backend/app/services/lightning_risk.py`
- `backend/app/schemas/lightning_risk.py`
- backend tests for the above
- frontend result/input panel (within `App.tsx`, plus `lib/api.ts` helper)

Modified:
- `backend/app/services/lightning.py` (extract `_strikes_within`, add
  `ground_flash_density`)
- `backend/app/api/routes.py` (new endpoint)
- `frontend/src/App.tsx`, `frontend/src/lib/api.ts`
- `frontend/src/lib/api-schema.d.ts`, `backend/openapi.json` (regenerated)
```
