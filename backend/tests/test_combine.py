from app.dto import ParsedObs
from app.services.combine import merge_layers_max


def test_max_picks_highest_layer_per_timestamp():
    layer1 = [ParsedObs(1000, 1.0, "G"), ParsedObs(2000, 4.0, "G")]
    layer2 = [ParsedObs(1000, 3.0, "G"), ParsedObs(2000, 2.0, "G")]
    layer3 = [ParsedObs(1000, 5.0, "G")]
    merged = merge_layers_max([layer1, layer2, layer3])
    assert [(o.ts_utc, o.value) for o in merged] == [(1000, 5.0), (2000, 4.0)]


def test_none_values_are_skipped():
    layer1 = [ParsedObs(1000, None, "G"), ParsedObs(2000, 2.0, "G")]
    layer2 = [ParsedObs(1000, 3.0, "G")]
    merged = merge_layers_max([layer1, layer2])
    assert [(o.ts_utc, o.value) for o in merged] == [(1000, 3.0), (2000, 2.0)]


def test_timestamp_with_all_none_is_omitted():
    layer1 = [ParsedObs(1000, None, "G")]
    layer2 = [ParsedObs(1000, None, "G")]
    assert merge_layers_max([layer1, layer2]) == []


def test_empty_input_returns_empty():
    assert merge_layers_max([]) == []
    assert merge_layers_max([[], []]) == []


def test_result_is_sorted_by_timestamp():
    layer1 = [ParsedObs(3000, 1.0, "G"), ParsedObs(1000, 1.0, "G")]
    merged = merge_layers_max([layer1])
    assert [o.ts_utc for o in merged] == [1000, 3000]
