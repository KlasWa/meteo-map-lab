from app.services.parameters import PARAMETERS, ParameterSpec


def test_registry_has_all_cloud_params():
    assert set(PARAMETERS) == {16, 29, 31, 33, 35}
    assert isinstance(PARAMETERS[16], ParameterSpec)


def test_param_16_is_percent_with_113_indeterminate():
    spec = PARAMETERS[16]
    assert spec.unit == "percent"
    assert 113.0 in spec.indeterminate


def test_layer_params_are_octas_with_9_through_15_indeterminate():
    for pid in (29, 31, 33, 35):
        spec = PARAMETERS[pid]
        assert spec.unit == "octas", pid
        assert spec.label
        # code 9 (obscured) and 10-15 (METAR-reserved, empty) all drop to None
        assert {9.0, 10.0, 11.0, 12.0, 13.0, 14.0, 15.0} <= spec.indeterminate
