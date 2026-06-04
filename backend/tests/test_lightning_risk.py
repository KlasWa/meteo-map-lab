from math import isclose, pi

from app.services import lightning_risk as lr


def test_collection_area_structure_matches_iec_formula():
    # A_D = L*W + 6H(L+W) + 9*pi*H^2
    l, w, h = 20.0, 10.0, 5.0
    expected = l * w + 6 * h * (l + w) + 9 * pi * h * h
    assert isclose(lr.collection_area_structure(l, w, h), expected)


def test_collection_area_structure_flat_is_footprint():
    # Zero height -> area is just the footprint.
    assert lr.collection_area_structure(20.0, 10.0, 0.0) == 200.0


def test_collection_area_line():
    assert lr.collection_area_line(1000.0) == 40_000.0


def test_ground_flash_density_basic():
    # 7854 ground flashes over a 50 km radius (area ~7853.98 km^2) in 1 year
    # -> ~1.0 flashes/km^2/yr.
    n_g = lr.ground_flash_density(7854, radius_km=50.0, span_years=1.0)
    assert isclose(n_g, 7854 / (pi * 2500) / 1.0)


def test_ground_flash_density_zero_count():
    assert lr.ground_flash_density(0, radius_km=50.0, span_years=1.0) == 0.0


def test_ground_flash_density_guards_zero_span():
    assert lr.ground_flash_density(100, radius_km=50.0, span_years=0.0) == 0.0


def test_expected_events_converts_m2_to_km2():
    # N = N_G * A(km^2) * factor; 1e6 m^2 = 1 km^2.
    assert isclose(lr.expected_events(2.0, 1_000_000.0, 1.0), 2.0)
    assert isclose(lr.expected_events(2.0, 1_000_000.0, 0.5), 1.0)


def test_annual_probability_is_poisson():
    assert lr.annual_probability(0.0) == 0.0
    assert isclose(lr.annual_probability(1.0), 1 - pow(2.718281828459045, -1.0), rel_tol=1e-9)


def test_return_period_years():
    assert lr.return_period_years(0.0) is None
    assert isclose(lr.return_period_years(0.01), 100.0)


def test_hazard_band_boundaries():
    assert lr.hazard_band(0.00005) == "Very low"
    assert lr.hazard_band(0.0005) == "Low"
    assert lr.hazard_band(0.005) == "Moderate"
    assert lr.hazard_band(0.05) == "High"
