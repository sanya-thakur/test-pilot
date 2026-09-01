from pathlib import Path
from app.profiling.profiler import profile_csv

def test_normal_fixture_matches_golden_contract():
    fixture = Path(__file__).parent / "fixtures" / "normal.csv"
    report = profile_csv(fixture.read_bytes(), fixture.name, "text/csv")
    assert report.model_dump(mode="json") == {
        "profiler_version": "testpilot-profiler-v1",
        "file_summary": {"file_sha256": "4e4f003db05722e4a8afde623ec3fd1a590629347662445679f2206e5f4e5d22", "size_bytes": 86, "row_count": 3, "column_count": 4, "duplicate_row_count": 0, "encoding": "utf-8-sig", "delimiter": ",", "header_quality": "good"},
        "health_score": {"score": 100, "deductions": {}, "scoring_version": "score-v1"},
        "severity_totals": {"info": 0, "warning": 0, "error": 0},
        "findings": [],
        "column_profiles": report.model_dump(mode="json")["column_profiles"],
    }
