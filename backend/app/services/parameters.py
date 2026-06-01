"""Registry of supported SMHI cloud parameters.

Each parameter is stored in its native unit (no cross-conversion). The
`indeterminate` codes map to None during parsing (param 16: 113 = "cannot
determine"; param 29: 9 = "sky obscured")."""

from dataclasses import dataclass


@dataclass(frozen=True)
class ParameterSpec:
    id: int
    label: str
    unit: str
    indeterminate: frozenset[float]


PARAMETERS: dict[int, ParameterSpec] = {
    16: ParameterSpec(16, "Total cloud cover", "percent", frozenset({113.0})),
    29: ParameterSpec(29, "Low cloud amount", "octas", frozenset({9.0})),
}
