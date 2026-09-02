export type Severity = 'info' | 'warning' | 'error';
export type HeaderQuality = 'good' | 'poor';
export type InferredType = 'integer' | 'number' | 'date' | 'string' | 'empty' | 'mixed';

export interface FileSummary {
  file_sha256: string;
  size_bytes: number;
  row_count: number;
  column_count: number;
  duplicate_row_count: number;
  encoding: string;
  delimiter: string;
  header_quality: HeaderQuality;
}

export interface HealthScore {
  score: number;
  deductions: Record<string, number>;
  scoring_version: string;
}

export interface Finding {
  rule_id: string;
  severity: Severity;
  column?: string | null;
  metrics?: Record<string, unknown>;
}

export interface ColumnProfile {
  column_name: string;
  inferred_type: InferredType;
  null_count: number;
  null_percentage: number;
  empty_string_count: number;
  distinct_count: number;
  distinct_percentage: number;
  duplicate_value_rate: number;
  invalid_parsed_value_count: number;
  numeric_statistics?: Record<string, number> | null;
  string_length_statistics?: Record<string, number> | null;
  date_range?: Record<string, string> | null;
  samples?: string[];
}

export interface ProfilerResponse {
  profiler_version: string;
  file_summary: FileSummary;
  health_score: HealthScore;
  severity_totals: Record<Severity, number>;
  findings: Finding[];
  column_profiles: ColumnProfile[];
}

export interface ApiErrorResponse {
  error: string | { message?: string; code?: string };
}
