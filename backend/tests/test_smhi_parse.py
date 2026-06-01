import json
from pathlib import Path

from app.services.smhi_parse import parse_archive_csv, parse_recent_json

FIXTURES = Path(__file__).parent / "fixtures"


def test_parse_archive_csv():
    text = (FIXTURES / "archive_sample.csv").read_text(encoding="utf-8")
    obs = parse_archive_csv(text)
    assert len(obs) == 5
    # First row: 2025-01-01 00:00:00 UTC -> 1735689600000 ms
    assert obs[0].ts_utc == 1735689600000
    assert obs[0].cloud_pct == 100.0
    assert obs[0].quality == "G"
    # 113 indeterminate -> None
    assert obs[2].cloud_pct is None
    # empty value -> None
    assert obs[3].cloud_pct is None
    # zero is a real value, not None
    assert obs[4].cloud_pct == 0.0
    assert obs[1].quality == "Y"


def test_parse_recent_json():
    payload = json.loads((FIXTURES / "recent_sample.json").read_text())
    obs = parse_recent_json(payload)
    assert len(obs) == 4
    assert obs[0].ts_utc == 1735689600000
    assert obs[0].cloud_pct == 90.0
    assert obs[1].cloud_pct is None  # 113
    assert obs[2].cloud_pct is None  # empty
    assert obs[3].cloud_pct == 20.0


def test_parse_recent_json_handles_missing_value_key():
    assert parse_recent_json({}) == []


def test_parse_recent_json_octas_with_param29_indeterminate():
    # Param 29 reports octas 0-8; code 9 = "sky obscured" -> None.
    payload = {
        "value": [
            {"date": 1735689600000, "value": "8", "quality": "G"},
            {"date": 1735693200000, "value": "9", "quality": "G"},
            {"date": 1735696800000, "value": "0", "quality": "G"},
        ]
    }
    obs = parse_recent_json(payload, indeterminate=frozenset({9.0}))
    assert obs[0].cloud_pct == 8.0
    assert obs[1].cloud_pct is None  # 9 = obscured
    assert obs[2].cloud_pct == 0.0  # zero is real


def test_parse_archive_csv_respects_custom_indeterminate():
    text = (
        "Datum;Tid (UTC);Molnmängd;Kvalitet;;\n"
        "2025-01-01;00:00:00;9;G;;\n"
        "2025-01-01;01:00:00;3;G;;\n"
    )
    obs = parse_archive_csv(text, indeterminate=frozenset({9.0}))
    assert obs[0].cloud_pct is None
    assert obs[1].cloud_pct == 3.0
