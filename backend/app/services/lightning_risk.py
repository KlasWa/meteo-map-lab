"""Pure IEC 62305 lightning-risk math. No I/O — only formulas, so it is
trivially unit-testable. Collection areas are in m^2; densities are in
flashes per km^2 per year."""

from math import exp, pi

_M2_PER_KM2 = 1_000_000.0

# IEC location factors C_D (see schema/route enum).
LOCATION_FACTORS = (0.25, 0.5, 1.0, 2.0)


def collection_area_structure(length_m: float, width_m: float, height_m: float) -> float:
    """IEC direct-strike collection area A_D = L*W + 6H(L+W) + 9*pi*H^2, in m^2."""
    l, w, h = length_m, width_m, height_m
    return l * w + 6 * h * (l + w) + 9 * pi * h * h


def collection_area_line(line_length_m: float) -> float:
    """IEC service-line incidence area A_L = 40 * L_c, in m^2."""
    return 40.0 * line_length_m


def ground_flash_density(ground_flash_count: int, radius_km: float, span_years: float) -> float:
    """Empirical N_G = flashes / (pi * R^2) / years, in flashes/km^2/yr."""
    area_km2 = pi * radius_km * radius_km
    if area_km2 <= 0 or span_years <= 0:
        return 0.0
    return ground_flash_count / area_km2 / span_years


def expected_events(n_g: float, area_m2: float, factor: float = 1.0) -> float:
    """Expected annual events N = N_G * A(km^2) * factor."""
    return n_g * (area_m2 / _M2_PER_KM2) * factor


def annual_probability(expected_per_year: float) -> float:
    """Poisson probability of at least one event in a year: 1 - exp(-N)."""
    return 1.0 - exp(-expected_per_year)


def return_period_years(expected_per_year: float) -> float | None:
    """Return period 1/N in years; None when N == 0."""
    if expected_per_year <= 0:
        return None
    return 1.0 / expected_per_year


def hazard_band(p_annual: float) -> str:
    """Presentational heuristic band (NOT an IEC R1 compliance verdict)."""
    if p_annual < 1e-4:
        return "Very low"
    if p_annual < 1e-3:
        return "Low"
    if p_annual < 1e-2:
        return "Moderate"
    return "High"
