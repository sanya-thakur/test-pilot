import re
from app.models.report import ColumnProfile, Finding

RULESET_VERSION = "rules-v1"

# duplicate_rows.v1 compares only rows with at least one populated cell. Fully
# empty rows are represented by missing-value/all-null-column findings instead.

def _severity(percent: float, warning: float = 5, error: float = 25) -> str:
    return "error" if percent >= error else "warning" if percent >= warning else "info"

def make_findings(columns: list[ColumnProfile], duplicate_rows: int, row_count: int, bad_headers: list[str]) -> list[Finding]:
    findings: list[Finding] = []
    if duplicate_rows:
        findings.append(Finding(rule_id="duplicate_rows.v1", severity=_severity(duplicate_rows / row_count * 100), metrics={"count": duplicate_rows}))
    for name in bad_headers:
        findings.append(Finding(rule_id="poor_column_name.v1", severity="warning", column=name))
    for col in columns:
        if col.inferred_type == "empty":
            findings.append(Finding(rule_id="all_null_column.v1", severity="error", column=col.column_name))
            continue
        if col.null_percentage > 0:
            findings.append(Finding(rule_id="missing_values.v1", severity=_severity(col.null_percentage), column=col.column_name, metrics={"percentage": col.null_percentage}))
        if col.distinct_count == 1:
            findings.append(Finding(rule_id="constant_column.v1", severity="warning", column=col.column_name))
        if col.duplicate_value_rate >= 80:
            findings.append(Finding(rule_id="duplicate_values.v1", severity=_severity(col.duplicate_value_rate, 80, 95), column=col.column_name, metrics={"percentage": col.duplicate_value_rate}))
        if col.inferred_type == "mixed":
            findings.append(Finding(rule_id="mixed_types.v1", severity="warning", column=col.column_name, metrics={"invalid_count": col.invalid_parsed_value_count}))
        if col.invalid_parsed_value_count:
            findings.append(Finding(rule_id="invalid_parsed_values.v1", severity="warning", column=col.column_name, metrics={"count": col.invalid_parsed_value_count}))
        if col.numeric_statistics and col.numeric_statistics.get("outlier_count", 0):
            findings.append(Finding(rule_id="iqr_outliers.v1", severity=_severity(col.numeric_statistics["outlier_percentage"], 1, 10), column=col.column_name, metrics={"count": int(col.numeric_statistics["outlier_count"]), "rule": "values below Q1 - 1.5*IQR or above Q3 + 1.5*IQR"}))
    return findings

def bad_headers(headers: list[str]) -> list[str]:
    return [h for h in headers if not h.strip() or h != h.strip() or not re.match(r"^[A-Za-z_][A-Za-z0-9_ ]*$", h)]
