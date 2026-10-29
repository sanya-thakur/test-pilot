import type { DatasetRecord } from '../repositories/dataset.repository';
import type {
  AIReportContext,
  AIColumnProfile,
  AIFinding,
  AISeverityTotals,
} from '../contracts/ai-report-context';
import { datasetProfileService, DatasetProfileService } from './dataset-profile.service';

/** Maximum pretty-serialized report context sent to an AI provider. */
export const MAX_AI_PROVIDER_CONTEXT_CHARACTERS = 24_000;
const MAX_AI_PROVIDER_FINDINGS = 20;
const MAX_AI_PROVIDER_COLUMNS = 20;
const MAX_RECORD_ENTRIES = 8;
const MAX_TEXT_CHARACTERS = 128;
const MAX_KEY_CHARACTERS = 48;

export type AIProviderContextDiagnostics = {
  sourceFindingCount: number;
  sourceColumnProfileCount: number;
  sentFindingCount: number;
  sentColumnProfileCount: number;
  serializedCharacterCount: number;
};

const severityRank: Record<AIFinding['severity'], number> = { error: 0, warning: 1, info: 2 };

function truncateText(value: string, maxLength = MAX_TEXT_CHARACTERS): string {
  return value.length <= maxLength ? value : value.slice(0, maxLength);
}

function compactNumericRecord(value: Record<string, unknown> | null | undefined): Record<string, number> {
  if (!value || typeof value !== 'object') return {};
  return Object.entries(value)
    .filter(([, entry]) => typeof entry === 'number' && Number.isFinite(entry))
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, MAX_RECORD_ENTRIES)
    .reduce<Record<string, number>>((result, [key, entry]) => {
      result[truncateText(key, MAX_KEY_CHARACTERS)] = entry as number;
      return result;
    }, {});
}

function compactDateRange(value: Record<string, string> | null | undefined): Record<string, string> | null {
  if (!value || typeof value !== 'object') return null;
  const compact = Object.entries(value)
    .filter(([, entry]) => typeof entry === 'string')
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, MAX_RECORD_ENTRIES)
    .reduce<Record<string, string>>((result, [key, entry]) => {
      result[truncateText(key, MAX_KEY_CHARACTERS)] = truncateText(entry);
      return result;
    }, {});
  return Object.keys(compact).length > 0 ? compact : null;
}

function compactFinding(finding: AIFinding): AIFinding {
  return {
    ruleId: truncateText(finding.ruleId),
    severity: finding.severity,
    column: finding.column ? truncateText(finding.column) : null,
    // Finding metrics are expected to be numeric. Drop arbitrary nested/string values.
    metrics: compactNumericRecord(finding.metrics),
  };
}

function compactColumnProfile(profile: AIColumnProfile): AIColumnProfile {
  return {
    columnName: truncateText(profile.columnName),
    inferredType: truncateText(profile.inferredType),
    nullCount: profile.nullCount,
    nullPercentage: profile.nullPercentage,
    emptyStringCount: profile.emptyStringCount,
    distinctCount: profile.distinctCount,
    distinctPercentage: profile.distinctPercentage,
    duplicateValueRate: profile.duplicateValueRate,
    invalidParsedValueCount: profile.invalidParsedValueCount,
    numericStatistics: compactNumericRecord(profile.numericStatistics),
    stringLengthStatistics: compactNumericRecord(profile.stringLengthStatistics),
    dateRange: compactDateRange(profile.dateRange),
    // Raw representative values can be sensitive and are unnecessary for aggregate profiling advice.
    samples: [],
  };
}

/**
 * Builds the deterministic, bounded projection used only for provider requests.
 * The public AI-context endpoint continues to return the complete mapped report.
 */
export function buildAIProviderContext(context: AIReportContext): {
  context: AIReportContext;
  diagnostics: AIProviderContextDiagnostics;
} {
  const sourceFindings = Array.isArray(context.findings) ? context.findings : [];
  const sourceColumnProfiles = Array.isArray(context.columnProfiles) ? context.columnProfiles : [];
  const findings = sourceFindings
    .map(compactFinding)
    .sort((left, right) => severityRank[left.severity] - severityRank[right.severity]
      || left.ruleId.localeCompare(right.ruleId)
      || (left.column ?? '').localeCompare(right.column ?? ''))
    .slice(0, MAX_AI_PROVIDER_FINDINGS);
  const columnProfiles = sourceColumnProfiles
    .map(compactColumnProfile)
    .sort((left, right) => left.columnName.localeCompare(right.columnName))
    .slice(0, MAX_AI_PROVIDER_COLUMNS);

  const compactContext: AIReportContext = {
    ...context,
    datasetId: truncateText(context.datasetId),
    id: truncateText(context.id),
    originalFilename: truncateText(context.originalFilename),
    healthScoreDeductions: compactNumericRecord(context.healthScoreDeductions),
    scoringVersion: truncateText(context.scoringVersion),
    profilerVersion: truncateText(context.profilerVersion),
    createdAt: truncateText(context.createdAt),
    findings: [],
    columnProfiles: [],
  };

  // Alternate high-priority findings and alphabetical columns until the byte-safe
  // character budget is reached, so neither category can crowd out the other.
  const maxEntries = Math.max(findings.length, columnProfiles.length);
  for (let index = 0; index < maxEntries; index += 1) {
    for (const [field, item] of [
      ['findings', findings[index]],
      ['columnProfiles', columnProfiles[index]],
    ] as const) {
      if (!item) continue;
      const candidate = {
        ...compactContext,
        [field]: [...compactContext[field], item],
      };
      if (JSON.stringify(candidate).length <= MAX_AI_PROVIDER_CONTEXT_CHARACTERS) {
        compactContext[field] = candidate[field] as never;
      }
    }
  }

  const serializedCharacterCount = JSON.stringify(compactContext).length;
  return {
    context: compactContext,
    diagnostics: {
      sourceFindingCount: sourceFindings.length,
      sourceColumnProfileCount: sourceColumnProfiles.length,
      sentFindingCount: compactContext.findings.length,
      sentColumnProfileCount: compactContext.columnProfiles.length,
      serializedCharacterCount,
    },
  };
}

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
