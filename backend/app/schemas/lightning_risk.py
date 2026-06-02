from pydantic import BaseModel


class RiskResponse(BaseModel):
    # Echoed inputs
    lat: float
    lon: float
    length_m: float
    width_m: float
    height_m: float
    location_factor: float
    line_length_m: float | None = None

    # Derived hazard
    n_g: float  # ground flash density, flashes/km^2/yr
    radius_km: float  # radius used to derive N_G
    span_years: float  # window N_G was annualized over
    ground_flash_count: int
    total_flash_count: int

    # Results
    collection_area_km2: float  # structure A_D
    expected_direct_per_year: float  # N_D
    annual_probability: float  # 1 - exp(-N_D)
    return_period_years: float | None = None  # 1/N_D, None when N_D == 0
    expected_line_per_year: float | None = None  # N_L, None when no line length
    hazard_band: str

    stale: bool = False
    attribution: str = "Data: SMHI (CC BY 4.0)"
