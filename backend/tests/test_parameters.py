from app.services.parameters import PARAMETERS, ParameterSpec


def test_registry_has_16_and_29():
    assert set(PARAMETERS) == {16, 29}
    assert isinstance(PARAMETERS[16], ParameterSpec)


def test_param_16_is_percent_with_113_indeterminate():
    spec = PARAMETERS[16]
    assert spec.unit == "percent"
    assert 113.0 in spec.indeterminate


def test_param_29_is_octas_with_9_indeterminate():
    spec = PARAMETERS[29]
    assert spec.unit == "octas"
    assert 9.0 in spec.indeterminate
    assert spec.label
