from app.services.geo import haversine_km


def test_haversine_known_distance():
    # Stockholm (59.33, 18.07) to Gothenburg (57.71, 11.97) ~ 398 km
    d = haversine_km(59.33, 18.07, 57.71, 11.97)
    assert 390 <= d <= 410


def test_haversine_zero_for_same_point():
    assert haversine_km(59.0, 18.0, 59.0, 18.0) == 0.0
