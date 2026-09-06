import type { DatasetRecord } from '../repositories/dataset.repository';
import type {
  AIReportContext,
  AIColumnProfile,
  AIFinding,
  AISeverityTotals,
} from '../contracts/ai-report-context';
import { datasetProfileService, DatasetProfileService } from './dataset-profile.service';

export function mapDatasetToAIReportContext(record: DatasetRecord): AIReportContext {
  const report = record.report;
  const fileSummary = report?.file_summary;

  const rowCount = record.rowCount ?? fileSummary?.row_count ?? 0;
  const columnCount = record.columnCount ?? fileSummary?.column_count ?? 0;
  const duplicateRowCount = record.duplicateRowCount ?? fileSummary?.duplicate_row_count ?? 0;

  const healthScore = record.healthScore ?? report?.health_score?.score ?? 100;
  const healthScoreDeductions = record.healthScoreDeductions ?? report?.health_score?.deductions ?? {};
  const scoringVersion = record.scoringVersion ?? report?.health_score?.scoring_version ?? 'v1';

  const rawSeverityTotals = record.severityTotals ?? report?.severity_totals;
  const severityTotals: AISeverityTotals = {
    info: rawSeverityTotals?.info ?? 0,
    warning: rawSeverityTotals?.warning ?? 0,
    error: rawSeverityTotals?.error ?? 0,
  };

  const rawFindings: any[] = record.findings ?? report?.findings ?? [];
  const findings: AIFinding[] = rawFindings.map((f) => ({
    ruleId: f.ruleId || f.rule_id || 'unknown_rule',
    severity: f.severity === 'warning' || f.severity === 'error' ? f.severity : 'info',
    column: f.column ?? null,
    metrics: (f.metrics && typeof f.metrics === 'object') ? f.metrics : {},
  }));

  const rawColumnProfiles: any[] = record.columnProfiles ?? report?.column_profiles ?? [];
  const columnProfiles: AIColumnProfile[] = rawColumnProfiles.map((cp) => ({
    columnName: cp.columnName || cp.column_name || 'unnamed_column',
    inferredType: cp.inferredType || cp.inferred_type || 'string',
    nullCount: cp.nullCount ?? cp.null_count ?? 0,
    nullPercentage: cp.nullPercentage ?? cp.null_percentage ?? 0,
    emptyStringCount: cp.emptyStringCount ?? cp.empty_string_count ?? 0,
    distinctCount: cp.distinctCount ?? cp.distinct_count ?? 0,
    distinctPercentage: cp.distinctPercentage ?? cp.distinct_percentage ?? 0,
    duplicateValueRate: cp.duplicateValueRate ?? cp.duplicate_value_rate ?? 0,
    invalidParsedValueCount: cp.invalidParsedValueCount ?? cp.invalid_parsed_value_count ?? 0,
    numericStatistics: cp.numericStatistics ?? cp.numeric_statistics ?? null,
    stringLengthStatistics: cp.stringLengthStatistics ?? cp.string_length_statistics ?? null,
    dateRange: cp.dateRange ?? cp.date_range ?? null,
    samples: Array.isArray(cp.samples) ? cp.samples.map(String) : [],
  }));

  const profilerVersion = record.profilerVersion ?? report?.profiler_version ?? 'testpilot-profiler-v1';
  const createdAt = typeof record.createdAt === 'string'
    ? record.createdAt
    : (record.createdAt as Date)?.toISOString() ?? new Date().toISOString();

  return {
    datasetId: record.id,
    id: record.id,
    originalFilename: record.originalFilename,
    rowCount,
    columnCount,
    duplicateRowCount,
    healthScore,
    healthScoreDeductions,
    scoringVersion,
    severityTotals,
    findings,
    columnProfiles,
    profilerVersion,
    createdAt,
  };
}

export class AIReportContextService {
  private datasetProfileService: DatasetProfileService;

  constructor(profileService?: DatasetProfileService) {
    this.datasetProfileService = profileService || datasetProfileService;
  }

  async getAIReportContext(id: string): Promise<AIReportContext | null> {
    const record = await this.datasetProfileService.findById(id);
    if (!record) {
      return null;
    }
    return mapDatasetToAIReportContext(record);
  }
}

export const aiReportContextService = new AIReportContextService();
