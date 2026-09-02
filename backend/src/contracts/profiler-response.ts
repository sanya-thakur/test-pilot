import { z } from 'zod';
import { ProfilerInvalidResponseError } from '../clients/fastapi-profiler.errors';

export const PROFILER_RESPONSE_VERSION = 'testpilot-profiler-v1' as const;

export const profilerSeveritySchema = z.enum(['info', 'warning', 'error']);

export const profilerFileSummarySchema = z
  .object({
    file_sha256: z.string().min(1),
    size_bytes: z.number().int().nonnegative(),
    row_count: z.number().int().nonnegative(),
    column_count: z.number().int().nonnegative(),
    duplicate_row_count: z.number().int().nonnegative(),
    encoding: z.string().min(1),
    delimiter: z.string().min(1),
    header_quality: z.enum(['good', 'poor']),
  })
  .strict();

export const profilerHealthScoreSchema = z
  .object({
    score: z.number().int().min(0).max(100),
    deductions: z.record(z.string(), z.number().int().nonnegative()),
    scoring_version: z.string().min(1),
  })
  .strict();

export const profilerFindingSchema = z
  .object({
    rule_id: z.string().min(1),
    severity: profilerSeveritySchema,
    column: z.string().optional().nullable(),
    metrics: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export const profilerColumnProfileSchema = z
  .object({
    column_name: z.string().min(1),
    inferred_type: z.enum(['integer', 'number', 'date', 'string', 'empty', 'mixed']),
    null_count: z.number().int().nonnegative(),
    null_percentage: z.number().finite(),
    empty_string_count: z.number().int().nonnegative(),
    distinct_count: z.number().int().nonnegative(),
    distinct_percentage: z.number().finite(),
    duplicate_value_rate: z.number().finite(),
    invalid_parsed_value_count: z.number().int().nonnegative().default(0),
    numeric_statistics: z.record(z.string(), z.number()).nullable().optional(),
    string_length_statistics: z.record(z.string(), z.number()).nullable().optional(),
    date_range: z.record(z.string(), z.string()).nullable().optional(),
    samples: z.array(z.string()),
  })
  .strict();

export const profilerSeverityTotalsSchema = z
  .object({
    info: z.number().int().nonnegative(),
    warning: z.number().int().nonnegative(),
    error: z.number().int().nonnegative(),
  })
  .strict();

export const profilerResponseV1Schema = z
  .object({
    profiler_version: z.literal(PROFILER_RESPONSE_VERSION),
    file_summary: profilerFileSummarySchema,
    health_score: profilerHealthScoreSchema,
    severity_totals: profilerSeverityTotalsSchema,
    findings: z.array(profilerFindingSchema),
    column_profiles: z.array(profilerColumnProfileSchema),
  })
  .strict();

export type ProfilerResponseV1 = z.infer<typeof profilerResponseV1Schema>;

export function parseProfilerResponse(value: unknown): ProfilerResponseV1 {
  const result = profilerResponseV1Schema.safeParse(value);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
      .join('; ');

    throw new ProfilerInvalidResponseError(`Invalid profiler response contract (v1): ${issues}`);
  }

  return result.data;
}
