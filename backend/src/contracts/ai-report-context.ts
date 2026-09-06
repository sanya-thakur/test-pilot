import { z } from 'zod';

export const aiSeverityTotalsSchema = z
  .object({
    info: z.number().int().nonnegative(),
    warning: z.number().int().nonnegative(),
    error: z.number().int().nonnegative(),
  })
  .strict();

export const aiFindingSchema = z
  .object({
    ruleId: z.string().min(1),
    severity: z.enum(['info', 'warning', 'error']),
    column: z.string().optional().nullable(),
    metrics: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export const aiColumnProfileSchema = z
  .object({
    columnName: z.string().min(1),
    inferredType: z.string(),
    nullCount: z.number().int().nonnegative(),
    nullPercentage: z.number().finite(),
    emptyStringCount: z.number().int().nonnegative(),
    distinctCount: z.number().int().nonnegative(),
    distinctPercentage: z.number().finite(),
    duplicateValueRate: z.number().finite(),
    invalidParsedValueCount: z.number().int().nonnegative(),
    numericStatistics: z.record(z.string(), z.number()).nullable().optional(),
    stringLengthStatistics: z.record(z.string(), z.number()).nullable().optional(),
    dateRange: z.record(z.string(), z.string()).nullable().optional(),
    samples: z.array(z.string()).default([]),
  })
  .strict();

export const aiReportContextSchema = z
  .object({
    datasetId: z.string().min(1),
    id: z.string().min(1),
    originalFilename: z.string().min(1),
    rowCount: z.number().int().nonnegative(),
    columnCount: z.number().int().nonnegative(),
    duplicateRowCount: z.number().int().nonnegative(),
    healthScore: z.number().int().min(0).max(100),
    healthScoreDeductions: z.record(z.string(), z.number().int().nonnegative()),
    scoringVersion: z.string(),
    severityTotals: aiSeverityTotalsSchema,
    findings: z.array(aiFindingSchema),
    columnProfiles: z.array(aiColumnProfileSchema),
    profilerVersion: z.string().min(1),
    createdAt: z.string(),
  })
  .strict();

export type AISeverityTotals = z.infer<typeof aiSeverityTotalsSchema>;
export type AIFinding = z.infer<typeof aiFindingSchema>;
export type AIColumnProfile = z.infer<typeof aiColumnProfileSchema>;
export type AIReportContext = z.infer<typeof aiReportContextSchema>;
