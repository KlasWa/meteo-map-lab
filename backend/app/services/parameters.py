"""Registry of supported SMHI cloud parameters.

Each parameter is stored in its native unit (no cross-conversion). The
`indeterminate` codes map to None during parsing (param 16: 113 = "cannot
determine"; octa layers 29/31/33/35: 9 = "sky obscured", 10-15 = METAR-reserved
and empty in this feed)."""

from dataclasses import dataclass


@dataclass(frozen=True)
class ParameterSpec:
    id: int
    label: str
    unit: str
    indeterminate: frozenset[float]


# Octa layers share an indeterminate set: code 9 = "sky obscured", and codes
# 10-15 are METAR-reserved (empty in this feed). Mapping all to None keeps them
# from corrupting the layer-max combination.
_LAYER_INDETERMINATE = frozenset({9.0, 10.0, 11.0, 12.0, 13.0, 14.0, 15.0})

PARAMETERS: dict[int, ParameterSpec] = {
    16: ParameterSpec(16, "Total cloud cover", "percent", frozenset({113.0})),
    29: ParameterSpec(29, "Low cloud amount", "octas", _LAYER_INDETERMINATE),
    31: ParameterSpec(31, "Cloud amount, 2nd layer", "octas", _LAYER_INDETERMINATE),
    33: ParameterSpec(33, "Cloud amount, 3rd layer", "octas", _LAYER_INDETERMINATE),
    35: ParameterSpec(35, "Cloud amount, 4th layer", "octas", _LAYER_INDETERMINATE),
}
