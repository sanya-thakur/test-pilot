from typing import Any, Literal
from pydantic import BaseModel, Field

Severity = Literal["info", "warning", "error"]

class Finding(BaseModel):
    rule_id: str
    severity: Severity
    column: str | None = None
    metrics: dict[str, Any] = Field(default_factory=dict)

class FileSummary(BaseModel):
    file_sha256: str
    size_bytes: int
    row_count: int
    column_count: int
    duplicate_row_count: int
    encoding: str
    delimiter: str
    header_quality: Literal["good", "poor"]

class ColumnProfile(BaseModel):
    column_name: str
    inferred_type: Literal["integer", "number", "date", "string", "empty", "mixed"]
    null_count: int
    null_percentage: float
    empty_string_count: int
    distinct_count: int
    distinct_percentage: float
    duplicate_value_rate: float
    invalid_parsed_value_count: int = 0
    numeric_statistics: dict[str, float] | None = None
    string_length_statistics: dict[str, float] | None = None
    date_range: dict[str, str] | None = None
    samples: list[str] = Field(default_factory=list)

class HealthScore(BaseModel):
    score: int = Field(ge=0, le=100)
    deductions: dict[str, int]
    scoring_version: str

class ProfileReport(BaseModel):
    profiler_version: str
    file_summary: FileSummary
    health_score: HealthScore
    severity_totals: dict[Severity, int]
    findings: list[Finding]
    column_profiles: list[ColumnProfile]

class ErrorResponse(BaseModel):
    error: dict[str, str]
