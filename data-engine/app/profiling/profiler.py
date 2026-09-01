import hashlib
import math
import pandas as pd
from app.models.report import ColumnProfile, FileSummary, ProfileReport
from app.profiling.rules.findings import RULESET_VERSION, bad_headers, make_findings
from app.profiling.scoring import score
from app.readers.csv_reader import read_csv

PROFILER_VERSION = "testpilot-profiler-v1"

def _pct(part: int, total: int) -> float:
    return round((part / total * 100) if total else 0.0, 4)

def _numbers(values: pd.Series):
    parsed = pd.to_numeric(values, errors="coerce")
    return parsed, int(parsed.isna().sum())

def _dates(values: pd.Series):
    parsed = pd.to_datetime(values, errors="coerce", utc=False)
    return parsed, int(parsed.isna().sum())

def _type(values: pd.Series):
    numeric, numeric_invalid = _numbers(values)
    if numeric_invalid == 0:
        return ("integer" if (numeric.dropna() % 1 == 0).all() else "number"), numeric, 0
    dates, date_invalid = _dates(values)
    if date_invalid == 0:
        return "date", dates, 0
    numeric_ok = len(values) - numeric_invalid
    date_ok = len(values) - date_invalid
    if numeric_ok and numeric_ok >= max(2, math.ceil(len(values) * .75)):
        return "mixed", numeric, numeric_invalid
    if date_ok and date_ok >= max(2, math.ceil(len(values) * .75)):
        return "mixed", dates, date_invalid
    return "string", None, 0

def _samples(values: pd.Series, sha: str) -> list[str]:
    # A stable hash ordering gives deterministic, bounded, de-identified previews.
    unique = sorted({str(v) for v in values.dropna() if str(v) != ""}, key=lambda value: hashlib.sha256((sha + value).encode()).hexdigest())
    return [f"sha256:{hashlib.sha256(value.encode()).hexdigest()[:12]}" for value in unique[:3]]

def _column_profile(name: str, raw: pd.Series, sha: str) -> ColumnProfile:
    total = len(raw)
    empty = int(raw.fillna("").eq("").sum())
    normalized = raw.mask(raw.eq(""))
    nulls = int(normalized.isna().sum())
    values = normalized.dropna()
    nonempty = len(values)
    distinct = int(values.nunique())
    inferred, parsed, invalid = ("empty", None, 0) if not nonempty else _type(values)
    numeric_stats = length_stats = date_range = None
    if inferred in {"integer", "number", "mixed"} and parsed is not None:
        # Mixed numeric columns retain statistics for their successfully parsed
        # values; invalid values remain visible through the profile and findings.
        clean = parsed.dropna()
        if len(clean):
            q1, q3 = clean.quantile(.25), clean.quantile(.75)
            iqr = q3 - q1
            outliers = ((clean < q1 - 1.5 * iqr) | (clean > q3 + 1.5 * iqr)).sum() if iqr > 0 else 0
            numeric_stats = {"min": round(float(clean.min()), 6), "max": round(float(clean.max()), 6), "mean": round(float(clean.mean()), 6), "median": round(float(clean.median()), 6), "q1": round(float(q1), 6), "q3": round(float(q3), 6), "iqr": round(float(iqr), 6), "outlier_count": float(outliers), "outlier_percentage": _pct(int(outliers), len(clean))}
    if inferred == "date" and parsed is not None:
        date_range = {"min": parsed.min().isoformat(), "max": parsed.max().isoformat()}
    if inferred in {"string", "mixed"}:
        lengths = values.astype(str).str.len()
        length_stats = {"min": float(lengths.min()), "max": float(lengths.max()), "mean": round(float(lengths.mean()), 6), "median": float(lengths.median())}
    # Distinct and duplicate-value rates describe populated values only; missing
    # cells are reported independently by null_count/null_percentage.
    return ColumnProfile(column_name=name, inferred_type=inferred, null_count=nulls, null_percentage=_pct(nulls, total), empty_string_count=empty, distinct_count=distinct, distinct_percentage=_pct(distinct, nonempty), duplicate_value_rate=_pct(nonempty - distinct, nonempty), invalid_parsed_value_count=invalid, numeric_statistics=numeric_stats, string_length_statistics=length_stats, date_range=date_range, samples=_samples(values, sha))

def profile_csv(data: bytes, filename: str, content_type: str | None = None) -> ProfileReport:
    frame, meta = read_csv(data, filename, content_type)
    headers = [str(h) for h in frame.columns]
    profiles = [_column_profile(name, frame.iloc[:, index], meta["sha256"]) for index, name in enumerate(headers)]
    # Rows with no populated cells carry no record-level information. Excluding
    # them prevents an all-null column from also producing a duplicate-row issue.
    populated_rows = frame.mask(frame.eq("")).notna().any(axis=1)
    duplicates = int(frame.loc[populated_rows].duplicated().sum())
    findings = make_findings(profiles, duplicates, len(frame), bad_headers(headers))
    totals = {severity: sum(f.severity == severity for f in findings) for severity in ("info", "warning", "error")}
    return ProfileReport(profiler_version=PROFILER_VERSION, file_summary=FileSummary(file_sha256=meta["sha256"], size_bytes=meta["size_bytes"], row_count=len(frame), column_count=len(headers), duplicate_row_count=duplicates, encoding=meta["encoding"], delimiter=meta["delimiter"], header_quality="poor" if bad_headers(headers) else "good"), health_score=score(findings), severity_totals=totals, findings=findings, column_profiles=profiles)
