import { mapDatasetToAIReportContext, AIReportContextService } from '../src/services/ai-report-context.service';
import { aiReportContextSchema } from '../src/contracts/ai-report-context';
import type { DatasetRecord } from '../src/repositories/dataset.repository';

describe('AIReportContextService & Mapper', () => {
  const mockPgRecord: DatasetRecord = {
    id: 'pg-dataset-123',
    originalFilename: 'sales_data.csv',
    storedFilename: '/var/storage/uploads/secret_path_123.csv',
    createdAt: '2026-09-06T12:00:00.000Z',
    profilerVersion: 'testpilot-profiler-v1',
    healthScore: 92,
    healthScoreDeductions: { NULL_VALUES: 8 },
    scoringVersion: 'v1',
    rowCount: 1500,
    columnCount: 5,
    duplicateRowCount: 12,
    severityTotals: { info: 2, warning: 1, error: 0 },
    findings: [
      {
        rule_id: 'IQR_OUTLIERS',
        severity: 'warning',
        column: 'price',
        metrics: { outlier_count: 5, lower_bound: 0, upper_bound: 500 },
      },
    ],
    columnProfiles: [
      {
        column_name: 'price',
        inferred_type: 'number',
        null_count: 10,
        null_percentage: 0.67,
        empty_string_count: 0,
        distinct_count: 120,
        distinct_percentage: 8.0,
        duplicate_value_rate: 0.92,
        invalid_parsed_value_count: 0,
        numeric_statistics: { min: 5, max: 450, mean: 120, std: 45, median: 110 },
        string_length_statistics: null,
        date_range: null,
        samples: ['10', '25', '100'],
      },
    ],
    report: {
      profiler_version: 'testpilot-profiler-v1',
      file_summary: {
        file_sha256: 'sha256_hash_abc',
        size_bytes: 4096,
        row_count: 1500,
        column_count: 5,
        duplicate_row_count: 12,
        encoding: 'utf-8',
        delimiter: ',',
        header_quality: 'good',
      },
      health_score: {
        score: 92,
        deductions: { NULL_VALUES: 8 },
        scoring_version: 'v1',
      },
      severity_totals: { info: 2, warning: 1, error: 0 },
      findings: [],
      column_profiles: [],
    },
  };

  it('correctly maps PostgreSQL dataset record shape to AIReportContext', () => {
    const aiContext = mapDatasetToAIReportContext(mockPgRecord);

    expect(aiContext.datasetId).toBe('pg-dataset-123');
    expect(aiContext.id).toBe('pg-dataset-123');
    expect(aiContext.originalFilename).toBe('sales_data.csv');
    expect(aiContext.rowCount).toBe(1500);
    expect(aiContext.columnCount).toBe(5);
    expect(aiContext.duplicateRowCount).toBe(12);
    expect(aiContext.healthScore).toBe(92);
    expect(aiContext.severityTotals).toEqual({ info: 2, warning: 1, error: 0 });
    expect(aiContext.findings).toHaveLength(1);
    expect(aiContext.findings[0].ruleId).toBe('IQR_OUTLIERS');
    expect(aiContext.columnProfiles).toHaveLength(1);
    expect(aiContext.columnProfiles[0].columnName).toBe('price');
    expect(aiContext.columnProfiles[0].inferredType).toBe('number');
  });

  it('strictly excludes internal and sensitive fields like storedFilename or file paths', () => {
    const aiContext = mapDatasetToAIReportContext(mockPgRecord);
    const keys = Object.keys(aiContext);

    expect(keys).not.toContain('storedFilename');
    expect(keys).not.toContain('filePath');
    expect(keys).not.toContain('report');
    expect(keys).not.toContain('fileSha256');
    expect((aiContext as any).storedFilename).toBeUndefined();
    expect((aiContext as any).stored_filename).toBeUndefined();
  });

  it('validates mapped context against aiReportContextSchema', () => {
    const aiContext = mapDatasetToAIReportContext(mockPgRecord);
    const validationResult = aiReportContextSchema.safeParse(aiContext);
    expect(validationResult.success).toBe(true);
  });

  it('fetches record via service findById and returns null if dataset not found', async () => {
    const mockProfileService = {
      findById: jest.fn().mockResolvedValue(null),
    } as any;

    const service = new AIReportContextService(mockProfileService);
    const result = await service.getAIReportContext('nonexistent-id');

    expect(mockProfileService.findById).toHaveBeenCalledWith('nonexistent-id');
    expect(result).toBeNull();
  });
});
