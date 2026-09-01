from pathlib import Path
import pytest
from app.profiling.profiler import profile_csv
from app.readers.csv_reader import CsvInputError

FIXTURES = Path(__file__).parent / "fixtures"

def report(name: str):
    return profile_csv((FIXTURES / name).read_bytes(), name, "text/csv")

def ids(value): return {finding.rule_id for finding in value.findings}

def test_normal_csv_and_deterministic_output():
    first, second = report("normal.csv"), report("normal.csv")
    assert first.model_dump() == second.model_dump()
    assert first.file_summary.row_count == 3
    assert first.column_profiles[2].numeric_statistics["mean"] == 20.333333
    assert first.column_profiles[3].date_range["min"].startswith("2024-01-01")

def test_missing_values_use_populated_value_distinct_rate():
    value = report("missing.csv")
    name = next(column for column in value.column_profiles if column.column_name == "name")
    assert "missing_values.v1" in ids(value)
    assert (name.null_count, name.distinct_count, name.distinct_percentage, name.duplicate_value_rate) == (1, 2, 100.0, 0.0)
def test_duplicate_rows_and_duplicate_heavy_column():
    value = report("duplicates.csv")
    assert {"duplicate_rows.v1", "duplicate_values.v1"} <= ids(value)
def test_mixed_data_types_keep_numeric_statistics_for_parsed_values():
    value = report("mixed.csv")
    column = value.column_profiles[0]
    assert {"mixed_types.v1", "invalid_parsed_values.v1"} <= ids(value)
    assert column.inferred_type == "mixed"
    assert column.invalid_parsed_value_count == 1
    assert column.numeric_statistics["mean"] == 2.333333

def test_all_null_rows_are_not_counted_as_duplicate_records():
    value = report("all_null.csv")
    assert value.file_summary.duplicate_row_count == 0
    assert "all_null_column.v1" in ids(value)
    assert "duplicate_rows.v1" not in ids(value)
def test_constant_column(): assert "constant_column.v1" in ids(profile_csv(b"x\na\na\na\n", "constant.csv", "text/csv"))
def test_numeric_outliers(): assert "iqr_outliers.v1" in ids(report("outliers.csv"))
def test_invalid_headers(): assert "poor_column_name.v1" in ids(profile_csv(b"bad-name, ok\n1,2\n", "headers.csv", "text/csv"))

@pytest.mark.parametrize("payload,code", [(b"", "empty_file"), (b"a,b\n1,\"unterminated", "parsing_failure")])
def test_empty_and_malformed_csv(payload, code):
    with pytest.raises(CsvInputError) as error: profile_csv(payload, "broken.csv", "text/csv")
    assert error.value.code == code
