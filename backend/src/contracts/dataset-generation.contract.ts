import { z } from 'zod';
export const DatasetGenerationRequestSchema = z.object({
  recordCount: z.number().int().min(1).max(10_000).default(100),
  format: z.enum(['csv', 'json']).default('csv'),
  scenarios: z.array(z.enum(['valid', 'boundary', 'invalid', 'missing', 'duplicate'])).min(1).max(5).default(['valid', 'boundary', 'invalid', 'missing', 'duplicate']),
  seed: z.number().int().min(0).max(2147483647).optional(),
});
export type DatasetGenerationRequest = z.infer<typeof DatasetGenerationRequestSchema>;
